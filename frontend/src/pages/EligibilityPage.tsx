import { useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, XCircle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ProfileForm } from "../components/ProfileForm";
import { SectionCard } from "../components/SectionCard";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";
import { getLocalizedScheme } from "../utils/schemeLocalization";

export function EligibilityPage() {
  const { profile, setProfile, schemes, language } = useAppContext();
  const location = useLocation();
  const [schemeId, setSchemeId] = useState(location.state?.prefillScheme || "pm-kisan");
  const [result, setResult] = useState<any | null>(null);

  const localizedSchemes = schemes.map((s) => getLocalizedScheme(s, language));
  const schemeSelectLabel =
    language === "hi"
      ? "मूल्यांकन के लिए योजना चुनें"
      : language === "kn"
      ? "ಮೌಲ್ಯಮಾಪನ ಮಾಡಲು ಯೋಜನೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ"
      : "Select Scheme to Evaluate";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <SectionCard title={t(language, "eligibilityProfile")}>
        <div className="mb-4" data-tour="eligibility-scheme-select">
          <label htmlFor="eligibility-scheme" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            {schemeSelectLabel}
          </label>
          <select id="eligibility-scheme" data-tour="eligibility-scheme-select" className="min-h-12 w-full rounded-xl border p-3 bg-white" value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
            {localizedSchemes.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>
                {scheme.name} ({scheme.category})
              </option>
            ))}
          </select>
        </div>
        <div data-tour="eligibility-check-btn">
          <ProfileForm
            initialValue={profile}
            submitLabel={t(language, "runEligibility")}
            onSubmit={async (nextProfile) => {
              setProfile(nextProfile);
              const res = await api.post("/api/check-eligibility", { scheme_id: schemeId, profile: nextProfile });
              setResult(res.data);
            }}
          />
        </div>
      </SectionCard>


      <SectionCard title={t(language, "result")}>
        {!result && <p className="text-sm text-slate-600">{t(language, "fillProfileRunCheck")}</p>}
        {result && (
          <div className="space-y-3">
            <div className={`rounded-xl p-4 font-bold text-white shadow-xs ${result.status === "eligible" ? "bg-emerald-700" : result.status === "not_eligible" ? "bg-red-700" : "bg-amber-600"}`}>
              {result.status === "eligible"
                ? (language === "hi" ? "✓ आप योग्य हैं" : language === "kn" ? "✓ ನೀವು ಅರ್ಹರಾಗಿದ್ದೀರಿ" : "ELIGIBLE")
                : result.status === "not_eligible"
                ? (language === "hi" ? "✕ आप योग्य नहीं हैं" : language === "kn" ? "✕ ನೀವು ಅರ್ಹರಾಗಿಲ್ಲ" : "NOT ELIGIBLE")
                : (language === "hi" ? "ⓘ अधिक जानकारी की आवश्यकता है" : language === "kn" ? "ⓘ ಹೆಚ್ಚಿನ ಮಾಹಿತಿ ಅಗತ್ಯವಿದೆ" : "NEEDS MORE INFORMATION")}
            </div>

            <p className="text-sm leading-relaxed text-slate-800">{result.explanation}</p>
            <p className="text-sm">
              <span className="font-semibold text-slate-900">{t(language, "nextAction")}:</span> {result.next_action}
            </p>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-900">
                  <CheckCircle2 size={18} /> {t(language, "matched")}
                </div>
                {result.matched.length ? (
                  result.matched.map((item: string) => <div key={item} className="text-sm text-emerald-900">✓ {item}</div>)
                ) : (
                  <div className="text-sm text-slate-500">{t(language, "none")}</div>
                )}
              </div>

              <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
                <div className="mb-2 flex items-center gap-2 font-semibold text-red-900">
                  <XCircle size={18} /> {t(language, "failed")}
                </div>
                {result.failed.length ? (
                  result.failed.map((item: string) => <div key={item} className="text-sm text-red-900">✕ {item}</div>)
                ) : (
                  <div className="text-sm text-slate-500">{t(language, "none")}</div>
                )}
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3">
                <div className="mb-2 flex items-center gap-2 font-semibold text-amber-900">
                  <AlertTriangle size={18} /> {t(language, "missing")}
                </div>
                {result.missing.length ? (
                  result.missing.map((item: string) => <div key={item} className="text-sm text-amber-900">! {item}</div>)
                ) : (
                  <div className="text-sm text-slate-500">{t(language, "none")}</div>
                )}

                {(result.failed.some((item: string) => item.toLowerCase().includes("document")) || result.missing.length > 0) && (
                  <Link to="/documents" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-sahaya-green border">
                    <FileUp size={16} /> {t(language, "uploadThisDocument")}
                  </Link>
                )}
              </div>
            </div>

            <div className="text-sm">
              <span className="font-semibold text-slate-900">{t(language, "alternativeSchemes")}:</span>{" "}
              {result.alternative_schemes.join(", ") || t(language, "none")}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
