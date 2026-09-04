import io
import logging
import os
import re
import shutil
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageEnhance, ImageFilter
try:
    import pytesseract
except ImportError:
    pytesseract = None
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.redis_client import ephemeral_store
from app.models.db_models import DocumentRecord, User
from app.services.data_loader import load_ocr_keywords
from app.services.document_verification_service import document_verification_service

logger = logging.getLogger("techsahaya.ocr")
settings = get_settings()

_TESS_LANG_MAP = {
    "en": "eng",
    "hi": "hin",
    "kn": "kan",
    "te": "tel",
    "ta": "tam",
    "ml": "mal",
    "bn": "ben",
    "mr": "mar",
    "gu": "guj",
}


def _configure_tesseract():
    """Auto-detects Tesseract binary and tessdata directory across Windows, Scoop, Linux, and Docker."""
    if not pytesseract:
        return
    # 1. Resolve executable
    if not shutil.which("tesseract"):
        possible_bins = [
            os.path.expanduser(r"~\scoop\apps\tesseract\current\tesseract.exe"),
            os.path.expanduser(r"~\scoop\shims\tesseract.exe"),
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Tesseract-OCR\tesseract.exe"),
        ]
        for p in possible_bins:
            if os.path.exists(p):
                pytesseract.pytesseract.tesseract_cmd = p
                logger.info("Configured Tesseract binary at %s", p)
                break

    # 2. Resolve tessdata prefix if needed
    if "TESSDATA_PREFIX" not in os.environ:
        possible_tessdata = [
            os.path.expanduser(r"~\scoop\apps\tesseract-languages\current"),
            os.path.expanduser(r"~\scoop\apps\tesseract\current\tessdata"),
            r"C:\Program Files\Tesseract-OCR\tessdata",
            r"/usr/share/tesseract-ocr/5/tessdata",
            r"/usr/share/tesseract-ocr/4.00/tessdata",
            r"/usr/share/tesseract-ocr/tessdata",
        ]
        for td in possible_tessdata:
            if os.path.exists(td):
                os.environ["TESSDATA_PREFIX"] = td
                logger.info("Configured TESSDATA_PREFIX at %s", td)
                break


_configure_tesseract()

_INDIC_DIGITS = {
    # Devanagari (Hindi, Marathi)
    "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9",
    # Kannada
    "೦": "0", "೧": "1", "೨": "2", "೩": "3", "೪": "4", "೫": "5", "೬": "6", "೭": "7", "೮": "8", "೯": "9",
    # Telugu
    "౦": "0", "౧": "1", "౨": "2", "౩": "3", "౪": "4", "౫": "5", "౬": "6", "౭": "7", "౮": "8", "౯": "9",
    # Tamil
    "௦": "0", "௧": "1", "௨": "2", "௩": "3", "௪": "4", "௫": "5", "௬": "6", "௭": "7", "௮": "8", "௯": "9",
    # Malayalam
    "൦": "0", "൧": "1", "൨": "2", "൩": "3", "൪": "4", "൫": "5", "൬": "6", "൭": "7", "൮": "8", "൯": "9",
    # Bengali
    "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
    # Gujarati
    "૦": "0", "૧": "1", "૨": "2", "૩": "3", "૪": "4", "૫": "5", "૬": "6", "૭": "7", "૮": "8", "૯": "9",
}


def _normalize_indic_digits(text: str) -> str:
    for indic_char, ascii_digit in _INDIC_DIGITS.items():
        text = text.replace(indic_char, ascii_digit)
    return text


def _preprocess_image_for_ocr(image: Image.Image) -> Image.Image:
    """Local, in-memory image enhancement to boost OCR accuracy across contrast and camera noise."""
    try:
        # Convert to Grayscale
        gray = image.convert("L")
        # Enhance Contrast
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.8)
        # Sharpen slightly
        sharpened = enhanced.filter(ImageFilter.SHARPEN)
        return sharpened
    except Exception:
        return image


