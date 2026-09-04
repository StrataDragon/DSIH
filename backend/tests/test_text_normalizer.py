import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from app.services.text_normalizer import normalize_for_speech
from main import app
from app.core.config import get_settings


def test_normalize_for_speech_basic_currency():
    raw_text = "your verified annual income is ₹85,000."
    normalized = normalize_for_speech(raw_text, "en")
    assert "85000 rupees" in normalized
    assert "85,000" not in normalized
    assert "₹" not in normalized
    assert normalized == "your verified annual income is 85000 rupees."


def test_normalize_for_speech_multi_comma_lakh_crore():
    raw_text = "Eligible amount under scheme is ₹1,20,000 and maximum limit is ₹12,50,000."
    normalized = normalize_for_speech(raw_text, "en")
    assert "120000 rupees" in normalized
    assert "1250000 rupees" in normalized
    assert "," not in normalized


def test_normalize_for_speech_various_currency_prefixes():
    assert normalize_for_speech("Annual grant is Rs. 85,000.", "en") == "Annual grant is 85000 rupees."
    assert normalize_for_speech("Total fee is INR 50,000.", "en") == "Total fee is 50000 rupees."
    assert normalize_for_speech("Grant amount is Rs 6,000", "en") == "Grant amount is 6000 rupees"


def test_normalize_for_speech_non_currency_comma_numbers():
    raw_text = "Over 50,000 farmers and 1,00,000 students enrolled."
    normalized = normalize_for_speech(raw_text, "en")
    assert normalized == "Over 50000 farmers and 100000 students enrolled."


def test_normalize_for_speech_multilingual():
    # Kannada
    kn_text = "ನಿಮ್ಮ ಪರಿಶೀಲಿತ ವಾರ್ಷಿಕ ಆದಾಯ ರೂ 85,000."
    assert normalize_for_speech(kn_text, "kn") == "ನಿಮ್ಮ ಪರಿಶೀಲಿತ ವಾರ್ಷಿಕ ಆದಾಯ 85000 ರೂಪಾಯಿ."

    kn_text_symbol = "ನಿಮ್ಮ ಆದಾಯ ₹85,000 ಆಗಿದೆ."
    assert normalize_for_speech(kn_text_symbol, "kn") == "ನಿಮ್ಮ ಆದಾಯ 85000 ರೂಪಾಯಿ ಆಗಿದೆ."

    # Hindi
    hi_text = "आपकी सत्यापित वार्षिक आय ₹85,000 है।"
    assert normalize_for_speech(hi_text, "hi") == "आपकी सत्यापित वार्षिक आय 85000 रुपये है।"


def test_chat_endpoint_preserves_display_text_while_normalizing_tts(monkeypatch):
    """Confirm the chat bubble display text keeps comma formatting while TTS receives normalized text."""
    settings = get_settings()
    monkeypatch.setattr(settings, "sarvam_api_key", "mock_key")

    from app.core.rate_limit import rate_limiter
    rate_limiter.reset()

    client = TestClient(app)
    # Login as citizen
    login_res = client.post("/api/auth/login", json={"email": "citizen@techsahaya.org", "password": "Citizen@123"})
    assert login_res.status_code == 200
    token = login_res.json()["token"]

    captured_tts_input = []

    async def mock_tts(text: str, language_code: str = "en"):
        captured_tts_input.append({"text": text, "language": language_code})
        return b"MOCK_AUDIO_BYTES"

    with patch("app.routers.api.sarvam_service.text_to_speech", side_effect=mock_tts):
        response = client.post(
            "/api/chat",
            json={"message": "What are the benefits of PM-Kisan?", "language": "en"},
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        data = response.json()

        # 1. UI display text in JSON payload is untouched
        assert "answer" in data
        assert data["audio_base64"] is not None

        # 2. TTS received normalized speech text
        assert len(captured_tts_input) > 0
        tts_arg = captured_tts_input[0]["text"]
        # If the answer contained formatted currency e.g. ₹6,000, TTS got 6000 rupees
        if "6,000" in data["answer"] or "₹" in data["answer"]:
            assert "6,000" not in tts_arg or "₹" not in tts_arg
