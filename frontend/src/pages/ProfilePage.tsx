import { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Bot, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ProfileForm } from "../components/ProfileForm";
import { SectionCard } from "../components/SectionCard";
import { GuidedProfileModal } from "../components/GuidedProfileModal";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";
import { SUPPORTED_LANGUAGES } from "../utils/languages";
import { LanguageSelect } from "../components/LanguageSelect";
import { isProfileComplete, getMissingProfileFields } from "../utils/profileUtils";

const friendlyFieldNames: Record<string, Record<string, string>> = {
  full_name: { en: "Full Name", hi: "पूरा नाम", kn: "ಪೂರ್ಣ ಹೆಸರು", te: "పూర్తి పేరు", ta: "முழு பெயர்", ml: "പൂർണ്ണമായ പേര്", bn: "পুরো নাম", mr: "पूर्ण नाव", gu: "પૂરું નામ" },
  email: { en: "Email", hi: "ईमेल", kn: "ಇಮೇಲ್", te: "ఇమెయిల్", ta: "மின்னஞ்சல்", ml: "ഇമെയിൽ", bn: "ইমেল", mr: "ईमेल", gu: "ઇમેઇલ" },
  phone_number: { en: "Phone number", hi: "फोन नंबर", kn: "ಫೋನ್ ಸಂಖ್ಯೆ", te: "ఫోన్ నంబర్", ta: "தொலைபேசி எண்", ml: "ഫോൺ നമ്പർ", bn: "ফোন নম্বর", mr: "फोन नंबर", gu: "ફોન નંબર" },
  preferred_language: { en: "Preferred language", hi: "पसंदीदा भाषा", kn: "ಆದ್ಯತೆಯ ಭಾಷೆ", te: "ప్రాధాన్య భాష", ta: "விருப்பமான மொழி", ml: "തിരഞ്ഞെടുത്ത ഭാഷ", bn: "পছন্দের ভাষা", mr: "पसंतीची भाषा", gu: "પસંદગીની ભાષા" },
  accessibility_preference: { en: "Accessibility preference", hi: "सुगमता विकल्प", kn: "ಪ್ರವೇಶಿಸುವಿಕೆ ಆಯ್ಕೆ", te: "సదుపాయాల ఎంపిక", ta: "அணுகல்தன்மை விருப்பம்", ml: "പ്രവേശനക്ഷമതാ മുൻഗണന", bn: "অভিগম্যতা পছন্দ", mr: "सुगमता पर्याय", gu: "સુલભતા પસંદગી" },
  consent_given: { en: "Consent status", hi: "सहमति स्थिति", kn: "ಸಮ್ಮತಿ ಸ್ಥಿತಿ", te: "సమ్మతి స్థితి", ta: "ஒப்புதல் நிலை", ml: "സമ്മത നില", bn: "সম্মতি অবস্থা", mr: "संमती स्थिती", gu: "સંમતિ સ્થિતિ" },
  age: { en: "Age", hi: "आयु", kn: "ವಯಸ್ಸು", te: "వయస్సు", ta: "வயது", ml: "പ്രായം", bn: "বয়স", mr: "वय", gu: "ઉંમર" },
  gender: { en: "Gender", hi: "लिंग", kn: "ಲಿಂಗ", te: "లింగం", ta: "பாலினம்", ml: "ലിംഗഭേദം", bn: "লিঙ্গ", mr: "लिंग", gu: "જાતિ" },
  state: { en: "State", hi: "राज्य", kn: "ರಾಜ್ಯ", te: "రాష్ట్రం", ta: "மாநிலம்", ml: "സംസ്ഥാനം", bn: "রাজ্য", mr: "राज्य", gu: "રાજ્ય" },
  occupation: { en: "Occupation", hi: "व्यवसाय", kn: "ಉದ್ಯೋಗ", te: "వృత్తి", ta: "தொழில்", ml: "തൊഴിൽ", bn: "পেশা", mr: "व्यवसाय", gu: "વ્યવસાય" },
  income: { en: "Income range", hi: "आय सीमा", kn: "ಆದಾಯ ಪ್ರಮಾಣ", te: "ఆదాయ పరిధి", ta: "வருமான வரம்பு", ml: "വരുമാന പരിധി", bn: "আয় সীমা", mr: "उत्पन्न श्रेणी", gu: "આવક મર્યાદા" },
  landholding: { en: "Landholding", hi: "भूमि", kn: "ಜಮೀನು", te: "భూమి", ta: "நில அளவு", ml: "ഭൂമി", bn: "জমি", mr: "जमीन", gu: "જમીન" },
  disability: { en: "Disability support need", hi: "दिव्यांगता सहायता", kn: "ಅಂಗವಿಕಲರ ನೆರವು", te: "దివ్యాంగ సహాయం", ta: "மாற்றுத்திறன் உதவி", ml: "ഭിന്നശേഷി സഹായം", bn: "প্রতিবন্ধী সহায়তা", mr: "दिव्यांग सहाय्य", gu: "દિવ્યાંગ સહાય" },
  family_members: { en: "Family members", hi: "परिवार सदस्य", kn: "ಕುಟುಂಬ ಸದಸ್ಯರು", te: "కుటుంబ సభ్యులు", ta: "குடும்ப உறுப்பினர்கள்", ml: "കുടുംബാംഗങ്ങൾ", bn: "পরিবারের সদস্য", mr: "कुटुंब सदस्य", gu: "પરિવારના સભ્યો" },
  available_documents: { en: "Available document names", hi: "उपलब्ध दस्तावेज़", kn: "ಲಭ್ಯವಿರುವ ದಾಖಲೆಗಳು", te: "అందుబాటులో ఉన్న పత్రాలు", ta: "உள்ள ஆவணங்கள்", ml: "ലഭ്യമായ രേഖകൾ", bn: "উপলব্ধ নথিপত্র", mr: "उपलब्ध कागदपत्रे", gu: "ઉપલબ્ધ દસ્તાવેજો" },
  recently_viewed_schemes: { en: "Recently viewed schemes", hi: "हाल ही में देखी गई योजनाएँ", kn: "ಇತ್ತೀಚೆಗೆ ನೋಡಿದ ಯೋಜನೆಗಳು", te: "ఇటీవల చూసిన పథకాలు", ta: "சமீபத்தில் பார்த்த திட்டங்கள்", ml: "അടുത്തിടെ കണ്ട പദ്ധതികൾ", bn: "সম্প্রতি দেখা প্রকল্প", mr: "नुकत्याच पाहिलेल्या योजना", gu: "તાજેતરમાં જોયેલી યોજનાઓ" },
  digital_literacy: { en: "Guidance preference", hi: "मार्गदर्शन विकल्प", kn: "ಮಾರ್ಗದರ್ಶನ ಆದ್ಯತೆ", te: "మార్గదర్శక ప్రాధాన్యత", ta: "வழிகாட்டுதல் விருப்பம்", ml: "മാർഗ്ഗനിർദ്ദേശ മുൻഗണന", bn: "নির্দেশিকা পছন্দ", mr: "मार्गदर्शन पर्याय", gu: "માર્ગદર્શન પસંદગી" },
};

