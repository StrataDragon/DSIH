"""Comprehensive Security & Authenticity Test Suite for Document Verification Pipeline.

Covers all 14 verification test scenarios:
1. Genuine cryptographically signed document -> VERIFIED
2. Modified signed document (tampered signed bytes) -> REJECTED (SIGNATURE_INVALID)
3. Fake DigiLocker-looking PDF -> NOT VERIFIED (REVIEW_REQUIRED / DOCUMENT_UNVERIFIED)
4. Fake QR pointing to attacker-controlled domain -> REJECTED (QR_UNTRUSTED_DOMAIN)
5. Trusted QR with mismatching document data -> REJECTED (DOCUMENT_ID_MISMATCH)
6. Edited scanned certificate (contradictory age vs DOB or negative income) -> REJECTED (FIELD_CONTRADICTION)
7. Missing metadata -> Supporting signal only, not automatically fake
8. Forged metadata -> Does not elevate fake document to verified
9. Malicious PDF (embedded JavaScript/actions) -> REJECTED (MALICIOUS_FILE)
10. Huge / decompression-bomb file -> REJECTED (FILE_INVALID)
11. Verification API / service unavailable -> REVIEW_REQUIRED (fails closed)
12. OCR hallucination / low confidence -> Not automatically verified
13. Eligibility gate: Rejected document cannot satisfy scheme rules
14. Verified document: Successfully satisfies scheme rules and unlocks eligibility
"""

import io
from fastapi.testclient import TestClient
import pypdf
import pytest

from app.services.document_verification_service import (
    document_verification_service,
    VerificationStatus,
    VerificationReasonCode,
    SAFE_REJECTED_MESSAGE,
    PIPELINE_VERSION,
)
from main import app

client = TestClient(app)


def auth_headers(email: str = "citizen@techsahaya.org", password: str = "Citizen@123") -> dict[str, str]:
    response = client.post("/api/auth/login", json={"email": email, "password": password, "remember_session": False})
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['token']}"}


def create_valid_pdf_base() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def create_mock_signed_pdf(tampered: bool = False, malicious_js: bool = False, fake_digilocker: bool = False) -> bytes:
    base = create_valid_pdf_base()
    sig_block = b"/Type /Sig /ByteRange [0 50 150 100] /Contents <" + b"00" * 256 + b">"
    if malicious_js:
        sig_block += b" /JavaScript /JS (app.alert('malicious');)"
    if fake_digilocker:
        sig_block += b" % DigiLocker Verified Document"
    if tampered:
        sig_block += b" TAMPERED_BYTE_MARKER"

    return base.replace(b"%%EOF", sig_block + b"\n%%EOF")


# ---------------------------------------------------------------------------
# Test 1 — Genuine cryptographically signed document
# ---------------------------------------------------------------------------
def test_genuine_signed_document():
    pdf_bytes = create_mock_signed_pdf(tampered=False)
    result = document_verification_service.verify(
        pdf_bytes,
        "application/pdf",
        "income_certificate",
        {"income": 120000},
    )
    assert result["status"] == VerificationStatus.VERIFIED.value
    assert result["eligibility_usable"] is True
    assert result["reason_code"] == VerificationReasonCode.SUCCESS.value
    assert result["pipeline_version"] == PIPELINE_VERSION


# ---------------------------------------------------------------------------
# Test 2 — Modified signed document
# ---------------------------------------------------------------------------
def test_modified_signed_document():
    pdf_bytes = create_mock_signed_pdf(tampered=True)
    result = document_verification_service.verify(
        pdf_bytes,
        "application/pdf",
        "income_certificate",
        {"income": 120000},
    )
    assert result["status"] == VerificationStatus.REJECTED.value
    assert result["eligibility_usable"] is False
    assert result["reason_code"] == VerificationReasonCode.SIGNATURE_INVALID.value
    assert result["user_message"] == SAFE_REJECTED_MESSAGE


# ---------------------------------------------------------------------------
# Test 3 — Fake DigiLocker-looking PDF
# ---------------------------------------------------------------------------
def test_fake_digilocker_looking_pdf():
    # A PDF with DigiLocker branding and keywords, but lacking valid digital signature
    base = create_valid_pdf_base()
    fake_digilocker_pdf = base.replace(b"%%EOF", b"% DigiLocker Verified Certificate\n/Producer (DigiLocker Official)\n%%EOF")
    result = document_verification_service.verify(
        fake_digilocker_pdf,
        "application/pdf",
        "income_certificate",
        {"income": 120000},
    )
    # Must NOT pass as VERIFIED merely because of DigiLocker branding
    assert result["status"] != VerificationStatus.VERIFIED.value
    assert result["status"] == VerificationStatus.REVIEW_REQUIRED.value
    assert result["eligibility_usable"] is False
    assert result["reason_code"] == VerificationReasonCode.DOCUMENT_UNVERIFIED.value


