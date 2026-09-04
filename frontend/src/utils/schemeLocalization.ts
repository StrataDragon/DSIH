import type { Scheme } from "../types";
import rawSchemeTranslations from "../../../data/config/scheme_translations.json";

export const categoryTranslations: Record<string, Record<string, string>> = {
  Agriculture: {
    hi: "कृषि",
    kn: "ಕೃಷಿ",
    te: "వ్యవసాయం",
    ta: "வேளாண்மை",
    ml: "കൃഷി",
    bn: "কৃষি",
    mr: "शेती",
    gu: "કૃષિ"
  },
  Education: {
    hi: "शिक्षा",
    kn: "ಶಿಕ್ಷಣ",
    te: "విద్య",
    ta: "கல்வி",
    ml: "വിദ്യാഭ്യാസം",
    bn: "শিক্ষা",
    mr: "शिक्षण",
    gu: "શિક્ષણ"
  },
  Health: {
    hi: "स्वास्थ्य",
    kn: "ಆರೋಗ್ಯ",
    te: "ఆరోగ్యం",
    ta: "சுகாதாரம்",
    ml: "ആരോഗ്യം",
    bn: "স্বাস্থ্য",
    mr: "आरोग्य",
    gu: "આરોગ્ય"
  },
  Housing: {
    hi: "आवास",
    kn: "ವಸತಿ",
    te: "గృహనిర్మాణం",
    ta: "வீட்டுவசதி",
    ml: "ഭവനനിർമ്മാണം",
    bn: "আবাসন",
    mr: "गृहनिर्माण",
    gu: "આવાસ"
  },
  Energy: {
    hi: "ऊर्जा",
    kn: "ಇಂಧನ",
    te: "శక్తి & ఇంధనం",
    ta: "ஆற்றல்",
    ml: "ഊർജ്ജം",
    bn: "শক্তি ও জ্বালানি",
    mr: "ऊर्जा",
    gu: "ઊર્જા"
  },
  Labour: {
    hi: "श्रम",
    kn: "ಕಾರ್ಮಿಕ",
    te: "కార్మిక సంక్షేమం",
    ta: "தொழிலாளர் நலம்",
    ml: "തൊഴിൽ",
    bn: "শ্রম",
    mr: "कामगार",
    gu: "શ્રમ"
  },
  "Women and Child": {
    hi: "महिला एवं बाल विकास",
    kn: "ಮಹಿಳೆ ಮತ್ತು ಮಗು",
    te: "మహిళా & శిశు సంక్షేమం",
    ta: "மகளிர் மற்றும் குழந்தைகள்",
    ml: "വനിതാ-ശിശു വികസനം",
    bn: "মহিলা ও শিশু কল্যাণ",
    mr: "महिला आणि बालविकास",
    gu: "મહિલા અને બાળ વિકાસ"
  },
  Sanitation: {
    hi: "स्वच्छता",
    kn: "ನೈರ್ಮಲ್ಯ",
    te: "పారిశుధ్యం",
    ta: "துப்புரவு",
    ml: "ശുചിത്വം",
    bn: "পরিচ্ছন্নতা",
    mr: "स्वच्छता",
    gu: "સ્વચ્છતા"
  },
  Livelihood: {
    hi: "आजीविका एवं कौशल",
    kn: "ಬದುಕು ಮತ್ತು ಕೌಶಲ್ಯ",
    te: "జీవనోపాధి & నైపుణ్యాలు",
    ta: "வாழ்வாதாரம் & திறன்",
    ml: "ഉപജീവനവും നൈപുണ്യവും",
    bn: "জীবিকা ও দক্ষতা",
    mr: "उपजीविका आणि कौशल्य",
    gu: "આજીવિકા અને કૌશલ્ય"
  },
  Disability: {
    hi: "दिव्यांगता सहायता",
    kn: "ಅಂಗವಿಕಲರ ಕಲ್ಯಾಣ",
    te: "దివ్యాంగుల సంక్షేమం",
    ta: "மாற்றுத்திறனாளிகள் நலம்",
    ml: "ഭിന്നശേഷി ക്ഷേമം",
    bn: "প্রতিবন্ধী কল্যাণ",
    mr: "दिव्यांग सहाय्य",
    gu: "દિવ્યાંગ સહાય"
  },
};

