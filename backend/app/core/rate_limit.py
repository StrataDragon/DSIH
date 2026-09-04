import time
from collections import defaultdict
from threading import Lock
from typing import Dict, List, Tuple

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.services.audit_service import audit_service


settings = get_settings()

# Endpoints classified as AI/expensive
AI_ENDPOINTS = {
    "/api/chat",
    "/api/voice-chat",
    "/api/check-eligibility",
    "/api/what-if",
    "/api/family/analyze",
}


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self.lock = Lock()
        # Storage: key -> list of request timestamps (float)
        self.requests: Dict[str, List[float]] = defaultdict(list)

    def is_allowed(self, key: str, max_requests: int, window_seconds: int = 60) -> Tuple[bool, int]:
        """
        Check if request under `key` is allowed within `window_seconds`.
        Returns (is_allowed: bool, retry_after: int)
        """
        now = time.time()
        window_start = now - window_seconds

        with self.lock:
            # Clean timestamps older than current window
            timestamps = [ts for ts in self.requests[key] if ts > window_start]
            
            if len(timestamps) >= max_requests:
                oldest = timestamps[0]
                retry_after = max(1, int(oldest + window_seconds - now))
                self.requests[key] = timestamps
                return False, retry_after

            timestamps.append(now)
            self.requests[key] = timestamps
            return True, 0

    def reset(self) -> None:
        with self.lock:
            self.requests.clear()


rate_limiter = SlidingWindowRateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Exclude OPTIONS (CORS preflight), OpenAPI documentation, static files, and health checks
        if request.method == "OPTIONS" or path in {"/health", "/", "/docs", "/redoc", "/openapi.json"} or path.startswith("/static"):
            return await call_next(request)

        # Determine rate limit tier
        is_ai_route = any(path.startswith(endpoint) for endpoint in AI_ENDPOINTS)
        limit = settings.rate_limit_per_minute_ai if is_ai_route else settings.rate_limit_per_minute_default
        tier_name = "ai" if is_ai_route else "default"

        # Determine client identifier (User ID if token present, otherwise IP)
        user_id = getattr(request.state, "user_id", None)
        auth_header = request.headers.get("authorization", "")
        
        if not user_id and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                db = SessionLocal()
                from app.models.db_models import SessionRecord
                session = db.query(SessionRecord).filter(SessionRecord.token == token).first()
                if session and session.revoked_at is None:
                    user_id = session.user_id
                db.close()
            except Exception:
                pass

        if user_id:
            client_key = f"user:{user_id}:{tier_name}"
            actor_role = "citizen"
        else:
            forwarded = request.headers.get("x-forwarded-for")
            ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
            client_key = f"ip:{ip}:{tier_name}"
            actor_role = "anonymous"

        allowed, retry_after = rate_limiter.is_allowed(client_key, max_requests=limit, window_seconds=60)

        if not allowed:
            # Audit log rate limit violation
            try:
                db = SessionLocal()
                audit_service.log(
                    db=db,
                    event_type="rate_limit_exceeded",
                    detail=f"Rate limit exceeded on {path} (Tier: {tier_name}, Limit: {limit}/min)",
                    user_id=user_id,
                    actor_role=actor_role,
                    target_resource=path,
                    request=request,
                )
                db.close()
            except Exception:
                pass

            response = JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded for {tier_name} operations. Please wait before retrying.",
                    "retry_after": retry_after,
                    "limit_per_minute": limit,
                },
                headers={"Retry-After": str(retry_after)},
            )
            return response

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(limit)
        return response
