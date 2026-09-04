import { ArrowRight, CheckCircle2, ChevronRight, Languages, Mic, Play, Search, ShieldCheck, Sparkles, Square, Users, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { OnboardingChecklist, type OnboardingStep } from "../components/OnboardingChecklist";
import { SchemeCard } from "../components/SchemeCard";
import { SectionCard } from "../components/SectionCard";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";
import { SUPPORTED_LANGUAGES } from "../utils/languages";
import { hasActivePlayback, playExclusiveAudio, stopAllPlayback } from "../utils/speechUtils";
import type { Scheme } from "../types";

const getDashboardSummaryAutoplayKey = (userId?: string) =>
  `sahaya_dashboard_summary_autoplayed:${userId || "guest"}`;

export function DashboardPage() {
  const { profile, setProfile, user, notifications, language, schemes } = useAppContext();
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [gaps, setGaps] = useState<any[]>([]);
  const [eligibleSchemes, setEligibleSchemes] = useState<Scheme[]>([]);
  const [eligibleError, setEligibleError] = useState("");
  const [summaryAudio, setSummaryAudio] = useState<{ summary: string; base64: string | null; mime: string } | null>(null);
  const [summaryPlaying, setSummaryPlaying] = useState(false);
  const [summaryAutoplayBlocked, setSummaryAutoplayBlocked] = useState(false);
  const [activeUsersCount, setActiveUsersCount] = useState<number | null>(null);
  const [lifeEventModal, setLifeEventModal] = useState<string | null>(null);
  const [lifeEventData, setLifeEventData] = useState<any>({});
  const summaryAudioRef = useRef<HTMLAudioElement | null>(null);
  const summaryRequestedKeys = useRef(new Set<string>());

  const profileKey = JSON.stringify(profile);
  const eligibilityKey = `${profileKey}:${language}`;

  useEffect(() => {
    return () => {
      if (summaryAudioRef.current) {
        summaryAudioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const autoplayKey = getDashboardSummaryAutoplayKey(user?.id);

    if (summaryRequestedKeys.current.has(eligibilityKey)) return;
    summaryRequestedKeys.current.add(eligibilityKey);
    api.get("/api/recommendations").then((res) => { if (isMounted) setRecommendations(res.data); }).catch(() => { if (isMounted) setRecommendations([]); });
    api.get("/api/welfare-gaps").then((res) => { if (isMounted) setGaps(res.data); }).catch(() => { if (isMounted) setGaps([]); });
    setEligibleError("");
    setSummaryAudio(null);
    api.get("/api/eligible-schemes")
      .then((res) => {
        if (!isMounted) return;
        const schemes = res.data as Scheme[];
        setEligibleSchemes(schemes);
        if (!schemes.length) return;
        return api.post("/api/eligible-schemes/summary-audio", {
          user_name: user?.full_name || "Citizen",
          scheme_names: schemes.map((scheme) => scheme.name),
          language,
        });
      })
      .then((res) => {
        if (!isMounted || !res) return;
        const nextAudio = { summary: res.data.summary, base64: res.data.audio_base64, mime: res.data.audio_mime || "audio/wav" };
        setSummaryAudio(nextAudio);

        const hasAutoplayedBefore = localStorage.getItem(autoplayKey) === "true";
        // Guard: only autoplay if user has not heard it before, component is still mounted, AND no other audio is actively playing
        if (!hasAutoplayedBefore && nextAudio.base64 && !hasActivePlayback()) {
          const player = new Audio(`data:${nextAudio.mime};base64,${nextAudio.base64}`);
          summaryAudioRef.current = player;
          playExclusiveAudio(
            player,
            () => {
              localStorage.setItem(autoplayKey, "true"); // only mark played once it actually starts
              if (isMounted) setSummaryPlaying(true);
            },
            () => { if (isMounted) setSummaryPlaying(false); },
            () => {
              if (isMounted) {
                setSummaryPlaying(false);
                setSummaryAutoplayBlocked(true);
              }
            }
          ).catch(() => {
            if (isMounted) {
              setSummaryPlaying(false);
              setSummaryAutoplayBlocked(true);
            }
          });
        }
      })
      .catch(() => {
        if (isMounted) setEligibleError(t(language, "eligibleSchemesError"));
      });
    
    // Fetch public stats
    api.get("/api/stats").then((res) => {
      if (res.data && res.data.total_users !== undefined) {
        setActiveUsersCount(res.data.total_users);
      }
    }).catch(() => undefined);

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibilityKey, profile, language, user?.id, user?.full_name]);

  const playSummary = () => {
    if (!summaryAudio?.base64) return;
    const player = new Audio(`data:${summaryAudio.mime};base64,${summaryAudio.base64}`);
    summaryAudioRef.current = player;
    setSummaryAutoplayBlocked(false);
    playExclusiveAudio(
      player,
      () => setSummaryPlaying(true),
      () => setSummaryPlaying(false),
      () => setSummaryPlaying(false)
    ).catch(() => setSummaryPlaying(false));
  };

  const stopSummary = () => {
    stopAllPlayback();
    setSummaryPlaying(false);
  };

  const readiness = Math.min(100, (profile.available_documents?.length || 0) * 15 + (profile.age ? 20 : 0) + (profile.occupation ? 20 : 0) + (profile.state ? 20 : 0));

  const readinessFactors = [
    {
      label: language === "hi" ? "प्रोफ़ाइल विवरण" : language === "kn" ? "ಪ್ರೊಫೈಲ್ ವಿವರಗಳು" : "Profile details",
      ready: Boolean(profile.age && profile.state),
      action: language === "hi" ? "आयु और राज्य जोड़ें" : language === "kn" ? "ವಯಸ್ಸು ಮತ್ತು ರಾಜ್ಯ ಸೇರಿಸಿ" : "Add age and state",
    },
    {
      label: language === "hi" ? "व्यवसाय" : language === "kn" ? "ಉದ್ಯೋಗ" : "Occupation",
      ready: Boolean(profile.occupation),
      action: language === "hi" ? "व्यवसाय जोड़ें" : language === "kn" ? "ಉದ್ಯೋಗ ಸೇರಿಸಿ" : "Add occupation",
    },
    {
      label: language === "hi" ? "दस्तावेज़" : language === "kn" ? "ದಾಖಲೆಗಳು" : "Documents",
      ready: Boolean(profile.available_documents?.length),
      action: language === "hi" ? "दस्तावेज़ जोड़ें" : language === "kn" ? "ದಾಖಲೆ ಸೇರಿಸಿ" : "Add document names",
    },
    {
      label: language === "hi" ? "परिवार" : language === "kn" ? "ಕುಟುಂಬ" : "Family",
      ready: Boolean(profile.family_members?.length),
      action: language === "hi" ? "परिवार सदस्य जोड़ें" : language === "kn" ? "ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ" : "Add family members",
    },
  ];

  const getStepDescription = (stepId: number): string => {
    switch (stepId) {
      case 1:
        if (language === "hi") return "आयु, राज्य और व्यवसाय विवरण जोड़ें";
        if (language === "kn") return "ವಯಸ್ಸು, ರಾಜ್ಯ ಮತ್ತು ಉದ್ಯೋಗ ವಿವರಗಳನ್ನು ಸೇರಿಸಿ";
        if (language === "te") return "వయస్సు, రాష్ట్రం మరియు వృత్తి వివరాలను జోడించండి";
        if (language === "ta") return "வயது, மாநிலம் மற்றும் தொழில் விவரங்களைச் சேர்க்கவும்";
        if (language === "ml") return "പ്രായം, സംസ്ഥാനം, തൊഴിൽ വിവരങ്ങൾ ചേർക്കുക";
        if (language === "bn") return "বয়স, রাজ্য এবং পেশার বিবরণ যোগ করুন";
        if (language === "mr") return "वय, राज्य आणि व्यवसाय तपशील जोडा";
        if (language === "gu") return "ઉંમર, રાજ્ય અને વ્યવસાયની વિગતો ઉમેરો";
        return "Add age, state and occupation details";
      case 2:
        if (language === "hi") return "पहचान और आय सत्यापन दस्तावेज़ जोड़ें";
        if (language === "kn") return "ಗುರುತು ಮತ್ತು ಆದಾಯ ಪರಿಶೀಲನಾ ದಾಖಲೆಗಳನ್ನು ಸೇರಿಸಿ";
        if (language === "te") return "గుర్తింపు మరియు ఆదాయ ధృవీకరణ పత్రాలను జోడించండి";
        if (language === "ta") return "அடையாளம் மற்றும் வருமான சரிபார்ப்பு ஆவணங்களைச் சேர்க்கவும்";
        if (language === "ml") return "തിരിച്ചറിയൽ, വരുമാന സാക്ഷ്യപത്രങ്ങൾ ചേർക്കുക";
        if (language === "bn") return "পরিচয় এবং আয় যাচাইকরণ নথি যোগ করুন";
        if (language === "mr") return "ओळख आणि उत्पन्न पडताळणी कागदपत्रे जोडा";
        if (language === "gu") return "ઓળખ અને આવક ચકાસણી દસ્તાવેજો ઉમેરો";
        return "Add identity and income verification documents";
      case 3:
        if (language === "hi") return "योजनाओं के लिए अपनी पात्रता जाँचें";
        if (language === "kn") return "ಯೋಜನೆಗಳಿಗೆ ನಿಮ್ಮ ಅರ್ಹತೆಯನ್ನು ಪರಿಶೀಲಿಸಿ";
        if (language === "te") return "పథకాలకు మీ అర్హతను అంచనా వేయండి";
        if (language === "ta") return "திட்டங்களுக்கான உங்கள் தகுதியை மதிப்பிடுங்கள்";
        if (language === "ml") return "പദ്ധതികൾക്കായുള്ള നിങ്ങളുടെ യോഗ്യത പരിശോധിക്കുക";
        if (language === "bn") return "স্কিমগুলির জন্য আপনার যোগ্যতা মূল্যায়ন করুন";
        if (language === "mr") return "योजनांसाठी आपली पात्रता तपासा";
        if (language === "gu") return "યોજનાઓ માટે તમારી પાત્રતા તપાસો";
        return "Evaluate scheme rules against your profile";
      case 4:
        if (language === "hi") return "परिवार के सदस्यों को जोड़कर लाभ बढ़ाएँ";
        if (language === "kn") return "ಕುಟುಂಬ ಸದಸ್ಯರನ್ನು ಸೇರಿಸಿ ಪ್ರಯೋಜನಗಳನ್ನು ಹೆಚ್ಚಿಸಿ";
        if (language === "te") return "కుటుంబ ప్రయోజనాలను పొందడానికి సభ్యులను జోడించండి";
        if (language === "ta") return "குடும்ப நன்மைகளைப் பெற உறுப்பினர்களைச் சேர்க்கவும்";
        if (language === "ml") return "കുടുംബ ആനുകൂല്യങ്ങൾ ലഭിക്കാൻ അംഗങ്ങളെ ചേർക്കുക";
        if (language === "bn") return "পারিবারিক সুবিধা পেতে সদস্যদের যোগ করুন";
        if (language === "mr") return "कुटुंब लाभ मिळवण्यासाठी सदस्यांची नोंद करा";
        if (language === "gu") return "કૌટુંબિક લાભો મેળવવા સભ્યો ઉમેરો";
        return "Add family members to unlock household benefits";
      case 5:
        if (language === "hi") return "पात्र योजनाओं की पहचान करें जो आपसे छूट गई हैं";
        if (language === "kn") return "ನೀವು ಪಡೆಯಬಹುದಾದ ಕಲ್ಯಾಣ ಯೋಜನೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ";
        if (language === "te") return "మీరు అర్హత కలిగి ఉండి క్లెయిమ్ చేయని సంక్షేమ పథకాలను కనుగొనండి";
        if (language === "ta") return "நீங்கள் தகுதியுள்ள ஆனால் பெறாத நலத்திட்டங்களைக் கண்டறியவும்";
        if (language === "ml") return "നിങ്ങൾക്ക് അർഹതയുള്ളതും എന്നാൽ ലഭ്യമാകാത്തതുമായ ക്ഷേമപദ്ധതികൾ കണ്ടെത്തുക";
        if (language === "bn") return "আপনি যোগ্য কিন্তু দাবি করেননি এমন কল্যাণমূলক স্কিমগুলি খুঁজুন";
        if (language === "mr") return "आपण पात्र असलेल्या परंतु न मिळालेल्या कल्याणकारी योजना शोधा";
        if (language === "gu") return "તમે પાત્ર છો પરંતુ દાવો કર્યો નથી તેવી કલ્યાણકારી યોજનાઓ શોધો";
        return "Find welfare schemes you qualify for but haven't claimed";
      default:
        return "";
    }
  };

  const onboardingSteps: OnboardingStep[] = [
    {
      id: 1,
      title: t(language, "completeProfile"),
      description: getStepDescription(1),
      isCompleted: Boolean(profile.age && profile.state && profile.occupation),
      route: "/profile",
    },
    {
      id: 2,
      title: t(language, "prepareDocuments"),
      description: getStepDescription(2),
      isCompleted: Boolean(profile.available_documents?.length),
      route: "/documents",
    },
    {
      id: 3,
      title: t(language, "checkEligibility"),
      description: getStepDescription(3),
      isCompleted: recommendations.length > 0,
      route: "/eligibility",
    },
    {
      id: 4,
      title: t(language, "familyBenefits"),
      description: getStepDescription(4),
      isCompleted: Boolean(profile.family_members?.length),
      route: "/family",
    },
    {
      id: 5,
      title: t(language, "missingBenefits"),
      description: getStepDescription(5),
      isCompleted: gaps.length === 0 && Boolean(profile.age && profile.occupation),
      route: "/welfare-gaps",
    },
  ];

  const navigate = useNavigate();

  const handleLifeEvent = (type: string) => {
    setLifeEventModal(type);
    setLifeEventData({});
  };

  const submitLifeEvent = async () => {
    let newProfile = { ...profile };
    let targetSchemeId = "pm-kisan";

    if (lifeEventModal === 'baby') {
      newProfile = {
        ...newProfile,
        family_members: [...(newProfile.family_members || []), { name: lifeEventData.name || "Baby", relationship: "daughter", age: 0, gender: "female", occupation: "dependent" }]
      };
      targetSchemeId = "sukanya-samriddhi";
    } else if (lifeEventModal === 'crop') {
      newProfile = {
        ...newProfile,
        occupation: "farmer"
      };
      targetSchemeId = "pm-kisan";
    } else if (lifeEventModal === 'age') {
      newProfile = {
        ...newProfile,
        age: 60
      };
      targetSchemeId = "pm-sym";
    }
    
    setLifeEventModal(null);
    setProfile(newProfile);
    try {
      await api.put("/api/profile", newProfile);
    } catch(e) {
      // ignore if unauthenticated or error
    }
    navigate("/eligibility", { state: { prefillScheme: targetSchemeId } });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-5 shadow-card">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sahaya-saffron">{t(language, "dashboardTitle")}</p>
            <h1 data-tour="dashboard-title" className="mt-1 text-2xl font-bold text-sahaya-ink md:text-3xl">
              {t(language, "goodMorning")}, {user?.full_name || (language === "hi" ? "नागरिक" : language === "kn" ? "ನಾಗರಿಕ" : "Citizen")}
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600">{t(language, "dashboardSubtitle")}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/find-schemes" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sahaya-green px-5 font-semibold text-white">
                {t(language, "findBenefits")} <ArrowRight size={18} />
              </Link>
              <Link to="/chat" className="inline-flex min-h-12 items-center gap-2 rounded-xl border px-5 font-semibold text-sahaya-green">
                <Mic size={18} /> {t(language, "voiceTextCta")}
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <Languages className="mb-2 text-sahaya-green" />
              <b>
                {SUPPORTED_LANGUAGES.length}{" "}
                {language === "hi"
                  ? "भाषाएँ"
                  : language === "kn"
                  ? "ಭಾಷೆಗಳು"
                  : language === "te"
                  ? "భాషలు"
                  : language === "ta"
                  ? "மொழிகள்"
                  : language === "ml"
                  ? "ഭാഷകൾ"
                  : language === "bn"
                  ? "ভাষা"
                  : language === "mr"
                  ? "भाषा"
                  : language === "gu"
                  ? "ભાષાઓ"
                  : "Languages"}
              </b>
              <p className="text-slate-600 line-clamp-2">
                English, हिन्दी, ಕನ್ನಡ, తెలుగు, தமிழ், മലയാളം, বাংলা, मराठी, ગુજરાતી
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <ShieldCheck className="mb-2 text-sahaya-green" />
              <b>{t(language, "privacyArchitecture")}</b>
              <p className="text-slate-600">{language === "hi" ? "केवल न्यूनतम डेटा" : language === "kn" ? "ಕನಿಷ್ಠ ಡೇಟಾ ಮಾತ್ರ" : "Minimum data only"}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stat Cards */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="rounded-full bg-emerald-100 p-3 text-emerald-600"><Languages size={24} /></div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase">Languages</div>
            <div className="text-xl font-bold text-slate-900">{SUPPORTED_LANGUAGES.length}</div>
            <div className="text-xs text-slate-500 line-clamp-1">{SUPPORTED_LANGUAGES.map(l => l.nativeLabel).join(", ")}</div>
          </div>
        </div>
        <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="rounded-full bg-purple-100 p-3 text-purple-600"><ShieldCheck size={24} /></div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase">Privacy First</div>
            <div className="text-xl font-bold text-slate-900">100%</div>
            <div className="text-xs text-slate-500">Your data, your control</div>
          </div>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="rounded-full bg-rose-100 p-3 text-rose-600"><Users size={24} /></div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase">Active Users</div>
            <div className="text-xl font-bold text-slate-900">{activeUsersCount !== null ? activeUsersCount : "..."}</div>
            <div className="text-xs text-slate-500">Across Karnataka</div>
          </div>
        </div>
        <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="rounded-full bg-orange-100 p-3 text-orange-600"><Search size={24} /></div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase">Schemes Available</div>
            <div className="text-xl font-bold text-slate-900">{schemes.length > 0 ? schemes.length : "150+"}</div>
            <div className="text-xs text-slate-500">Central & State</div>
          </div>
        </div>
      </section>

      {/* Predictive Life Events */}
      <section className="rounded-3xl bg-white p-6 shadow-card border border-slate-100">
        <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2"><Sparkles className="text-sahaya-saffron" size={24} /> Predictive Life Events</h2>
        <p className="text-sm text-slate-600 mb-6">Update your life events to instantly discover new government schemes you automatically qualify for.</p>
        
        <div className="grid gap-4 md:grid-cols-3">
          <button 
            onClick={() => handleLifeEvent('baby')}
            className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-pink-200 bg-pink-50 hover:bg-pink-100 transition group"
          >
            <div className="h-12 w-12 rounded-full bg-pink-200 flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition">👶</div>
            <div className="font-bold text-pink-900">Just had a baby girl</div>
            <div className="text-xs text-pink-700 mt-1">Tap to update profile</div>
          </button>
          
          <button 
            onClick={() => handleLifeEvent('crop')}
            className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 hover:bg-amber-100 transition group"
          >
            <div className="h-12 w-12 rounded-full bg-amber-200 flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition">🌾</div>
            <div className="font-bold text-amber-900">Crop Failure / Loss</div>
            <div className="text-xs text-amber-700 mt-1">Tap to update profile</div>
          </button>

          <button 
            onClick={() => handleLifeEvent('age')}
            className="flex flex-col items-center justify-center p-6 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 hover:bg-blue-100 transition group"
          >
            <div className="h-12 w-12 rounded-full bg-blue-200 flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition">🎂</div>
            <div className="font-bold text-blue-900">Turned 60 Years Old</div>
            <div className="text-xs text-blue-700 mt-1">Tap to update profile</div>
          </button>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div data-tour="dashboard-readiness-circle">
          <SectionCard title={t(language, "welfareReadiness")}>
            <div className="flex items-end gap-3">
              <div className="text-5xl font-bold text-sahaya-green">{readiness}%</div>
              <div className="pb-2 text-sm text-slate-600">
                {language === "hi" ? "आवेदन के लिए तैयार" : language === "kn" ? "ಅರ್ಜಿಗೆ ಸಿದ್ಧವಾಗಿದೆ" : "ready for guided applications"}
              </div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-stone-100">
              <div className="h-full rounded-full bg-sahaya-green" style={{ width: `${readiness}%` }} />
            </div>
            <div className="mt-4 grid gap-2 text-sm">
              {readinessFactors.map((factor) => (
                <div key={factor.label} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className={factor.ready ? "text-sahaya-green" : "text-slate-300"} size={18} /> {factor.label}
                  </span>
                  <span className={factor.ready ? "font-semibold text-sahaya-green" : "text-slate-500"}>
                    {factor.ready ? (language === "hi" ? "तैयार" : language === "kn" ? "ಸಿದ್ಧ" : "Ready") : factor.action}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div data-tour="dashboard-checklist">
          <OnboardingChecklist
            steps={onboardingSteps}
            title={t(language, "gettingStarted")}
            subtitle={language === "hi" ? "कल्याण लाभ प्राप्त करने के लिए महत्वपूर्ण चरण" : language === "kn" ? "ಕಲ್ಯಾಣ ಪ್ರಯೋಜನಗಳನ್ನು ಪಡೆಯಲು ಪ್ರಮುಖ ಹಂತಗಳು" : "Key steps to maximize your welfare entitlement"}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title={t(language, "eligibleSchemes")}>
          {eligibleError && <p className="text-sm text-red-700">{eligibleError}</p>}
          {!eligibleError && eligibleSchemes.length === 0 && <p className="text-sm text-slate-600">{t(language, "noEligibleSchemes")}</p>}
          {eligibleSchemes.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">{summaryAudio?.summary}</p>
              {summaryAudio && summaryAutoplayBlocked && <button type="button" onClick={playSummary} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold text-sahaya-green"><Volume2 size={16} /> {t(language, "playSummary")}</button>}
              {summaryAudio && !summaryAutoplayBlocked && <button type="button" onClick={summaryPlaying ? stopSummary : playSummary} className="inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold text-sahaya-green">{summaryPlaying ? <Square size={16} /> : <Play size={16} />} {summaryPlaying ? t(language, "stopAudio") : t(language, "playSummary")}</button>}
              <div className="grid gap-3">{eligibleSchemes.map((scheme) => <SchemeCard key={scheme.id} scheme={scheme} />)}</div>
            </div>
          )}
        </SectionCard>
        <SectionCard title={t(language, "benefitsForYou")}>
          <div className="space-y-3">
            {recommendations.slice(0, 3).map((item) => (
              <div key={item.scheme_id} className="rounded-xl border p-3">
                <div className="font-semibold">{item.scheme_name}</div>
                <div className="text-sm text-slate-600">Match: {item.relevance_score}%</div>
                <div className="text-sm">{item.reason}</div>
                <Link to="/eligibility" className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-sahaya-green">
                  {t(language, "checkEligibility")}
                </Link>
              </div>
            ))}
            {recommendations.length === 0 && <p className="text-sm text-slate-600">{t(language, "completeProfileForRecommendations")}</p>}
          </div>
        </SectionCard>

        <SectionCard title={t(language, "missingBenefits")}>
          <div className="space-y-3">
            {gaps.slice(0, 3).map((item) => (
              <div key={item.scheme} className="rounded-xl border p-3">
                <div className="font-semibold">{item.scheme}</div>
                <div className="text-sm text-slate-600">{item.why_it_may_apply}</div>
                <div className="text-sm">{item.recommended_next_action}</div>
              </div>
            ))}
            {gaps.length === 0 && <p className="text-sm text-slate-600">{t(language, "noGapsYet")}</p>}
            <Link to="/welfare-gaps" className="mt-2 inline-flex min-h-10 items-center gap-1.5 font-semibold text-sahaya-green hover:underline text-sm">
              {t(language, "missingBenefits")} <ArrowRight size={16} />
            </Link>
          </div>
        </SectionCard>

        <SectionCard title={t(language, "familyBenefits")}>
          <div className="space-y-2 text-sm">
            <div>
              {t(language, "familyMembersInProfile")}: {profile.family_members?.length || 0}
            </div>
            <div>
              {t(language, "documentsReady")}: {profile.available_documents?.length || 0}
            </div>
            <div className="rounded-xl bg-stone-50 p-3 font-medium">
              {language === "hi"
                ? "खोजें → पात्र → दस्तावेज़ → आवेदन → सत्यापन → लाभ"
                : language === "kn"
                ? "ಹುಡುಕಿ → ಅರ್ಹರು → ದಾಖಲೆ → ಅರ್ಜಿ → ಪರಿಶೀಲನೆ → ಪ್ರಯೋಜನ"
                : "Discover → Eligible → Documents → Apply → Verification → Benefit"}
            </div>
            <Link to="/family" className="inline-flex min-h-10 items-center font-semibold text-sahaya-green">
              {t(language, "optimizeFamilyBenefits")}
            </Link>
          </div>
        </SectionCard>
      </div>

      {lifeEventModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4 text-slate-900">
              {lifeEventModal === 'baby' && "👶 Congratulations on your baby girl!"}
              {lifeEventModal === 'crop' && "🌾 Report Crop Loss"}
              {lifeEventModal === 'age' && "🎂 Welcome to the 60s Club!"}
            </h2>
            
            <p className="text-sm text-slate-600 mb-5">
              Please provide a few details so we can find exactly which new government schemes you automatically qualify for.
            </p>

            <div className="space-y-4 mb-6">
              {lifeEventModal === 'baby' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Baby's Name</label>
                    <input type="text" className="w-full border rounded-xl px-4 py-2 focus:border-sahaya-green outline-none" placeholder="Enter name" onChange={(e) => setLifeEventData({ ...lifeEventData, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Date of Birth</label>
                    <input type="date" className="w-full border rounded-xl px-4 py-2 focus:border-sahaya-green outline-none" defaultValue={new Date().toISOString().split('T')[0]} />
                  </div>
                </>
              )}

              {lifeEventModal === 'crop' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Crop Type</label>
                    <select className="w-full border rounded-xl px-4 py-2 focus:border-sahaya-green outline-none">
                      <option>Rice / Paddy</option>
                      <option>Wheat</option>
                      <option>Cotton</option>
                      <option>Sugarcane</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Estimated Loss Date</label>
                    <input type="date" className="w-full border rounded-xl px-4 py-2 focus:border-sahaya-green outline-none" />
                  </div>
                </>
              )}

              {lifeEventModal === 'age' && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Confirm Date of Birth</label>
                    <input type="date" className="w-full border rounded-xl px-4 py-2 focus:border-sahaya-green outline-none" />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setLifeEventModal(null)} className="flex-1 rounded-xl bg-slate-100 py-3 font-bold text-slate-700 hover:bg-slate-200">
                Cancel
              </button>
              <button onClick={submitLifeEvent} className="flex-1 rounded-xl bg-sahaya-green py-3 font-bold text-white hover:bg-sahaya-green/90">
                Update & Check Schemes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