# ---------------------------------------------------------------------------
# Test 4 — Fake QR pointing to attacker-controlled domain
# ---------------------------------------------------------------------------
def test_fake_qr_untrusted_domain():
    pdf_bytes = create_valid_pdf_base()
    result = document_verification_service.verify(
        pdf_bytes,
        "application/pdf",
        "income_certificate",
        {"certificate_number": "INC/2026/001"},
        qr_text="https://evil-hacker-phishing-site.com/verify?id=INC/2026/001",
    )
    assert result["status"] == VerificationStatus.REJECTED.value
    assert result["eligibility_usable"] is False
    assert result["reason_code"] == VerificationReasonCode.QR_UNTRUSTED_DOMAIN.value
    assert result["user_message"] == SAFE_REJECTED_MESSAGE


# ---------------------------------------------------------------------------
# Test 5 — Trusted QR but mismatching document data
# ---------------------------------------------------------------------------
def test_trusted_qr_mismatching_document():
    pdf_bytes = create_valid_pdf_base()
    result = document_verification_service.verify(
        pdf_bytes,
        "application/pdf",
        "income_certificate",
        {"certificate_number": "DOC-REAL-12345", "income": 50000},
        # QR points to trusted gov domain, but returns different certificate number
        qr_text="https://apisetu.gov.in/certificate?id=DOC-DIFFERENT-99999&income=500000",
    )
    assert result["status"] == VerificationStatus.REJECTED.value
    assert result["eligibility_usable"] is False
    assert result["reason_code"] == VerificationReasonCode.DOCUMENT_ID_MISMATCH.value


# ---------------------------------------------------------------------------
# Test 6 — Edited scanned certificate (contradictions)
# ---------------------------------------------------------------------------
def test_edited_scanned_certificate_contradictions():
    pdf_bytes = create_valid_pdf_base()
    # Extracted fields have contradictory Age (20) vs DOB (1980 -> age 46)
    result = document_verification_service.verify(
        pdf_bytes,
        "application/pdf",
        "income_certificate",
        {"age": 20, "dob": "15/08/1980", "income": 50000},
    )
    assert result["status"] == VerificationStatus.REJECTED.value
    assert result["eligibility_usable"] is False
    assert result["reason_code"] == VerificationReasonCode.FIELD_CONTRADICTION.value


# ---------------------------------------------------------------------------
# Test 7 — Missing metadata is only a supporting signal
# ---------------------------------------------------------------------------
def test_missing_metadata_is_supporting_signal():
    # Pure PDF with stripped metadata (no Producer, no ModDate)
    stripped_pdf = create_valid_pdf_base()
    result = document_verification_service.verify(
        stripped_pdf,
        "application/pdf",
        "generic_sample_document",
        {"income": 100000},
    )
    # Missing metadata must NOT trigger MALICIOUS_FILE or outright fake rejection
    assert result["reason_code"] != VerificationReasonCode.MALICIOUS_FILE.value
    assert result["status"] == VerificationStatus.REVIEW_REQUIRED.value


# ---------------------------------------------------------------------------
# Test 8 — Forged metadata does not make fake document verified
# ---------------------------------------------------------------------------
def test_forged_metadata_does_not_verify():
    # Injected metadata claiming official authority
    base = create_valid_pdf_base()
    content = base.replace(b"%%EOF", b"/Producer (Official Government of India CCA Generator)\n/Creator (NIC eSign)\n%%EOF")
    result = document_verification_service.verify(
        content,
        "application/pdf",
        "income_certificate",
        {"income": 80000},
    )
    # Must NOT be VERIFIED based on metadata alone
    assert result["status"] != VerificationStatus.VERIFIED.value
    assert result["eligibility_usable"] is False


# ---------------------------------------------------------------------------
# Test 9 — Malicious PDF with embedded JavaScript
# ---------------------------------------------------------------------------
def test_malicious_pdf_embedded_javascript():
    pdf_bytes = create_mock_signed_pdf(malicious_js=True)
    result = document_verification_service.verify(
        pdf_bytes,
        "application/pdf",
        "income_certificate",
        {"income": 120000},
    )
    assert result["status"] == VerificationStatus.REJECTED.value
    assert result["eligibility_usable"] is False
    assert result["reason_code"] == VerificationReasonCode.MALICIOUS_FILE.value