const neverStoredItems: Record<string, string[]> = {
  en: ["Full Aadhaar number", "Full PAN number", "Biometric data", "Raw identity documents"],
  hi: ["पूरा आधार नंबर", "पूरा पैन नंबर", "बायोमेट्रिक डेटा", "मूल पहचान पत्र की तस्वीर"],
  kn: ["ಪೂರ್ಣ ಆಧಾರ್ ಸಂಖ್ಯೆ", "ಪೂರ್ಣ ಪ್ಯಾನ್ ಸಂಖ್ಯೆ", "ಬಯೋಮೆಟ್ರಿಕ್ ಡೇಟಾ", "ಮೂಲ ಗುರುತಿನ ಚೀಟಿಯ ಚಿತ್ರ"],
  te: ["పూర్తి ఆధార్ నంబర్", "పూర్తి పాన్ నంబర్", "బయోమెట్రిక్ వివరాలు", "గుర్తింపు కార్డు చిత్రాలు"],
  ta: ["முழு ஆதார் எண்", "முழு பான் எண்", "பயோமெட்ரிக் தரவு", "அடையாள அட்டை படங்கள்"],
  ml: ["പൂർണ്ണ ആധാർ നമ്പർ", "പൂർണ്ണ പാൻ നമ്പർ", "ബയോമെട്രിക് ഡാറ്റ", "തിരിച്ചറിയൽ രേഖകൾ"],
  bn: ["সম্পূর্ণ আধার নম্বর", "সম্পূর্ণ প্যান নম্বর", "বায়োমেট্রিক তথ্য", "আসল নথির ছবি"],
  mr: ["पूर्ण आधार क्रमांक", "पूर्ण पॅन क्रमांक", "बायोमेट्रिक डेटा", "मूळ ओळखपत्राची प्रत"],
  gu: ["સંપૂર્ણ આધાર નંબર", "સંપૂર્ણ પાન નંબર", "બાયોમેટ્રિક ડેટા", "મૂળ ઓળખપત્રનો ફોટો"],
};