# Calibrated OCR Quality Threshold:
# Empirically calibrated against real test images:
# - Clean official certificate: scores ~76.5 (classified "good")
# - Real-world creased/shadowed/skewed photo: scores ~46.1 with degraded extractions (classified "poor")
# - Synthetic noise/blur image: scores None / < 20 (classified "poor")
# Setting the threshold to 55.0 safely gates skewed/creased real-world mobile photos while allowing clean uploads.
OCR_QUALITY_THRESHOLD = 55.0

REUPLOAD_PROMPTS = {
    "en": "We couldn't read this document clearly enough to verify your details. Please try re-uploading a clearer photo — flat, well-lit, and without creases or heavy shadows.",
    "hi": "हम आपके विवरणों को सत्यापित करने के लिए इस दस्तावेज़ को स्पष्ट रूप से नहीं पढ़ सके। कृपया एक स्पष्ट तस्वीर फिर से अपलोड करने का प्रयास करें - सीधी, अच्छी रोशनी वाली, और बिना सिलवटों या गहरी छाया के।",
    "kn": "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಲು ಈ ದಾಖಲೆಯನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಸ್ಪಷ್ಟವಾದ ಫೋಟೋವನ್ನು ಮರು-ಅಪ್‌ಲೋಡ್ ಮಾಡಲು ಪ್ರಯತ್ನಿಸಿ — ನೇರವಾದ, ಉತ್ತಮ ಬೆಳಕಿರುವ ಮತ್ತು ಸುಕ್ಕುಗಳು ಅಥವಾ ನೆರಳುಗಳಿಲ್ಲದ ಫೋಟೋ.",
    "te": "మీ వివరాలను ధృవీకరించడానికి ఈ పత్రాన్ని స్పష్టంగా చదవలేకపోయాము. దయచేసి స్పష్టమైన ఫోటోను మళ్లీ అప్‌లోడ్ చేయడానికి ప్రయత్నించండి — సమాంతరంగా, మంచి వెలుతురులో, మరియు ముడతలు లేదా నీడలు లేకుండా.",
    "ta": "உங்கள் விவரங்களைச் சரிபார்க்க இந்த ஆவணத்தை தெளிவாகப் படிக்க முடியவில்லை. தயவுசெய்து தெளிவான புகைப்படத்தை மீண்டும் பதிவேற்ற முயற்சிக்கவும் — தட்டையான, நல்ல வெளிச்சமுள்ள, மடிப்புகள் அல்லது நிழல்கள் இல்லாத புகைப்படம்.",
    "ml": "നിങ്ങളുടെ വിശദാംശങ്ങൾ പരിശോധിക്കാൻ ഈ രേഖ വ്യക്തമായി വായിക്കാൻ കഴിഞ്ഞില്ല. ദയവായി വ്യക്തമായ ഒരു ഫോട്ടോ വീണ്ടും അപ്‌ലോഡ് ചെയ്യാൻ ശ്രമിക്കുക — നിവർന്നതും നല്ല വെളിച്ചമുള്ളതും ചുളിവുകളോ നിഴലുകളോ ഇല്ലാത്തതുമായ ഫോട്ടോ.",
    "bn": "আপনার বিবরণ যাচাই করার জন্য আমরা এই নথিটি স্পষ্টভাবে পড়তে পারিনি। অনুগ্রহ করে একটি পরিষ্কার ছবি পুনরায় আপলোড করার চেষ্টা করুন — সমতল, ভাল আলোযুক্ত এবং ভাঁজ বা ভারী ছায়া ছাড়া।",
    "mr": "तुमच्या तपशीलांची पडताळणी करण्यासाठी आम्हाला हा दस्तऐवज स्पष्टपणे वाचता आला नाही. कृपया अधिक स्पष्ट फोटो पुन्हा अपलोड करण्याचा प्रयत्न करा — सपाट, चांगल्या प्रकाशात आणि सुरकुत्या किंवा सावल्या नसलेला.",
    "gu": "તમારી વિગતો ચકાસવા માટે અમે આ દસ્તાવેજ સ્પષ્ટપણે વાંચી શક્યા નથી. કૃપા કરીને સ્પષ્ટ ફોટો ફરીથી અપલોડ કરવાનો પ્રયાસ કરો — સપાટ, સારી લાઇટિંગવાળો અને કરચલીઓ અથવા પડછાયા વગરનો.",
}



