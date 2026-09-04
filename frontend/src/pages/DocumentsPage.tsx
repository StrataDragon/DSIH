import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, FileCheck2, FileText, Loader2, RefreshCcw, ShieldCheck, UploadCloud } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";
import { getLocalizedDocumentName } from "../utils/schemeLocalization";

const commonDocuments = [
  {
    documentType: "income_certificate",
    name: {
      en: "Income certificate",
      hi: "आय प्रमाण पत्र",
      kn: "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ",
      te: "ఆదాయ ధృవీకరణ పత్రం",
      ta: "வருமானச் சான்றிதழ்",
      ml: "വരുമാന സർട്ടിഫിക്കറ്റ്",
      bn: "আয় শংসাপত্র",
      mr: "उत्पन्नाचा दाखला",
      gu: "આવકનો દાખલો"
    },
    usedFor: {
      en: "Scholarship, housing, fee waiver, and welfare income threshold checks",
      hi: "छात्रवृत्ति, आवास, शुल्क छूट और कम आय कल्याण पात्रता सत्यापन",
      kn: "ವಿದ್ಯಾರ್ಥಿವೇತನ, ವಸತಿ, ಶುಲ್ಕ ವಿನಾಯಿತಿ ಮತ್ತು ಕಲ್ಯಾಣ ಯೋಜನೆಗಳ ಆದಾಯ ಪರಿಶೀಲನೆ",
      te: "స్కాలర్‌షిప్, గృహనిర్మాణం మరియు సంక్షేమ పథకాల ఆదాయ అర్హత నిర్ధారణ",
      ta: "கல்வி உதவித்தொகை, வீட்டுவசதி மற்றும் நலத்திட்ட வருமான சரிபார்ப்பு",
      ml: "സ്കോളർഷിപ്പ്, ഭവന നിർമ്മാണം, ക്ഷേമ പദ്ധതി വരുമാന പരിശോധന",
      bn: "বৃত্তি, আবাসন এবং কল্যাণ প্রকল্পের আয়ের যোগ্যতা যাচাই",
      mr: "शिष्यवृत्ती, घरकुल आणि कल्याणकारी योजनांसाठी उत्पन्न पडताळणी",
      gu: "શિષ્યવૃત્તિ, આવાસ અને કલ્યાણકારી યોજનાઓ માટે આવક ચકાસણી"
    },
  },
  {
    documentType: "land_record",
    name: {
      en: "Land record",
      hi: "भूमि रिकॉर्ड (RTC / खतौनी)",
      kn: "ಭೂ ದಾಖಲೆ (ಪಹಣಿ / RTC)",
      te: "భూమి రికార్డు (RTC / పట్టా)",
      ta: "நில ஆவணம் (பட்டா / சிட்டா)",
      ml: "ഭൂമി രേഖ (RTC / തണ്ടപ്പೇര്)",
      bn: "জমির রেকর্ড (খতিয়ান / RTC)",
      mr: "जमीन महसूल नोंद (७/१२ उतारा)",
      gu: "જમીન દસ્તાવેજ (૭/૧૨ / RTC)"
    },
    usedFor: {
      en: "Farmer subsidies, agriculture inputs, crop insurance, and land ownership checks",
      hi: "किसान सब्सिडी, कृषि इनपुट, फसल बीमा और भूमि स्वामित्व सत्यापन",
      kn: "ರೈತ ಸಬ್ಸಿಡಿ, ಕೃಷಿ ಸಲಕರಣೆ, ಬೆಳೆ ವಿಮೆ ಮತ್ತು ಭೂ ಮಾಲೀಕತ್ವ ಪರಿಶೀಲನೆ",
      te: "రైతు రాయితీలు, వ్యవసాయ పథకాలు, పంట బీమా మరియు భూ యాజమాన్య నిర్ధారణ",
      ta: "விவசாய மானியங்கள், பயிர் காப்பீடு மற்றும் நில உரிமை சரிபார்ப்பு",
      ml: "കർഷക സബ്‌സിഡി, കൃഷി ആനുകൂല്യങ്ങൾ, വിള ഇൻഷുറൻസ് പരിശോധന",
      bn: "কৃষক ভর্তুকি, ফসল বীমা এবং জমির মালিকানা যাচাই",
      mr: "शेतकरी सबसिडी, पीक विमा आणि जमीन मालकी पडताळणी",
      gu: "ખેડૂત સબસિડી, પાક વીમો અને જમીનની માલિકી ચકાસણી"
    },
  },
  {
    documentType: "ration_card",
    name: {
      en: "Ration card",
      hi: "राशन कार्ड",
      kn: "ರೇಷನ್ ಕಾರ್ಡ್",
      te: "రేషన్ కార్డు",
      ta: "ரேஷன் கார்டு",
      ml: "റേഷൻ കാർഡ്",
      bn: "রেশন কার্ড",
      mr: "रेशन कार्ड",
      gu: "રેશન કાર્ડ"
    },
    usedFor: {
      en: "Food security, subsidized grains, family structure, and BPL/AAY health benefit checks",
      hi: "खाद्य सुरक्षा, रियायती राशन, परिवार विवरण और बीपीएल/अंत्योदय स्वास्थ्य लाभ",
      kn: "ಆಹಾರ ಭದ್ರತೆ, ರಿಯಾಯಿತಿ ಪಡಿತರ, ಕುಟುಂಬದ ವಿವರ ಮತ್ತು ಬಿಪಿಎಲ್ ಸೌಲಭ್ಯ ಪರಿಶೀಲನೆ",
      te: "ఆహార భద్రత, సబ్సిడీ రేషన్, కుటుంబ వివరాలు మరియు BPL ఆరోగ్య ప్రయోజనాలు",
      ta: "உணவுப் பாதுகாப்பு, மானிய விலை ரேஷன் மற்றும் குடும்ப நலத்திட்ட சரிபார்ப்பு",
      ml: "ഭക്ഷ്യസുരക്ഷ, സബ്‌സിഡി റേഷൻ, ബിപിഎൽ ആരോഗ്യ ആനുകൂല്യ പരിശോധന",
      bn: "খাদ্য সুরক্ষা, ভর্তুকিযুক্ত রেশন এবং বিপিএল স্বাস্থ্য সুবিধা যাচাই",
      mr: "अन्न सुरक्षा, अनुदानित धान्य, कौटुंबिक तपशील आणि दारिद्र्यरेषेखालील लाभ",
      gu: "અન્ન સુરક્ષા, સબસિડીયુક્ત અનાજ અને બીપીએલ સ્વાસ્થ્ય લાભ ચકાસણી"
    },
  },
  {
    documentType: "disability_certificate",
    name: {
      en: "Disability certificate",
      hi: "दिव्यांगता प्रमाण पत्र (UDID)",
      kn: "ಅಂಗವಿಕಲತೆಯ ಪ್ರಮಾಣಪತ್ರ (UDID)",
      te: "దివ్యాంగ ధృవీకరణ పత్రం (UDID)",
      ta: "மாற்றுத்திறனாளி சான்றிதழ் (UDID)",
      ml: "ഭിന്നശേഷി സർട്ടിഫിക്കറ്റ് (UDID)",
      bn: "প্রতিবন্ধকতা শংসাপত্র (UDID)",
      mr: "दिव्यांगत्व प्रमाणपत्र (UDID)",
      gu: "દિવ્યાંગતા પ્રમાણપત્ર (UDID)"
    },
    usedFor: {
      en: "Disability pensions, assistive devices, mobility aids, and reservation/quota benefits",
      hi: "दिव्यांग पेंशन, सहायक उपकरण, गतिशीलता सहायता और आरक्षण लाभ",
      kn: "ವಿಕಲಚೇತನರ ಪಿಂಚಣಿ, ಸಹಾಯಕ ಉಪಕರಣಗಳು ಮತ್ತು ಮೀಸಲಾತಿ ಸೌಲಭ್ಯ ಪರಿಶೀಲನೆ",
      te: "దివ్యాంగుల పింఛను, సహాయక ఉపకరణాలు మరియు ప్రత్యేక రాయితీలు",
      ta: "மாற்றுத்திறனாளி ஓய்வூதியம், உதவி உபகரணங்கள் மற்றும் சிறப்பு சலுகைகள்",
      ml: "ഭിന്നശേഷി പെൻഷൻ, സഹായക ഉപകരണങ്ങൾ, പ്രത്യേക ആനുകൂല്യങ്ങൾ",
      bn: "প্রতিবন্ধী পেনশন, সহায়ক সরঞ্জাম এবং বিশেষ সুযোগ-সুবিধা যাচাই",
      mr: "दिव्यांग पेन्शन, सहाय्यक उपकरणे आणि विशेष सवलती पडताळणी",
      gu: "દિવ્યાંગ પેન્શન, સહાયક સાધનો અને વિશેષ લાભ ચકાસણી"
    },
  },
  {
    documentType: "caste_certificate",
    name: {
      en: "Caste certificate",
      hi: "जाति प्रमाण पत्र",
      kn: "ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ",
      te: "కుల ధృవీకరణ పత్రం",
      ta: "சாதிச் சான்றிதழ்",
      ml: "ജാതി സർട്ടിഫിക്കറ്റ്",
      bn: "জাতিগত শংসাপত্র",
      mr: "जात प्रमाणपत्र",
      gu: "જાતિનું પ્રમાણપત્ર"
    },
    usedFor: {
      en: "Category-specific welfare (SC/ST/OBC/Minority), education fee concessions, and hostel quotas",
      hi: "वर्ग-विशिष्ट कल्याण (SC/ST/OBC/अल्पसंख्यक), शिक्षण शुल्क छूट और छात्रावास कोटा",
      kn: "ವರ್ಗ-ಆಧಾರಿತ ಕಲ್ಯಾಣ (SC/ST/OBC/ಅಲ್ಪಸಂಖ್ಯಾತ), ಶುಲ್ಕ ವಿನಾಯಿತಿ ಮತ್ತು ವಸತಿ ನಿಲಯ ಸೌಲಭ್ಯ",
      te: "వర్గ సంక్షేమ పథకాలు (SC/ST/OBC/మైనారిటీ), ఫీజు రాయితీలు మరియు హాస్టల్ సీట్లు",
      ta: "பிரிவு சார்ந்த நலத்திட்டங்கள் (SC/ST/OBC), கல்விக் கட்டணச் சலுகை மற்றும் விடுதி வசதி",
      ml: "വിഭാഗാധിഷ്ഠിത ക്ഷേമം (SC/ST/OBC), ഫീസ് ഇളവുകൾ, ഹോസ്റ്റൽ ആനുകൂല്യങ്ങൾ",
      bn: "শ্রেণিভিত্তিক কল্যাণ (SC/ST/OBC/সংখ্যালঘু), ফি ছাড় এবং হোস্টেল সুবিধা",
      mr: "प्रवर्गनिहाय कल्याण (SC/ST/OBC/अल्पसंख्याक), शैक्षणिक शुल्क सवलत आणि वसतिगृह कोटा",
      gu: "વર્ગ આધારિત કલ્યાણ (SC/ST/OBC/લઘુમતી), ફી માફી અને હોસ્ટેલ લાભ"
    },
  },
  {
    documentType: "marksheet_academic_record",
    name: {
      en: "Marksheet / Academic Record (DigiLocker)",
      hi: "अंकतालिका / शैक्षणिक रिकॉर्ड (डिजिलॉकर)",
      kn: "ಅಂಕಪಟ್ಟಿ / ಶೈಕ್ಷಣಿಕ ದಾಖಲೆ (ಡಿಜಿಲಾಕರ್)",
      te: "మార్కుల జాబితా / విద్యా రికార్డు (డిజిలాకర్)",
      ta: "மதிப்பெண் சான்றிதழ் / கல்வி ஆவணம் (டிஜிலாக்கர்)",
      ml: "മാർക്ക് ഷീറ്റ് / വിദ്യാഭ്യാസ രേഖ (ഡിജിലോക്കർ)",
      bn: "নম্বরপত্র / শিক্ষাগত রেকর্ড (ডিজিলকার)",
      mr: "गुणपत्रिका / शैक्षणिक नोंद (डिजीलॉकर)",
      gu: "માર્કશીટ / શૈક્ષણિક રેકોર્ડ (ડિજીલોકર)"
    },
    usedFor: {
      en: "Scholarship applications, higher education schemes, student welfare admissions, and academic qualification verification",
      hi: "छात्रवृत्ति आवेदन, उच्च शिक्षा योजनाएं, छात्र कल्याण प्रवेश और शैक्षणिक योग्यता सत्यापन",
      kn: "ವಿದ್ಯಾರ್ಥಿವೇತನ ಅರ್ಜಿಗಳು, ಉನ್ನತ ಶಿಕ್ಷಣ ಯೋಜನೆಗಳು, ವಿದ್ಯಾರ್ಥಿ ಪ್ರವೇಶ ಮತ್ತು ಶೈಕ್ಷಣಿಕ ಅರ್ಹತೆ ಪರಿಶೀಲನೆ",
      te: "స్కాలర్‌షిప్ దరఖాస్తులు, ఉన్నత విద్యా పథకాలు, విద్యార్థి ప్రవేశాలు మరియు విద్యా అర్హత నిర్ధారణ",
      ta: "கல்வி உதவித்தொகை விண்ணப்பங்கள், உயர்கல்வித் திட்டங்கள் மற்றும் கல்வித் தகுதி சரிபார்ப்பு",
      ml: "സ്കോളർഷിപ്പ് അപേക്ഷകൾ, ഉന്നത വിദ്യാഭ്യാസ പദ്ധതികൾ, വിദ്യാഭ്യാസ യോഗ്യതാ പരിശോധന",
      bn: "বৃত্তি আবেদন, উচ্চশিক্ষা প্রকল্প, শিক্ষার্থী কল্যাণ ভর্তি এবং শিক্ষাগত योग्यता যাচাই",
      mr: "शिष्यवृत्ती अर्ज, उच्च शिक्षण योजना, विद्यार्थी कल्याण प्रवेश आणि शैक्षणिक पात्रता पडताळणी",
      gu: "શિષ્યવૃત્તિ અરજીઓ, ઉચ્ચ શિક્ષણ યોજનાઓ, વિદ્યાર્થી પ્રવેશ અને શૈક્ષણિક લાયકાત ચકાસણી"
    },
  },
  {
    documentType: "generic_sample_document",
    name: {
      en: "Generic sample document",
      hi: "सामान्य नमूना दस्तावेज़",
      kn: "ಸಾಮಾನ್ಯ ಮಾದರಿ ದಾಖಲೆ",
      te: "సాధారణ నమూనా పత్రం",
      ta: "மாதிரி பொது ஆவணம்",
      ml: "സാധാരണ മാതൃകാ രേഖ",
      bn: "সাধারণ নমুনা নথি",
      mr: "सर्वसाधारण नमुना दस्तऐवज",
      gu: "સામાન્ય નમૂના દસ્તાવેજ"
    },
    usedFor: {
      en: "General supporting proof, sample official forms, or applicant self-attestation copies",
      hi: "सामान्य सहायक प्रमाण, आधिकारिक आवेदन पत्र या स्व-प्रमाणित प्रतियां",
      kn: "ಸಾಮಾನ್ಯ ಪೂರಕ ಪುರಾವೆ, ಅರ್ಜಿ ಮಾದರಿ ಅಥವಾ ಸ್ವಯಂ ಘೋಷಿತ ದಾಖಲೆಗಳು",
      te: "సాధారణ సహాయక పత్రం, దరఖాస్తు నమూనా లేదా స్వయం ధృవీకరణ పత్రాలు",
      ta: "பொது துணை ஆவணம், மாதிரி விண்ணப்பப் படிவம் அல்லது சுய சான்றொப்ப நகல்",
      ml: "പൊതു അനുബന്ധ രേഖ, അപേക്ഷാ മാതൃക അല്ലെങ്കിൽ സ്വയം സാക്ഷ്യപ്പെടുത്തിയ പകർപ്പ്",
      bn: "সাধারণ সহায়ক প্রমাণ, নমুনা আবেদনপত্র বা স্ব-প্রত্যয়িত কপি",
      mr: "सर्वसाधारण पूरक पुरावा, नमुना अर्ज किंवा स्व-स्वाक्षरी केलेली प्रत",
      gu: "સામાન્ય સહાયક પુરાવો, અરજીનો નમૂનો અથવા સ્વ-પ્રમાણિત નકલ"
    },
  },
];

