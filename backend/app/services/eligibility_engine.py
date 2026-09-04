from typing import Any

from app.models.schemas import EligibilityProfile, EligibilityResult


class EligibilityEngine:
    def evaluate(self, scheme_id: str, profile: EligibilityProfile, rule: dict[str, Any], alternative_schemes: list[str]) -> EligibilityResult:
        try:
            return self._evaluate_internal(scheme_id, profile, rule, alternative_schemes)
        except Exception as e:
            import logging
            import asyncio
            from app.services.discord_service import discord_service
            logger = logging.getLogger("techsahaya.eligibility_engine")
            logger.exception("Eligibility engine failure: %s", e)
            
            asyncio.create_task(
                discord_service.send_admin_notification(
                    title="⚠️ ELIGIBILITY SYSTEM ERROR",
                    message=f"**Component:** Eligibility Engine\n**Error:** {str(e)}\n**Scheme ID:** {scheme_id}",
                    event_type="error",
                    metadata={"scheme_id": scheme_id}
                )
            )
            # Return a degraded but safe response
            return EligibilityResult(
                eligible=False,
                status="system_error",
                matched=[],
                failed=["A system error occurred during evaluation."],
                missing=[],
                score=0,
                explanation="System encountered an unexpected error while evaluating this scheme.",
                next_action="Please try again later or contact support.",
                alternative_schemes=[]
            )

    def _evaluate_internal(self, scheme_id: str, profile: EligibilityProfile, rule: dict[str, Any], alternative_schemes: list[str]) -> EligibilityResult:
        matched: list[str] = []
        failed: list[str] = []
        missing: list[str] = []

        self._check_min_max("age", profile.age, rule, matched, failed, missing)
        self._check_min_max("income", profile.income, rule, matched, failed, missing)
        self._check_min_max("landholding", profile.landholding, rule, matched, failed, missing)
        self._check_exact("gender", profile.gender, rule, matched, failed, missing)
        self._check_exact("occupation", profile.occupation, rule, matched, failed, missing, allow_list=True)
        self._check_state(profile.state, rule, matched, failed, missing)
        self._check_disability(profile.disability, rule, matched, failed, missing)
        self._check_documents(profile.available_documents, rule, matched, failed)

        total_checks = max(len(matched) + len(failed) + len(missing), 1)
        score = int((len(matched) / total_checks) * 100)

        reason_code = None
        verified = None

        if failed:
            doc_only_failure = len(failed) == 1 and any("At least one of these documents is required" in f for f in failed)
            if doc_only_failure:
                status = "document_verification_required"
                eligible = False
                explanation = "Core criteria are satisfied, but an official verified document is required to establish eligibility."
                next_action = "Please upload an official digitally-signed or verified document to establish eligibility."
                reason_code = "DOCUMENT_AUTHENTICITY_FAILED"
                verified = False
            else:
                status = "not_eligible"
                eligible = False
                explanation = f"Deterministic rule evaluation found {len(failed)} unmet condition(s)."
                next_action = "Review failed conditions or explore alternative schemes."
        elif missing:
            status = "needs_more_information"
            eligible = False
            explanation = "More information is required before eligibility can be confirmed."
            next_action = "Complete the missing profile information and recheck."
        else:
            status = "eligible"
            eligible = True
            explanation = "All deterministic eligibility conditions were satisfied."
            next_action = "Prepare the required documents and continue to the application journey."
            verified = True

        return EligibilityResult(
            eligible=eligible,
            status=status,
            matched=matched,
            failed=failed,
            missing=missing,
            score=score,
            explanation=explanation,
            next_action=next_action,
            alternative_schemes=alternative_schemes if not eligible else [],
            verified=verified,
            reason_code=reason_code,
        )

    def _check_min_max(self, field: str, value: float | int | None, rule: dict[str, Any], matched: list[str], failed: list[str], missing: list[str]) -> None:
        min_key = f"min_{field}"
        max_key = f"max_{field}"
        if min_key not in rule and max_key not in rule:
            return
        if value is None:
            missing.append(f"Missing {field}")
            return
        if min_key in rule and value < rule[min_key]:
            failed.append(f"{field} is below minimum threshold of {rule[min_key]}")
        elif max_key in rule and value > rule[max_key]:
            failed.append(f"{field} is above maximum threshold of {rule[max_key]}")
        else:
            matched.append(f"{field} condition satisfied")

    def _check_exact(self, field: str, value: str | None, rule: dict[str, Any], matched: list[str], failed: list[str], missing: list[str], allow_list: bool = False) -> None:
        if field not in rule:
            return
        if value is None:
            missing.append(f"Missing {field}")
            return
        expected = rule[field]
        if allow_list and isinstance(expected, list):
            if value.lower() in [item.lower() for item in expected]:
                matched.append(f"{field} condition satisfied")
            else:
                failed.append(f"{field} must be one of {', '.join(expected)}")
            return
        if value.lower() == str(expected).lower():
            matched.append(f"{field} condition satisfied")
        else:
            failed.append(f"{field} must be {expected}")

    def _check_state(self, value: str | None, rule: dict[str, Any], matched: list[str], failed: list[str], missing: list[str]) -> None:
        states = rule.get("state")
        if not states:
            return
        if value is None:
            missing.append("Missing state")
            return
        if value.lower() in [state.lower() for state in states] or "all" in [state.lower() for state in states]:
            matched.append("state condition satisfied")
        else:
            failed.append(f"state must be one of {', '.join(states)}")

    def _check_disability(self, value: bool | None, rule: dict[str, Any], matched: list[str], failed: list[str], missing: list[str]) -> None:
        if "disability" not in rule:
            return
        if value is None:
            missing.append("Missing disability status")
            return
        if value == rule["disability"]:
            matched.append("disability condition satisfied")
        else:
            failed.append("disability condition not satisfied")

    def _check_documents(self, documents: list[str], rule: dict[str, Any], matched: list[str], failed: list[str]) -> None:
        required = rule.get("required_documents_any_of", [])
        if not required:
            return
        normalized_documents = {self._normalize_document_name(item) for item in documents}
        normalized_required = {self._normalize_document_name(item) for item in required}

        # Academic document equivalence:
        # A verified marksheet / academic record satisfies education/academic document requirements
        academic_family = {"academicrecord", "studentid"}
        has_academic_doc = bool(normalized_documents.intersection(academic_family))
        requires_academic_doc = bool(normalized_required.intersection(academic_family))

        if normalized_required.intersection(normalized_documents) or (has_academic_doc and requires_academic_doc):
            matched.append("document condition satisfied")
        else:
            failed.append(f"At least one of these documents is required: {', '.join(required)}")

    def _normalize_document_name(self, value: str) -> str:
        aliases = {
            "studentid": "studentid",
            "studentidentitycard": "studentid",
            "studentcard": "studentid",
            "schoolid": "studentid",
            "collegeid": "studentid",
            "marksheet": "academicrecord",
            "marksheetacademicrecord": "academicrecord",
            "academicrecord": "academicrecord",
            "academicrecorddigilocker": "academicrecord",
            "marksheetacademicrecorddigilocker": "academicrecord",
            "digilockermarksheet": "academicrecord",
            "digilockeracademicrecord": "academicrecord",
            "semestermarksheet": "academicrecord",
            "educationcertificate": "academicrecord",
            "landrecord": "landrecord",
            "landrecords": "landrecord",
            "incomecertificate": "incomecertificate",
            "rationcard": "rationcard",
            "castecertificate": "castecertificate",
            "disabilitycertificate": "disabilitycertificate",
        }
        normalized = "".join(char for char in value.lower() if char.isalnum())
        return aliases.get(normalized, normalized)


eligibility_engine = EligibilityEngine()