def _build_keyword_regex(keywords: list[str]) -> str:
    """Sorts keywords by length descending and builds regex pattern."""
    if not keywords:
        return r"(?!x)x"
    sorted_kws = sorted(set(keywords), key=len, reverse=True)
    patterns = []
    for kw in sorted_kws:
        if kw == "आय":
            patterns.append(r"(?<![आ\w])आय(?![ु\w])")
        elif kw == "वय":
            patterns.append(r"(?<![\w])वय(?![\w])")
        elif kw in {"yr", "dob"}:
            patterns.append(r"(?<![\w])" + re.escape(kw) + r"(?![\w])")
        else:
            parts = re.split(r"\s+", kw.strip())
            patterns.append(r"\s*".join(re.escape(p) for p in parts))
    return r"(?:" + "|".join(patterns) + r")"


def _get_field_keywords(field: str, language: str = "en") -> list[str]:
    """Returns keyword variants for the specified field, prioritizing the requested language
    plus English keywords (for standard bilingual government certificates), falling back to all languages if needed."""
    cfg = load_ocr_keywords()
    field_cfg = cfg.get(field, {})
    lang_normalized = (language or "en").strip().lower()

    if lang_normalized in {"all", "*"}:
        all_variants: list[str] = []
        for k, v in field_cfg.items():
            if k != "_comment" and isinstance(v, list):
                all_variants.extend(v)
        return list(dict.fromkeys(all_variants))

    lang_key = lang_normalized[:2]
    # Priority: requested language keywords first, followed by English keywords for bilingual certificates
    lang_variants = list(field_cfg.get(lang_key, []))
    en_variants = list(field_cfg.get("en", [])) if lang_key != "en" else []
    combined = lang_variants + en_variants

    if not combined:
        for k, v in field_cfg.items():
            if k != "_comment" and isinstance(v, list):
                combined.extend(v)

    return list(dict.fromkeys(combined))