export const documentTranslations: Record<string, Record<string, string>> = {
  "land record": {
    hi: "भूमि रिकॉर्ड (RTC)",
    kn: "ಭೂ ದಾಖಲೆ (ಪಹಣಿ/RTC)",
    te: "భూమి రికార్డు (RTC/పట్టా)",
    ta: "நில ஆவணம் (பட்டா/சிட்டா)",
    ml: "ഭൂമി രേഖ (RTC)",
    bn: "জমির রেকর্ড (খতিয়ান/RTC)",
    mr: "जमीन महसूल नोंद (७/१२)",
    gu: "જમીન દસ્તાવેજ (૭/૧૨/RTC)"
  },
  "bank account proof": {
    hi: "बैंक खाता प्रमाण",
    kn: "ಬ್ಯಾಂಕ್ ಖಾತೆ ಪುರಾವೆ",
    te: "బ్యాంక్ ఖాతా రుజువు",
    ta: "வங்கி கணக்கு ஆவணம்",
    ml: "ബാങ്ക് അക്കൗണ്ട് തെളിവ്",
    bn: "ব্যাঙ্ক অ্যাকাউন্ট প্রমাণ",
    mr: "बँक खाते पुरावा",
    gu: "બેંક ખાતાનો પુરાવો"
  },
  "ration card": {
    hi: "राशन कार्ड",
    kn: "ರೇಷನ್ ಕಾರ್ಡ್",
    te: "రేషన్ కార్డు",
    ta: "ரேஷன் கார்டு",
    ml: "റേഷൻ കാർഡ്",
    bn: "রেশন কার্ড",
    mr: "रेशन कार्ड",
    gu: "રેશન કાર્ડ"
  },
  "family id": {
    hi: "परिवार पहचान पत्र",
    kn: "ಕುಟುಂಬ ಐಡಿ",
    te: "కుటుంబ గుర్తింపు కార్డు",
    ta: "குடும்ப அடையாள அட்டை",
    ml: "കുടുംബ ഐഡി",
    bn: "পারিবারিক পরিচয়পত্র",
    mr: "कुटुंब ओळखपत्र",
    gu: "પરિવાર ઓળખપત્ર"
  },
  "residence proof": {
    hi: "निवास प्रमाण पत्र",
    kn: "ವಾಸಸ್ಥಳ ಪುರಾವೆ",
    te: "నివాస ధృవీకరణ పత్రం",
    ta: "இருப்பிடச் சான்றிதழ்",
    ml: "താമസ തെളിവ്",
    bn: "বাসস্থানের প্রমাণপত্র",
    mr: "रहिवासी दाखला",
    gu: "રહેઠાણનો પુરાવો"
  },
  "income certificate": {
    hi: "आय प्रमाण पत्र",
    kn: "ಆದಾಯ ಪ್ರಮಾಣಪತ್ರ",
    te: "ఆదాయ ధృవీకరణ పత్రం",
    ta: "வருமானச் சான்றிதழ்",
    ml: "വരുമാന സർട്ടിഫിക്കറ്റ്",
    bn: "আয় শংসাপত্র",
    mr: "उत्पन्नाचा दाखला",
    gu: "આવકનો દાખલો"
  },
  "student id": {
    hi: "छात्र पहचान पत्र",
    kn: "ವಿದ್ಯಾರ್ಥಿ ಐಡಿ ಕಾರ್ಡ್",
    te: "విద్యార్థి గుర్తింపు కార్డు",
    ta: "மாணவர் அடையாள அட்டை",
    ml: "വിദ്യാർത്ഥി ഐഡി",
    bn: "ছাত্র পরিচয়পত্র",
    mr: "विद्यार्थी ओळखपत्र",
    gu: "વિદ્યાર્થી ઓળખકાર્ડ"
  },
  "mobile number": {
    hi: "मोबाइल नंबर",
    kn: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ",
    te: "మొబైల్ నంబర్",
    ta: "கைபேசி எண்",
    ml: "മൊബൈൽ നമ്പർ",
    bn: "মোবাইল নম্বর",
    mr: "मोबाईल नंबर",
    gu: "મોબાઇલ નંબર"
  },
  "occupation proof": {
    hi: "व्यवसाय प्रमाण",
    kn: "ವೃತ್ತಿ ಪುರಾವೆ",
    te: "వృత్తి ధృవీకరణ",
    ta: "தொழில் சான்று",
    ml: "തൊഴിൽ തെളിവ്",
    bn: "পেশার প্রমাণ",
    mr: "व्यवसाय पुरावा",
    gu: "વ્યવસાય પુરાવો"
  },
  "birth certificate": {
    hi: "जन्म प्रमाण पत्र",
    kn: "ಜನನ ಪ್ರಮಾಣಪತ್ರ",
    te: "జనన ధృవీకరణ పత్రం",
    ta: "பிறப்புச் சான்றிதழ்",
    ml: "ജനന സർട്ടിഫിക്കറ്റ്",
    bn: "জন্ম শংসাপত্র",
    mr: "जन्म दाखला",
    gu: "જન્મ પ્રમાણપત્ર"
  },
  "guardian id proof": {
    hi: "अभिभावक पहचान पत्र",
    kn: "ಪೋಷಕರ ಗುರುತಿನ ಚೀಟಿ",
    te: "సంరక్షకుని గుర్తింపు పత్రం",
    ta: "பாதுகாவலர் அடையாள அட்டை",
    ml: "രക്ഷിതാവിന്റെ ഐഡി",
    bn: "অভিভাবকের পরিচয়পত্র",
    mr: "पालक ओळखपत्र",
    gu: "વાલીનું ઓળખપત્ર"
  },
  "disability certificate": {
    hi: "दिव्यांगता प्रमाण पत्र",
    kn: "ಅಂಗವಿಕಲತೆಯ ಪ್ರಮಾಣಪತ್ರ",
    te: "దివ్యాంగ ధృవీకరణ పత్రం",
    ta: "மாற்றுத்திறனாளி சான்றிதழ்",
    ml: "ഭിന്നശേഷി സർട്ടിഫിക്കറ്റ്",
    bn: "প্রতিবন্ধকতা শংসাপত্র",
    mr: "दिव्यांगत्व प्रमाणपत्र",
    gu: "દિવ્યાંગતા પ્રમાણપત્ર"
  },
  "caste certificate": {
    hi: "जाति प्रमाण पत्र",
    kn: "ಜಾತಿ ಪ್ರಮಾಣಪತ್ರ",
    te: "కుల ధృవీకరణ పత్రం",
    ta: "சாதிச் சான்றிதழ்",
    ml: "ജാതി സർട്ടിഫിക്കറ്റ്",
    bn: "জাতিগত শংসাপত্র",
    mr: "जात प्रमाणपत्र",
    gu: "જાતિનું પ્રમાણપત્ર"
  },
  "generic sample document": {
    hi: "सामान्य नमूना दस्तावेज़",
    kn: "ಸಾಮಾನ್ಯ ಮಾದರಿ ದಾಖಲೆ",
    te: "సాధారణ నమూనా పత్రం",
    ta: "மாதிரி பொது ஆவணம்",
    ml: "സാധാരണ മാതൃകാ രേഖ",
    bn: "সাধারণ নমুনা নথি",
    mr: "सर्वसाधारण नमुना दस्तऐवज",
    gu: "સામાન્ય નમૂના દસ્તાવેજ"
  },
  "marksheet_academic_record": {
    en: "Marksheet / Academic Record — DigiLocker",
    hi: "अंकतालिका / शैक्षणिक रिकॉर्ड — डिजिलॉकर",
    kn: "ಅಂಕಪಟ್ಟಿ / ಶೈಕ್ಷಣಿಕ ದಾಖಲೆ — ಡಿಜಿಲಾಕರ್",
    te: "మార్కుల జాబితా / విద్యా రికార్డు — డిజిలాకర్",
    ta: "மதிப்பெண் சான்றிதழ் / கல்வி ஆவணம் — டிஜிலாக்கர்",
    ml: "മാർക്ക് ഷീറ്റ് / വിദ്യാഭ്യാസ രേഖ — ഡിജിലോക്കർ",
    bn: "নম্বরপত্র / শিক্ষাগত রেকর্ড — ডিজিলকার",
    mr: "गुणपत्रिका / शैक्षणिक नोंद — डिजीलॉकर",
    gu: "માર્કશીટ / શૈક્ષણિક રેકોર્ડ — ડિજીલોકર"
  },
  "marksheet academic record": {
    en: "Marksheet / Academic Record — DigiLocker",
    hi: "अंकतालिका / शैक्षणिक रिकॉर्ड — डिजिलॉकर",
    kn: "ಅಂಕಪಟ್ಟಿ / ಶೈಕ್ಷಣಿಕ ದಾಖಲೆ — ಡಿಜಿಲಾಕರ್",
    te: "మార్కుల జాబితా / విద్యా రికార్డు — డిజిలాకర్",
    ta: "மதிப்பெண் சான்றிதழ் / கல்வி ஆவணம் — டிஜிலாக்கர்",
    ml: "മാർക്ക് ഷീറ്റ് / വിദ്യാഭ്യാസ രേഖ — ഡിജിലോക്കർ",
    bn: "নম্বরপত্র / শিক্ষাগত রেকর্ড — ডিজিলকার",
    mr: "गुणपत्रिका / शैक्षणिक नोंद — डिजीलॉकर",
    gu: "માર્કશીટ / શૈક્ષણિક રેકોર્ડ — ડિજીલોકર"
  },
  "marksheet / academic record": {
    en: "Marksheet / Academic Record — DigiLocker",
    hi: "अंकतालिका / शैक्षणिक रिकॉर्ड — डिजिलॉकर",
    kn: "ಅಂಕಪಟ್ಟಿ / ಶೈಕ್ಷಣಿಕ ದಾಖಲೆ — ಡಿಜಿಲಾಕರ್",
    te: "మార్కుల జాబితా / విద్యా రికార్డు — డిజిలాకర్",
    ta: "மதிப்பெண் சான்றிதழ் / கல்வி ஆவணம் — டிஜிலாக்கர்",
    ml: "മാർക്ക് ഷീറ്റ് / വിദ്യാഭ്യാസ രേഖ — ഡിജിലോക്കർ",
    bn: "নম্বরপত্র / শিক্ষাগত রেকর্ড — ডিজিলকার",
    mr: "गुणपत्रिका / शैक्षणिक नोंद — डिजीलॉकर",
    gu: "માર્કશીટ / શૈક્ષણિક રેકોર્ડ — ડિજીલોકર"
  },
  "state residence proof": {
    hi: "राज्य निवास प्रमाण पत्र",
    kn: "ಕರ್ನಾಟಕ ವಾಸಸ್ಥಳ ಪುರಾವೆ",
    te: "రాష్ట్ర నివాస ధృవీకరణ",
    ta: "மாநில இருப்பிடச் சான்று",
    ml: "സംസ്ഥാന താമസ തെളിവ്",
    bn: "রাজ্য বাসস্থানের প্রমাণপত্র",
    mr: "राज्य रहिवासी दाखला",
    gu: "રાજ્ય રહેઠાણ પુરાવો"
  },
};

