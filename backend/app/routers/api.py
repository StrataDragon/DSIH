import base64
import logging
from typing import Optional
from uuid import uuid4

logger = logging.getLogger("techsahaya.api")

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, get_optional_user, get_user_role, require_document_access, require_role

from app.core.config import get_settings
from app.core.db import get_db
from app.models.db_models import AuditLog, AuthorizedSession, DocumentRecord, NotificationRecord, SavedScheme, User
from app.models.schemas import (
    BenefitsPassportResponse,
    ChatRequest,
    CheckEligibilityRequest,
    CitizenSessionRequest,
    ConsentRequest,
    EligibleSummaryRequest,
    FamilyAnalysisRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ProfileUpdate,
    SaveSchemeRequest,
    SignUpRequest,
    VoiceChatRequest,
    VoiceChatResponse,
    WhatIfRequest,
)
from app.services.audit_service import audit_service
from app.services.auth_service import auth_service
from app.services.benefits_passport_service import benefits_passport_service
from app.services.chat_service import chat_service
from app.services.data_loader import load_languages, load_personas, load_rules, load_schemes, load_tours
from app.services.document_service import document_service, REUPLOAD_PROMPTS
from app.services.eligibility_engine import eligibility_engine
from app.services.journey_service import journey_service
from app.services.profile_service import profile_service
from app.services.recommendation_service import recommendation_service
from app.services.sarvam_service import SarvamAPIError, sarvam_service
from app.services.text_normalizer import normalize_for_speech

router = APIRouter(prefix="/api", tags=["api"])
settings = get_settings()



def _profile_from_current(db: Session, user: User):
    profile = profile_service.get_or_create(db, user)
    from app.models.schemas import EligibilityProfile

    return EligibilityProfile(
        full_name=user.full_name,
        age=profile.age,
        gender=profile.gender,
        state=profile.state,
        occupation=profile.occupation,
        income=profile.income,
        landholding=profile.landholding,
        disability=profile.disability,
        family_members=profile.family_members or [],
        available_documents=profile.available_documents or [],
    )


@router.post("/auth/signup")
def signup(payload: SignUpRequest, request: Request, db: Session = Depends(get_db)):
    return auth_service.signup(db, payload, request)


@router.post("/auth/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    return auth_service.login(db, payload, request)


@router.post("/onboarding/welcome-audio")
async def onboarding_welcome_audio(
    language: str = "en",
    user: User = Depends(get_current_user),
):
    welcome_messages = {
        "en": "Welcome to Tech Sahaya. Please complete your profile so we can find government schemes that you may be eligible for.",
        "hi": "टेक सहाय में आपका स्वागत है। कृपया अपनी प्रोफ़ाइल पूरी करें ताकि हम आपके लिए उपयुक्त सरकारी योजनाएं खोज सकें।",
        "kn": "ಟೆಕ್ ಸಹಾಯಕ್ಕೆ ಸ್ವಾಗತ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪೂರ್ಣಗೊಳಿಸಿ, ಇದರಿಂದ ನಿಮಗೆ ಸೂಕ್ತವಾದ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳನ್ನು ಹುಡುಕಲು ನಮಗೆ ಸಾಧ್ಯವಾಗುತ್ತದೆ.",
        "te": "టెక్ సహాయకు స్వాగతం. దయచేసి మీ ప్రొఫైల్‌ను పూర్తి చేయండి, తద్వారా మీరు అర్హులైన ప్రభుత్వ పథకాలను మేము కనుగొనగలము.",
        "ta": "டெக் சகாயாவிற்கு வரவேற்கிறோம். தயவுசெய்து உங்கள் சுயவிவரத்தை நிரப்பவும், இதன் மூலம் நீங்கள் தகுதியான அரசு திட்டங்களை நாங்கள் கண்டறிய முடியும்.",
        "ml": "ടെക് സഹായയിലേക്ക് സ്വാഗതം. നിങ്ങൾക്ക് അർഹമായ സർക്കാർ പദ്ധതികൾ കണ്ടെത്താനായി പ്രൊഫൈൽ പൂർത്തിയാക്കുക.",
        "bn": "টেক সহায়ে স্বাগতম। দয়া করে আপনার প্রোফাইল সম্পূর্ণ করুন যাতে আমরা আপনার জন্য উপযুক্ত সরকারি প্রকল্প খুঁজে পেতে পারি।",
        "mr": "टेक सहाय्य मध्ये आपले स्वागत आहे. कृपया आपले प्रोफाईल पूर्ण करा जेणेकरून आम्ही आपल्यासाठी योग्य सरकारी योजना शोधू शकू.",
        "gu": "ટેક સહાયમાં આપનું સ્વાગત છે. કૃપા કરીને તમારી પ્રોફાઇલ પૂર્ણ કરો જેથી અમે તમને પાત્ર સરકારી યોજનાઓ શોધી શકીએ.",
    }
    language_key = language[:2].lower()
    message = welcome_messages.get(language_key, welcome_messages["en"])
    try:
        tts_text = normalize_for_speech(message, language_code=language_key)
        audio_bytes = await sarvam_service.text_to_speech(tts_text, language_code=language_key)
    except SarvamAPIError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message) from err
    return {"audio_base64": base64.b64encode(audio_bytes).decode("utf-8"), "audio_mime": "audio/wav"}


