import io
import json
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models.db_models import User, DocumentRecord, ProfileRecord
from app.services.benefits_passport_service import benefits_passport_service
from app.services.eligibility_engine import eligibility_engine
from app.services.data_loader import load_rules, load_schemes
from main import app


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def test_client():
    return TestClient(app)


def get_or_create_test_user(db: Session, email: str, full_name: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, full_name=full_name, password_hash="mock_hash")
        db.add(user)
        db.commit()
        db.refresh(user)
    # Clean up existing test profile/docs for clean test isolation
    db.query(ProfileRecord).filter(ProfileRecord.user_id == user.id).delete()
    db.query(DocumentRecord).filter(DocumentRecord.user_id == user.id).delete()
    db.commit()
    return user


def auth_headers(client: TestClient, email: str = "citizen@techsahaya.org", password: str = "Citizen@123") -> dict[str, str]:
    resp = client.post("/api/auth/login", json={"email": email, "password": password, "remember_session": False})
    if resp.status_code != 200:
        client.post(
            "/api/auth/signup",
            json={
                "full_name": "Test Citizen",
                "email": email,
                "password": password,
                "preferred_language": "en",
                "phone_number": "9999999999",
                "consent_given": True,
            },
        )
        resp = client.post("/api/auth/login", json={"email": email, "password": password, "remember_session": False})
    return {"Authorization": f"Bearer {resp.json()['token']}"}


# --- Test 1: Complete Profile ---
def test_complete_profile_passport_active(db_session: Session):
    user = get_or_create_test_user(db_session, "test_complete@example.com", "Ramesh Sharma")

    prof = ProfileRecord(
        user_id=user.id,
        age=34,
        state="Karnataka",
        occupation="farmer",
        income=85000.0,
        landholding=2.5,
        onboarding_completed=True,
    )
    db_session.add(prof)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    assert passport.profile_complete is True
    assert len(passport.missing_profile_fields) == 0
    assert passport.summary.profile_completion_percentage >= 75


# --- Test 2: Incomplete Profile ---
def test_incomplete_profile_handling(db_session: Session):
    user = get_or_create_test_user(db_session, "test_incomplete@example.com", "Pooja Patel")

    prof = ProfileRecord(user_id=user.id, age=28, state=None, occupation=None, onboarding_completed=False)
    db_session.add(prof)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    assert passport.profile_complete is False
    assert "state" in passport.missing_profile_fields
    assert "occupation" in passport.missing_profile_fields
    assert any(a.category == "complete_profile" for a in passport.priority_actions)


# --- Test 3: Verified Document Claim Available ---
def test_verified_document_claim_available_in_passport(db_session: Session):
    user = get_or_create_test_user(db_session, "test_verified_doc@example.com", "Anand Kumar")

    prof = ProfileRecord(
        user_id=user.id,
        age=30,
        state="Karnataka",
        occupation="farmer",
        income=120000.0,
        available_documents=["land_record"],
        onboarding_completed=True,
    )
    db_session.add(prof)

    doc = DocumentRecord(
        user_id=user.id,
        document_type="land_record",
        status="processed",
        verification_state="processed_in_memory",
        masked_fields={
            "document_type": "land_record",
            "verification_status": "VERIFIED",
            "eligibility_usable": True,
        },
        file_name="land_record.pdf",
        mime_type="application/pdf",
        file_size=1024,
    )
    db_session.add(doc)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    assert passport.summary.verified_documents_count >= 1


# --- Test 4: Rejected Document Claim Quarantined ---
def test_rejected_document_claim_quarantined(db_session: Session):
    user = get_or_create_test_user(db_session, "test_rejected_doc@example.com", "Sanjay Rao")

    prof = ProfileRecord(
        user_id=user.id,
        age=20,
        state="Karnataka",
        occupation="student",
        income=50000.0,
        available_documents=["income_certificate"],
        onboarding_completed=True,
    )
    db_session.add(prof)

    doc = DocumentRecord(
        user_id=user.id,
        document_type="income_certificate",
        status="processed",
        verification_state="processed_in_memory",
        masked_fields={
            "document_type": "income_certificate",
            "verification_status": "REJECTED",
            "eligibility_usable": False,
            "reason_code": "SIGNATURE_INVALID",
        },
        file_name="fake_income.pdf",
        mime_type="application/pdf",
        file_size=1024,
    )
    db_session.add(doc)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    assert passport.summary.verified_documents_count == 0
    eligible_ids = [e.scheme_id for e in passport.eligible_now]
    assert "national-scholarship-portal" not in eligible_ids


