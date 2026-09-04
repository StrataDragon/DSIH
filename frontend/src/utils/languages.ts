export interface LanguageOption {
  code: string;
  label: string;
  nativeLabel: string;
  bcp47: string;
  sarvamCode: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: "en", label: "English", nativeLabel: "English", bcp47: "en-IN", sarvamCode: "en-IN" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", bcp47: "hi-IN", sarvamCode: "hi-IN" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", bcp47: "kn-IN", sarvamCode: "kn-IN" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", bcp47: "te-IN", sarvamCode: "te-IN" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", bcp47: "ta-IN", sarvamCode: "ta-IN" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", bcp47: "ml-IN", sarvamCode: "ml-IN" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", bcp47: "bn-IN", sarvamCode: "bn-IN" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", bcp47: "mr-IN", sarvamCode: "mr-IN" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", bcp47: "gu-IN", sarvamCode: "gu-IN" },
];
