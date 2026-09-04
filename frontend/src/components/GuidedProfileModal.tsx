import { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  Bot,
  User,
  Calendar,
  MapPin,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  X,
  Loader2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { ALL_INDIAN_STATES_AND_UTS } from "../data/indianStates";
import {
  isProfileComplete,
  getMissingMandatoryFieldKeys,
  type MandatoryFieldKey,
} from "../utils/profileUtils";
import type { EligibilityProfile } from "../types";

type GuidedProfileModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onStartTour?: () => void;
};

const COMMON_OCCUPATIONS = [
  "Farmer",
  "Agricultural Labourer",
  "Construction Worker",
  "Small Business Owner / Vendor",
  "Artisan / Weaver",
  "Student",
  "Healthcare Worker",
  "Driver",
  "Homemaker",
  "Unemployed / Jobseeker",
];

export function GuidedProfileModal({ isOpen, onClose, onStartTour }: GuidedProfileModalProps) {
  const { user, profile, setProfile, language, refreshSession } = useAppContext();
  const navigate = useNavigate();

  // Working state for the fields being edited
  const [formData, setFormData] = useState<{
    full_name: string;
    age: number | "";
    state: string;
    occupation: string;
  }>({
    full_name: "",
    age: "",
    state: "",
    occupation: "",
  });

  // Track the fields that need answering in this session
  const [activeSteps, setActiveSteps] = useState<MandatoryFieldKey[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepError, setStepError] = useState("");
  const [apiError, setApiError] = useState("");
  const [saving, setSaving] = useState(false);
  const [completedCelebration, setCompletedCelebration] = useState(false);

  // Initialize or re-sync when modal opens or profile changes
  useEffect(() => {
    if (isOpen) {
      const currentName = profile?.full_name || user?.full_name || "";
      const currentAge = profile?.age ?? "";
      const currentState = profile?.state || "";
      const currentOccupation = profile?.occupation || "";

      setFormData({
        full_name: currentName,
        age: currentAge,
        state: currentState,
        occupation: currentOccupation,
      });

      const missing = getMissingMandatoryFieldKeys(profile);
      if (missing.length === 0) {
        // Profile is already complete
        setActiveSteps([]);
        setCompletedCelebration(true);
      } else {
        setActiveSteps(missing);
        setCurrentStepIndex(0);
        setCompletedCelebration(false);
      }
      setStepError("");
      setApiError("");
    }
  }, [isOpen, profile, user?.full_name]);

  if (!isOpen) return null;

  const currentFieldKey = activeSteps[currentStepIndex];

  // Multilingual labels and prompts
  const getFieldTitle = (key: MandatoryFieldKey): string => {
    switch (key) {
      case "full_name":
        if (language === "hi") return "आपका पूरा नाम क्या है?";
        if (language === "kn") return "ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರು ಏನು?";
        if (language === "te") return "మీ పూర్తి పేరు ఏమిటి?";
        if (language === "ta") return "உங்கள் முழு பெயர் என்ன?";
        if (language === "ml") return "നിങ്ങളുടെ പൂർണ്ണമായ പേര് എന്താണ്?";
        if (language === "bn") return "আপনার পুরো নাম কি?";
        if (language === "mr") return "आपले पूर्ण नाव काय आहे?";
        if (language === "gu") return "તમારું પૂરું નામ શું છે?";
        return "What is your full name?";
      case "age":
        if (language === "hi") return "आपकी वर्तमान आयु कितनी है?";
        if (language === "kn") return "ನಿಮ್ಮ ಪ್ರಸ್ತುತ ವಯಸ್ಸು ಎಷ್ಟು?";
        if (language === "te") return "మీ ప్రస్తుత వయస్సు ఎంత?";
        if (language === "ta") return "உங்கள் தற்போதைய வயது என்ன?";
        if (language === "ml") return "നിങ്ങളുടെ ഇപ്പോഴത്തെ പ്രായം എത്രയാണ്?";
        if (language === "bn") return "আপনার বর্তমান বয়স কত?";
        if (language === "mr") return "आपले सध्याचे वय किती आहे?";
        if (language === "gu") return "તમારી હાલની ઉંમર કેટલી છે?";
        return "What is your current age?";
      case "state":
        if (language === "hi") return "आप किस राज्य या केंद्र शासित प्रदेश में रहते हैं?";
        if (language === "kn") return "ನೀವು ಯಾವ ರಾಜ್ಯ ಅಥವಾ ಕೇಂದ್ರಾಡಳಿತ ಪ್ರದೇಶದಲ್ಲಿ ವಾಸಿಸುತ್ತಿದ್ದೀರಿ?";
        if (language === "te") return "మీరు ఏ రాష్ట్రం లేదా కేంద్రపాలిత ప్రాంతంలో నివసిస్తున్నారు?";
        if (language === "ta") return "நீங்கள் எந்த மாநிலம் அல்லது யூனியன் பிரதேசத்தில் வசிக்கிறீர்கள்?";
        if (language === "ml") return "നിങ്ങൾ ഏത് സംസ്ഥാനത്താണ് അല്ലെങ്കിൽ കേന്ദ്രഭരണ പ്രദേശത്താണ് താമസിക്കുന്നത്?";
        if (language === "bn") return "আপনি কোন রাজ্য বা কেন্দ্রশাসিত অঞ্চলে বাস করেন?";
        if (language === "mr") return "आपण कोणत्या राज्यात किंवा केंद्रशासित प्रदेशात राहता?";
        if (language === "gu") return "તમે કયા રાજ્ય અથવા કેન્દ્રશાસિત પ્રદેશમાં રહો છો?";
        return "Which state or union territory do you reside in?";
      case "occupation":
        if (language === "hi") return "आपका मुख्य व्यवसाय क्या है?";
        if (language === "kn") return "ನಿಮ್ಮ ಮುಖ್ಯ ಉದ್ಯೋಗ ಏನು?";
        if (language === "te") return "మీ ప్రధాన వృత్తి ఏమిటి?";
        if (language === "ta") return "உங்கள் முக்கிய தொழில் என்ன?";
        if (language === "ml") return "നിങ്ങളുടെ പ്രധാന തൊഴിൽ എന്താണ്?";
        if (language === "bn") return "আপনার প্রধান পেশা কি?";
        if (language === "mr") return "आपला मुख्य व्यवसाय काय आहे?";
        if (language === "gu") return "તમારો મુખ્ય વ્યવસાય શું છે?";
        return "What is your primary occupation?";
    }
  };

  const getFieldDescription = (key: MandatoryFieldKey): string => {
    switch (key) {
      case "full_name":
        if (language === "hi") return "यह नाम आपके कल्याणकारी आवेदनों और नागरिक प्रोफ़ाइल पर प्रदर्शित होगा।";
        if (language === "kn") return "ಈ ಹೆಸರು ನಿಮ್ಮ ಕಲ್ಯಾಣ ಅರ್ಜಿಗಳು ಮತ್ತು ನಾಗರಿಕ ಪ್ರೊಫೈಲ್‌ನಲ್ಲಿ ಪ್ರದರ್ಶನಗೊಳ್ಳುತ್ತದೆ.";
        return "This will appear on your welfare eligibility records and application receipts.";
      case "age":
        if (language === "hi") return "अधिकांश सरकारी योजनाओं में आयु के विशिष्ट मानदंड होते हैं (जैसे युवा, वरिष्ठ नागरिक आदि)।";
        if (language === "kn") return "ಹೆಚ್ಚಿನ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು ವಯಸ್ಸಿನ ಮಾನದಂಡಗಳನ್ನು ಹೊಂದಿರುತ್ತವೆ (ಉದಾ: ಯುವಕರು, ಹಿರಿಯ ನಾಗರಿಕರು).";
        return "Many schemes are age-specific (such as youth scholarships, elderly pensions, maternity benefits).";
      case "state":
        if (language === "hi") return "कल्याणकारी योजनाएं केंद्र और आपके राज्य सरकार के नियमों के आधार पर फ़िल्टर की जाती हैं।";
        if (language === "kn") return "ಕಲ್ಯಾಣ ಯೋಜನೆಗಳು ಕೇಂದ್ರ ಮತ್ತು ನಿಮ್ಮ ರಾಜ್ಯ ಸರ್ಕಾರದ ನಿಯಮಗಳ ಆಧಾರದ ಮೇಲೆ ಫಿಲ್ಟರ್ ಆಗುತ್ತವೆ.";
        return "Welfare schemes vary by state. This ensures you see local state government benefits.";
      case "occupation":
        if (language === "hi") return "व्यवसाय से किसानों, कारीगरों, छात्रों और श्रमिकों के लिए लक्षित लाभ अनलॉक होते हैं।";
        if (language === "kn") return "ಉದ್ಯೋಗವು ರೈತರು, ಕುಶಲಕರ್ಮಿಗಳು ಮತ್ತು ಕಾರ್ಮಿಕರಿಗೆ ವಿಶೇಷ ಪ್ರಯೋಜನಗಳನ್ನು ಅನ್‌ಲಾಕ್ ಮಾಡುತ್ತದೆ.";
        return "Occupations unlock sector-specific subsidies, worker protections, and farming schemes.";
    }
  };

  // Validate the active step
  const validateCurrentStep = (): boolean => {
    setStepError("");
    if (!currentFieldKey) return true;

    if (currentFieldKey === "full_name") {
      if (!formData.full_name || !formData.full_name.trim()) {
        setStepError(
          language === "hi"
            ? "कृपया अपना पूरा नाम दर्ज करें।"
            : language === "kn"
            ? "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ."
            : "Please enter your full name."
        );
        return false;
      }
    } else if (currentFieldKey === "age") {
      const numAge = Number(formData.age);
      if (!formData.age || isNaN(numAge) || numAge <= 0 || numAge > 125) {
        setStepError(
          language === "hi"
            ? "कृपया 1 से 120 के बीच वैध आयु दर्ज करें।"
            : language === "kn"
            ? "ದಯವಿಟ್ಟು 1 ರಿಂದ 120 ರ ನಡುವೆ ಮಾನ್ಯವಾದ ವಯಸ್ಸನ್ನು ನಮೂದಿಸಿ."
            : "Please enter a valid age between 1 and 120."
        );
        return false;
      }
    } else if (currentFieldKey === "state") {
      if (!formData.state || !formData.state.trim()) {
        setStepError(
          language === "hi"
            ? "कृपया अपना राज्य चुनें।"
            : language === "kn"
            ? "ದಯವಿಟ್ಟು ನಿಮ್ಮ ರಾಜ್ಯವನ್ನು ಆಯ್ಕೆಮಾಡಿ."
            : "Please select your state."
        );
        return false;
      }
    } else if (currentFieldKey === "occupation") {
      if (!formData.occupation || !formData.occupation.trim()) {
        setStepError(
          language === "hi"
            ? "कृपया अपना व्यवसाय दर्ज करें या नीचे से चुनें।"
            : language === "kn"
            ? "ದಯವಿಟ್ಟು ನಿಮ್ಮ ಉದ್ಯೋಗವನ್ನು ನಮೂದಿಸಿ ಅಥವಾ ಕೆಳಗೆ ಆಯ್ಕೆಮಾಡಿ."
            : "Please enter or select your occupation."
        );
        return false;
      }
    }

    return true;
  };

  // Save current step data to existing profile API
  const saveAndProceed = async () => {
    if (!validateCurrentStep()) return;

    setSaving(true);
    setApiError("");

    try {
      // Build updated profile payload reusing existing profile state
      const nextProfile: EligibilityProfile = {
        ...profile,
        full_name: formData.full_name.trim() || undefined,
        age: formData.age !== "" ? Number(formData.age) : undefined,
        state: formData.state.trim() || undefined,
        occupation: formData.occupation.trim() || undefined,
        preferred_language: language,
        consent_given: true,
      };

      const res = await api.put("/api/profile", nextProfile);

      const updatedProfile: EligibilityProfile = {
        ...nextProfile,
        full_name: res.data.full_name || nextProfile.full_name,
        onboarding_completed: res.data.onboarding_completed,
      };

      // Immediately update unified AppContext profile state
      setProfile(updatedProfile);
      await refreshSession();

      // Check if there are further steps in this wizard
      if (currentStepIndex < activeSteps.length - 1) {
        setCurrentStepIndex((prev) => prev + 1);
        setStepError("");
      } else {
        // Last step completed! Re-evaluate profile completion
        if (isProfileComplete(updatedProfile)) {
          setCompletedCelebration(true);
        } else {
          // Double check if any other field is missing
          const stillMissing = getMissingMandatoryFieldKeys(updatedProfile);
          if (stillMissing.length === 0) {
            setCompletedCelebration(true);
          } else {
            setActiveSteps(stillMissing);
            setCurrentStepIndex(0);
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to save profile step via API", err);
      setApiError(
        language === "hi"
          ? "विवरण सहेजने में विफल। कृपया अपना इंटरनेट कनेक्शन जांचें और पुनः प्रयास करें।"
          : language === "kn"
          ? "ವಿವರಗಳನ್ನು ಉಳಿಸಲು ವಿಫಲವಾಗಿದೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಸಂಪರ್ಕವನ್ನು ಪರಿಶೀಲಿಸಿ ಮತ್ತು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ."
          : "Could not save your information. Please check your network and click retry."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    setStepError("");
    setApiError("");
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleStartTour = () => {
    onClose();
    if (onStartTour) {
      onStartTour();
    }
  };

  const handleGoToDashboard = () => {
    onClose();
    navigate("/dashboard");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-profile-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl border border-slate-200"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-6 py-5 text-white relative">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-2 text-white/80 hover:bg-white/20 hover:text-white transition"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/15 p-2.5 backdrop-blur-sm border border-white/20">
              <Bot size={28} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="guided-profile-title" className="text-xl font-bold tracking-tight">
                  {language === "hi"
                    ? "सहाय प्रोफ़ाइल मार्गदर्शक"
                    : language === "kn"
                    ? "ಸಹಾಯ ಪ್ರೊಫೈಲ್ ಮಾರ್ಗದರ್ಶಿ"
                    : "Sahaya Profile Guide"}
                </h2>
                <span className="rounded-full bg-blue-500/50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white border border-white/30">
                  {language === "hi" ? "अनिवार्य" : language === "kn" ? "ಕಡ್ಡಾಯ" : "Required"}
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                {language === "hi"
                  ? "सभी योजनाओं और सुविधाओं को अनलॉक करने के लिए आवश्यक विवरण"
                  : language === "kn"
                  ? "ಎಲ್ಲಾ ಯೋಜನೆಗಳು ಮತ್ತು ವೈಶಿಷ್ಟ್ಯಗಳನ್ನು ಅನ್‌ಲಾಕ್ ಮಾಡಲು ಅಗತ್ಯ ವಿವರಗಳು"
                  : "Complete required details to unlock full welfare access and dashboard"}
              </p>
            </div>
          </div>

          {/* Progress Bar (Only when steps exist and not celebration) */}
          {!completedCelebration && activeSteps.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-medium text-blue-100 mb-1.5">
                <span>
                  {language === "hi"
                    ? `चरण ${currentStepIndex + 1} / ${activeSteps.length}`
                    : language === "kn"
                    ? `ಹಂತ ${currentStepIndex + 1} / ${activeSteps.length}`
                    : `Step ${currentStepIndex + 1} of ${activeSteps.length}`}
                </span>
                <span className="capitalize font-semibold text-white">
                  {currentFieldKey === "full_name"
                    ? (language === "hi" ? "पूरा नाम" : language === "kn" ? "ಪೂರ್ಣ ಹೆಸರು" : "Full Name")
                    : currentFieldKey === "age"
                    ? (language === "hi" ? "आयु" : language === "kn" ? "ವಯಸ್ಸು" : "Age")
                    : currentFieldKey === "state"
                    ? (language === "hi" ? "राज्य" : language === "kn" ? "ರಾಜ್ಯ" : "State")
                    : (language === "hi" ? "व्यवसाय" : language === "kn" ? "ಉದ್ಯೋಗ" : "Occupation")}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-blue-950/30">
                <div
                  className="h-full bg-white transition-all duration-300 rounded-full"
                  style={{
                    width: `${((currentStepIndex + 1) / activeSteps.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Body Content */}
        <div className="p-6">
          {completedCelebration ? (
            /* Celebration Screen */
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">
                {language === "hi"
                  ? "प्रोफ़ाइल सफलतापूर्वक पूरी हुई!"
                  : language === "kn"
                  ? "ಪ್ರೊಫೈಲ್ ಯಶಸ್ವಿಯಾಗಿ ಪೂರ್ಣಗೊಂಡಿದೆ!"
                  : "Profile Successfully Completed!"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                {language === "hi"
                  ? "आपका नाम, आयु, राज्य और व्यवसाय सुरक्षित रूप से सहेज लिए गए हैं। अब टेक सहाय की सभी सरकारी योजनाएं, पात्रता जांच और डैशबोर्ड आपके लिए खुले हैं।"
                  : language === "kn"
                  ? "ನಿಮ್ಮ ಹೆಸರು, ವಯಸ್ಸು, ರಾಜ್ಯ ಮತ್ತು ಉದ್ಯೋಗ ವಿವರಗಳನ್ನು ಉಳಿಸಲಾಗಿದೆ. ಈಗ ಎಲ್ಲಾ ಸರ್ಕಾರಿ ಯೋಜನೆಗಳು ಮತ್ತು ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಲಭ್ಯವಿದೆ."
                  : "Your name, age, state, and occupation are saved. Full platform features, scheme recommendations, and eligibility checks are now completely unlocked."}
              </p>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleStartTour}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-blue-700 transition"
                >
                  <Sparkles size={18} />
                  {language === "hi"
                    ? "गाइडेड टूर शुरू करें"
                    : language === "kn"
                    ? "ಮಾರ್ಗದರ್ಶಿ ಪ್ರವಾಸ ಪ್ರಾರಂಭಿಸಿ"
                    : "Start Guided Tour"}
                </button>
                <button
                  type="button"
                  onClick={handleGoToDashboard}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  {language === "hi" ? "डैशबोर्ड पर जाएं" : language === "kn" ? "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ಗೆ ಹೋಗಿ" : "Go to Dashboard"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ) : (
            /* Question Sequence */
            <div>
              {/* Question header */}
              <div className="mb-5">
                <div className="flex items-center gap-2 text-blue-600 text-xs font-bold uppercase tracking-wider mb-1">
                  {currentFieldKey === "full_name" && <User size={16} />}
                  {currentFieldKey === "age" && <Calendar size={16} />}
                  {currentFieldKey === "state" && <MapPin size={16} />}
                  {currentFieldKey === "occupation" && <Briefcase size={16} />}
                  <span>
                    {currentFieldKey === "full_name"
                      ? (language === "hi" ? "पहचान" : language === "kn" ? "ಗುರುತು" : "Identity")
                      : currentFieldKey === "age"
                      ? (language === "hi" ? "उम्र" : language === "kn" ? "ವಯಸ್ಸು" : "Age Eligibility")
                      : currentFieldKey === "state"
                      ? (language === "hi" ? "स्थान" : language === "kn" ? "ಸ್ಥಳ" : "Location")
                      : (language === "hi" ? "आजीविका" : language === "kn" ? "ಜೀವನೋಪಾಯ" : "Livelihood")}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-slate-900">
                  {getFieldTitle(currentFieldKey)}
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  {getFieldDescription(currentFieldKey)}
                </p>
              </div>

              {/* Form Input Area */}
              <div className="space-y-4">
                {currentFieldKey === "full_name" && (
                  <div>
                    <input
                      type="text"
                      autoFocus
                      placeholder={
                        language === "hi"
                          ? "अपना पूरा नाम दर्ज करें"
                          : language === "kn"
                          ? "ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ"
                          : "Enter your full name"
                      }
                      value={formData.full_name}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, full_name: e.target.value }));
                        setStepError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveAndProceed();
                        }
                      }}
                      className="min-h-12 w-full rounded-2xl border border-slate-300 p-4 text-base text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}

                {currentFieldKey === "age" && (
                  <div>
                    <input
                      type="number"
                      autoFocus
                      min="1"
                      max="125"
                      placeholder={language === "hi" ? "उदा. 34" : language === "kn" ? "ಉದಾ. 34" : "e.g. 34"}
                      value={formData.age}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          age: val === "" ? "" : Number(val),
                        }));
                        setStepError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") {
                          e.preventDefault();
                        }
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveAndProceed();
                        }
                      }}
                      className="min-h-12 w-full rounded-2xl border border-slate-300 p-4 text-base text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                )}

                {currentFieldKey === "state" && (
                  <div>
                    <select
                      autoFocus
                      value={formData.state}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, state: e.target.value }));
                        setStepError("");
                      }}
                      className="min-h-12 w-full rounded-2xl border border-slate-300 p-4 text-base text-slate-800 bg-white shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">
                        {language === "hi"
                          ? "-- राज्य या केंद्र शासित प्रदेश चुनें --"
                          : language === "kn"
                          ? "-- ರಾಜ್ಯ ಅಥವಾ ಕೇಂದ್ರಾಡಳಿತ ಪ್ರದೇಶವನ್ನು ಆಯ್ಕೆಮಾಡಿ --"
                          : "-- Select State or Union Territory --"}
                      </option>
                      {ALL_INDIAN_STATES_AND_UTS.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {currentFieldKey === "occupation" && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      autoFocus
                      placeholder={
                        language === "hi"
                          ? "व्यवसाय लिखें (उदा. किसान, छात्र, निर्माण श्रमिक)"
                          : language === "kn"
                          ? "ಉದ್ಯೋಗ ಬರೆಯಿರಿ (ಉದಾ: ರೈತ, ವಿದ್ಯಾರ್ಥಿ, ಕಾರ್ಮಿಕ)"
                          : "Type your occupation (e.g. Farmer, Student, Artisan)"
                      }
                      value={formData.occupation}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, occupation: e.target.value }));
                        setStepError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveAndProceed();
                        }
                      }}
                      className="min-h-12 w-full rounded-2xl border border-slate-300 p-4 text-base text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />

                    {/* Quick suggestion chips */}
                    <div>
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        {language === "hi" ? "त्वरित विकल्प" : language === "kn" ? "ತ್ವರಿತ ಆಯ್ಕೆಗಳು" : "Popular Suggestions"}
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                        {COMMON_OCCUPATIONS.map((occ) => (
                          <button
                            key={occ}
                            type="button"
                            onClick={() => {
                              setFormData((prev) => ({ ...prev, occupation: occ }));
                              setStepError("");
                            }}
                            className={`rounded-xl px-3 py-1.5 text-xs font-medium border transition ${
                              formData.occupation.toLowerCase() === occ.toLowerCase()
                                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                                : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                            }`}
                          >
                            {occ}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation Error */}
                {stepError && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{stepError}</span>
                  </div>
                )}

                {/* API Error & Retry */}
                {apiError && (
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="shrink-0 text-amber-600" />
                      <span>{apiError}</span>
                    </div>
                    <button
                      type="button"
                      onClick={saveAndProceed}
                      disabled={saving}
                      className="rounded-lg bg-amber-700 px-3 py-1 text-white hover:bg-amber-800 transition font-bold shrink-0"
                    >
                      {saving ? "..." : (language === "hi" ? "पुनः प्रयास" : language === "kn" ? "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ" : "Retry")}
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-8 flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={currentStepIndex > 0 ? handleBack : onClose}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  {currentStepIndex > 0 ? (
                    <>
                      <ArrowLeft size={16} />
                      {language === "hi" ? "पीछे" : language === "kn" ? "ಹಿಂದೆ" : "Back"}
                    </>
                  ) : (
                    language === "hi" ? "रद्द करें" : language === "kn" ? "ರದ್ದುಮಾಡಿ" : "Cancel"
                  )}
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={saveAndProceed}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{language === "hi" ? "सहेजा जा रहा है..." : language === "kn" ? "ಉಳಿಸಲಾಗುತ್ತಿದೆ..." : "Saving..."}</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {currentStepIndex === activeSteps.length - 1
                          ? (language === "hi" ? "सहेजें और पूरा करें" : language === "kn" ? "ಉಳಿಸಿ ಮತ್ತು ಪೂರ್ಣಗೊಳಿಸಿ" : "Save & Complete Profile")
                          : (language === "hi" ? "सहेजें और आगे बढ़ें" : language === "kn" ? "ಉಳಿಸಿ ಮತ್ತು ಮುಂದುವರಿಯಿರಿ" : "Save & Next")}
                      </span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Guarantee */}
        <div className="bg-stone-50 px-6 py-3 text-center text-[11px] text-slate-500 border-t border-slate-200 flex items-center justify-center gap-1.5">
          <ShieldCheck size={14} className="text-emerald-600" />
          <span>
            {language === "hi"
              ? "डेटा न्यूनतमकरण नीति: कोई कच्चा पहचान दस्तावेज़ या बायोमेट्रिक्स कभी संग्रहीत नहीं किया जाता है।"
              : language === "kn"
              ? "ಡೇಟಾ ಕನಿಷ್ಠೀಕರಣ ನೀತಿ: ಯಾವುದೇ ಕಚ್ಚಾ ಗುರುತಿನ ದಾಖಲೆಗಳನ್ನು ಸಂಗ್ರಹಿಸಲಾಗುವುದಿಲ್ಲ."
              : "Minimum-data policy: Only attributes needed for welfare verification are retained under strict consent."}
          </span>
        </div>
      </motion.div>
    </div>
  );
}