export function DocumentsPage() {
  const { language, profile, setProfile } = useAppContext();
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploadStage, setUploadStage] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    status: "VERIFIED" | "REJECTED" | "REVIEW_REQUIRED";
    message: string;
    reason_code?: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const res = await api.get("/api/documents");
    setDocuments(res.data);
  };

  useEffect(() => {
    load().catch(() => setDocuments([]));
  }, []);

  const langKey = (language || "en").toLowerCase();

  const STAGE_LABELS: Record<string, string> = {
    uploading: "Uploading file securely...",
    safety: "Running malware, dimension & structural safety checks...",
    authenticity: "Verifying cryptographic digital signatures & tamper signals...",
    issuer: "Validating official government issuer records & QR codes...",
    extracting: "Extracting verified attributes in-memory...",
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl bg-white p-6 shadow-card">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-sahaya-saffron">{t(language, "processedSafely")}</p>
            <h1 className="mt-1 text-3xl font-bold">{t(language, "secureDocuments")}</h1>
            <p className="mt-2 max-w-3xl text-slate-600">{t(language, "documentsIntro")}</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-sahaya-green">
            <ShieldCheck className="mb-2" />
            <b>{t(language, "documentPrivacyNote")}</b>
            <p className="mt-2 text-slate-700">{t(language, "doNotUploadIds")}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <div className="rounded-3xl bg-white p-5 shadow-card">
          <h2 className="mb-4 text-lg font-semibold">{t(language, "commonDocuments")}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {commonDocuments.map((item) => {
              const nameMap = item.name as Record<string, string>;
              const usedForMap = item.usedFor as Record<string, string>;
              const localizedName = nameMap[langKey] || nameMap.en;
              const localizedUsedFor = usedForMap[langKey] || usedForMap.en;
              return (
                <div key={item.documentType} className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <FileCheck2 className="text-sahaya-green" size={18} /> {localizedName}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="font-semibold">{t(language, "usedFor")}:</span> {localizedUsedFor}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-card" data-tour="upload-section">
          <h2 className="mb-2 text-lg font-semibold">{t(language, "uploadDocument")}</h2>
          <p className="mb-4 text-sm text-slate-600">{t(language, "uploadHelp")}</p>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const input = document.getElementById("upload") as HTMLInputElement;
              const select = document.getElementById("doc-type") as HTMLSelectElement;
              const file = input.files?.[0];
              if (!file) return;
              if (/aadhaar|aadhar|pan/i.test(file.name)) {
                setError(t(language, "doNotUploadIds"));
                return;
              }
              if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type)) {
                setError(t(language, "invalidDocumentType"));
                return;
              }
              if (file.size > 5242880) {
                setError(t(language, "documentTooLarge"));
                return;
              }

              setError("");
              setMessage("");
              setVerificationResult(null);
              setUploadStage("uploading");

              const t1 = setTimeout(() => setUploadStage("safety"), 400);
              const t2 = setTimeout(() => setUploadStage("authenticity"), 900);
              const t3 = setTimeout(() => setUploadStage("issuer"), 1400);
              const t4 = setTimeout(() => setUploadStage("extracting"), 1900);

              try {
                const form = new FormData();
                form.append("file", file);
                if (select?.value) {
                  form.append("document_type", select.value);
                }
                form.append("language", language || "en");
                const res = await api.post("/api/documents/upload", form);

                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                clearTimeout(t4);
                setUploadStage(null);

                const vStatus = res.data.verification_status || res.data.verification?.status || (res.data.eligibility_usable ? "VERIFIED" : "REVIEW_REQUIRED");
                setVerificationResult({
                  status: vStatus,
                  message: res.data.message,
                  reason_code: res.data.verification?.reason_code,
                });

                if (res.data.available_documents) {
                  setProfile({ ...profile, available_documents: res.data.available_documents });
                }
                input.value = "";
                await load();
              } catch (err: any) {
                clearTimeout(t1);
                clearTimeout(t2);
                clearTimeout(t3);
                clearTimeout(t4);
                setUploadStage(null);
                const detail = err?.response?.data?.detail || err?.message || "Document upload failed.";
                setError(detail);
              }
            }}
          >
            <div className="grid gap-1 text-sm font-semibold">
              <label htmlFor="doc-type">{t(language, "chooseDocument")}</label>
              <select
                id="doc-type"
                data-tour="doc-type-select"
                className="min-h-12 rounded-xl border p-3 font-normal text-slate-700 bg-white"
                defaultValue="income_certificate"
              >
                {commonDocuments.map((item) => {
                  const nameMap = item.name as Record<string, string>;
                  const localizedName = nameMap[langKey] || nameMap.en;
                  return (
                    <option key={item.documentType} value={item.documentType}>
                      {localizedName}
                    </option>
                  );
                })}
              </select>
            </div>

            <label className="grid gap-1 text-sm font-semibold" htmlFor="upload">
              Select File (PDF, PNG, JPG)
              <input id="upload" data-tour="documents-upload-input" aria-label={t(language, "uploadDocument")} className="min-h-12 rounded-xl border p-3 font-normal" type="file" accept=".pdf,.png,.jpg,.jpeg" />
            </label>

            {uploadStage && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm text-sahaya-green flex items-center gap-3 animate-pulse">
                <Loader2 size={20} className="animate-spin flex-shrink-0" />
                <div>
                  <div className="font-semibold">{STAGE_LABELS[uploadStage] || "Processing document..."}</div>
                  <div className="text-xs text-slate-600">Enforcing defense-in-depth document authenticity pipeline</div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={Boolean(uploadStage)}
                data-tour="upload-button"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-sahaya-green px-4 font-semibold text-white shadow-sm hover:opacity-90 transition disabled:opacity-50"
              >
                <UploadCloud size={18} /> {uploadStage ? "Verifying..." : t(language, "uploadDocument")}
              </button>
              <button type="button" onClick={() => load()} className="inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 font-semibold hover:bg-stone-50 transition">
                <RefreshCcw size={18} /> {t(language, "refreshDocuments")}
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Primary Verification Result Feedback Card */}
      {verificationResult?.status === "REJECTED" && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950 shadow-card">
          <div className="flex items-center gap-2 text-base font-bold text-red-900">
            <AlertTriangle size={22} className="text-red-600 flex-shrink-0" />
            Document Could Not Be Verified
          </div>
          <p className="mt-2 text-sm text-red-900 font-medium">
            {verificationResult.message || "The document you uploaded may be fake or altered. Please make sure you upload a verified/original document and try again."}
          </p>
          <div className="mt-3 rounded-xl border border-red-200 bg-white/80 p-3.5 text-xs space-y-1.5">
            <div className="font-bold text-red-950">Next steps to unlock scheme eligibility:</div>
            <ul className="list-disc list-inside space-y-1 text-slate-700">
              <li>Upload an official digital certificate bearing an authoritative cryptographic digital signature.</li>
              <li>Upload a DigiLocker-issued or DigiLocker-verified digital document.</li>
              <li>Or provide a clear, original, unaltered physical certificate scan.</li>
            </ul>
          </div>
        </div>
      )}

      {verificationResult?.status === "REVIEW_REQUIRED" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-card">
          <div className="flex items-center gap-2 text-base font-bold text-amber-900">
            <Clock size={22} className="text-amber-600 flex-shrink-0" />
            Document Awaiting Officer Verification
          </div>
          <p className="mt-2 text-sm text-amber-900">
            {verificationResult.message || "Your document passed initial safety checks, but requires manual officer verification before it can unlock scheme eligibility."}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Tip: Uploading an official digitally-signed PDF or DigiLocker verified document allows immediate automated eligibility without waiting for manual review.
          </p>
        </div>
      )}

      {verificationResult?.status === "VERIFIED" && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-card">
          <div className="flex items-center gap-2 text-base font-bold text-emerald-900">
            <ShieldCheck size={22} className="text-emerald-600 flex-shrink-0" />
            Document Authenticity Verified
          </div>
          <p className="mt-1 text-sm text-emerald-900">
            {verificationResult.message || "Your document passed cryptographic and issuer authenticity checks. It is now active for deterministic eligibility evaluations."}
          </p>
        </div>
      )}

      {message && !verificationResult && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-3 rounded-3xl bg-white p-5 shadow-card">
        <h2 className="text-lg font-semibold text-slate-900">Uploaded Documents ({documents.length})</h2>
        {documents.length === 0 && <div className="rounded-xl border p-4 text-sm text-slate-600">{t(language, "noDocuments")}</div>}
        {documents.map((doc) => {
          const vState = doc.masked_fields?.verification_status || doc.verification_state;
          const isVerified = vState === "VERIFIED" || doc.status === "verified" || doc.masked_fields?.eligibility_usable === true;
          const isRejected = vState === "REJECTED" || doc.status === "rejected";
          const statusDisplay = isVerified ? "Verified" : isRejected ? "Verification Failed" : "Verification Required";
          return (
            <div key={doc.id} className="rounded-2xl border p-4 hover:border-slate-300 transition">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <FileText size={18} className="text-sahaya-green" /> {getLocalizedDocumentName(doc.document_type, language)}
                </div>
                <div>
                  {isVerified && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                      <ShieldCheck size={14} /> Verified
                    </span>
                  )}
                  {isRejected && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                      <AlertTriangle size={14} /> Verification Failed
                    </span>
                  )}
                  {!isVerified && !isRejected && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                      <Clock size={14} /> Verification Required
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                <span>MIME: {doc.mime_type}</span>
                <span>File: {doc.file_name}</span>
                <span>Verification Status: <strong className={isVerified ? "text-emerald-700 font-semibold" : isRejected ? "text-red-700 font-semibold" : "text-amber-700 font-semibold"}>{statusDisplay}</strong></span>
              </div>
              <div className="mt-2 rounded-xl bg-stone-50 p-2.5 text-xs text-slate-600">
                {t(language, "maskedInfo")}: {JSON.stringify(doc.masked_fields)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
