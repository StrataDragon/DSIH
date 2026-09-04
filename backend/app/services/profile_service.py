from sqlalchemy.orm import Session

from app.core.auth import get_user_role
from app.models.db_models import NotificationRecord, ProfileRecord, User
from app.models.schemas import ProfileResponse, ProfileUpdate


class ProfileService:
    def get_or_create(self, db: Session, user: User) -> ProfileRecord:
        profile = db.query(ProfileRecord).filter(ProfileRecord.user_id == user.id).first()
        if profile is None:
            profile = ProfileRecord(user_id=user.id, preferred_language=user.preferred_language)
            db.add(profile)
            db.commit()
            db.refresh(profile)
        return profile

    def to_response(self, db: Session, user: User, profile: ProfileRecord) -> ProfileResponse:
        is_complete = bool(
            user.full_name
            and user.full_name.strip()
            and profile.age
            and profile.state
            and profile.occupation
        )
        if profile.onboarding_completed != is_complete:
            profile.onboarding_completed = is_complete
            db.add(profile)
            db.commit()
            db.refresh(profile)

        return ProfileResponse(
            user_id=user.id,
            full_name=user.full_name or "",
            email=user.email,
            phone_number=user.phone_number,
            role=get_user_role(db, user.id),
            onboarding_completed=profile.onboarding_completed,
            preferred_language=profile.preferred_language,
            accessibility_preference=profile.accessibility_preference,
            consent_given=profile.consent_given,
            age=profile.age,
            gender=profile.gender,
            state=profile.state,
            occupation=profile.occupation,
            income=profile.income,
            landholding=profile.landholding,
            disability=profile.disability,
            family_members=profile.family_members or [],
            available_documents=profile.available_documents or [],
            recently_viewed_schemes=profile.recently_viewed_schemes or [],
            digital_literacy=profile.digital_literacy,
            stored_data_summary={
                "fields_stored": [
                    "full_name",
                    "email",
                    "phone_number",
                    "preferred_language",
                    "accessibility_preference",
                    "consent_given",
                    "age",
                    "gender",
                    "state",
                    "occupation",
                    "income",
                    "landholding",
                    "disability",
                    "family_members",
                    "available_documents",
                    "recently_viewed_schemes",
                    "digital_literacy",
                ],
                "what_we_never_store": [
                    "full Aadhaar number",
                    "full PAN number",
                    "biometric data",
                    "raw identity documents",
                ],
                "sensitive_data_policy": "Documents are processed in memory whenever possible and only masked extracted metadata is retained.",
            },
        )

    def update(self, db: Session, user: User, payload: ProfileUpdate) -> ProfileResponse:
        profile = self.get_or_create(db, user)
        data = payload.model_dump(exclude_unset=True)
        if "full_name" in data and data["full_name"] is not None:
            name_val = data["full_name"].strip()
            user.full_name = name_val
            db.add(user)
        for key, value in data.items():
            if key != "full_name" and hasattr(profile, key):
                setattr(profile, key, value)
        profile.onboarding_completed = bool(
            user.full_name
            and user.full_name.strip()
            and profile.age
            and profile.state
            and profile.occupation
        )
        db.add(profile)
        db.add(
            NotificationRecord(
                user_id=user.id,
                title="Profile updated",
                message="Your welfare profile has been updated.",
                level="info",
            )
        )
        db.commit()
        db.refresh(profile)
        return self.to_response(db, user, profile)

    def delete(self, db: Session, user: User) -> None:
        db.query(NotificationRecord).filter(NotificationRecord.user_id == user.id).delete()
        db.query(ProfileRecord).filter(ProfileRecord.user_id == user.id).delete()
        db.commit()


profile_service = ProfileService()
