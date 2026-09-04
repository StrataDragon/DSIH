import type { EligibilityProfile } from "../types";

/**
 * Checks if a profile has satisfied the mandatory onboarding criteria.
 * Aligns with backend profile_service.py: bool(profile.age and profile.state and profile.occupation).
 */
export function isProfileComplete(profile?: EligibilityProfile | null): boolean {
  if (!profile) return false;
  if (profile.onboarding_completed) return true;
  return Boolean(profile.age && profile.state && profile.occupation);
}

/**
 * Returns a list of required fields that are still missing from the profile.
 */
export function getMissingProfileFields(profile?: EligibilityProfile | null, language: string = "en"): string[] {
  const missing: string[] = [];
  const lang = (language || "en").toLowerCase().slice(0, 2);

  const labels: Record<string, Record<string, string>> = {
    age: { en: "Age", hi: "आयु", kn: "ವಯಸ್ಸು" },
    state: { en: "State", hi: "राज्य", kn: "ರಾಜ್ಯ" },
    occupation: { en: "Occupation", hi: "व्यवसाय", kn: "ಉದ್ಯೋಗ" },
  };

  if (!profile?.age) {
    missing.push(labels.age[lang] || labels.age.en);
  }
  if (!profile?.state) {
    missing.push(labels.state[lang] || labels.state.en);
  }
  if (!profile?.occupation) {
    missing.push(labels.occupation[lang] || labels.occupation.en);
  }

  return missing;
}
