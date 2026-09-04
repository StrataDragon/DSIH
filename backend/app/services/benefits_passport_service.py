"""
Benefits Passport Aggregator Service (Tech Sahaya)

Provides authoritative, deterministic welfare benefits state:
- Current eligible benefits with verified justifications
- "Almost eligible" schemes failing exactly one actionable requirement
- "Eligibility Radar" predicting future deterministic milestones (e.g. age thresholds)
- "Protect Your Benefits" tracking document expirations and affected scheme counts
- Deterministic priority actions ranking next steps by impact (schemes unlocked)

Enforces fail-closed authenticity: only VERIFIED document claims may contribute to passport state.
"""

from datetime import datetime, timedelta
import logging
from typing import Any
from sqlalchemy.orm import Session

from app.models.db_models import User, DocumentRecord, ProfileRecord
from app.models.schemas import (
    EligibilityProfile,
    BenefitsPassportResponse,
    BenefitsPassportSummary,
    EligibleBenefitItem,
    AlmostEligibleItem,
    EligibilityRadarItem,
    DocumentAlertItem,
    PassportActionItem,
    PassportTimelineEvent,
    PassportChangeItem,
    Scheme,
)
from app.services.data_loader import load_rules, load_schemes
from app.services.eligibility_engine import eligibility_engine
from app.services.profile_service import profile_service

logger = logging.getLogger("techsahaya.benefits_passport")