# --- Test 5: Review Required Document Claim Quarantined ---
def test_review_required_document_claim_quarantined(db_session: Session):
    user = get_or_create_test_user(db_session, "test_review_doc@example.com", "Kavita Gowda")

    prof = ProfileRecord(
        user_id=user.id,
        age=22,
        state="Karnataka",
        occupation="student",
        income=60000.0,
        available_documents=["income_certificate"],
        onboarding_completed=True,
    )
    db_session.add(prof)

    doc = DocumentRecord(
        user_id=user.id,
        document_type="income_certificate",
        status="processed",
        verification_state="processed_in_memory",
        masked_fields={
            "document_type": "income_certificate",
            "verification_status": "REVIEW_REQUIRED",
            "eligibility_usable": False,
        },
        file_name="unverified_scan.png",
        mime_type="image/png",
        file_size=1024,
    )
    db_session.add(doc)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    assert passport.summary.verified_documents_count == 0
    eligible_ids = [e.scheme_id for e in passport.eligible_now]
    assert "national-scholarship-portal" not in eligible_ids


# --- Test 6: Current Eligibility with Explainable Reasons ---
def test_current_eligibility_with_matched_reasons(db_session: Session):
    user = get_or_create_test_user(db_session, "test_farmer_elig@example.com", "Basavaraj")

    prof = ProfileRecord(
        user_id=user.id,
        age=42,
        state="Karnataka",
        occupation="farmer",
        income=150000.0,
        landholding=3.0,
        available_documents=["land record"],
        onboarding_completed=True,
    )
    db_session.add(prof)

    doc = DocumentRecord(
        user_id=user.id,
        document_type="land record",
        status="processed",
        verification_state="processed_in_memory",
        masked_fields={
            "document_type": "land record",
            "verification_status": "VERIFIED",
            "eligibility_usable": True,
        },
        file_name="land_record.pdf",
        mime_type="application/pdf",
        file_size=1024,
    )
    db_session.add(doc)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    pm_kisan = next((e for e in passport.eligible_now if e.scheme_id == "pm-kisan"), None)
    assert pm_kisan is not None
    assert len(pm_kisan.matched_reasons) > 0
    assert any("Age" in r for r in pm_kisan.matched_reasons)
    assert any("Income" in r or "income" in r for r in pm_kisan.matched_reasons)
    assert pm_kisan.official_link.startswith("http")


# --- Test 7: Almost Eligible One Step Away ---
def test_almost_eligible_one_step_away(db_session: Session):
    user = get_or_create_test_user(db_session, "test_almost_elig@example.com", "Deepak Joshi")

    prof = ProfileRecord(
        user_id=user.id,
        age=19,
        state="Karnataka",
        occupation="student",
        income=100000.0,
        available_documents=[],
        onboarding_completed=True,
    )
    db_session.add(prof)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    nsp_almost = next((a for a in passport.almost_eligible if a.scheme_id == "national-scholarship-portal"), None)
    assert nsp_almost is not None
    assert nsp_almost.blocking_reason_category == "ONE_MISSING_DOCUMENT"
    assert nsp_almost.missing_document_status == "NOT_UPLOADED"
    assert "income_certificate" in (nsp_almost.missing_document_name or "")


# --- Test 8: Missing Document != Ineligible ---
def test_missing_document_is_not_marked_ineligible(db_session: Session):
    user = get_or_create_test_user(db_session, "test_missing_doc_diff@example.com", "Manjula Devi")

    prof = ProfileRecord(
        user_id=user.id,
        age=20,
        state="Karnataka",
        occupation="student",
        income=80000.0,
        available_documents=[],
        onboarding_completed=True,
    )
    db_session.add(prof)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    nsp_almost = next((a for a in passport.almost_eligible if a.scheme_id == "national-scholarship-portal"), None)
    assert nsp_almost is not None
    assert "Upload" in nsp_almost.unlock_action


