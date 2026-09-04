from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, HttpUrl


RoleName = Literal["citizen", "csc_operator", "admin"]


class Scheme(BaseModel):
    id: str
    name: str
    description: str
    category: str
    state_scope: list[str]
    benefits: list[str]
    eligibility: list[str]
    required_documents: list[str]
    application_steps: list[str]
    department: str
    official_link: HttpUrl
    source_name: str
    source_reference: str
    last_verified: str
    alternative_scheme_ids: list[str] = []
    data_note: str | None = None


class EligibilityProfile(BaseModel):
    age: int | None = None
    gender: str | None = None
    state: str | None = None
    occupation: str | None = None
    income: float | None = None
    landholding: float | None = None
    disability: bool | None = None
    family_members: list[dict[str, Any]] = Field(default_factory=list)
    available_documents: list[str] = Field(default_factory=list)


class EligibilityResult(BaseModel):
    eligible: bool
    status: Literal["eligible", "not_eligible", "needs_more_information", "document_verification_required"]
    matched: list[str]
    failed: list[str]
    missing: list[str]
    score: int
    explanation: str
    next_action: str
    alternative_schemes: list[str] = Field(default_factory=list)
    verified: bool | None = None
    reason_code: str | None = None


class CheckEligibilityRequest(BaseModel):
    scheme_id: str
    profile: EligibilityProfile


class WhatIfRequest(BaseModel):
    scheme_id: str
    current_profile: EligibilityProfile
    simulated_changes: dict[str, Any]


class FamilyMember(BaseModel):
    name: str
    age: int | None = None
    gender: str | None = None
    occupation: str | None = None
    income: float | None = None
    relationship: str
    state: str | None = None
    disability: bool | None = None
    landholding: float | None = None
    available_documents: list[str] = Field(default_factory=list)


class FamilyAnalysisRequest(BaseModel):
    members: list[FamilyMember]


class ChatRequest(BaseModel):
    message: str
    language: str = "en"
    profile: EligibilityProfile | None = None


class VoiceChatRequest(BaseModel):
    transcript: str | None = None
    audio_base64: str | None = None
    language: str = "en"
    profile: EligibilityProfile | None = None


class EligibleSummaryRequest(BaseModel):
    user_name: str = "Citizen"
    scheme_names: list[str] = Field(default_factory=list)
    language: str = "en"


class ChatResponse(BaseModel):
    answer: str
    schemes: list[Scheme] = Field(default_factory=list)
    evidence: list[dict[str, Any]] = Field(default_factory=list)
    verification_status: str
    confidence: str
    offline_ready: bool = True
    tour_id: str | None = None
    suggested_action: dict[str, Any] | None = None
    audio_base64: str | None = None
    audio_mime: str | None = None


class VoiceChatResponse(BaseModel):
    transcript: str
    response: ChatResponse
    audio_base64: str | None = None
    audio_mime: str = "audio/wav"
    mode: str = "sarvam_ai"




class ProfileUpdate(BaseModel):
    preferred_language: str = "en"
    accessibility_preference: str = "standard"
    consent_given: bool = False
    age: int | None = None
    gender: str | None = None
    state: str | None = None
    occupation: str | None = None
    income: float | None = None
    landholding: float | None = None
    disability: bool = False
    family_members: list[dict[str, Any]] = Field(default_factory=list)
    available_documents: list[str] = Field(default_factory=list)
    recently_viewed_schemes: list[str] = Field(default_factory=list)
    digital_literacy: str = "guided"


class ProfileResponse(ProfileUpdate):
    user_id: str
    full_name: str
    email: EmailStr
    phone_number: str | None = None
    role: RoleName
    stored_data_summary: dict[str, Any]


class RecommendationItem(BaseModel):
    scheme_id: str
    scheme_name: str
    relevance_score: int
    reason: str


class WelfareGapItem(BaseModel):
    scheme: str
    estimated_relevance: int
    why_it_may_apply: str
    why_missed: str
    missing_document_or_information: str
    recommended_next_action: str
    reason_category: str


class SignUpRequest(BaseModel):
    full_name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=8)
    preferred_language: str = "en"
    phone_number: str | None = None
    consent_given: bool


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_session: bool = False


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class SessionUser(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    preferred_language: str
    onboarding_completed: bool = False
    role: RoleName


class AuthResponse(BaseModel):
    token: str
    expires_at: str
    auth_adapter: str = "local"
    user: SessionUser


class ConsentRequest(BaseModel):
    consent_version: str = "v1"
    selected_language: str = "en"
    purpose: str = "welfare_assistance"
    consent_given: bool = True


class DocumentSummary(BaseModel):
    id: str
    document_type: str
    status: str
    verification_state: str
    masked_fields: dict[str, Any]
    file_name: str
    mime_type: str
    file_size: int
    retained_in_storage: bool
    created_at: str


class NotificationItem(BaseModel):
    id: str
    title: str
    message: str
    level: str
    read: bool
    created_at: str


class AuditItem(BaseModel):
    id: str
    event_type: str
    target_resource: str
    detail: str
    actor_role: str
    created_at: str


class CitizenSessionRequest(BaseModel):
    citizen_email: EmailStr
    language: str = "en"


class CitizenSessionResponse(BaseModel):
    session_id: str
    citizen_user_id: str
    operator_user_id: str
    language: str
    active: bool


class SaveSchemeRequest(BaseModel):
    scheme_id: str