class DocumentService:
    allowed_types = {"application/pdf", "image/png", "image/jpeg"}
    extension_types = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }

    canonical_types = {
        "income_certificate",
        "land_record",
        "ration_card",
        "disability_certificate",
        "caste_certificate",
        "generic_sample_document",
    }

    def process_upload(
        self,
        db: Session,
        user: User,
        file: UploadFile,
        content: bytes,
        declared_type: Optional[str] = None,
        language: str = "en",
    ) -> DocumentRecord:
        try:
            original_name = (file.filename or "").lower()
            if "aadhaar" in original_name or "aadhar" in original_name or "pan" in original_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Please do not upload Aadhaar or PAN images. Use self-declared profile fields or common verification documents (income certificate, land record, ration card, disability certificate, caste certificate, generic sample document).",
                )
            content_type = file.content_type or self._content_type_from_name(file.filename or "")
            if content_type in {"application/octet-stream", "text/plain"}:
                content_type = self._content_type_from_name(file.filename or "")
            if content_type not in self.allowed_types:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")
            masked_name = re.sub(r"\d", "X", file.filename or "document")
    
            doc_type = declared_type if (declared_type and declared_type in self.canonical_types) else self._classify(file.filename or "document")
    
            # In-memory ephemeral OCR (never saved to disk, zero external APIs)
            extracted_fields = self._extract_ephemeral_fields(content, content_type, doc_type, language=language)

            # Defense-in-depth Authenticity Verification Gate
            qr_text = extracted_fields.get("qr_text")
            if not qr_text:
                # Heuristic search in extracted OCR lines for potential verification URL
                url_match = re.search(r"https?://[^\s\"'>]+", str(extracted_fields))
                if url_match:
                    qr_text = url_match.group(0)

            verification_result = document_verification_service.verify(
                content,
                content_type,
                doc_type,
                extracted_fields,
                qr_text=qr_text,
            )

            verification_state = verification_result["status"]
            eligibility_usable = verification_result.get("eligibility_usable", False)
            doc_status = "verified" if eligibility_usable else "rejected" if verification_state == "REJECTED" else "review_required"
    
            masked_fields = {
                "document_type": doc_type,
                "mime_type": content_type,
                "name_hint": user.full_name.split(" ")[0] if user.full_name else "Citizen",
                "identifier_masked": "XXXX-XXXX",
                "verification_status": verification_state,
                "reason_code": verification_result.get("reason_code"),
                "eligibility_usable": eligibility_usable,
            }
            document = DocumentRecord(
                user_id=user.id,
                document_type=doc_type,
                status="processed",
                verification_state="processed_in_memory",
                masked_fields=masked_fields,
                file_name=masked_name,
                mime_type=content_type,
                file_size=len(content),
                retained_in_storage=False,
            )
            db.add(document)
            db.commit()
            db.refresh(document)
    
            # Store derived structured data in Redis with short ephemeral TTL (300 seconds)
            ephemeral_payload = {
                "document_id": document.id,
                "user_id": user.id,
                "document_type": doc_type,
                "verification": verification_result,
                "verification_status": verification_state,
                "verification_reason_code": verification_result.get("reason_code"),
                "eligibility_usable": eligibility_usable,
                "extracted_fields": extracted_fields,
                "quarantined_fields": {} if eligibility_usable else extracted_fields,
                "field_confidences": extracted_fields.get("field_confidences", {}),
                "ocr_quality": extracted_fields.get("ocr_quality", "good"),
                "ocr_confidence_score": extracted_fields.get("ocr_confidence_score"),
                "created_at": datetime.utcnow().isoformat(),
            }
            ephemeral_store.set(f"doc:{document.id}", ephemeral_payload, ttl_seconds=settings.redis_ephemeral_ttl)
            setattr(document, "ephemeral_extracted", extracted_fields)
            setattr(document, "verification", verification_result)
            setattr(document, "verification_status", verification_state)
            setattr(document, "eligibility_usable", eligibility_usable)

            return document
        except HTTPException:
            raise
        except Exception as e:
            import asyncio
            from app.services.discord_service import discord_service
            logger.exception("OCR Processing failed: %s", e)
            
            asyncio.create_task(
                discord_service.send_admin_notification(
                    title="📄 OCR PROCESSING ALERT",
                    message=f"**Status:** Processing failed\n**Reason:** {str(e)}",
                    event_type="warning"
                )
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="OCR processing encountered an unexpected error."
            )

    def _extract_ephemeral_fields(self, content: bytes, content_type: str, doc_type: str, language: str = "en") -> dict[str, Any]:
        """Runs in-memory local OCR / text extraction without writing bytes to disk or calling third-party vision APIs.
        Computes OCR quality confidence score and quality gate flag."""
        text = ""
        used_lang = "fallback"
        ocr_confidence_score: float | None = None
        if content_type in {"image/png", "image/jpeg"}:
            try:
                raw_image = Image.open(io.BytesIO(content))
                image = _preprocess_image_for_ocr(raw_image)
                if pytesseract:
                    tess_lang = _TESS_LANG_MAP.get(language[:2].lower(), "eng")
                    # Try citizen's declared language first, then fall back to combined eng+<lang>, then eng
                    lang_attempts = [f"eng+{tess_lang}", tess_lang, "eng"] if tess_lang != "eng" else ["eng"]
                    for lang_attempt in lang_attempts:
                        try:
                            extracted = pytesseract.image_to_string(image, lang=lang_attempt)
                            if extracted and extracted.strip():
                                text = extracted
                                used_lang = lang_attempt
                                break
                        except Exception as ocr_err:
                            logger.debug("Tesseract attempt with lang=%s failed: %s", lang_attempt, ocr_err)
                            continue

                    # Compute mean OCR confidence from image_to_data
                    if text and used_lang != "fallback":
                        try:
                            data = pytesseract.image_to_data(image, lang=used_lang, output_type=pytesseract.Output.DICT)
                            conf_list = []
                            for conf, word in zip(data.get("conf", []), data.get("text", [])):
                                try:
                                    c_val = float(conf)
                                    if c_val >= 0 and str(word).strip():
                                        conf_list.append(c_val)
                                except (ValueError, TypeError):
                                    continue
                            if conf_list:
                                ocr_confidence_score = round(sum(conf_list) / len(conf_list), 2)
                        except Exception as data_err:
                            logger.debug("Tesseract image_to_data failed: %s", data_err)
            except Exception as img_err:
                logger.warning("Image preprocessing for OCR failed: %s", img_err)

        if not text:
            # In-memory byte stream heuristic / text extraction fallback
            printable = re.findall(rb"[\x20-\x7E]{3,}", content)
            text = " ".join([chunk.decode("latin1", errors="ignore") for chunk in printable])

        # Normalize Indic numerals (e.g., ೧, ೨, ३, ৪ to 1, 2, 3, 4)
        normalized_text = _normalize_indic_digits(text)
        fields = self._parse_structured_fields(normalized_text, language=language)

        # Multi-signal OCR Quality Gate:
        # Mark as 'poor' if:
        # 1. OCR confidence score is None (no readable text tokens found)
        # 2. OCR confidence score < OCR_QUALITY_THRESHOLD (mean token confidence < 55.0)
        # 3. Any extracted field is low or medium confidence (a single degraded field is enough to cause harm)
        field_confs = fields.get("field_confidences", {})
        has_low_or_medium_field = any(conf in {"low", "medium"} for conf in field_confs.values())

        if ocr_confidence_score is None or ocr_confidence_score < OCR_QUALITY_THRESHOLD or has_low_or_medium_field:
            ocr_quality = "poor"
        else:
            ocr_quality = "good"

        fields["ocr_quality"] = ocr_quality
        fields["ocr_confidence_score"] = ocr_confidence_score

        logger.info(
            "OCR DIAGNOSTICS: OCR INVOKED=%s | TESSERACT LANG=%s | OCR CONFIDENCE=%s | OCR QUALITY=%s | OCR TEXT FOUND=%s (len=%d) | EXTRACTED=%s",
            "YES" if bool(pytesseract) else "NO (pytesseract missing)",
            used_lang,
            f"{ocr_confidence_score:.2f}" if ocr_confidence_score is not None else "None",
            ocr_quality,
            "YES" if bool(text.strip()) else "NO",
            len(text),
            fields,
        )
        return fields

    def _parse_structured_fields(self, text: str, language: str = "en") -> dict[str, Any]:
        """Extracts structured values from normalized OCR text using configurable JSON keywords,
        anchored to OCR lines with multi-line plausibility ranking and confidence estimation."""
        fields: dict[str, Any] = {}
        field_confidences: dict[str, str] = {}
        if not text:
            return fields

        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if not lines:
            return fields

        # Helper to get search text for a match in lines:
        # returns list of tuples: (scope_text, distance_in_lines, line_index)
        def _get_search_scopes(kw_regex: str) -> list[tuple[str, int, int]]:
            scopes: list[tuple[str, int, int]] = []
            for idx, line in enumerate(lines):
                m = re.search(kw_regex, line, re.IGNORECASE)
                if m:
                    # 1. Text on same line after keyword
                    after_kw = line[m.end():].strip()
                    first_segment = re.split(r"\s+/\s+|\s*[|;]\s*", after_kw)[0].strip()
                    if first_segment:
                        scopes.append((first_segment, 0, idx))
                    # 2. Next line (distance 1)
                    if idx + 1 < len(lines):
                        next_line = lines[idx + 1].strip()
                        next_segment = re.split(r"\s+/\s+|\s*[|;]\s*", next_line)[0].strip()
                        if next_segment:
                            scopes.append((next_segment, 1, idx))
                    # 3. Line after next (distance 2, for skewed/creased multi-column layouts)
                    if idx + 2 < len(lines):
                        next2_line = lines[idx + 2].strip()
                        next2_segment = re.split(r"\s+/\s+|\s*[|;]\s*", next2_line)[0].strip()
                        if next2_segment:
                            scopes.append((next2_segment, 2, idx))
            return scopes

        def _get_scopes_for_field(field_name: str) -> list[tuple[str, int, int]]:
            # First search with requested language keywords (prioritized)
            primary_kws = _get_field_keywords(field_name, language)
            scopes = _get_search_scopes(_build_keyword_regex(primary_kws))
            # If no match found, fallback to all-languages keyword patterns for mixed-language/undeclared documents
            if not scopes and language != "all":
                fallback_kws = _get_field_keywords(field_name, "all")
                scopes = _get_search_scopes(_build_keyword_regex(fallback_kws))
            return scopes

        # 1. Extract Age with Plausibility Scoring
        age_candidates: list[tuple[int, float, str]] = []  # (value, score, confidence)
        for scope, dist, _ in _get_scopes_for_field("age"):
            # Explicit age unit matches e.g. "34 yrs", "34 years", "34 ವರ್ಷ", "34 वर्ष"
            for um in re.finditer(r"\b(\d{1,3})\s*(?:yrs?|years?|ವರ್ಷ|ವರ್ಷಗಳು|साल|वर्ष)\b", scope, re.IGNORECASE):
                try:
                    u_val = int(um.group(1))
                    if 0 <= u_val <= 125:
                        score = 100.0 - (dist * 5.0)
                        age_candidates.append((u_val, score, "high"))
                except ValueError:
                    pass

            # Regular digit tokens
            for m in re.finditer(r"\b(\d{1,3})\b", scope):
                try:
                    val = int(m.group(1))
                    if 0 <= val <= 125:
                        if 18 <= val <= 100:
                            score = 85.0 - (dist * 10.0)
                            conf = "high" if dist <= 1 else "medium"
                        elif 10 <= val <= 17 or 101 <= val <= 125:
                            score = 65.0 - (dist * 10.0)
                            conf = "medium"
                        else:
                            # 1-digit without unit is very likely stray OCR noise (like item number '4' or '2')
                            score = 20.0 - (dist * 5.0)
                            conf = "low"
                        age_candidates.append((val, score, conf))
                except ValueError:
                    continue

        if age_candidates:
            age_candidates.sort(key=lambda x: x[1], reverse=True)
            best_age, _, best_age_conf = age_candidates[0]
            fields["age"] = best_age
            fields["_age_confidence"] = best_age_conf
            field_confidences["age"] = best_age_conf

        # 2. Extract DOB (and derive age if not yet present)
        dob_candidates: list[tuple[str, int, float, str]] = []
        for scope, dist, _ in _get_scopes_for_field("dob"):
            dob_matches = list(re.finditer(r"\b(\d{1,2})[./\-\s](\d{1,2})[./\-\s](\d{4})\b", scope))
            for m in dob_matches:
                try:
                    d = int(m.group(1))
                    mo = int(m.group(2))
                    y = int(m.group(3))
                    current_year = datetime.now().year
                    if 1 <= d <= 31 and 1 <= mo <= 12 and 1900 <= y <= current_year:
                        dob_str = f"{d:02d}/{mo:02d}/{y}"
                        calc_age = current_year - y
                        score = 90.0 - (dist * 10.0)
                        dob_candidates.append((dob_str, calc_age, score, "high"))
                except ValueError:
                    continue

        if dob_candidates:
            dob_candidates.sort(key=lambda x: x[2], reverse=True)
            best_dob, calc_age, _, dob_conf = dob_candidates[0]
            fields["dob"] = best_dob
            if "age" not in fields and 0 <= calc_age <= 125:
                fields["age"] = calc_age
                fields["_age_confidence"] = dob_conf
                field_confidences["age"] = dob_conf

        # 3. Extract Income with Plausibility Scoring
        income_candidates: list[tuple[float, float, str]] = []  # (value, score, confidence)
        for scope, dist, _ in _get_scopes_for_field("income"):
            for m in re.finditer(r"(?:(?:rs\.?|inr|₹|రూ|ரூ|ರೂ|रु|%)\s*)?([\d,]+(?:\.\d+)?)\b", scope, re.IGNORECASE):
                raw = m.group(1).replace(",", "").strip()
                if not raw:
                    continue
                try:
                    val = float(raw)
                    if val >= 0:
                        has_sym = bool(re.search(r"[rs|inr|₹|రూ|ரூ|ರೂ|रु,%]", m.group(0), re.IGNORECASE))
                        has_comma = "," in m.group(1)
                        has_suffix_dash = bool(re.search(r"/\-", scope))

                        if (has_sym or has_suffix_dash) and (has_comma or val >= 1000.0):
                            score = 100.0 - (dist * 5.0)
                            conf = "high"
                        elif has_comma and val >= 1000.0:
                            score = 95.0 - (dist * 5.0)
                            conf = "high"
                        elif has_sym and val >= 1000.0:
                            score = 90.0 - (dist * 5.0)
                            conf = "high"
                        elif val >= 10000.0:
                            score = 80.0 - (dist * 5.0)
                            conf = "high" if dist <= 1 else "medium"
                        elif 1000.0 <= val < 10000.0:
                            score = 40.0 - (dist * 5.0)
                            conf = "medium"
                        else:  # < 1000 and no currency/comma -> low confidence stray noise (e.g. item number '2')
                            score = 10.0 - (dist * 5.0)
                            conf = "low"

                        income_candidates.append((val, score, conf))
                except ValueError:
                    continue

        if income_candidates:
            income_candidates.sort(key=lambda x: x[1], reverse=True)
            best_inc, _, best_inc_conf = income_candidates[0]
            fields["income"] = best_inc
            fields["_income_confidence"] = best_inc_conf
            field_confidences["income"] = best_inc_conf

        # 4. Extract Landholding with Plausibility Scoring
        land_candidates: list[tuple[float, float, str]] = []  # (value, score, confidence)
        for scope, dist, _ in _get_scopes_for_field("landholding"):
            for m in re.finditer(r"([\d.]+)\s*(acres?|acre|एकड़|ఎకరాలు|ஏக்கர்|ഏക്കർ|একর|हेक्टर|guntha|bigha|cents?|hectares?)?", scope, re.IGNORECASE):
                raw = m.group(1).strip()
                if not raw or raw == ".":
                    continue
                try:
                    val = float(raw)
                    if 0 <= val <= 10000:
                        has_unit = bool(m.group(2))
                        if has_unit and val > 0:
                            score = 95.0 - (dist * 5.0)
                            conf = "high"
                        elif val > 0:
                            score = 60.0 - (dist * 5.0)
                            conf = "medium"
                        else:
                            score = 30.0 - (dist * 5.0)
                            conf = "low"
                        land_candidates.append((val, score, conf))
                except ValueError:
                    continue

        if land_candidates:
            land_candidates.sort(key=lambda x: x[1], reverse=True)
            best_land, _, best_land_conf = land_candidates[0]
            fields["landholding"] = best_land
            fields["_landholding_confidence"] = best_land_conf
            field_confidences["landholding"] = best_land_conf

        fields["field_confidences"] = field_confidences
        return fields

    def _classify(self, file_name: str) -> str:
        name = file_name.lower()
        if "income" in name or "aay" in name or "aadhaya" in name:
            return "income_certificate"
        if "land" in name or "rtc" in name or "patta" in name or "chitta" in name or "pahani" in name or "7/12" in name:
            return "land_record"
        if "ration" in name or "rashan" in name:
            return "ration_card"
        if "disability" in name or "disabled" in name or "pwd" in name or "divyang" in name or "udid" in name:
            return "disability_certificate"
        if "caste" in name or "jati" in name or "jaati" in name or "samudhayam" in name:
            return "caste_certificate"
        return "generic_sample_document"

    def _content_type_from_name(self, file_name: str) -> str:
        for extension, content_type in self.extension_types.items():
            if file_name.lower().endswith(extension):
                return content_type
        return ""


document_service = DocumentService()