# --- Test 9: Verification Failure Distinction ---
def test_verification_failure_distinction(db_session: Session):
    user = get_or_create_test_user(db_session, "test_verif_fail_distinct@example.com", "Harish Reddy")

    prof = ProfileRecord(
        user_id=user.id,
        age=21,
        state="Karnataka",
        occupation="student",
        income=90000.0,
        available_documents=[],
        onboarding_completed=True,
    )
    db_session.add(prof)

    doc = DocumentRecord(
        user_id=user.id,
        document_type="income_certificate",
        status="processed",
        verification_state="processed_in_memory",
        masked_fields={
            "document_type": "income_certificate",
            "verification_status": "REJECTED",
            "eligibility_usable": False,
        },
        file_name="tampered_cert.pdf",
        mime_type="application/pdf",
        file_size=1024,
    )
    db_session.add(doc)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    nsp_almost = next((a for a in passport.almost_eligible if a.scheme_id == "national-scholarship-portal"), None)
    assert nsp_almost is not None
    assert nsp_almost.missing_document_status == "VERIFICATION_FAILED"
    assert "could not be verified" in nsp_almost.unlock_action


# --- Test 10: Future Age Threshold in Eligibility Radar ---
def test_future_age_threshold_calculation(db_session: Session):
    user = get_or_create_test_user(db_session, "test_future_age@example.com", "Sunita Rao")

    prof = ProfileRecord(
        user_id=user.id,
        age=16,
        state="Karnataka",
        occupation="worker",
        onboarding_completed=True,
    )
    db_session.add(prof)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    radar_items = [r for r in passport.eligibility_radar if "18" in r.trigger_condition]
    assert len(radar_items) > 0
    assert "16 years" in radar_items[0].current_value
    assert "18 years" in radar_items[0].required_value


# --- Test 11: Expiring Document Alert with Affected Scheme Count ---
def test_expiring_document_alert(db_session: Session):
    user = get_or_create_test_user(db_session, "test_expiring_doc@example.com", "Narayan Murthy")

    prof = ProfileRecord(
        user_id=user.id,
        age=38,
        state="Karnataka",
        occupation="farmer",
        income=120000.0,
        landholding=2.0,
        available_documents=["land record"],
        onboarding_completed=True,
    )
    db_session.add(prof)

    expiry_date = (datetime.utcnow() + timedelta(days=20)).isoformat()
    doc = DocumentRecord(
        user_id=user.id,
        document_type="land record",
        status="processed",
        verification_state="processed_in_memory",
        masked_fields={
            "document_type": "land record",
            "verification_status": "VERIFIED",
            "eligibility_usable": True,
            "expires_at": expiry_date,
        },
        file_name="land_record.pdf",
        mime_type="application/pdf",
        file_size=1024,
    )
    db_session.add(doc)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    assert len(passport.document_alerts) > 0
    alert = passport.document_alerts[0]
    assert alert.document_type == "land record"
    assert alert.days_remaining <= 21
    assert alert.affected_schemes_count >= 1
    assert any("pm-kisan" in s.lower() for s in alert.affected_scheme_names)


# --- Test 12: Expired Document Recalculation ---
def test_expired_document_does_not_satisfy_active_requirements(db_session: Session):
    user = get_or_create_test_user(db_session, "test_expired_doc@example.com", "Lalitha Bai")

    prof = ProfileRecord(
        user_id=user.id,
        age=40,
        state="Karnataka",
        occupation="farmer",
        income=120000.0,
        landholding=2.0,
        available_documents=[],
        onboarding_completed=True,
    )
    db_session.add(prof)

    expired_date = (datetime.utcnow() - timedelta(days=10)).isoformat()
    doc = DocumentRecord(
        user_id=user.id,
        document_type="land record",
        status="processed",
        verification_state="processed_in_memory",
        masked_fields={
            "document_type": "land record",
            "verification_status": "VERIFIED",
            "eligibility_usable": False,  # Expired
            "expires_at": expired_date,
        },
        file_name="expired_land_record.pdf",
        mime_type="application/pdf",
        file_size=1024,
    )
    db_session.add(doc)
    db_session.commit()

    passport = benefits_passport_service.get_passport(db_session, user)
    eligible_ids = [e.scheme_id for e in passport.eligible_now]
    assert "pm-kisan" not in eligible_ids