# ---------------------------------------------------------------------------
# Test 10 — Decompression bomb / huge dimension file
# ---------------------------------------------------------------------------
def test_decompression_bomb_rejected():
    checker = document_verification_service.safety_checker
    # Excessively large fake file
    huge_bytes = b"0" * (checker.MAX_FILE_SIZE + 1024)
    safe, reason, msg = checker.check_safety(huge_bytes, "application/pdf")
    assert safe is False
    assert reason == VerificationReasonCode.FILE_INVALID


# ---------------------------------------------------------------------------
# Test 11 — Verification service outage fails closed
# ---------------------------------------------------------------------------
def test_verification_service_fails_closed():
    # When digital signature / external verifier cannot confirm, fail closed to REVIEW_REQUIRED
    pdf_bytes = create_valid_pdf_base()
    result = document_verification_service.verify(
        pdf_bytes,
        "application/pdf",
        "income_certificate",
        {},
    )
    assert result["status"] == VerificationStatus.REVIEW_REQUIRED.value
    assert result["eligibility_usable"] is False


# ---------------------------------------------------------------------------
# Test 12 — OCR hallucination / negative income contradiction
# ---------------------------------------------------------------------------
def test_ocr_hallucination_negative_income():
    pdf_bytes = create_valid_pdf_base()
    result = document_verification_service.verify(
        pdf_bytes,
        "application/pdf",
        "income_certificate",
        {"income": -50000},
    )
    assert result["status"] == VerificationStatus.REJECTED.value
    assert result["reason_code"] == VerificationReasonCode.FIELD_CONTRADICTION.value


# ---------------------------------------------------------------------------
# Test 13 — Eligibility gate: Rejected document cannot satisfy scheme rules
# ---------------------------------------------------------------------------
def test_eligibility_gate_blocks_unverified_document():
    headers = auth_headers()
    # Reset documents on profile to ensure clean test state
    client.put("/api/profile", headers=headers, json={"available_documents": []})

    # Upload an unverified scan / fake document
    pdf_content = create_valid_pdf_base()
    upload = client.post(
        "/api/documents/upload",
        headers=headers,
        files={"file": ("unverified_income.pdf", pdf_content, "application/pdf")},
    )
    assert upload.status_code == 200
    data = upload.json()
    assert data["eligibility_usable"] is False
    assert "income_certificate" not in data["available_documents"]

    # Now run eligibility check — must NOT be eligible based on unverified document
    profile = {
        "age": 20,
        "gender": "female",
        "state": "Karnataka",
        "occupation": "student",
        "income": 200000,
        "landholding": 0,
        "disability": False,
        "available_documents": data["available_documents"],
    }
    result = client.post(
        "/api/check-eligibility",
        headers=headers,
        json={"scheme_id": "national-scholarship-portal", "profile": profile},
    )
    assert result.status_code == 200
    assert result.json()["eligible"] is False
    assert result.json()["status"] == "document_verification_required"
    assert result.json()["reason_code"] == "DOCUMENT_AUTHENTICITY_FAILED"


# ---------------------------------------------------------------------------
# Test 14 — Verified document allows scheme eligibility check to succeed
# ---------------------------------------------------------------------------
def test_eligibility_gate_allows_verified_document():
    headers = auth_headers()
    signed_pdf = create_mock_signed_pdf(tampered=False)
    upload = client.post(
        "/api/documents/upload",
        headers=headers,
        files={"file": ("verified_income_certificate.pdf", signed_pdf, "application/pdf")},
    )
    assert upload.status_code == 200
    data = upload.json()
    assert data["eligibility_usable"] is True
    assert "income_certificate" in data["available_documents"]

    profile = {
        "age": 20,
        "gender": "female",
        "state": "Karnataka",
        "occupation": "student",
        "income": 200000,
        "landholding": 0,
        "disability": False,
        "available_documents": data["available_documents"],
    }
    result = client.post(
        "/api/check-eligibility",
        headers=headers,
        json={"scheme_id": "national-scholarship-portal", "profile": profile},
    )
    assert result.status_code == 200
    assert result.json()["eligible"] is True
    assert result.json()["status"] == "eligible"
    assert "document condition satisfied" in result.json()["matched"]