export function ProfilePage() {
  const { profile, setProfile, language, setLanguage, refreshSession } = useAppContext();
  const [storedSummary, setStoredSummary] = useState<any | null>(null);
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");
  const [guidedOpen, setGuidedOpen] = useState(false);

  useEffect(() => {
    api.get("/api/profile").then((res) => setStoredSummary(res.data.stored_data_summary)).catch(() => undefined);
  }, []);

  const langKey = language.toLowerCase().trim();

  const fieldsStored = (storedSummary?.fields_stored || []).map((field: string) => friendlyFieldNames[field]?.[langKey] || friendlyFieldNames[field]?.en || field);
  const neverStored = neverStoredItems[langKey] || neverStoredItems.en;

  const profileIsComplete = isProfileComplete(profile);
  const missingFields = getMissingProfileFields(profile, language);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <GuidedProfileModal isOpen={guidedOpen} onClose={() => setGuidedOpen(false)} />
      <SectionCard title={t(language, "profilePrivacy")}>
        {!profileIsComplete && (
          <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-base">
              <AlertCircle size={20} className="text-amber-600 flex-shrink-0" />
              {language === "hi"
                ? "अनिवार्य प्रोफ़ाइल पूर्णता"
                : language === "kn"
                ? "ಕಡ್ಡಾಯ ಪ್ರೊಫೈಲ್ ಪೂರ್ಣಗೊಳಿಸುವಿಕೆ"
                : "Mandatory Profile Completion"}
            </div>
            <p className="mt-1 text-sm text-amber-900">
              {language === "hi"
                ? "सरकारी योजनाओं, पात्रता जांच और डैशबोर्ड को अनलॉक करने के लिए कृपया अपनी प्रोफ़ाइल पूरी करें।"
                : language === "kn"
                ? "ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು, ಅರ್ಹತಾ ತಪಾಸಣೆ ಮತ್ತು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಅನ್ನು ಅನ್‌ಲಾಕ್ ಮಾಡಲು ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪೂರ್ಣಗೊಳಿಸಿ."
                : "Please complete your required profile information below to unlock scheme discovery, eligibility evaluations, and the full platform."}
            </p>
            {missingFields.length > 0 && (
              <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-amber-800">
                {language === "hi" ? "अपेक्षित विवरण" : language === "kn" ? "ಅಗತ್ಯವಿರುವ ವಿವರಗಳು" : "Missing required fields"}:{" "}
                <span className="font-bold underline text-amber-950">{missingFields.join(", ")}</span>
              </div>
            )}
            <div className="mt-3.5">
              <button
                type="button"
                onClick={() => setGuidedOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
              >
                <Bot size={16} />
                {language === "hi"
                  ? "मार्गदर्शक के साथ पूरा करें (Guide Me)"
                  : language === "kn"
                  ? "ಮಾರ್ಗದರ್ಶಿಯೊಂದಿಗೆ ಪೂರ್ಣಗೊಳಿಸಿ (Guide Me)"
                  : "Guide Me Through Missing Fields"}
              </button>
            </div>
          </div>
        )}

        <div data-tour="profile-header" className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <div className="text-lg font-semibold text-sahaya-green">{t(language, "tellOnlyNeeded")}</div>
          <p className="mt-1 text-sm text-slate-700">{t(language, "profileHelp")}</p>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold" htmlFor="profile-language">{t(language, "language")}</label>
          <LanguageSelect id="profile-language" dataTour="profile-language-select" value={language} onChange={setLanguage} />
        </div>

        {saveError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={18} className="text-emerald-600" />
              {message}
            </div>
            {profileIsComplete && (
              <div className="mt-3">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 rounded-xl bg-sahaya-green px-4 py-2 font-semibold text-white text-xs hover:bg-emerald-800 transition"
                >
                  {t(language, "dashboard")} <ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        )}

        <ProfileForm
          initialValue={profile}
          submitLabel={t(language, "saveProfile")}
          onSubmit={async (nextProfile) => {
            setSaveError("");
            setMessage("");
            try {
              const res = await api.put("/api/profile", {
                ...nextProfile,
                preferred_language: language,
                consent_given: true,
              });
              const updated = {
                ...nextProfile,
                full_name: res.data.full_name || nextProfile.full_name,
                onboarding_completed: res.data.onboarding_completed,
              };
              setProfile(updated);
              await refreshSession();
              if (isProfileComplete(updated)) {
                setMessage(
                  language === "hi"
                    ? "प्रोफ़ाइल सफलतापूर्वक सहेजी गई! अब आपका खाता पूरी तरह सक्रिय है।"
                    : language === "kn"
                    ? "ಪ್ರೊಫೈಲ್ ಯಶಸ್ವಿಯಾಗಿ ಉಳಿಸಲಾಗಿದೆ! ಈಗ ನಿಮ್ಮ ಖಾತೆ ಸಂಪೂರ್ಣವಾಗಿ ಸಕ್ರಿಯವಾಗಿದೆ."
                    : "Profile completed successfully! You now have full access to all features."
                );
              } else {
                setMessage(t(language, "profileSaved"));
              }
            } catch (err: any) {
              setSaveError(err?.response?.data?.detail || "Failed to save profile. Please check your inputs.");
            }
          }}
        />
      </SectionCard>

      <SectionCard title={t(language, "storedDataControls")}>
        <p className="text-sm leading-6 text-slate-600">{t(language, "minimumData")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-2xl border border-slate-200 p-4">
            <h3 className="font-semibold">{t(language, "whatMayBeStored")}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {fieldsStored.map((field: string) => (
                <span key={field} className="rounded-full bg-stone-100 px-3 py-2 text-xs font-medium text-slate-700">
                  {field}
                </span>
              ))}
            </div>
          </div>
          <div data-tour="profile-never-stored" className="rounded-2xl border border-red-100 bg-red-50 p-4">
            <h3 className="font-semibold text-red-900">{t(language, "whatNeverStored")}</h3>
            <ul className="mt-3 space-y-2 text-sm text-red-950">
              {neverStored.map((item: string) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-slate-700">
            {storedSummary?.sensitive_data_policy ||
              (language === "hi"
                ? "दस्तावेज़ केवल प्रक्रिया के दौरान उपयोग होते हैं, केवल मास्क्ड फ़ील्ड सहेजे जाते हैं।"
                : language === "kn"
                ? "ದಾಖಲೆಗಳನ್ನು ಸಂಸ್ಕರಣೆಯ ಸಮಯದಲ್ಲಿ ಮಾತ್ರ ಬಳಸಲಾಗುತ್ತದೆ, ಮಾಸ್ಕ್ ಮಾಡಿದ ಮಾಹಿತಿ ಮಾತ್ರ ಉಳಿಯುತ್ತದೆ."
                : "Documents are processed in memory whenever possible and only masked extracted metadata is retained.")}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-red-200 p-4">
          <h3 className="font-semibold text-red-900">{t(language, "deletePersonalData")}</h3>
          <p className="mt-1 text-sm text-slate-600">{t(language, "typeDeleteHelp")}</p>
          <input className="mt-3 min-h-12 w-full rounded-xl border p-3" placeholder="Type DELETE" value={confirmDelete} onChange={(e) => setConfirmDelete(e.target.value)} />
          <button
            onClick={async () => {
              await api.delete("/api/profile");
              setProfile({ available_documents: [] });
              setMessage(t(language, "allDataDeleted"));
            }}
            disabled={confirmDelete !== "DELETE"}
            className="mt-3 min-h-12 rounded-xl bg-red-700 px-4 font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {language === "hi" ? "मेरा पूरा डेटा हटाएं" : language === "kn" ? "ನನ್ನ ಎಲ್ಲಾ ಡೇಟಾ ಅಳಿಸಿ" : "Delete All My Data"}
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-sahaya-green">{message}</p>}
      </SectionCard>
    </div>
  );
}