# --- Test 13: Verified Upload Updates Passport ---
def test_verified_upload_updates_passport(test_client: TestClient):
    headers = auth_headers(test_client)
    db = SessionLocal()
    user = db.query(User).filter(User.email == "citizen@techsahaya.org").first()
    db.query(DocumentRecord).filter(DocumentRecord.user_id == user.id).delete()
    prof = db.query(ProfileRecord).filter(ProfileRecord.user_id == user.id).first()
    prof.age = 22
    prof.state = "Karnataka"
    prof.occupation = "student"
    prof.income = 100000.0
    prof.available_documents = []
    prof.onboarding_completed = True
    db.commit()

    resp1 = test_client.get("/api/benefits/passport", headers=headers)
    assert resp1.status_code == 200
    before_eligible = len(resp1.json()["eligible_now"])

    # Simulate genuine signed certificate upload
    from tests.test_document_authenticity import create_mock_signed_pdf
    pdf_bytes = create_mock_signed_pdf(tampered=False)
    files = {"file": ("income_cert.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    upload_resp = test_client.post(
        "/api/documents/upload?declared_type=income_certificate",
        files=files,
        headers=headers,
    )
    assert upload_resp.status_code == 200
    assert upload_resp.json()["eligibility_usable"] is True

    resp2 = test_client.get("/api/benefits/passport", headers=headers)
    assert resp2.status_code == 200
    after_eligible = len(resp2.json()["eligible_now"])
    assert after_eligible > before_eligible
    assert any(e["scheme_id"] == "national-scholarship-portal" for e in resp2.json()["eligible_now"])
    db.close()


# --- Test 14: Rejected Upload Does NOT Change Passport ---
def test_rejected_upload_does_not_change_passport(test_client: TestClient):
    headers = auth_headers(test_client)
    db = SessionLocal()
    user = db.query(User).filter(User.email == "citizen@techsahaya.org").first()
    db.query(DocumentRecord).filter(DocumentRecord.user_id == user.id).delete()
    prof = db.query(ProfileRecord).filter(ProfileRecord.user_id == user.id).first()
    prof.age = 22
    prof.state = "Karnataka"
    prof.occupation = "student"
    prof.income = 100000.0
    prof.available_documents = []
    prof.onboarding_completed = True
    db.commit()

    resp1 = test_client.get("/api/benefits/passport", headers=headers)
    before_eligible = len(resp1.json()["eligible_now"])

    # Upload tampered / modified signed PDF
    from tests.test_document_authenticity import create_mock_signed_pdf
    tampered_bytes = create_mock_signed_pdf(tampered=True)
    files = {"file": ("fake_income.pdf", io.BytesIO(tampered_bytes), "application/pdf")}
    upload_resp = test_client.post(
        "/api/documents/upload?declared_type=income_certificate",
        files=files,
        headers=headers,
    )
    assert upload_resp.status_code == 200
    assert upload_resp.json()["verification"]["status"] == "REJECTED"

    resp2 = test_client.get("/api/benefits/passport", headers=headers)
    after_eligible = len(resp2.json()["eligible_now"])
    assert after_eligible == before_eligible
    db.close()


# --- Test 15: Direct API Invariant ---
def test_authenticity_gate_invariant_cannot_be_bypassed_by_client(test_client: TestClient):
    headers = auth_headers(test_client)
    db = SessionLocal()
    user = db.query(User).filter(User.email == "citizen@techsahaya.org").first()
    db.query(DocumentRecord).filter(DocumentRecord.user_id == user.id, DocumentRecord.document_type == "income_certificate").delete()
    db.commit()
    db.close()

    update_resp = test_client.put(
        "/api/profile",
        json={
            "age": 25,
            "state": "Karnataka",
            "occupation": "student",
            "income": 90000.0,
            "available_documents": ["income_certificate"],
        },
        headers=headers,
    )
    assert update_resp.status_code == 200

    resp = test_client.get("/api/benefits/passport", headers=headers)
    assert resp.status_code == 200
    assert not any(e["scheme_id"] == "national-scholarship-portal" for e in resp.json()["eligible_now"])