@router.post("/auth/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    auth_header = request.headers.get("authorization", "")
    token = auth_header.split(" ", 1)[1] if " " in auth_header else ""
    auth_service.logout(db, user, token, request)
    return {"status": "logged_out"}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = profile_service.get_or_create(db, user)
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "preferred_language": user.preferred_language,
        "onboarding_completed": profile.onboarding_completed,
        "role": get_user_role(db, user.id),
        "auth_adapter": settings.auth_adapter,
    }


@router.post("/auth/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    audit_service.log(db, "forgot_password", f"Password reset requested for {payload.email}", None, "anonymous", "auth", request)
    return {"status": "reset_requested", "message": "If your account exists, password reset instructions will be sent through the configured secure channel."}


@router.post("/consent")
def consent(payload: ConsentRequest, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    auth_service.grant_consent(db, user, payload, request)
    return {"status": "recorded"}


@router.post("/chat")
async def chat(payload: ChatRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    chat_response = chat_service.answer(payload.message, payload.language, payload.profile, user=user, db=db)
    if settings.sarvam_api_key and chat_response.answer:
        try:
            tts_text = normalize_for_speech(chat_response.answer, language_code=payload.language)
            audio_bytes = await sarvam_service.text_to_speech(tts_text, language_code=payload.language)
            chat_response.audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
            chat_response.audio_mime = "audio/wav"
        except (SarvamAPIError, Exception) as exc:
            logger.warning("TTS generation in /chat failed: %s", exc)
    return chat_response



@router.post("/voice-chat")
async def voice_chat(payload: VoiceChatRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    transcript = payload.transcript or ""
    mode = "sarvam_ai"

    # If base64 audio is provided, run Sarvam STT
    if payload.audio_base64:
        try:
            audio_bytes = base64.b64decode(payload.audio_base64)
            logger.info("Voice-chat STT: language=%s audio_base64_bytes=%d", payload.language, len(payload.audio_base64))
            stt_res = await sarvam_service.speech_to_text(audio_bytes, language_code=payload.language)
            transcript = stt_res.transcript
            logger.info("Voice-chat STT success: transcript=%r (lang=%s)", transcript, stt_res.language_code)
        except SarvamAPIError as err:
            logger.warning("Voice STT SarvamAPIError: %s (status=%d)", err.message, err.status_code)
            mode = "text_fallback"
            if not transcript:
                raise HTTPException(status_code=err.status_code, detail=f"Voice STT Error: {err.message}")
        except Exception as exc:
            logger.exception("Voice STT failed unexpectedly: %s", exc)
            mode = "text_fallback"

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript or audio input is required")

    # Run RAG chat answering
    chat_response = chat_service.answer(transcript, payload.language, payload.profile, user=user, db=db)

    # Synthesize audio with Sarvam TTS if enabled
    audio_base64_out: str | None = None
    if settings.sarvam_api_key and chat_response.answer:
        try:
            tts_text = normalize_for_speech(chat_response.answer, language_code=payload.language)
            audio_bytes_out = await sarvam_service.text_to_speech(tts_text, language_code=payload.language)
            audio_base64_out = base64.b64encode(audio_bytes_out).decode("utf-8")
        except Exception:
            # Degrade gracefully to text if TTS fails
            mode = "text_degraded"

    return {
        "transcript": transcript,
        "response": chat_response,
        "audio_base64": audio_base64_out,
        "audio_mime": "audio/wav",
        "mode": mode,
    }


@router.post("/voice-chat/audio")
async def voice_chat_audio(
    file: UploadFile = File(...),
    language: str = Form("en"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):


    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(status_code=413, detail="Audio file too large")

    try:
        stt_res = await sarvam_service.speech_to_text(content, language_code=language)
        transcript = stt_res.transcript
    except SarvamAPIError as err:
        logger.warning("Voice audio STT SarvamAPIError: %s", err.message)
        raise HTTPException(status_code=err.status_code, detail=f"Sarvam STT failed: {err.message}")
    except Exception as exc:
        logger.exception("Voice audio STT failed unexpectedly: %s", exc)
        raise HTTPException(status_code=500, detail="Voice transcription failed")

    chat_response = chat_service.answer(transcript, language, user=user, db=db)

    audio_base64_out: str | None = None
    if settings.sarvam_api_key and chat_response.answer:
        try:
            tts_text = normalize_for_speech(chat_response.answer, language_code=language)
            audio_bytes_out = await sarvam_service.text_to_speech(tts_text, language_code=language)
            audio_base64_out = base64.b64encode(audio_bytes_out).decode("utf-8")
        except Exception:
            pass

    return {
        "transcript": transcript,
        "response": chat_response,
        "audio_base64": audio_base64_out,
        "audio_mime": "audio/wav",
        "mode": "sarvam_ai",
    }


@router.get("/config/languages")
def get_languages_config():
    return load_languages()


@router.get("/config/tours")
def get_tours_config():
    return load_tours()



@router.post("/documents/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    document_type: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    if len(content) > settings.max_upload_size:
        raise HTTPException(status_code=413, detail="File too large")
    selected_language = language or user.preferred_language or "en"
    document = document_service.process_upload(db, user, file, content, declared_type=document_type, language=selected_language)
    
    verification = getattr(document, "verification", {})
    verification_status = verification.get("status", "REVIEW_REQUIRED")
    eligibility_usable = verification.get("eligibility_usable", False)

    profile = profile_service.get_or_create(db, user)
    existing_documents = profile.available_documents or []
    
    # CRITICAL SECURITY GATE:
    # Only VERIFIED documents may enter profile.available_documents for eligibility!
    if eligibility_usable and document.document_type not in existing_documents:
        profile.available_documents = [*existing_documents, document.document_type]
        db.add(profile)
        db.commit()

    audit_service.log(
        db,
        "document_uploaded",
        f"{document.document_type} status={verification_status}",
        user.id,
        get_user_role(db, user.id),
        f"document:{document.id}",
        request,
    )
    ephemeral_extracted = getattr(document, "ephemeral_extracted", {})
    ocr_quality = ephemeral_extracted.get("ocr_quality", "good")
    ocr_confidence = ephemeral_extracted.get("ocr_confidence_score")

    if verification_status == "REJECTED":
        reupload_msg = verification.get("user_message") or (
            "The document you uploaded may be fake or altered. "
            "Please make sure you upload a verified/original document and try again."
        )
    elif ocr_quality == "poor":
        lang_key = selected_language[:2].lower()
        reupload_msg = REUPLOAD_PROMPTS.get(lang_key, REUPLOAD_PROMPTS["en"])
    elif verification_status == "REVIEW_REQUIRED":
        reupload_msg = (
            "Document requires manual verification or an official digitally-signed copy "
            "before it can unlock scheme eligibility."
        )
    else:
        reupload_msg = "Document verified successfully. It is now active for eligibility checks."

    return {
        "status": "verified" if eligibility_usable else "rejected" if verification_status == "REJECTED" else "review_required",
        "document": document.id,
        "document_type": document.document_type,
        "verification": verification,
        "verification_status": verification_status,
        "eligibility_usable": eligibility_usable,
        "available_documents": profile.available_documents,
        "ocr_quality": ocr_quality,
        "ocr_confidence_score": ocr_confidence,
        "ephemeral_extracted": ephemeral_extracted if eligibility_usable else {},
        "ephemeral_ttl": settings.redis_ephemeral_ttl,
        "message": reupload_msg,
    }


@router.get("/documents")
def list_documents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    docs = db.query(DocumentRecord).filter(DocumentRecord.user_id == user.id).all()
    return [
        {
            "id": doc.id,
            "document_type": doc.document_type,
            "status": doc.status,
            "verification_state": doc.verification_state,
            "masked_fields": doc.masked_fields,
            "file_name": doc.file_name,
            "mime_type": doc.mime_type,
            "file_size": doc.file_size,
            "retained_in_storage": doc.retained_in_storage,
            "created_at": doc.created_at.isoformat(),
        }
        for doc in docs
    ]


@router.get("/documents/{document_id}")
def get_document(document_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    require_document_access(document.user_id, user, db)
    return {
        "id": document.id,
        "document_type": document.document_type,
        "status": document.status,
        "verification_state": document.verification_state,
        "masked_fields": document.masked_fields,
        "file_name": document.file_name,
        "mime_type": document.mime_type,
        "file_size": document.file_size,
        "retained_in_storage": document.retained_in_storage,
        "created_at": document.created_at.isoformat(),
    }


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    require_document_access(document.user_id, user, db)
    db.delete(document)
    db.commit()
    audit_service.log(db, "document_deleted", document_id, user.id, get_user_role(db, user.id), f"document:{document_id}", request)
    return {"status": "deleted"}


@router.post("/check-eligibility")
def check_eligibility(payload: CheckEligibilityRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scheme = next((item for item in load_schemes() if item.id == payload.scheme_id), None)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    rule = load_rules().get(payload.scheme_id)
    result = eligibility_engine.evaluate(payload.scheme_id, payload.profile, rule, scheme.alternative_scheme_ids)

    db.add(NotificationRecord(
        user_id=user.id,
        title=f"Eligibility checked: {scheme.name}",
        message=(f"You are eligible for {scheme.name}." if result.eligible
                  else f"You are not eligible for {scheme.name}. Reason: {result.failed[0] if result.failed else 'criteria not met'}."),
        level="success" if result.eligible else "info",
    ))
    db.commit()
    return result


@router.get("/schemes")
def list_schemes(q: str | None = None, category: str | None = None, state: str | None = None):
    schemes = load_schemes()
    if q:
        schemes = [scheme for scheme in schemes if q.lower() in scheme.name.lower() or q.lower() in scheme.description.lower()]
    if category:
        schemes = [scheme for scheme in schemes if scheme.category.lower() == category.lower()]
    if state:
        schemes = [scheme for scheme in schemes if "All" in scheme.state_scope or state.lower() in [item.lower() for item in scheme.state_scope]]
    return schemes


@router.get("/schemes/{scheme_id}")
def scheme_details(scheme_id: str):
    scheme = next((item for item in load_schemes() if item.id == scheme_id), None)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    conflicts = []
    if scheme.id == "pm-kisan":
        conflicts.append("Information Conflict Detected: benefit amount should be verified against the current official notification.")
    return {"scheme": scheme, "conflicts": conflicts}


@router.post("/schemes/save")
def save_scheme(payload: SaveSchemeRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.query(SavedScheme).filter(SavedScheme.user_id == user.id, SavedScheme.scheme_id == payload.scheme_id).first() is None:
        db.add(SavedScheme(user_id=user.id, scheme_id=payload.scheme_id))
        scheme = next((s for s in load_schemes() if s.id == payload.scheme_id), None)
        db.add(NotificationRecord(
            user_id=user.id,
            title="Scheme saved",
            message=f"{scheme.name if scheme else payload.scheme_id} was added to your saved schemes.",
            level="info",
        ))
        db.commit()
    return {"status": "saved"}


@router.get("/recommendations")
def recommendations(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return recommendation_service.recommendations(_profile_from_current(db, user))


@router.get("/eligible-schemes")
def eligible_schemes(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return recommendation_service.eligible_schemes(_profile_from_current(db, user))


@router.get("/benefits/passport", response_model=BenefitsPassportResponse)
def get_benefits_passport(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return benefits_passport_service.get_passport(db, user)


@router.post("/eligible-schemes/summary-audio")
async def eligible_schemes_summary_audio(
    payload: EligibleSummaryRequest,
    user: User = Depends(get_current_user),
):
    language_key = payload.language[:2].lower()
    names = payload.scheme_names
    if not names:
        scheme_text = "no matching schemes"
    elif len(names) == 1:
        scheme_text = names[0]
    elif language_key == "hi":
        scheme_text = ", ".join(names[:-1]) + f" और {names[-1]}"
    elif language_key == "kn":
        scheme_text = ", ".join(names[:-1]) + f" ಮತ್ತು {names[-1]}"
    elif language_key == "te":
        scheme_text = ", ".join(names[:-1]) + f" మరియు {names[-1]}"
    elif language_key == "ta":
        scheme_text = ", ".join(names[:-1]) + f" மற்றும் {names[-1]}"
    elif language_key == "ml":
        scheme_text = ", ".join(names[:-1]) + f" ഒപ്പം {names[-1]}"
    elif language_key == "bn":
        scheme_text = ", ".join(names[:-1]) + f" এবং {names[-1]}"
    elif language_key == "mr":
        scheme_text = ", ".join(names[:-1]) + f" आणि {names[-1]}"
    elif language_key == "gu":
        scheme_text = ", ".join(names[:-1]) + f" અને {names[-1]}"
    else:
        scheme_text = ", ".join(names[:-1]) + f" and {names[-1]}"
    messages = {
        "en": f"Hi {payload.user_name}, the schemes you are eligible for are {scheme_text}. Please read the details carefully.",
        "hi": f"नमस्ते {payload.user_name}, आप इन योजनाओं के लिए पात्र हैं: {scheme_text}। कृपया विवरण ध्यान से पढ़ें।",
        "kn": f"ನಮಸ್ಕಾರ {payload.user_name}, ನೀವು ಈ ಯೋಜನೆಗಳಿಗೆ ಅರ್ಹರಾಗಿದ್ದೀರಿ: {scheme_text}. ದಯವಿಟ್ಟು ವಿವರಗಳನ್ನು ಗಮನವಾಗಿ ಓದಿ.",
        "te": f"నమస్కారం {payload.user_name}, మీరు ఈ పథకాలకు అర్హులు: {scheme_text}. దయచేసి వివరాలను జాగ్రత్తగా చదవండి.",
        "ta": f"வணக்கம் {payload.user_name}, நீங்கள் தகுதியுடைய திட்டங்கள்: {scheme_text}. விவரங்களை கவனமாக படிக்கவும்.",
        "ml": f"നമസ്കാരം {payload.user_name}, നിങ്ങൾ ഈ പദ്ധതികൾക്ക് അർഹരാണ്: {scheme_text}. ദയവായി വിവരങ്ങൾ ശ്രദ്ധാപൂർവ്വം വായിക്കുക.",
        "bn": f"নমস্কার {payload.user_name}, আপনি যে স্কিমগুলির জন্য যোগ্য তা হল {scheme_text}। দয়া করে বিস্তারিত মনোযোগ সহকারে পড়ুন।",
        "mr": f"नमस्कार {payload.user_name}, आपण या योजनांसाठी पात्र आहात: {scheme_text}. कृपया तपशील काळजीपूर्वक वाचा.",
        "gu": f"નમસ્તે {payload.user_name}, તમે આ યોજનાઓ માટે પાત્ર છો: {scheme_text}. કૃપા કરીને વિગતો ધ્યાનથી વાંચો.",
    }
    message = messages.get(language_key, messages["en"])
    try:
        tts_text = normalize_for_speech(message, language_code=language_key)
        audio_bytes = await sarvam_service.text_to_speech(tts_text, language_code=language_key)
    except SarvamAPIError as err:
        logger.warning("Eligible scheme summary TTS unavailable: %s", err.message)
        return {"summary": message, "audio_base64": None, "audio_mime": "audio/wav"}
    return {
        "summary": message,
        "audio_base64": base64.b64encode(audio_bytes).decode("utf-8"),
        "audio_mime": "audio/wav",
    }


@router.get("/welfare-gaps")
def welfare_gaps(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return recommendation_service.welfare_gaps(_profile_from_current(db, user))


@router.post("/family/analyze")
def family_analyze(payload: FamilyAnalysisRequest, user: User = Depends(get_current_user)):
    rules = load_rules()
    schemes = load_schemes()
    members = []
    for member in payload.members:
        from app.models.schemas import EligibilityProfile

        profile = EligibilityProfile(**member.model_dump())
        eligible_for = []
        for scheme in schemes:
            result = eligibility_engine.evaluate(scheme.id, profile, rules[scheme.id], scheme.alternative_scheme_ids)
            if result.status == "eligible":
                eligible_for.append({"scheme_id": scheme.id, "scheme_name": scheme.name, "score": result.score})
        members.append({"member": member.name, "relationship": member.relationship, "eligible_schemes": eligible_for})
    return {
        "members": members,
        "family_benefit_map": members,
        "overlaps": [],
        "possible_conflicts": [],
        "total_potential_benefits": sum(len(item["eligible_schemes"]) for item in members),
    }


@router.post("/what-if")
def what_if(payload: WhatIfRequest, user: User = Depends(get_current_user)):
    scheme = next((item for item in load_schemes() if item.id == payload.scheme_id), None)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    if payload.simulated_changes:
        for field in ["income", "age", "landholding"]:
            if field in payload.simulated_changes and isinstance(payload.simulated_changes[field], (int, float)):
                payload.simulated_changes[field] = max(0, payload.simulated_changes[field])
    rule = load_rules()[payload.scheme_id]
    before = eligibility_engine.evaluate(payload.scheme_id, payload.current_profile, rule, scheme.alternative_scheme_ids)
    updated = payload.current_profile.model_copy(update=payload.simulated_changes)
    after = eligibility_engine.evaluate(payload.scheme_id, updated, rule, scheme.alternative_scheme_ids)
    changed = list(set(after.failed + after.matched + after.missing) - set(before.failed + before.matched + before.missing))
    return {"before": before, "after": after, "changed_rules": changed}


@router.get("/journey")
def journey(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return journey_service.build_journey(_profile_from_current(db, user))


@router.get("/profile")
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return profile_service.to_response(db, user, profile_service.get_or_create(db, user))


@router.put("/profile")
def update_profile(payload: ProfileUpdate, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = profile_service.update(db, user, payload)
    audit_service.log(db, "profile_updated", "Profile updated", user.id, get_user_role(db, user.id), "profile", request)
    return result


@router.delete("/profile")
def delete_profile(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(DocumentRecord).filter(DocumentRecord.user_id == user.id).delete()
    db.query(NotificationRecord).filter(NotificationRecord.user_id == user.id).delete()
    db.query(AuditLog).filter(AuditLog.user_id == user.id).delete()
    profile_service.delete(db, user)
    audit_service.log(db, "data_deletion_requested", "User deleted personal data", user.id, get_user_role(db, user.id), "profile", request)
    return {"status": "deleted"}


@router.get("/sources/{scheme_id}")
def sources(scheme_id: str):
    scheme = next((item for item in load_schemes() if item.id == scheme_id), None)
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return {
        "scheme_id": scheme.id,
        "source_name": scheme.source_name,
        "source_reference": scheme.source_reference,
        "official_link": scheme.official_link,
        "last_verified": scheme.last_verified,
        "evidence_policy": "Answers are generated only from verified evidence chunks and cited source metadata.",
    }


@router.get("/schemes/{scheme_id}/rules")
def scheme_rules(scheme_id: str):
    from app.services.data_loader import load_rules
    rules = load_rules()
    rule = rules.get(scheme_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rules not found for scheme")
    return rule


@router.get("/personas")
def personas():
    return load_personas()


@router.get("/notifications")
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [
        {
            "id": item.id,
            "title": item.title,
            "message": item.message,
            "level": item.level,
            "read": item.read,
            "created_at": item.created_at.isoformat(),
        }
        for item in db.query(NotificationRecord).filter(NotificationRecord.user_id == user.id).order_by(NotificationRecord.created_at.desc()).all()
    ]


@router.get("/audit")
def audit(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    role = get_user_role(db, user.id)
    query = db.query(AuditLog)
    if role == "admin":
        logs = query.order_by(AuditLog.created_at.desc()).limit(100).all()
    elif role == "csc_operator":
        logs = query.filter(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()).limit(50).all()
    else:
        logs = query.filter(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()).limit(50).all()
    return [
        {
            "id": item.id,
            "event_type": item.event_type,
            "target_resource": item.target_resource,
            "detail": item.detail,
            "actor_role": item.actor_role,
            "created_at": item.created_at.isoformat(),
        }
        for item in logs
    ]


@router.post("/csc/citizen-session")
def start_citizen_session(payload: CitizenSessionRequest, request: Request, user: User = Depends(require_role("csc_operator")), db: Session = Depends(get_db)):
    citizen = db.query(User).filter(User.email == payload.citizen_email).first()
    if citizen is None:
        raise HTTPException(status_code=404, detail="Citizen not found")
    session = AuthorizedSession(citizen_user_id=citizen.id, operator_user_id=user.id, language=payload.language, active=True)
    db.add(session)
    db.commit()
    db.refresh(session)
    audit_service.log(db, "csc_session_started", citizen.email, user.id, "csc_operator", "csc_session", request)
    return {
        "session_id": session.id,
        "citizen_user_id": citizen.id,
        "operator_user_id": user.id,
        "language": session.language,
        "active": session.active,
    }


@router.post("/csc/citizen-session/{session_id}/end")
def end_citizen_session(session_id: str, request: Request, user: User = Depends(require_role("csc_operator")), db: Session = Depends(get_db)):
    session = db.query(AuthorizedSession).filter(AuthorizedSession.id == session_id, AuthorizedSession.operator_user_id == user.id).first()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session.active = False
    db.add(session)
    db.commit()
    audit_service.log(db, "csc_session_ended", session_id, user.id, "csc_operator", "csc_session", request)
    return {"status": "ended"}


@router.get("/stats")
def get_public_stats(db: Session = Depends(get_db)):
    return {
        "total_users": db.query(User).count()
    }

@router.get("/admin/dashboard")
def admin_dashboard(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    schemes = load_schemes()
    return {
        "total_users": db.query(User).count(),
        "scheme_count": len(schemes),
        "scheme_verification_status": "seed_data_needs_official_verification",
        "system_health": "ok",
        "ai_service_status": "local_fallback_ready",
        "document_processing_status": "in_memory_processing",
        "security_events": db.query(AuditLog).count(),
        "policy_conflicts": 1,
        "most_requested_schemes": [scheme.name for scheme in schemes[:3]],
    }


@router.get("/admin/users")
def admin_users(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return [
        {
            "id": item.id,
            "full_name": item.full_name,
            "email": item.email,
            "role": get_user_role(db, item.id),
            "preferred_language": item.preferred_language,
        }
        for item in db.query(User).all()
    ]


@router.get("/admin/schemes")
def admin_schemes(user: User = Depends(require_role("admin"))):
    return load_schemes()


@router.get("/admin/rules")
def admin_rules(user: User = Depends(require_role("admin"))):
    return load_rules()


@router.get("/admin/sources")
def admin_sources(user: User = Depends(require_role("admin"))):
    return [{"scheme_id": scheme.id, "source_name": scheme.source_name, "last_verified": scheme.last_verified} for scheme in load_schemes()]


@router.get("/admin/audit")
def admin_audit(user: User = Depends(require_role("admin")), db: Session = Depends(get_db)):
    return [
        {
            "id": item.id,
            "event_type": item.event_type,
            "detail": item.detail,
            "actor_role": item.actor_role,
            "created_at": item.created_at.isoformat(),
        }
        for item in db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()
    ]
