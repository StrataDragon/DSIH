import type { EligibilityProfile } from "../types";

/**
 * Checks if a profile has satisfied the mandatory onboarding criteria.
 * Aligns with backend profile_service.py:
 * bool(user.full_name and profile.age and profile.state and profile.occupation).
 */
export function isProfileComplete(profile?: EligibilityProfile | null): boolean {
  if (!profile) return false;
  const hasName = Boolean(profile.full_name && profile.full_name.trim());
  const hasAge = Boolean(profile.age);
  const hasState = Boolean(profile.state && profile.state.trim());
  const hasOccupation = Boolean(profile.occupation && profile.occupation.trim());

  return Boolean(hasName && hasAge && hasState && hasOccupation);
}

/**
 * Returns a list of required fields that are still missing from the profile.
 */
export function getMissingProfileFields(profile?: EligibilityProfile | null, language: string = "en"): string[] {
  const missing: string[] = [];
  const lang = (language || "en").toLowerCase().slice(0, 2);

  const labels: Record<string, Record<string, string>> = {
    full_name: {
      en: "Full Name",
      hi: "पूरा नाम",
      kn: "ಪೂರ್ಣ ಹೆಸರು",
      te: "పూర్తి పేరు",
      ta: "முழு பெயர்",
      ml: "പൂർണ്ണമായ പേര്",
      bn: "পুরো নাম",
      mr: "पूर्ण नाव",
      gu: "પૂરું નામ",
    },
    age: {
      en: "Age",
      hi: "आयु",
      kn: "ವಯಸ್ಸು",
      te: "వయస్సు",
      ta: "வயது",
      ml: "പ്രായം",
      bn: "বয়স",
      mr: "वय",
      gu: "ઉંમર",
    },
    state: {
      en: "State",
      hi: "राज्य",
      kn: "ರಾಜ್ಯ",
      te: "రాష్ట్రం",
      ta: "மாநிலம்",
      ml: "സംസ്ഥാനം",
      bn: "রাজ্য",
      mr: "राज्य",
      gu: "રાજ્ય",
    },
    occupation: {
      en: "Occupation",
      hi: "व्यवसाय",
      kn: "ಉದ್ಯೋಗ",
      te: "వృత్తి",
      ta: "தொழில்",
      ml: "തൊഴിൽ",
      bn: "পেশা",
      mr: "व्यवसाय",
      gu: "વ્યવસાય",
    },
  };

  if (!profile?.full_name || !profile.full_name.trim()) {
    missing.push(labels.full_name[lang] || labels.full_name.en);
  }
  if (!profile?.age) {
    missing.push(labels.age[lang] || labels.age.en);
  }
  if (!profile?.state || !profile.state.trim()) {
    missing.push(labels.state[lang] || labels.state.en);
  }
  if (!profile?.occupation || !profile.occupation.trim()) {
    missing.push(labels.occupation[lang] || labels.occupation.en);
  }

  return missing;
}

export type MandatoryFieldKey = "full_name" | "age" | "state" | "occupation";

/**
 * Returns an ordered list of raw keys for the missing mandatory fields.
 */
export function getMissingMandatoryFieldKeys(profile?: EligibilityProfile | null): MandatoryFieldKey[] {
  const missingKeys: MandatoryFieldKey[] = [];
  if (!profile?.full_name || !profile.full_name.trim()) {
    missingKeys.push("full_name");
  }
  if (!profile?.age) {
    missingKeys.push("age");
  }
  if (!profile?.state || !profile.state.trim()) {
    missingKeys.push("state");
  }
  if (!profile?.occupation || !profile.occupation.trim()) {
    missingKeys.push("occupation");
  }
  return missingKeys;
}