export const schemeTranslations: Record<string, Record<string, any>> = rawSchemeTranslations as Record<string, Record<string, any>>;

export function getLocalizedScheme(scheme: Scheme, language: string): Scheme {
  if (!scheme || !language || language === "en") {
    return scheme;
  }

  const lang = language.toLowerCase().trim();
  const translation = schemeTranslations[scheme.id]?.[lang];
  const catTrans = categoryTranslations[scheme.category]?.[lang] || scheme.category;

  const localizedStateScope = scheme.state_scope.map((s) => {
    if (s === "All") {
      const allLabels: Record<string, string> = {
        hi: "सभी राज्य",
        kn: "ಎಲ್ಲಾ ರಾಜ್ಯಗಳು",
        te: "అన్ని రాష్ట్రాలు",
        ta: "அனைத்து மாநிலங்கள்",
        ml: "എല്ലാ സംസ്ഥാനങ്ങളും",
        bn: "সকল রাজ্য",
        mr: "सर्व राज्ये",
        gu: "તમામ રાજ્યો"
      };
      return allLabels[lang] || s;
    }
    if (s === "Karnataka") {
      const knLabels: Record<string, string> = {
        hi: "कर्नाटक",
        kn: "ಕರ್ನಾಟಕ",
        te: "కర్ణాటక",
        ta: "கர்நாடகா",
        ml: "കർണാടക",
        bn: "কর্ণাটক",
        mr: "कर्नाटक",
        gu: "કર્ણાટક"
      };
      return knLabels[lang] || s;
    }
    return s;
  });

  if (!translation) {
    return {
      ...scheme,
      category: catTrans,
      state_scope: localizedStateScope,
    };
  }

  return {
    ...scheme,
    description: translation.description || scheme.description,
    category: catTrans,
    state_scope: localizedStateScope,
    benefits: translation.benefits && translation.benefits.length ? translation.benefits : scheme.benefits,
    eligibility: translation.eligibility && translation.eligibility.length ? translation.eligibility : scheme.eligibility,
    required_documents: translation.required_documents && translation.required_documents.length ? translation.required_documents : scheme.required_documents,
    application_steps: translation.application_steps && translation.application_steps.length ? translation.application_steps : scheme.application_steps,
    department: translation.department || scheme.department,
  };
}

export function getLocalizedDocumentName(docName: string, language: string): string {
  if (!docName) return "";
  const lang = (language || "en").toLowerCase().trim();
  const key = docName.toLowerCase().trim();
  const normalizedKey = key.replace(/_/g, " ");

  if (lang === "en") {
    if (documentTranslations[key]?.en) return documentTranslations[key].en;
    if (documentTranslations[normalizedKey]?.en) return documentTranslations[normalizedKey].en;
    if (key === "marksheet_academic_record" || key === "marksheet" || key === "academic_record") {
      return "Marksheet / Academic Record — DigiLocker";
    }
    return normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);
  }

  return (
    documentTranslations[key]?.[lang] ||
    documentTranslations[normalizedKey]?.[lang] ||
    documentTranslations[key]?.en ||
    documentTranslations[normalizedKey]?.en ||
    docName
  );
}
