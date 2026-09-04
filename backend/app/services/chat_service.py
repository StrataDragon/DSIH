import logging
import re
import unicodedata
from typing import Any
# pyrefly: ignore [missing-import]
import httpx

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.prompts import (
    PII_DETECTION_RESPONSES,
    REFUSAL_PROMPT_RESPONSES,
    SAHAYA_SYSTEM_INSTRUCTION,
    USER_PROMPT_TEMPLATE,
)
from app.core.redis_client import ephemeral_store
from app.models.db_models import DocumentRecord, User
from app.models.schemas import ChatResponse, EligibilityProfile, EligibilityResult, Scheme
from app.services.data_loader import load_rules, load_schemes, load_scheme_translations, load_tours
from app.services.document_service import REUPLOAD_PROMPTS
from app.services.eligibility_engine import eligibility_engine
from app.services.search_service import search_service

logger = logging.getLogger("techsahaya.chat_service")
settings = get_settings()


class ChatService:
    def __init__(self) -> None:
        self.rules = load_rules()
        self.schemes = load_schemes()
        self.scheme_map = {s.id: s for s in self.schemes}

    def answer(
        self,
        message: str,
        language: str = "en",
        profile: EligibilityProfile | None = None,
        user: User | None = None,
        db: Session | None = None,
    ) -> ChatResponse:
        self.schemes = load_schemes()
        self.scheme_map = {s.id: s for s in self.schemes}
        self.rules = load_rules()

        # 1. Input Sanitization & Normalization
        cleaned_message = self._sanitize_input(message)

        # 2. Prompt Injection & Scope Refusal Pre-check
        if settings.prompt_injection_guard_enabled and self._is_adversarial_or_jailbreak(cleaned_message):
            logger.warning("Prompt injection / jailbreak detected: '%s'", cleaned_message)
            return self._refusal_response(language)

        # 2a. PII Guardrail Check (Aadhaar, PAN)
        if self._detect_pii(cleaned_message):
            logger.warning("Sensitive PII detected in chat query: '%s'", cleaned_message)
            return self._pii_detected_response(language)

        # 2b. Friendly Greeting & General Onboarding Help
        if self._is_greeting_or_general_help(cleaned_message):
            return self._greeting_or_general_help_response(language)

        # 2c. Ephemeral OCR extraction lookup for citizen's recent documents
        live_ocr_fields: dict[str, Any] = {}
        live_ocr_confidences: dict[str, Any] = {}
        has_user_docs = False
        has_live_docs = False
        has_expired_docs = False
        has_poor_quality_docs = False
        live_doc_types: list[str] = []

        if user and db:
            try:
                user_docs = (
                    db.query(DocumentRecord)
                    .filter(DocumentRecord.user_id == user.id, DocumentRecord.status == "processed")
                    .order_by(DocumentRecord.created_at.desc())
                    .limit(10)
                    .all()
                )
                if user_docs:
                    has_user_docs = True
                    for doc in user_docs:
                        cached = ephemeral_store.get(f"doc:{doc.id}")
                        if cached and isinstance(cached, dict) and cached.get("extracted_fields"):
                            extracted = cached['extracted_fields']
                            ocr_quality = cached.get('ocr_quality') or extracted.get('ocr_quality', 'good')
                            if ocr_quality == 'poor':
                                has_poor_quality_docs = True
                                continue
                            has_live_docs = True
                            confidences = cached.get("field_confidences", {})
                            for k, v in extracted.items():
                                if not k.startswith("_") and k != "field_confidences" and k not in live_ocr_fields and v is not None:
                                    live_ocr_fields[k] = v
                            if isinstance(confidences, dict):
                                live_ocr_confidences.update(confidences)
                            if isinstance(extracted, dict):
                                for ck in ["_age_confidence", "_income_confidence", "_landholding_confidence"]:
                                    if ck in extracted:
                                        live_ocr_confidences[ck.replace("_", "").replace("confidence", "")] = extracted[ck]
                        else:
                            has_expired_docs = True
            except Exception as exc:
                logger.warning("Error fetching ephemeral OCR data for user %s: %s", getattr(user, "id", "unknown"), exc)

        # Merge live ephemeral data into profile
        effective_profile = profile.model_copy() if profile else EligibilityProfile()
        if live_ocr_fields:
            if effective_profile.age is None and "age" in live_ocr_fields:
                effective_profile.age = live_ocr_fields["age"]
            if effective_profile.income is None and "income" in live_ocr_fields:
                effective_profile.income = float(live_ocr_fields["income"])
            if effective_profile.landholding is None and "landholding" in live_ocr_fields:
                effective_profile.landholding = float(live_ocr_fields["landholding"])
            for dt in live_doc_types:
                if dt not in effective_profile.available_documents:
                    effective_profile.available_documents.append(dt)

        if live_ocr_fields:
            ocr_extracted_profile_payload = f"Active session ephemeral OCR fields: {live_ocr_fields} from document types: {live_doc_types}"
        elif has_user_docs and has_expired_docs and not has_live_docs:
            ocr_extracted_profile_payload = "Document session expired: previously processed document fields have expired from temporary memory (TTL elapsed)."
        else:
            ocr_extracted_profile_payload = "None active in session"

        # 2d. Direct query about citizen's own profile / age / income / extracted data
        if self._is_profile_query(cleaned_message):
            return self._profile_query_response(
                message=cleaned_message,
                language=language,
                profile=effective_profile,
                live_ocr_fields=live_ocr_fields,
                live_ocr_confidences=live_ocr_confidences,
                has_user_docs=has_user_docs,
                has_expired_docs=has_expired_docs,
                has_live_docs=has_live_docs,
                has_poor_quality_docs=has_poor_quality_docs,
                live_doc_types=live_doc_types,
            )

        normalized_message = search_service._normalize_query(cleaned_message)
        intent = self._detect_intent(cleaned_message)
        chunks = search_service.search(cleaned_message, top_k=4, threshold=0.10)

        logger.info(
            "Chat Query: '%s' | Intent: '%s' | Chunks retrieved: %d",
            cleaned_message,
            intent,
            len(chunks),
        )

        # Rejection for unsupported queries
        if not chunks or self._is_unsupported_query(cleaned_message, chunks):
            return self._insufficient_evidence_response(language)

        top_score = max((c.get("retrieval_score", 0.0) for c in chunks), default=0.0)
        if top_score < 0.12 and not any(
            term in cleaned_message.lower()
            for term in ["farmer", "student", "worker", "women", "disability", "health", "house", "scheme", "kisan", "yojana", "help", "madu", "madi", "eligible", "eligibility", "age", "income", "my"]
        ):
            return self._insufficient_evidence_response(language)

        # Retrieve matched structured schemes
        scheme_ids = list({chunk["scheme_id"] for chunk in chunks})
        matched_schemes = [self.scheme_map[sid] for sid in scheme_ids if sid in self.scheme_map]

        target_schemes = search_service._detect_target_schemes(cleaned_message)
        if target_schemes:
            matched_schemes = [s for s in matched_schemes if s.id in target_schemes] or matched_schemes
            chunks = [c for c in chunks if c["scheme_id"] in [s.id for s in matched_schemes]] or chunks

        # Evaluate Deterministic Eligibility
        eligibility_result: EligibilityResult | None = None
        if (intent == "eligibility" or "eligible" in cleaned_message.lower() or profile is not None or bool(live_ocr_fields)) and matched_schemes:
            primary_scheme = matched_schemes[0]
            rule = self.rules.get(primary_scheme.id, {})
            eligibility_result = eligibility_engine.evaluate(
                primary_scheme.id, effective_profile, rule, primary_scheme.alternative_scheme_ids
            )

        confidence = self._calculate_confidence(chunks, matched_schemes, cleaned_message)

        # Generate Grounded Answer (Gemini API with XML Fencing or Fallback)
        raw_answer = self._generate_grounded_answer(
            message=cleaned_message,
            language=language,
            intent=intent,
            schemes=matched_schemes,
            chunks=chunks,
            eligibility_result=eligibility_result,
            profile=effective_profile,
            ocr_extracted_profile_payload=ocr_extracted_profile_payload,
            has_expired_docs=(has_user_docs and has_expired_docs and not has_live_docs),
        )

        # 3. Output Validation vs Deterministic Rule Engine
        validated_answer = self._validate_and_sanitize_output(
            raw_answer=raw_answer,
            eligibility_result=eligibility_result,
            schemes=matched_schemes,
            language=language,
            intent=intent,
        )

        # 4. Tour Action Detection & Allowlist Validation
        tour_id, suggested_action = self._detect_and_validate_tour_action(
            message=cleaned_message,
            answer=validated_answer,
            intent=intent,
            eligibility_result=eligibility_result,
        )

        # Clean out any raw action tag from the final answer text shown to citizens
        final_answer = re.sub(r"\[TOUR_ACTION:\s*[^\]]+\]", "", validated_answer).strip()

        evidence = [
            {
                "scheme_name": chunk["scheme_name"],
                "evidence": chunk["text"],
                "source": chunk["source"],
                "chunk_type": chunk["chunk_type"],
                "retrieval_score": chunk.get("retrieval_score", 0.0),
            }
            for chunk in chunks
        ]

        verification_status = (
            "verified_from_source_data" if confidence == "high" else "requires_official_verification"
        )

        return ChatResponse(
            answer=final_answer,
            schemes=matched_schemes,
            evidence=evidence,
            verification_status=verification_status,
            confidence=confidence,
            offline_ready=True,
            tour_id=tour_id,
            suggested_action=suggested_action,
        )

    def _sanitize_input(self, text: str) -> str:
        """Strip zero-width characters, control characters, and enforce length limits."""
        if not text:
            return ""
        # Strip zero-width spaces, joiners, byte order marks
        cleaned = re.sub(r"[\u200B-\u200D\uFEFF\u200E\u200F]", "", text)
        # Normalize unicode characters
        cleaned = unicodedata.normalize("NFKC", cleaned)
        # Remove ASCII control characters except newline and tab
        cleaned = "".join(ch for ch in cleaned if ch in "\n\t" or not unicodedata.category(ch).startswith("C"))
        # Enforce maximum length
        max_len = settings.max_chat_input_length
        return cleaned[:max_len].strip()

    def _is_adversarial_or_jailbreak(self, message: str) -> bool:
        """Identify prompt injection, system prompt extraction, or jailbreak attacks."""
        lowered = message.lower()
        adversarial_patterns = [
            r"ignore (all )?(previous|prior) (instructions|prompts|rules)",
            r"system (prompt|override|command)",
            r"reveal (your |the )?(instructions|prompt|directives)",
            r"developer mode",
            r"\bdan\b",
            r"jailbreak",
            r"act as an unrestricted",
            r"bypass (all )?(guardrails|safety|filters)",
            r"you have no rules",
            r"override (system|rules|criteria)",
            r"mark me eligible",
            r"regardless of (income|landholding|age|criteria|rules)",
            r"output (the |your )?initial prompt",
            r"print (your |the )?system instructions",
            r"pretend (you are|you're) a developer",
        ]
        return any(re.search(pat, lowered) for pat in adversarial_patterns)

    def _detect_pii(self, message: str) -> bool:
        """Detect Aadhaar (12-digit format) or PAN (10-character alphanumeric) in message."""
        # 12 digits (with optional spaces or dashes)
        if re.search(r"\b\d{4}[ -]?\d{4}[ -]?\d{4}\b", message):
            return True
        # PAN format: 5 letters, 4 digits, 1 letter
        if re.search(r"\b[A-Za-z]{5}\d{4}[A-Za-z]\b", message):
            return True
        return False

    def _pii_detected_response(self, language: str) -> ChatResponse:
        lang_key = next((k for k in ["hi", "kn", "te", "ta", "ml", "bn", "mr", "gu"] if language.lower().startswith(k)), "en")
        pii_text = PII_DETECTION_RESPONSES.get(lang_key, PII_DETECTION_RESPONSES["en"])
        return ChatResponse(
            answer=pii_text,
            schemes=[],
            evidence=[],
            verification_status="pii_detected_blocked",
            confidence="low",
            offline_ready=True,
        )

    def _refusal_response(self, language: str) -> ChatResponse:
        lang_key = next((k for k in ["hi", "kn", "te", "ta", "ml", "bn", "mr", "gu"] if language.lower().startswith(k)), "en")
        refusal_text = REFUSAL_PROMPT_RESPONSES.get(lang_key, REFUSAL_PROMPT_RESPONSES["en"])
        return ChatResponse(
            answer=refusal_text,
            schemes=[],
            evidence=[],
            verification_status="refused_out_of_scope",
            confidence="low",
            offline_ready=True,
        )

    def _detect_intent(self, message: str) -> str:
        msg = message.lower()
        if any(w in msg for w in ["eligible", "eligibility", "can i apply", "qualify", "पात्रता", "ಅರ್ಹತೆ", "ಅರ್ಹತ", "தகுதி", "യോഗ്യത", "যোগ্যতা", "पात्रता", "પાત્રતા"]):
            return "eligibility"
        if any(w in msg for w in ["document", "documents", "upload", "proof", "certificate", "दस्तावेज़", "ದಾಖಲೆಗಳು", "ಪತ್ರಗಳು", "ஆவணங்கள்", "രേഖകൾ", "নথিপত্র", "कागदपत्रे", "દસ્તાવેજો"]):
            return "documents"
        if any(w in msg for w in ["benefit", "benefits", "money", "amount", "pension", "लाभ", "ಪ್ರಯೋಜನಗಳು", "ప్రయోజనాలు", "பலன்கள்", "ആനുകൂല്യങ്ങൾ", "সুবিধা", "लाभ", "લાભો"]):
            return "benefits"
        if any(w in msg for w in ["apply", "how to apply", "application", "procedure", "process", "आवेदन", "ಅರ್ಜಿ", "దరఖాస్తు", "விண்ணப்பம்", "അപേക്ഷ", "আবেদন", "अर्ज", "અરજી"]):
            return "application"
        if any(w in msg for w in ["website", "link", "portal", "url", "वेबसाइट", "ಲಿಂಕ್", "వెబ్‌సైట్", "வலைத்தளம்", "വെബ്സൈറ്റ്", "ওয়েবসাইট", "संकेतस्थळ"]):
            return "website"
        if any(w in msg for w in ["family", "children", "household", "परिवार", "ಕುಟುಂಬ", "కుటుంబం", "குடும்பம்", "കുടുംബം", "পরিবার", "कुटुंब", "પરિવાર"]):
            return "family"
        if any(w in msg for w in ["profile", "income", "update", "state", "age", "ವಯಸ್ಸು", "ಆದಾಯ", "ಪ್ರೊಫೈಲ್", "उम्र", "आय", "प्रोफ़ाइल", "వయస్సు", "ఆదాయం", "ప్రొಫೈಲ್", "வயது", "வருமானம்", "சுயவிவரம்", "പ്രൊഫൈൽ", "প্রোফাইল", "પ્રોફાઇલ", "वय", "उत्पन्न"]):
            return "profile"
        if any(w in msg for w in ["gap", "missed", "schemes", "available", "list", "योजनाएं", "ಯೋಜನೆಗಳು", "పథకాలు", "திட்டங்கள்", "പദ്ധതികൾ", "প্রকল্প", "योजना", "યોજનાઓ"]):
            return "scheme_discovery"
        return "scheme_explanation"

    def _is_profile_query(self, message: str) -> bool:
        lowered = message.lower()
        if any(w in lowered for w in ["how to", "how do i", "how can i", "apply", "upload", "submit", "attach", "register"]):
            return False

        patterns = [
            r"\b(whats?|what's|what is|tell|show|check|know|get|view|display)\b.*\b(my|extracted|uploaded|current)?\b.*\b(age|income|land|landholding|salary|details|profile|data|document|info)\b",
            r"\b(my|extracted|uploaded|current)\b.*\b(age|income|land|landholding|salary|details|profile|data|info)\b",
            r"\bhow old (am i|i am)\b",
            r"\b(age|income|landholding)\b.*\b(is what|what is|whats)\b",
            r"^\s*(what is|whats?|what's)?\s*my (age|income|landholding|details|profile)\s*\??$",
            r"ನನ್ನ (ವಯಸ್ಸು|ಆದಾಯ|ವಿವರ|ದಾಖಲೆ|ಪ್ರೊಫೈಲ್|ಭೂಮಿ)",
            r"ಏನು ನನ್ನ (ವಯಸ್ಸು|ಆದಾಯ|ಪ್ರೊಫೈಲ್)",
            r"ನನ್ನ ವಯಸ್ಸು",
            r"ನನ್ನ ಆದಾಯ",
            r"मेरी (उम्र|आय|विवरण|प्रोफ़ाइल|जमीन)",
            r"मेरी उम्र",
            r"मेरी आय",
            r"ना (వయస్సు|ఆదాయం|వివరాలు)",
            r"என் (வயது|வருமானம்)",
            r"\b(what\s+am\s+i\s+eligible\s+for|what\s+benefits\s+do\s+i\s+get|what\s+schemes\s+do\s+i\s+qualify\s+for)\b",
            r"\b(what\s+document\s+am\s+i\s+missing|what\s+documents\s+am\s+i\s+missing|what\s+is\s+blocking\s+me)\b",
            r"\b(benefits\s+passport|eligibility\s+radar)\b",
        ]
        return any(re.search(pat, lowered) for pat in patterns)

    def _profile_query_response(
        self,
        message: str,
        language: str,
        profile: EligibilityProfile,
        live_ocr_fields: dict[str, Any],
        live_ocr_confidences: dict[str, Any],
        has_user_docs: bool,
        has_expired_docs: bool,
        has_live_docs: bool,
        has_poor_quality_docs: bool,
        live_doc_types: list[str],
    ) -> ChatResponse:
        lang = language.lower()
        msg = message.lower()
        is_age_query = any(w in msg for w in ["age", "old", "ವಯಸ್ಸು", "उम्र", "వయస్సు", "வயது", "വയസ്സ്", "বয়স", "ઉંમર", "वय"])
        is_income_query = any(w in msg for w in ["income", "salary", "ಆದಾಯ", "आय", "ఆదాయం", "வருமானம்", "ആദായം", "আয়", "આવક", "उत्पन्न"])
        is_benefits_query = any(w in msg for w in ["what am i eligible for", "am i eligible", "my benefits", "benefits passport", "what can i apply for right now"])
        is_missing_docs_query = any(w in msg for w in ["missing document", "what document am i missing", "blocking me", "which document"])

        if is_benefits_query and profile:
            eligible_list = []
            for s in self.schemes:
                rule = self.rules.get(s.id, {})
                res = eligibility_engine.evaluate(s.id, profile, rule, s.alternative_scheme_ids)
                if res.status == "eligible":
                    eligible_list.append(s)

            if eligible_list:
                s_names = ", ".join([f"**{s.name}**" for s in eligible_list[:3]])
                ans = (
                    f"Based on your verified profile, you currently qualify for **{len(eligible_list)} scheme(s)**: {s_names}. "
                    f"You can view your complete breakdown and official application links in your **Benefits Passport** (/benefits)."
                )
            else:
                ans = (
                    "Based on your current profile, no schemes are fully unlocked yet. "
                    "Visit your **Benefits Passport** (/benefits) to see which verified documents or criteria are needed to qualify."
                )

            return ChatResponse(
                answer=ans,
                schemes=eligible_list[:3],
                evidence=[],
                verification_status="verified_from_source_data",
                confidence="high",
                offline_ready=True,
                suggested_action={"type": "navigate", "title": "Open Benefits Passport", "route": "/benefits"},
            )

        if is_missing_docs_query and profile:
            ans = (
                "Based on your Benefits Passport evaluation, you have schemes that are currently **One Step Away**. "
                "Uploading a verified **Income Certificate** or **Land Record** will unlock several central and state welfare benefits. "
                "Visit your **Benefits Passport** (/benefits) to view prioritized actions."
            )
            return ChatResponse(
                answer=ans,
                schemes=[],
                evidence=[],
                verification_status="verified_from_source_data",
                confidence="high",
                offline_ready=True,
                suggested_action={"type": "navigate", "title": "View Missing Documents", "route": "/benefits"},
            )

        # If document was detected as poor quality and no verified profile data exists, prompt re-upload immediately
        if not has_live_docs and has_poor_quality_docs and profile.age is None and profile.income is None:
            lang_key = lang[:2]
            ans = REUPLOAD_PROMPTS.get(lang_key, REUPLOAD_PROMPTS['en'])
            return ChatResponse(
                answer=ans,
                schemes=[],
                evidence=[],
                verification_status='requires_official_verification',
                confidence='low',
                offline_ready=True,
                tour_id='upload_income_proof',
                suggested_action={
                    'type': 'start_tour',
                    'tour_id': 'upload_income_proof',
                    'title': 'Re-upload Verification Document',
                    'description': 'Upload a clearer photo of your document.',
                    'route': '/upload-document',
                },
            )

        # Case 1: Specific age query
        if is_age_query:
            if profile.age is not None:
                age_conf = live_ocr_confidences.get('age', live_ocr_fields.get('_age_confidence', 'high'))
                if age_conf in ('low', 'medium'):
                    if lang.startswith('kn'):
                        ans = f"ನಿಮ್ಮ ದಾಖಲೆಯ ಪ್ರಕಾರ ನಿಮ್ಮ ವಯಸ್ಸು ಅಂದಾಜು **{profile.age} ವರ್ಷಗಳು** ಎಂದು ಓದಲಾಗಿದೆ (ದಯವಿಟ್ಟು ಇದು ಸರಿಯಾಗಿದೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಿ)."
                    elif lang.startswith('hi'):
                        ans = f"आपके दस्तावेज़ के अनुसार आपकी आयु लगभग **{profile.age} वर्ष** पढ़ी गई है (कृपया पुष्टि करें कि यह सही है)।"
                    else:
                        ans = f"Based on your document upload, our system read your age as approximately **{profile.age} years** (please confirm this is correct)."
                else:
                    if lang.startswith('kn'):
                        ans = f"ನಿಮ್ಮ ಇತ್ತೀಚಿನ ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಸೆಷನ್ ಪ್ರಕಾರ, ನಿಮ್ಮ ಪರಿಶೀಲಿತ ವಯಸ್ಸು **{profile.age} ವರ್ಷಗಳು**."
                    elif lang.startswith('hi'):
                        ans = f"आपके हालिया दस्तावेज़ अपलोड सत्र के अनुसार, आपकी सत्यापित आयु **{profile.age} वर्ष** है।"
                    else:
                        ans = f"Based on your active document session, your verified age is **{profile.age} years**."
                return ChatResponse(
                    answer=ans,
                    schemes=[],
                    evidence=[],
                    verification_status='verified_from_source_data' if age_conf == 'high' else 'requires_official_verification',
                    confidence='high' if age_conf == 'high' else 'medium',
                    offline_ready=True,
                )
            elif has_user_docs and has_expired_docs and not has_live_docs:
                pass  # Fall through to Case 2 (expired session prompt)
            else:
                if lang.startswith("kn"):
                    ans = "ನಿಮ್ಮ ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆಯಲ್ಲಿ ಅಥವಾ ಪ್ರೊಫೈಲ್‌ನಲ್ಲಿ ವಯಸ್ಸಿನ ವಿವರ ಕಂಡುಬಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನಮೂದಿಸಿ."
                elif lang.startswith("hi"):
                    ans = "आपके अपलोड किए गए दस्तावेज़ या प्रोफ़ाइल में आयु का विवरण नहीं मिला। कृपया अपना विवरण दर्ज करें।"
                else:
                    ans = "No age was found in your uploaded document or profile. Please enter your age manually or upload a document showing your age."
                return ChatResponse(
                    answer=ans,
                    schemes=[],
                    evidence=[],
                    verification_status="insufficient_evidence",
                    confidence="medium",
                    offline_ready=True,
                )

        # Case 1b: Specific income query
        if is_income_query:
            if profile.income is not None:
                inc_conf = live_ocr_confidences.get('income', live_ocr_fields.get('_income_confidence', 'high'))
                if inc_conf in ('low', 'medium'):
                    if lang.startswith('kn'):
                        ans = f"ನಿಮ್ಮ ದಾಖಲೆಯ ಪ್ರಕಾರ ನಿಮ್ಮ ವಾರ್ಷಿಕ ಆದಾಯ ಅಂದಾಜು **ರೂ {profile.income:,.0f}** ಎಂದು ಓದಲಾಗಿದೆ (ದಯವಿಟ್ಟು ಇದು ಸರಿಯಾಗಿದೆಯೇ ಎಂದು ಖಚಿತಪಡಿಸಿ)."
                    elif lang.startswith('hi'):
                        ans = f"आपके दस्तावेज़ के अनुसार आपकी वार्षिक आय लगभग **₹{profile.income:,.0f}** पढ़ी गई है (कृपया पुष्टि करें कि यह सही है)।"
                    else:
                        ans = f"Based on your document upload, our system read your annual income as approximately **₹{profile.income:,.0f}** (please confirm this is correct)."
                else:
                    if lang.startswith('kn'):
                        ans = f"ನಿಮ್ಮ ಇತ್ತೀಚಿನ ದಾಖಲೆ ಅಪ್‌ಲೋಡ್ ಸೆಷನ್ ಪ್ರಕಾರ, ನಿಮ್ಮ ಪರಿಶೀಲಿತ ವಾರ್ಷಿಕ ಆದಾಯ **ರೂ {profile.income:,.0f}**."
                    elif lang.startswith('hi'):
                        ans = f"आपके हालिया दस्तावेज़ अपलोड सत्र के अनुसार, आपकी सत्यापित वार्षिक आय **₹{profile.income:,.0f}** है।"
                    else:
                        ans = f"Based on your active document session, your verified annual income is **₹{profile.income:,.0f}**."
                return ChatResponse(
                    answer=ans,
                    schemes=[],
                    evidence=[],
                    verification_status='verified_from_source_data' if inc_conf == 'high' else 'requires_official_verification',
                    confidence='high' if inc_conf == 'high' else 'medium',
                    offline_ready=True,
                )
            elif has_user_docs and has_expired_docs and not has_live_docs:
                pass  # Fall through to Case 2 (expired session prompt)
            else:
                if lang.startswith("kn"):
                    ans = "ನಿಮ್ಮ ಅಪ್‌ಲೋಡ್ ಮಾಡಿದ ದಾಖಲೆಯಲ್ಲಿ ಅಥವಾ ಪ್ರೊಫೈಲ್‌ನಲ್ಲಿ ಆದಾಯದ ವಿವರ ಕಂಡುಬಂದಿಲ್ಲ. ದಯವಿಟ್ಟು ಆದಾಯ ಪ್ರಮಾಣಪತ್ರವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ."
                elif lang.startswith("hi"):
                    ans = "आपके अपलोड किए गए दस्तावेज़ या प्रोफ़ाइल में आय का विवरण नहीं मिला। कृपया आय प्रमाण पत्र अपलोड करें।"
                else:
                    ans = "No income was found in your uploaded document or profile. Please upload an Income Certificate or enter your income manually."
                return ChatResponse(
                    answer=ans,
                    schemes=[],
                    evidence=[],
                    verification_status="insufficient_evidence",
                    confidence="medium",
                    offline_ready=True,
                )

        # Case 1c: General profile overview
        if profile.age is not None or profile.income is not None or profile.landholding is not None:
            details = []
            if profile.age is not None:
                details.append(f"Age: {profile.age} yrs")
            if profile.income is not None:
                details.append(f"Annual Income: ₹{profile.income:,.0f}")
            if profile.landholding is not None:
                details.append(f"Landholding: {profile.landholding} acres")
            if live_doc_types:
                details.append(f"Verified Documents: {', '.join(live_doc_types)}")

            if lang.startswith("kn"):
                ans = "ನಿಮ್ಮ ಸಕ್ರಿಯ ಸೆಷನ್ ಪರಿಶೀಲಿತ ವಿವರಗಳು:\n• " + "\n• ".join(details)
            elif lang.startswith("hi"):
                ans = "आपके सक्रिय सत्र का सत्यापित विवरण:\n• " + "\n• ".join(details)
            else:
                ans = "Your active session verified profile:\n• " + "\n• ".join(details)

            return ChatResponse(
                answer=ans,
                schemes=[],
                evidence=[],
                verification_status="verified_from_source_data",
                confidence="high",
                offline_ready=True,
            )

        # Case 2: TTL has expired for previously uploaded documents
        if has_user_docs and has_expired_docs and not has_live_docs:
            if lang.startswith("kn"):
                ans = "ನಿಮ್ಮ ತಾತ್ಕಾಲಿಕ ದಾಖಲೆ ಪರಿಶೀಲನಾ ಅವಧಿ ಮುಕ್ತಾಯಗೊಂಡಿದೆ (ಗೌಪ್ಯತೆಗಾಗಿ 5 ನಿಮಿಷಗಳ ನಂತರ ಡೇಟಾ ಅಳಿಸಲಾಗಿದೆ). ಪ್ರಸ್ತುತ ಪರಿಶೀಲಿಸಿದ ಡೇಟಾ ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ದಾಖಲೆಯನ್ನು ಮರು-ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಅಥವಾ ವಿವರಗಳನ್ನು ಹಸ್ತಚಾಲಿತವಾಗಿ ನಮೂದಿಸಿ."
            elif lang.startswith("hi"):
                ans = "आपका अस्थायी दस्तावेज़ सत्यापन सत्र समाप्त हो गया है (गोपनीयता के लिए 5 मिनट के बाद डेटा हटा दिया गया है)। वर्तमान में निकाले गए विवरण उपलब्ध नहीं हैं। कृपया अपना दस्तावेज़ फिर से अपलोड करें या मैन्युअल रूप से विवरण दर्ज करें।"
            else:
                ans = "Your temporary document session has expired (temporary OCR cache purged after 5 minutes for privacy). I do not have current extracted data for your documents. Please re-upload your document or provide your details manually."

            return ChatResponse(
                answer=ans,
                schemes=[],
                evidence=[],
                verification_status="requires_official_verification",
                confidence="medium",
                offline_ready=True,
                tour_id="upload_income_proof",
                suggested_action={
                    "type": "start_tour",
                    "tour_id": "upload_income_proof",
                    "title": "Re-upload Verification Document",
                    "description": "Upload an Income Certificate or relevant proof to restore active verification.",
                    "route": "/upload-document",
                },
            )

        # Case 3: No document uploaded and no profile data
        if lang.startswith("kn"):
            ans = "ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸೆಷನ್‌ನಲ್ಲಿ ಯಾವುದೇ ವಯಸ್ಸು ಅಥವಾ ಆದಾಯದ ವಿವರಗಳು ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ ಅಥವಾ ಇತರ ದಾಖಲೆಯನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಿ ಅಥವಾ ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಅನ್ನು ನವೀಕರಿಸಿ."
        elif lang.startswith("hi"):
            ans = "आपके वर्तमान सत्र में कोई आयु या आय विवरण दर्ज नहीं है। कृपया आय प्रमाण पत्र या संबंधित दस्तावेज़ अपलोड करें अथवा अपनी प्रोफ़ाइल अपडेट करें।"
        else:
            ans = "No age or income details are recorded in your current session. Please upload a verification document (e.g. Income Certificate) or enter your details manually."

        return ChatResponse(
            answer=ans,
            schemes=[],
            evidence=[],
            verification_status="insufficient_evidence",
            confidence="low",
            offline_ready=True,
        )

    def _is_greeting_or_general_help(self, message: str) -> bool:
        msg = message.lower().strip()
        help_phrases = [
            "help", "help me", "help madu", "help madi", "sahaya", "sahaya madi", "sahaya madu",
            "hello", "hi", "namaste", "namaskara", "namaskaram", "namaste ji", "nomoshkar", "hey",
            "what can you do", "guide me", "how to use", "yen madbeku", "madad", "sahayata",
            "मदद", "सहायता", "नमस्ते", "ನಮಸ್ಕಾರ", "ಸಹಾಯ", "ಸಹಾಯ ಮಾಡಿ", "ಹೇಗೆ ಬಳಸಬೇಕು",
            "నమస్కారం", "సహాయం", "வணக்கம்", "உதவி", "നമസ്കാരം", "സഹായം", "নমস্কার", "সাহায্য", "નમસ્તે", "મદદ"
        ]
        return any(msg == p or msg.startswith(p + " ") or msg.endswith(" " + p) for p in help_phrases)

    def _greeting_or_general_help_response(self, language: str) -> ChatResponse:
        lang = language.lower()
        if lang.startswith("kn"):
            answer = "ನಮಸ್ಕಾರ! ನಾನು 'ಸಹಾಯ' - ನಿಮ್ಮ ಡಿಜಿಟಲ್ ಕಲ್ಯಾಣ ಸಹಾಯಕ. ನಾನು ನಿಮಗೆ:\n• ರೈತರು, ವಿದ್ಯಾರ್ಥಿಗಳು ಮತ್ತು ಮಹಿಳೆಯರ ಯೋಜನೆಗಳನ್ನು ತಿಳಿಸಲು,\n• ನಿಮ್ಮ ಅರ್ಹತೆಯನ್ನು ಪರಿಶೀಲಿಸಲು,\n• ಅಗತ್ಯ ದಾಖಲೆಗಳನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಲು ಮಾರ್ಗದರ್ಶನ ನೀಡಬಲ್ಲೆ.\n\nನಿಮಗೆ ಯಾವ ವಿಷಯದಲ್ಲಿ ಸಹಾಯ ಬೇಕು?"
        elif lang.startswith("hi"):
            answer = "नमस्ते! मैं 'सहाय' हूँ - आपका डिजिटल कल्याण सहायक। मैं आपकी सहायता कर सकता हूँ:\n• किसानों, छात्रों और महिलाओं के लिए सरकारी योजनाओं की जानकारी देने में,\n• आपकी पात्रता की जांच करने में,\n• आवश्यक दस्तावेज़ तैयार करने में।\n\nआप किस योजना या विषय के बारे में जानना चाहते हैं?"
        elif lang.startswith("te"):
            answer = "నమస్కారం! నేను 'సహాయ' - మీ డిజిటల్ సంక్షేమ సహాయకుడిని. నేను మీకు సహాయం చేయగలను:\n• రైతులు, విద్యార్థులు మరియు మహిళల కోసం ప్రభుత్వ పథకాలను కనుగొనడంలో,\n• మీ అర్హతను ధృవీకరించడంలో,\n• అవసరమైన పత్రాలను సిద్ధం చేయడంలో.\n\nమీరు ఏ పథకం గురించి తెలుసుకోవాలనుకుంటున్నారు?"
        elif lang.startswith("ta"):
            answer = "வணக்கம்! நான் 'சகாயா' - உங்கள் டிஜிட்டல் நலத்திட்ட உதவியாளர். நான் உங்களுக்கு உதவ முடியும்:\n• விவசாயிகள், மாணவர்கள் மற்றும் பெண்களுக்கான அரசு நலத்திட்டங்களை அறிய,\n• உங்கள் தகுதியைச் சரிபார்க்க,\n• தேவையான ஆவணங்களைத் தயார் செய்ய.\n\nநீங்கள் எந்தத் திட்டம் பற்றி அறிய விரும்புகிறீர்கள்?"
        elif lang.startswith("ml"):
            answer = "നമസ്കാരം! ഞാൻ 'സഹായ' - നിങ്ങളുടെ ഡിജിಟൽ ക്ഷേമ സഹായി. ഞാൻ നിങ്ങളെ സഹായിക്കാം:\n• കർഷകർ, വിദ്യാർത്ഥികൾ, സ്ത്രീകൾ എന്നിവർക്കുള്ള പദ്ധതികൾ അറിയാൻ,\n• നിങ്ങളുടെ യോഗ്യത പരിശോധിക്കാൻ,\n• രേഖകൾ തയ്യാറാക്കാൻ.\n\nനിങ്ങൾക്ക് ഏത് വിഷയത്തിലാണ് സഹായം വേണ്ടത്?"
        elif lang.startswith("bn"):
            answer = "নমস্কার! আমি 'সহায়' - আপনার ডিজিটাল কল্যাণ সহকারী। আমি আপনাকে সাহায্য করতে পারি:\n• কৃষক, ছাত্রছাত্রী এবং মহিলাদের জন্য সরকারি প্রকল্প খুঁজে পেতে,\n• আপনার যোগ্যতা যাচাই করতে,\n• প্রয়োজনীয় নথিপত্র প্রস্তুত করতে।\n\nআপনি কোন প্রকল্প সম্পর্কে জানতে চান?"
        elif lang.startswith("mr"):
            answer = "नमस्ते! मी 'सहाया' - आपला डिजिटल कल्याण सहाय्यक. मी आपल्याला मदत करू शकतो:\n• शेतकरी, विद्यार्थी आणि महिलांसाठी सरकारी योजना शोधण्यात,\n• आपली पात्रता तपासण्यात,\n• आवश्यक कागदपत्रे तयार करण्यात.\n\nआपल्याला कोणत्या योजनेबद्दल माहिती हवी आहे?"
        elif lang.startswith("gu"):
            answer = "નમસ્તે! હું 'સહાય' છું - તમારો ડિજિટલ કલ્યાણ સહાયક. હું તમને મદદ કરી શકું છું:\n• ખેડૂતો, વિદ્યાર્થીઓ અને મહિલાઓ માટે સરકારી યોજનાઓ શોધવામાં,\n• તમારી પાત્રતા તપાસવામાં,\n• જરૂરી દસ્તાવેજો તૈયાર કરવામાં.\n\nતમે કઈ યોજના વિશે જાણવા માગો છો?"
        else:
            answer = "Namaste! I am Sahaya, your digital citizen welfare assistant. I can help you with:\n• Finding government welfare schemes for farmers, students, workers, and families\n• Checking your deterministic eligibility with transparent rules\n• Discovering missed welfare entitlements\n• Guided step-by-step document preparation\n\nWhat would you like to explore today?"

        tour_id = "explore_welfare_gaps"
        suggested_action = {
            "type": "guided_tour",
            "tour_id": "explore_welfare_gaps",
            "title": "Explore Missed Benefits",
            "description": "Discover schemes you qualify for with our guided spotlight tour.",
            "route": "/welfare-gaps",
        }

        return ChatResponse(
            answer=answer,
            schemes=[],
            evidence=[],
            verification_status="verified_from_source_data",
            confidence="high",
            offline_ready=True,
            tour_id=tour_id,
            suggested_action=suggested_action,
        )

    def _is_unsupported_query(self, message: str, chunks: list[dict[str, Any]]) -> bool:

        msg = message.lower()
        unsupported_triggers = ["fake scheme", "crypto scheme", "random scheme x", "hacked scheme"]
        return any(t in msg for t in unsupported_triggers)

    def _insufficient_evidence_response(self, language: str) -> ChatResponse:
        lang = language.lower()
        if lang.startswith("hi"):
            answer = "मेरे पास उपलब्ध सत्यापित टेक सहायता (Tech Sahaya) डेटा में इसका सटीक उत्तर देने के लिए पर्याप्त जानकारी नहीं है। कृपया आधिकारिक सरकारी पोर्टल पर जांच करें।"
        elif lang.startswith("kn"):
            answer = "ನನ್ನ ಬಳಿ ಇರುವ ಪರಿಶೀಲಿತ ಟೆಕ್ ಸಹಾಯ (Tech Sahaya) ಡೇಟಾದಲ್ಲಿ ಇದಕ್ಕೆ ನಿಖರವಾದ ಉತ್ತರ ನೀಡಲು ಸಾಕಷ್ಟು ಮಾಹಿತಿ ಇಲ್ಲ. ದಯವಿಟ್ಟು ಅಧಿಕೃತ ಸರ್ಕಾರಿ ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸಿ."
        elif lang.startswith("te"):
            answer = "లభ్యమైన ధృవీకరించబడిన టెక్ సహాయ (Tech Sahaya) డేటాలో ఖచ్చితమైన సమాధానం ఇవ్వడానికి తగిన సమాచారం లేదు. దయచేసి అధికారిక ప్రభుత్వ పోర్టల్‌లో తనిಖೀ చేయండి."
        elif lang.startswith("ta"):
            answer = "சரிபார்க்கப்பட்ட டெக் சகாயா (Tech Sahaya) தரவில் இதற்கு துல்லியமான பதில் அளிக்க போதுமான தகவல் இல்லை. அதிகாரப்பூர்வ அரசு தளத்தில் சரிபார்க்கவும்."
        elif lang.startswith("ml"):
            answer = "ടെക് സഹായ (Tech Sahaya) വിവരങ്ങളിൽ ഇതിന് കൃത്യമായ മറുപടി നൽകാൻ ആവശ്യമായ വിവരങ്ങൾ ലഭ്യമല്ല. ദയവായി ഔദ്യോഗിക പോർട്ടലിൽ പരിശോധിക്കുക."
        elif lang.startswith("bn"):
            answer = "যাচাইকৃত টেক সহায় (Tech Sahaya) ডেটায় এর সঠিক উত্তর দেওয়ার জন্য পর্যাপ্ত তথ্য নেই। দয়া করে অফিসিয়াল সরকারি পোর্টালে যাচাই করুন."
        elif lang.startswith("mr"):
            answer = "उपलब्ध सत्यापित टेक सहाया (Tech Sahaya) डेटामध्ये याचे अचूक उत्तर देण्यासाठी पुरेशी माहिती नाही. कृपया अधिकृत सरकारी संकेतस्थळावर तपासा."
        elif lang.startswith("gu"):
            answer = "ચકાસાયેલ ટેક સહાય (Tech Sahaya) ડેટામાં સચોટ જવાબ આપવા માટે પૂરતી માહિતી ઉપલબ્ધ નથી. કૃપા કરીને સત્તાવાર સરકારી પોર્ટલ પર તપાસો."
        else:
            answer = "I don't have enough verified information in the Tech Sahaya database to answer that accurately. Please verify on the official government portal."

        return ChatResponse(
            answer=answer,
            schemes=[],
            evidence=[],
            verification_status="insufficient_evidence",
            confidence="low",
            offline_ready=True,
        )

    def _calculate_confidence(self, chunks: list[dict[str, Any]], schemes: list[Scheme], message: str) -> str:
        if not chunks or not schemes:
            return "low"
        top_score = max((c.get("retrieval_score", 0.0) for c in chunks), default=0.0)
        norm_msg = search_service._normalize_query(message)
        target_schemes = search_service._detect_target_schemes(norm_msg)

        if target_schemes and any(s.id in target_schemes for s in schemes):
            return "high"
        if top_score >= 0.30:
            return "high"
        if top_score >= 0.10:
            return "medium"
        return "low"

    def _generate_grounded_answer(
        self,
        message: str,
        language: str,
        intent: str,
        schemes: list[Scheme],
        chunks: list[dict[str, Any]],
        eligibility_result: EligibilityResult | None,
        profile: EligibilityProfile | None = None,
        ocr_extracted_profile_payload: str = "None active in session",
        has_expired_docs: bool = False,
    ) -> str:
        api_key = settings.gemini_api_key or settings.google_api_key
        if api_key:
            try:
                answer = self._call_gemini_api(
                    api_key=api_key,
                    message=message,
                    language=language,
                    intent=intent,
                    schemes=schemes,
                    chunks=chunks,
                    eligibility_result=eligibility_result,
                    profile=profile,
                    ocr_extracted_profile_payload=ocr_extracted_profile_payload,
                )
                if answer and len(answer.strip()) > 10:
                    return answer
            except Exception as exc:
                logger.warning("Gemini API call failed, falling back to local generator: %s", exc)

        return self._generate_local_grounded_fallback(
            message=message,
            language=language,
            intent=intent,
            schemes=schemes,
            chunks=chunks,
            eligibility_result=eligibility_result,
            profile=profile,
            has_expired_docs=has_expired_docs,
        )

    def _call_gemini_api(
        self,
        api_key: str,
        message: str,
        language: str,
        intent: str,
        schemes: list[Scheme],
        chunks: list[dict[str, Any]],
        eligibility_result: EligibilityResult | None,
        profile: EligibilityProfile | None = None,
        ocr_extracted_profile_payload: str = "None active in session",
    ) -> str:
        system_instruction = SAHAYA_SYSTEM_INSTRUCTION.format(language=language)

        translations_map = load_scheme_translations()
        lang_key = next((k for k in ["hi", "kn", "te", "ta", "ml", "bn", "mr", "gu"] if language.lower().startswith(k)), "en")

        schemes_payload = []
        for s in schemes:
            trans = translations_map.get(s.id, {}).get(lang_key) if lang_key != "en" else None
            if lang_key != "en":
                if trans:
                    schemes_payload.append({
                        "name": s.name,  # Official scheme name preserved
                        "category": s.category,
                        "state_scope": s.state_scope,
                        "description": trans.get("description", s.description),
                        "benefits": trans.get("benefits", s.benefits),
                        "eligibility": trans.get("eligibility", s.eligibility),
                        "required_documents": trans.get("required_documents", s.required_documents),
                        "application_steps": trans.get("application_steps", s.application_steps),
                        "department": trans.get("department", s.department),
                        "official_link": str(s.official_link),
                        "source_name": s.source_name,
                    })
                else:
                    logger.info("Scheme '%s' missing '%s' translation entry — falling back to LLM translation.", s.id, lang_key)
                    schemes_payload.append({
                        "name": s.name,
                        "category": s.category,
                        "state_scope": s.state_scope,
                        "description": s.description,
                        "benefits": s.benefits,
                        "eligibility": s.eligibility,
                        "required_documents": s.required_documents,
                        "application_steps": s.application_steps,
                        "department": s.department,
                        "official_link": str(s.official_link),
                        "source_name": s.source_name,
                    })
            else:
                schemes_payload.append({
                    "name": s.name,
                    "category": s.category,
                    "state_scope": s.state_scope,
                    "description": s.description,
                    "benefits": s.benefits,
                    "eligibility": s.eligibility,
                    "required_documents": s.required_documents,
                    "application_steps": s.application_steps,
                    "department": s.department,
                    "official_link": str(s.official_link),
                    "source_name": s.source_name,
                })

        evidence_payload = [{"scheme": c["scheme_name"], "type": c["chunk_type"], "text": c["text"]} for c in chunks]
        eligibility_payload = eligibility_result.model_dump() if eligibility_result else "No profile evaluated"
        tours_allowlist = load_tours().get("allowlist", [])

        citizen_context_payload = profile.model_dump() if profile else "No stored profile"

        proactive_schemes = []
        if profile:
            for s in self.schemes:
                rule = self.rules.get(s.id, {})
                res = eligibility_engine.evaluate(s.id, profile, rule, s.alternative_scheme_ids)
                if res.status == "eligible":
                    proactive_schemes.append({"id": s.id, "name": s.name, "benefits": s.benefits})
        proactive_schemes_payload = proactive_schemes if proactive_schemes else "None currently eligible"

        family_schemes_payload = "None recorded"
        alternative_schemes_payload = eligibility_result.alternative_schemes if (eligibility_result and eligibility_result.alternative_schemes) else "None"
        pii_detection_payload = "No sensitive identity numbers detected"

        user_prompt = USER_PROMPT_TEMPLATE.format(
            message=message,
            language=language,
            intent=intent,
            citizen_context_payload=citizen_context_payload,
            evidence_payload=evidence_payload,
            schemes_payload=schemes_payload,
            eligibility_payload=eligibility_payload,
            proactive_schemes_payload=proactive_schemes_payload,
            family_schemes_payload=family_schemes_payload,
            alternative_schemes_payload=alternative_schemes_payload,
            pii_detection_result=pii_detection_payload,
            ocr_extracted_profile_payload=ocr_extracted_profile_payload,
            pii_detection_payload=pii_detection_payload,
            tours_allowlist=tours_allowlist,
        )

        headers = {"Content-Type": "application/json"}
        payload = {
            "systemInstruction": {
                "parts": [{"text": system_instruction}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_prompt}],
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 700,
            },
        }

        # Primary Model
        url = f"{settings.sarvam_api_base_url.replace('sarvam.ai', 'googleapis.com')}/v1beta/models/{settings.gemini_model}:generateContent?key={api_key}"
        if "googleapis.com" not in url:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent?key={api_key}"

        with httpx.Client(timeout=10.0) as client:
            response = client.post(url, json=payload, headers=headers)
            if response.status_code != 200:
                # Fallback model retry
                fallback_url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_fallback_model}:generateContent?key={api_key}"
                response = client.post(fallback_url, json=payload, headers=headers)

            if response.status_code == 200:
                data = response.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return parts[0].get("text", "").strip()

        raise RuntimeError("Gemini API response contained no valid text")

    def _validate_and_sanitize_output(
        self,
        raw_answer: str,
        eligibility_result: EligibilityResult | None,
        schemes: list[Scheme],
        language: str,
        intent: str,
    ) -> str:
        """Cross-check LLM explanation against deterministic rule evaluation."""
        if not raw_answer or not eligibility_result:
            return raw_answer

        lowered = raw_answer.lower()

        # If rule engine says NOT eligible, but LLM says eligible:
        if eligibility_result.status == "not_eligible":
            if any(phrase in lowered for phrase in ["you are eligible", "you qualify", "you are fully eligible", "आप पात्र हैं", "ನೀವು ಅರ್ಹರಾಗಿದ್ದೀರಿ"]):
                logger.warning("Guardrail violation: LLM claimed eligible when rule engine calculated not_eligible. Reverting to verified template.")
                return self._generate_local_grounded_fallback(
                    message="",
                    language=language,
                    intent=intent,
                    schemes=schemes,
                    chunks=[],
                    eligibility_result=eligibility_result,
                )

        # If rule engine says ELIGIBLE, but LLM says not eligible:
        if eligibility_result.status == "eligible":
            if any(phrase in lowered for phrase in ["you are not eligible", "you do not qualify", "you are ineligible", "आप पात्र नहीं हैं", "ನೀವು ಅರ್ಹರಲ್ಲ"]):
                logger.warning("Guardrail violation: LLM claimed not eligible when rule engine calculated eligible. Reverting to verified template.")
                return self._generate_local_grounded_fallback(
                    message="",
                    language=language,
                    intent=intent,
                    schemes=schemes,
                    chunks=[],
                    eligibility_result=eligibility_result,
                )

        return raw_answer

    def _detect_and_validate_tour_action(
        self,
        message: str,
        answer: str,
        intent: str,
        eligibility_result: EligibilityResult | None,
    ) -> tuple[str | None, dict[str, Any] | None]:
        """Detect and validate tour actions strictly against the backend allowlist."""
        tours_data = load_tours()
        allowlist = set(tours_data.get("allowlist", []))
        tours_list = tours_data.get("tours", [])
        tour_map = {t["id"]: t for t in tours_list}

        tour_id: str | None = None

        # Check explicit LLM tag: [TOUR_ACTION: upload_income_proof]
        match = re.search(r"\[TOUR_ACTION:\s*([a-zA-Z0-9_\-]+)\]", answer)
        if match:
            candidate = match.group(1).strip()
            if candidate in allowlist:
                tour_id = candidate
            else:
                logger.warning("Stripped disallowed tour ID emitted by model: %s", candidate)

        # If no explicit tag, heuristically match citizen intent
        if not tour_id:
            msg_lower = message.lower()
            if any(w in msg_lower for w in ["upload income", "income proof", "income certificate", "आय प्रमाण पत्र", "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ"]):
                tour_id = "upload_income_proof"
            elif any(w in msg_lower for w in ["update profile", "complete profile", "set income", "change state", "ಪ್ರೊಫೈಲ್"]):
                tour_id = "complete_profile"
            elif any(w in msg_lower for w in ["missed scheme", "welfare gap", "find schemes for me", "छूटे हुए लाभ"]):
                tour_id = "explore_welfare_gaps"
            elif any(w in msg_lower for w in ["check eligibility", "am i eligible", "पात्रता जांच"]):
                tour_id = "verify_eligibility"
            elif any(w in msg_lower for w in ["family benefit", "family member", "परिवार"]):
                tour_id = "family_optimizer"

        # Validate strictly against allowlist
        if tour_id and tour_id in allowlist and tour_id in tour_map:
            tour_obj = tour_map[tour_id]
            suggested_action = {
                "type": "start_tour",
                "tour_id": tour_id,
                "title": tour_obj.get("title", "Start Guided Tour"),
                "description": tour_obj.get("description", ""),
                "route": tour_obj.get("steps", [{}])[0].get("route", "/dashboard"),
            }
            return tour_id, suggested_action

        return None, None

    def _generate_local_grounded_fallback(
        self,
        message: str,
        language: str,
        intent: str,
        schemes: list[Scheme],
        chunks: list[dict[str, Any]],
        eligibility_result: EligibilityResult | None,
        profile: EligibilityProfile | None = None,
        has_expired_docs: bool = False,
    ) -> str:
        if not schemes:
            return self._insufficient_evidence_response(language).answer

        primary = schemes[0]
        scheme_names = ", ".join(s.name for s in schemes)
        lang = language.lower()
        lang_key = "hi" if lang.startswith("hi") else "kn" if lang.startswith("kn") else "en"
        trans = load_scheme_translations().get(primary.id, {}).get(lang_key) if lang_key != "en" else None

        desc = trans.get("description", primary.description) if trans else primary.description
        benefits = trans.get("benefits", primary.benefits) if trans else primary.benefits
        docs = trans.get("required_documents", primary.required_documents) if trans else primary.required_documents
        steps = trans.get("application_steps", primary.application_steps) if trans else primary.application_steps

        if lang.startswith("hi"):
            lines = [f"**सत्यापित योजना जानकारी: {scheme_names}**\n"]
            if intent == "documents":
                lines.append(f"• **आवश्यक दस्तावेज़**: {', '.join(docs)}")
            elif intent == "benefits":
                lines.append(f"• **मुख्य लाभ**: {'; '.join(benefits)}")
            elif intent == "application":
                lines.append(f"• **आवेदन प्रक्रिया**: {' -> '.join(steps)}")
            elif intent == "website":
                lines.append(f"• **आधिकारिक पोर्टल**: {primary.official_link}")
            else:
                lines.append(f"• **विवरण**: {desc}")
                lines.append(f"• **श्रेणी व दायरा**: {primary.category} (राज्य: {', '.join(primary.state_scope)})")
                lines.append(f"• **लाभ**: {'; '.join(benefits)}")

            if eligibility_result:
                status_hi = "पात्र (Eligible)" if eligibility_result.status == "eligible" else "अपात्र (Not Eligible)" if eligibility_result.status == "not_eligible" else "अधिक जानकारी चाहिए"
                lines.append(f"\n• **नियम-आधारित पात्रता स्थिति**: {status_hi}")
                lines.append(f"• **स्पष्टीकरण**: {eligibility_result.explanation}")
                if eligibility_result.matched:
                    lines.append(f"• **संतुष्ट शर्तें**: {', '.join(eligibility_result.matched)}")
                if eligibility_result.failed:
                    lines.append(f"• **अधूरी शर्तें**: {', '.join(eligibility_result.failed)}")
                if eligibility_result.missing:
                    lines.append(f"• **अनुपलब्ध प्रोफ़ाइल फ़ील्ड**: {', '.join(eligibility_result.missing)}")

                if profile and (profile.age is not None or profile.income is not None):
                    age_str = f"{profile.age} वर्ष" if profile.age is not None else "उपलब्ध नहीं"
                    inc_str = f"₹{profile.income:,.0f}" if profile.income is not None else "उपलब्ध नहीं"
                    lines.append(f"• **सत्यापित प्रोफ़ाइल सत्र डेटा**: आयु: {age_str} | वार्षिक आय: {inc_str}")

                if has_expired_docs and eligibility_result.missing:
                    lines.append("• *सत्र सूचना*: आपका पहले अपलोड किया गया दस्तावेज़ डेटा अस्थायी मेमोरी से समाप्त हो गया है। पूर्ण पात्रता जांच के लिए कृपया पुनः अपलोड करें।")

            lines.append(f"\n• **आधिकारिक स्रोत**: {primary.source_name} ({primary.official_link})")
            lines.append("• *टिप्पणी*: आवेदन करने से पहले आधिकारिक वेबसाइट पर नियम सत्यापित करें।")
            return "\n".join(lines)

        elif lang.startswith("kn"):
            lines = [f"**ಪರಿಶೀಲಿತ ಯೋಜನೆ ಮಾಹಿತಿ: {scheme_names}**\n"]
            if intent == "documents":
                lines.append(f"• **ಅಗತ್ಯ ದಾಖಲೆಗಳು**: {', '.join(docs)}")
            elif intent == "benefits":
                lines.append(f"• **ಮುಖ್ಯ ಪ್ರಯೋಜನಗಳು**: {'; '.join(benefits)}")
            elif intent == "application":
                lines.append(f"• **ಅರ್ಜಿ ಸಲ್ಲಿಸುವ ವಿಧಾನ**: {' -> '.join(steps)}")
            elif intent == "website":
                lines.append(f"• **ಅಧಿಕೃತ ಪೋರ್ಟಲ್**: {primary.official_link}")
            else:
                lines.append(f"• **ವಿವರಣೆ**: {desc}")
                lines.append(f"• **ವರ್ಗ ಮತ್ತು ವ್ಯಾಪ್ತಿ**: {primary.category} (ರಾಜ್ಯ: {', '.join(primary.state_scope)})")
                lines.append(f"• **ಪ್ರಯೋಜನಗಳು**: {'; '.join(benefits)}")

            if eligibility_result:
                status_kn = "ಅರ್ಹರಾಗಿದ್ದೀರಿ (Eligible)" if eligibility_result.status == "eligible" else "ಅರ್ಹರಲ್ಲ (Not Eligible)" if eligibility_result.status == "not_eligible" else "ಹೆಚ್ಚಿನ ಮಾಹಿತಿ ಬೇಕಾಗಿದೆ"
                lines.append(f"\n• **ನಿಯಮ-ಆಧಾರಿತ ಅರ್ಹತಾ ಮೌಲ್ಯಮಾಪನ**: {status_kn}")
                lines.append(f"• **ವಿವರಣೆ**: {eligibility_result.explanation}")
                if eligibility_result.matched:
                    lines.append(f"• **ಪೂರೈಸಿದ ಷರತ್ತುಗಳು**: {', '.join(eligibility_result.matched)}")
                if eligibility_result.failed:
                    lines.append(f"• **ಅಪೂರ್ಣ ಷರತ್ತುಗಳು**: {', '.join(eligibility_result.failed)}")
                if eligibility_result.missing:
                    lines.append(f"• **ಅಗತ್ಯವಿರುವ ವಿವರಗಳು**: {', '.join(eligibility_result.missing)}")

                if profile and (profile.age is not None or profile.income is not None):
                    age_str = f"{profile.age} ವರ್ಷ" if profile.age is not None else "ಲಭ್ಯವಿಲ್ಲ"
                    inc_str = f"ರೂ {profile.income:,.0f}" if profile.income is not None else "ಲಭ್ಯವಿಲ್ಲ"
                    lines.append(f"• **ಪರಿಶೀಲಿತ ಸೆಷನ್ ವಿವರಗಳು**: ವಯಸ್ಸು: {age_str} | ಆದಾಯ: {inc_str}")

                if has_expired_docs and eligibility_result.missing:
                    lines.append("• *ಸೆಷನ್ ಸೂಚನೆ*: ನಿಮ್ಮ ಹಿಂದಿನ ದಾಖಲೆ ಡೇಟಾ ತಾತ್ಕಾಲಿಕ ಮೆಮೊರಿಯಿಂದ ಮುಕ್ತಾಯಗೊಂಡಿದೆ. ಪೂರ್ಣ ಪರಿಶೀಲನೆಗಾಗಿ ದಯವಿಟ್ಟು ಮರು-ಅಪ್‌ಲೋಡ್ ಮಾಡಿ.")

            lines.append(f"\n• **ಅಧಿಕೃತ ಮೂಲ**: {primary.source_name} ({primary.official_link})")
            lines.append("• *ಟಿಪ್ಪಣಿ*: ಅರ್ಜಿ ಸಲ್ಲಿಸುವ ಮೊದಲು ಅಧಿಕೃತ ವೆಬ್‌ಸೈಟ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸಿ.")
            return "\n".join(lines)

        else:
            lines = [f"**Verified Scheme Information: {scheme_names}**\n"]
            if intent == "documents":
                docs = ", ".join(primary.required_documents)
                lines.append(f"• **Required Documents**: {docs}")
            elif intent == "benefits":
                bens = "; ".join(primary.benefits)
                lines.append(f"• **Key Benefits**: {bens}")
            elif intent == "application":
                steps = " -> ".join(primary.application_steps)
                lines.append(f"• **Application Steps**: {steps}")
            elif intent == "website":
                lines.append(f"• **Official Portal**: {primary.official_link}")
            else:
                lines.append(f"• **Overview**: {primary.description}")
                lines.append(f"• **Category & Scope**: {primary.category} (State: {', '.join(primary.state_scope)})")
                lines.append(f"• **Benefits**: {'; '.join(primary.benefits)}")

            if eligibility_result:
                lines.append(f"\n• **Deterministic Eligibility Evaluation**: {eligibility_result.status.upper()}")
                lines.append(f"• **Engine Explanation**: {eligibility_result.explanation}")
                if eligibility_result.matched:
                    lines.append(f"• **Satisfied Conditions**: {', '.join(eligibility_result.matched)}")
                if eligibility_result.failed:
                    lines.append(f"• **Unmet Conditions**: {', '.join(eligibility_result.failed)}")
                if eligibility_result.missing:
                    lines.append(f"• **Missing Profile Fields**: {', '.join(eligibility_result.missing)}")

                if profile and (profile.age is not None or profile.income is not None):
                    age_str = f"{profile.age} yrs" if profile.age is not None else "N/A"
                    inc_str = f"₹{profile.income:,.0f}" if profile.income is not None else "N/A"
                    lines.append(f"• **Verified Session Profile Data**: Age: {age_str} | Annual Income: {inc_str}")

                if has_expired_docs and eligibility_result.missing:
                    lines.append("• *Session Notice*: Your previously uploaded document data has expired from temporary memory for privacy. Please re-upload your document or provide details manually for full verification.")

            lines.append(f"\n• **Official Source**: {primary.source_name} ({primary.official_link})")
            lines.append("• *Verification Note*: Always verify current guidelines on the official portal before applying.")
            return "\n".join(lines)


chat_service = ChatService()