class BenefitsPassportService:
    def get_passport(self, db: Session, user: User) -> BenefitsPassportResponse:
        """
        Builds the complete authoritative Benefits Passport for the user.
        Derives all calculations deterministically from trusted profile state and verified documents.
        """
        profile_record: ProfileRecord = profile_service.get_or_create(db, user)
        schemes: list[Scheme] = load_schemes()
        rules: dict[str, Any] = load_rules()

        # 1. Profile Completeness Evaluation
        missing_profile_fields = []
        if not user.full_name or not user.full_name.strip():
            missing_profile_fields.append("full_name")
        if not profile_record.age:
            missing_profile_fields.append("age")
        if not profile_record.state:
            missing_profile_fields.append("state")
        if not profile_record.occupation:
            missing_profile_fields.append("occupation")

        profile_complete = bool(
            user.full_name
            and user.full_name.strip()
            and profile_record.age
            and profile_record.state
            and profile_record.occupation
        )

        readiness_pct = 0
        if profile_record.age:
            readiness_pct += 25
        if profile_record.state:
            readiness_pct += 25
        if profile_record.occupation:
            readiness_pct += 25
        if profile_record.income is not None:
            readiness_pct += 15
        if profile_record.available_documents:
            readiness_pct += 10
        readiness_pct = min(100, readiness_pct)

        # 2. Document Verification Audit & Security Boundary
        # Only documents verified by our authenticity pipeline may participate as trusted claims
        doc_records: list[DocumentRecord] = (
            db.query(DocumentRecord).filter(DocumentRecord.user_id == user.id).all()
        )

        verified_doc_types = set()
        doc_verification_status: dict[str, str] = {}  # doc_type -> status string
        expiring_docs: list[dict[str, Any]] = []

        for d in doc_records:
            dtype = d.document_type.lower().strip()
            masked = d.masked_fields or {}
            v_status = masked.get("verification_status") or "REVIEW_REQUIRED"
            doc_verification_status[dtype] = v_status

            if v_status == "VERIFIED" and masked.get("eligibility_usable") is True:
                verified_doc_types.add(dtype)

            # Check expiration date if present
            expires_at_str = masked.get("expires_at") or masked.get("valid_until")
            if expires_at_str:
                try:
                    exp_dt = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
                    now = datetime.utcnow()
                    days_left = (exp_dt.replace(tzinfo=None) - now).days
                    expiring_docs.append({
                        "document_type": d.document_type,
                        "file_name": d.file_name,
                        "expires_at": expires_at_str,
                        "days_remaining": days_left,
                    })
                except Exception:
                    pass

        # Build authoritative trusted profile strictly incorporating verified documents
        trusted_available_docs = list(
            set(profile_record.available_documents or []).intersection(verified_doc_types)
            if verified_doc_types
            else []
        )
        # Also include any document explicitly marked verified
        for vdt in verified_doc_types:
            if vdt not in trusted_available_docs:
                trusted_available_docs.append(vdt)

        trusted_profile = EligibilityProfile(
            age=profile_record.age,
            gender=profile_record.gender,
            state=profile_record.state,
            occupation=profile_record.occupation,
            income=profile_record.income,
            landholding=profile_record.landholding,
            disability=profile_record.disability,
            family_members=profile_record.family_members or [],
            available_documents=trusted_available_docs,
        )

        # 3. Deterministic Scheme Evaluations
        eligible_now: list[EligibleBenefitItem] = []
        almost_eligible: list[AlmostEligibleItem] = []
        scheme_evaluations: dict[str, Any] = {}

        for scheme in schemes:
            rule = rules.get(scheme.id, {})
            result = eligibility_engine.evaluate(
                scheme.id, trusted_profile, rule, scheme.alternative_scheme_ids
            )
            scheme_evaluations[scheme.id] = (scheme, rule, result)

            if result.status == "eligible":
                # Determine verified documents used
                req_docs = rule.get("required_documents_any_of", [])
                used_docs = [
                    d for d in req_docs
                    if eligibility_engine._normalize_document_name(d)
                    in {eligibility_engine._normalize_document_name(x) for x in trusted_profile.available_documents}
                ]
                reasons = self._format_matched_reasons(rule, trusted_profile, result.matched)

                eligible_now.append(
                    EligibleBenefitItem(
                        scheme_id=scheme.id,
                        name=scheme.name,
                        category=scheme.category,
                        department=scheme.department,
                        official_link=str(scheme.official_link),
                        benefits=scheme.benefits[:3],
                        matched_reasons=reasons,
                        verified_documents_used=used_docs,
                        score=result.score,
                    )
                )

        # 4. "Almost Eligible" (One Step Away) Analysis
        for scheme in schemes:
            scheme_obj, rule, result = scheme_evaluations[scheme.id]
            if result.status == "eligible":
                continue

            # Check if this scheme is blocked by exactly 1 actionable category
            failed = result.failed
            missing = result.missing
            total_unmet = len(failed) + len(missing)

            if total_unmet > 2:
                continue

            almost_item = self._evaluate_almost_eligible(
                scheme_obj, rule, result, trusted_profile, doc_verification_status
            )
            if almost_item:
                almost_eligible.append(almost_item)

        # 5. Eligibility Radar (Predictable Future Opportunities)
        eligibility_radar: list[EligibilityRadarItem] = []
        current_year = datetime.utcnow().year
        current_age = trusted_profile.age or 0

        for scheme in schemes:
            rule = rules.get(scheme.id, {})
            min_age = rule.get("min_age")
            if min_age and current_age and current_age < min_age:
                years_away = min_age - current_age
                if 0 < years_away <= 3:
                    # Check if other criteria match or could match
                    target_year = current_year + years_away
                    eligibility_radar.append(
                        EligibilityRadarItem(
                            scheme_id=scheme.id,
                            name=scheme.name,
                            category=scheme.category,
                            trigger_condition=f"Turns {min_age} years old (required age: {min_age})",
                            estimated_date=f"Year {target_year} (~{years_away} year{'s' if years_away > 1 else ''})",
                            current_value=f"{current_age} years",
                            required_value=f"{min_age} years",
                            confidence="HIGH",
                        )
                    )

        # 6. Document Expiry & Benefit Protection
        document_alerts: list[DocumentAlertItem] = []
        for exp in expiring_docs:
            days_left = exp.get("days_remaining", 999)
            dtype = exp["document_type"]

            # Calculate exact number of schemes that depend on this document
            # by simulating its removal from available_documents
            hypothetical_docs = [
                d for d in trusted_profile.available_documents
                if eligibility_engine._normalize_document_name(d) != eligibility_engine._normalize_document_name(dtype)
            ]
            hypothetical_profile = trusted_profile.model_copy(
                update={"available_documents": hypothetical_docs}
            )

            affected_names = []
            for eligible_item in eligible_now:
                rule = rules.get(eligible_item.scheme_id, {})
                re_eval = eligibility_engine.evaluate(
                    eligible_item.scheme_id, hypothetical_profile, rule, []
                )
                if re_eval.status != "eligible":
                    affected_names.append(eligible_item.name)

            alert_level = "critical" if days_left <= 15 else "warning" if days_left <= 45 else "info"
            recommendation = (
                f"Renew your {dtype} before it expires to protect eligibility for {len(affected_names)} scheme(s)."
                if affected_names
                else f"Renew your {dtype} to ensure future scheme eligibility remains uninterrupted."
            )

            document_alerts.append(
                DocumentAlertItem(
                    document_type=dtype,
                    file_name=exp.get("file_name"),
                    expires_at=exp.get("expires_at"),
                    days_remaining=days_left,
                    affected_schemes_count=len(affected_names),
                    affected_scheme_names=affected_names,
                    alert_level=alert_level,
                    recommendation=recommendation,
                )
            )

        # 7. Priority Actions ("What should I do next?")
        priority_actions: list[PassportActionItem] = []
        action_idx = 1

        # Action Type A: High-impact missing documents
        doc_impact_map: dict[str, list[str]] = {}
        for ae in almost_eligible:
            if ae.missing_document_name:
                doc_norm = eligibility_engine._normalize_document_name(ae.missing_document_name)
                doc_impact_map.setdefault(doc_norm, []).append(ae.name)

        # Sort documents by number of unlocked schemes descending
        sorted_doc_impact = sorted(
            doc_impact_map.items(), key=lambda kv: len(kv[1]), reverse=True
        )

        for doc_key, scheme_list in sorted_doc_impact:
            priority_actions.append(
                PassportActionItem(
                    id=f"action-upload-{doc_key}",
                    priority=action_idx,
                    title=f"Upload & verify {doc_key.replace('_', ' ').title()}",
                    description=f"Unlocks {len(scheme_list)} potential scheme(s): {', '.join(scheme_list[:2])}{'...' if len(scheme_list) > 2 else ''}.",
                    unlocked_schemes_count=len(scheme_list),
                    unlocked_scheme_names=scheme_list,
                    action_route="/documents",
                    action_label="Upload Document",
                    category="upload_document",
                )
            )
            action_idx += 1

        # Action Type B: Protecting expiring benefits
        for alert in document_alerts:
            if alert.affected_schemes_count > 0:
                priority_actions.append(
                    PassportActionItem(
                        id=f"action-renew-{alert.document_type}",
                        priority=action_idx,
                        title=f"Renew {alert.document_type}",
                        description=f"Protects access to {alert.affected_schemes_count} active scheme(s) expiring in {alert.days_remaining} days.",
                        unlocked_schemes_count=alert.affected_schemes_count,
                        unlocked_scheme_names=alert.affected_scheme_names,
                        action_route="/documents",
                        action_label="Renew Certificate",
                        category="renew_document",
                    )
                )
                action_idx += 1

        # Action Type C: Complete missing profile fields
        if missing_profile_fields:
            priority_actions.append(
                PassportActionItem(
                    id="action-complete-profile",
                    priority=action_idx,
                    title="Complete required profile attributes",
                    description=f"Add missing details ({', '.join(missing_profile_fields)}) to enable full deterministic eligibility checks.",
                    unlocked_schemes_count=0,
                    unlocked_scheme_names=[],
                    action_route="/profile",
                    action_label="Complete Profile",
                    category="complete_profile",
                )
            )

        # 8. Benefit Timeline
        timeline: list[PassportTimelineEvent] = [
            PassportTimelineEvent(
                time_label="Available Now",
                title=f"{len(eligible_now)} Scheme(s) Qualified",
                type="current_eligible",
                detail="All deterministic eligibility conditions and verified documents are satisfied.",
                badge="Active",
            )
        ]

        if almost_eligible:
            timeline.append(
                PassportTimelineEvent(
                    time_label="One Step Away",
                    title=f"{len(almost_eligible)} Scheme(s) Blocked by Missing Requirements",
                    type="missing_document",
                    detail="Actionable: uploading required certificates will immediately unlock these schemes.",
                    badge="Action Needed",
                )
            )

        for radar in eligibility_radar[:2]:
            timeline.append(
                PassportTimelineEvent(
                    time_label=radar.estimated_date or "Future",
                    title=f"{radar.name} ({radar.trigger_condition})",
                    type="future_age",
                    detail="Predictable milestone based on your verified birth date/age.",
                    badge="Coming Soon",
                )
            )

        for alert in document_alerts:
            timeline.append(
                PassportTimelineEvent(
                    time_label=f"In {alert.days_remaining} days",
                    title=f"{alert.document_type} Renewal Due",
                    type="document_expiry",
                    detail=f"Renewal protects eligibility for {alert.affected_schemes_count} scheme(s).",
                    badge="Renewal",
                )
            )

        # 9. Recent Changes
        recent_changes: list[PassportChangeItem] = []
        if verified_doc_types:
            recent_changes.append(
                PassportChangeItem(
                    title="Verified Document Claim Active",
                    description=f"Your verified documents ({', '.join(list(verified_doc_types)[:3])}) are actively supporting your welfare passport.",
                    type="positive",
                )
            )
        if len(eligible_now) > 0:
            recent_changes.append(
                PassportChangeItem(
                    title=f"{len(eligible_now)} Active Welfare Entitlements",
                    description="You meet all deterministic requirements. Review and submit your applications.",
                    type="positive",
                )
            )
        if not profile_complete:
            recent_changes.append(
                PassportChangeItem(
                    title="Profile Incomplete",
                    description=f"Please provide your {', '.join(missing_profile_fields)} to unlock all personalized recommendations.",
                    type="warning",
                )
            )

        # 10. Summary Snapshot
        summary = BenefitsPassportSummary(
            eligible_count=len(eligible_now),
            almost_eligible_count=len(almost_eligible),
            future_count=len(eligibility_radar),
            verified_documents_count=len(verified_doc_types),
            total_documents_count=len(doc_records),
            expiring_documents_count=len(document_alerts),
            profile_completion_percentage=readiness_pct,
        )

        return BenefitsPassportResponse(
            profile_complete=profile_complete,
            missing_profile_fields=missing_profile_fields,
            summary=summary,
            eligible_now=eligible_now,
            almost_eligible=almost_eligible,
            eligibility_radar=eligibility_radar,
            document_alerts=document_alerts,
            priority_actions=priority_actions,
            timeline=timeline,
            recent_changes=recent_changes,
        )

    def _format_matched_reasons(
        self, rule: dict[str, Any], profile: EligibilityProfile, matched_strings: list[str]
    ) -> list[str]:
        reasons = []
        if profile.age:
            min_a = rule.get("min_age")
            max_a = rule.get("max_age")
            if min_a and max_a:
                reasons.append(f"Age {profile.age} is within required bracket ({min_a}-{max_a} yrs)")
            elif min_a:
                reasons.append(f"Age {profile.age} meets minimum age requirement ({min_a}+ yrs)")
            elif max_a:
                reasons.append(f"Age {profile.age} satisfies maximum age ceiling ({max_a} yrs)")

        if profile.income is not None and "max_income" in rule:
            reasons.append(f"Annual income ₹{profile.income:,.0f} satisfies threshold (ceiling: ₹{rule['max_income']:,.0f})")

        if profile.state and "state" in rule:
            reasons.append(f"Resident of {profile.state} (eligible state)")

        if profile.occupation and "occupation" in rule:
            reasons.append(f"Occupation matches criteria ({profile.occupation.capitalize()})")

        if "required_documents_any_of" in rule:
            reasons.append("Official verified verification documents provided")

        return reasons or ["All core criteria satisfied"]

    def _evaluate_almost_eligible(
        self,
        scheme: Scheme,
        rule: dict[str, Any],
        result: Any,
        profile: EligibilityProfile,
        doc_verification_status: dict[str, str],
    ) -> AlmostEligibleItem | None:
        failed = result.failed
        missing = result.missing

        # Case 1: Document only failure
        doc_failure = any("At least one of these documents is required" in f for f in failed)
        other_failures = [f for f in failed if "At least one of these documents is required" not in f]

        if doc_failure and len(other_failures) == 0 and len(missing) == 0:
            req_docs = rule.get("required_documents_any_of", [])
            primary_doc = req_docs[0] if req_docs else "certificate"
            doc_norm = eligibility_engine._normalize_document_name(primary_doc)

            # Check status of this document in user's uploaded history
            current_status = "NOT_UPLOADED"
            for uploaded_type, v_status in doc_verification_status.items():
                if eligibility_engine._normalize_document_name(uploaded_type) == doc_norm:
                    if v_status == "REJECTED":
                        current_status = "VERIFICATION_FAILED"
                    elif v_status == "REVIEW_REQUIRED":
                        current_status = "UPLOADED_BUT_UNVERIFIED"
                    elif v_status == "VERIFIED":
                        current_status = "VERIFIED"
                    break

            if current_status == "VERIFICATION_FAILED":
                unlock_text = f"Your uploaded {primary_doc} could not be verified. Please upload an authentic, unaltered document."
            elif current_status == "UPLOADED_BUT_UNVERIFIED":
                unlock_text = f"Your {primary_doc} is pending manual review. Once verified, this scheme will unlock."
            else:
                unlock_text = f"Upload a verified {primary_doc} to unlock this benefit."

            return AlmostEligibleItem(
                scheme_id=scheme.id,
                name=scheme.name,
                category=scheme.category,
                department=scheme.department,
                blocking_reason_category="ONE_MISSING_DOCUMENT",
                unmet_conditions=[f"Requires verified {primary_doc}"],
                missing_document_name=primary_doc,
                missing_document_status=current_status,
                unlock_action=unlock_text,
                action_route="/documents",
            )

        # Case 2: Near Age Threshold (within 2 years of min_age)
        min_age = rule.get("min_age")
        if min_age and profile.age and 0 < (min_age - profile.age) <= 2:
            if len(other_failures) <= 1:
                return AlmostEligibleItem(
                    scheme_id=scheme.id,
                    name=scheme.name,
                    category=scheme.category,
                    department=scheme.department,
                    blocking_reason_category="NEAR_AGE_THRESHOLD",
                    unmet_conditions=[f"Age {profile.age} is near threshold of {min_age}"],
                    missing_document_name=None,
                    missing_document_status="NOT_UPLOADED",
                    unlock_action=f"You are {min_age - profile.age} year(s) away from qualifying at age {min_age}.",
                    action_route="/profile",
                )

        # Case 3: Near Income Threshold (within 20% of max_income)
        max_income = rule.get("max_income")
        if max_income and profile.income and max_income < profile.income <= max_income * 1.2:
            if len(other_failures) <= 1:
                return AlmostEligibleItem(
                    scheme_id=scheme.id,
                    name=scheme.name,
                    category=scheme.category,
                    department=scheme.department,
                    blocking_reason_category="NEAR_INCOME_THRESHOLD",
                    unmet_conditions=[f"Income ₹{profile.income:,.0f} is slightly above ₹{max_income:,.0f}"],
                    missing_document_name=None,
                    missing_document_status="NOT_UPLOADED",
                    unlock_action=f"Current income is within 20% of the ₹{max_income:,.0f} limit.",
                    action_route="/profile",
                )

        # Case 4: Exactly one missing profile attribute
        if len(failed) == 0 and len(missing) == 1:
            missing_attr = missing[0].replace("Missing ", "")
            return AlmostEligibleItem(
                scheme_id=scheme.id,
                name=scheme.name,
                category=scheme.category,
                department=scheme.department,
                blocking_reason_category="ONE_MISSING_ATTRIBUTE",
                unmet_conditions=[missing[0]],
                missing_document_name=None,
                missing_document_status="NOT_UPLOADED",
                unlock_action=f"Add your {missing_attr} to complete qualification.",
                action_route="/profile",
            )

        return None


benefits_passport_service = BenefitsPassportService()
