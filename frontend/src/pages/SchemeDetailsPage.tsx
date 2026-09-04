import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SectionCard } from "../components/SectionCard";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";
import { getLocalizedScheme } from "../utils/schemeLocalization";

export function SchemeDetailsPage() {
  const { schemeId } = useParams();
  const { language, profile } = useAppContext();
  const [data, setData] = useState<any | null>(null);
  const [eligibilityResult, setEligibilityResult] = useState<any | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  useEffect(() => {
    api.get(`/api/schemes/${schemeId}`).then((res) => setData(res.data)).catch(() => setData(null));
  }, [schemeId]);

  const handleCheckEligibility = async () => {
    if (isOfflineMode || !navigator.onLine) {
      // TRUE OFFLINE EDGE COMPUTING
      const { evaluateOfflineEligibility } = await import("../utils/offlineEngine");
      
      try {
        const ruleRes = await api.get(`/api/schemes/${schemeId}/rules`);
        const cachedRule = ruleRes.data;
        
        const result = evaluateOfflineEligibility(schemeId as string, profile, cachedRule);
        setEligibilityResult(result);
        setShowModal(true);
      } catch (e) {
        setEligibilityResult({
          status: "not_eligible",
          explanation: "Rule definition missing in offline cache. Cannot evaluate offline without downloaded rules.",
          failed: ["Cannot evaluate offline without downloaded rules."],
          missing: []
        });
        setShowModal(true);
      }
      return;
    }

    try {
      const res = await api.post("/api/check-eligibility", {
        scheme_id: schemeId,
        profile: profile,
      });
      setEligibilityResult(res.data);
      setShowModal(true);
    } catch (error) {
      console.error(error);
    }
  };

  if (!data) return <p className="p-4 text-sm text-slate-600">{t(language, "loadingAnswer")}</p>;

  const scheme = getLocalizedScheme(data.scheme, language);

  return (
    <div className="space-y-4">
      {/* Offline Mode Demo Toggle */}
      <div className="flex items-center justify-between rounded-2xl bg-slate-900 p-4 text-white shadow-lg">
        <div>
          <div className="font-bold flex items-center gap-2">
            <span className={isOfflineMode ? "h-3 w-3 rounded-full bg-red-500 animate-pulse" : "h-3 w-3 rounded-full bg-green-500"}></span>
            {isOfflineMode ? "CSC Offline Edge Mode ACTIVE" : "Cloud Connection ACTIVE"}
          </div>
          <div className="text-xs text-slate-300 mt-1">
            {isOfflineMode 
              ? "Running rules locally on device. No internet required." 
              : "Connected to Tech Sahaya backend servers."}
          </div>
        </div>
        <button 
          onClick={() => setIsOfflineMode(!isOfflineMode)}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition ${isOfflineMode ? 'bg-red-500 hover:bg-red-600' : 'bg-slate-700 hover:bg-slate-600'}`}
        >
          {isOfflineMode ? "Disable Offline Mode" : "Simulate Village Offline Mode"}
        </button>
      </div>
      {showModal && eligibilityResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-4">
              {eligibilityResult.status === "eligible" 
                ? "🎉 You are eligible!" 
                : "⚠️ Why you are not eligible for this scheme"}
            </h2>
            <div className="space-y-3 mb-6 text-sm">
              <p><strong>Status:</strong> {eligibilityResult.status.toUpperCase()}</p>
              <p><strong>Explanation:</strong> {eligibilityResult.explanation}</p>
              
              {eligibilityResult.failed && eligibilityResult.failed.length > 0 && (
                <div>
                  <strong className="text-red-700">Reasons for ineligibility:</strong>
                  <ul className="list-disc pl-5 text-red-600 mt-1">
                    {eligibilityResult.failed.map((reason: string, i: number) => <li key={i}>{reason}</li>)}
                  </ul>
                </div>
              )}
              
              {eligibilityResult.missing && eligibilityResult.missing.length > 0 && (
                <div>
                  <strong className="text-amber-700">Missing Information:</strong>
                  <ul className="list-disc pl-5 text-amber-600 mt-1">
                    {eligibilityResult.missing.map((item: string, i: number) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <button onClick={() => setShowModal(false)} className="w-full rounded-xl bg-slate-900 py-3 font-bold text-white">
              Close
            </button>
          </div>
        </div>
      )}

      <SectionCard title={scheme.name}>
        <p className="leading-relaxed text-slate-700">{scheme.description}</p>
        <p className="mt-3 text-sm font-medium text-slate-600">
          <span className="font-semibold">{t(language, "category")}:</span> {scheme.category} | <span className="font-semibold">{t(language, "coverage")}:</span> {scheme.state_scope.join(", ")}
        </p>
        <p className="text-sm text-slate-600">
          <span className="font-semibold">{t(language, "verificationStatus")}:</span> {t(language, "lastVerified")} {scheme.last_verified}
        </p>
        <p className="text-sm text-slate-600">
          <span className="font-semibold">{t(language, "department")}:</span> {scheme.department}
        </p>
        {data.conflicts && data.conflicts.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{data.conflicts[0]}</div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={handleCheckEligibility} className="inline-flex min-h-12 items-center rounded-xl bg-sahaya-green px-4 font-semibold text-white hover:bg-sahaya-green/90 transition">
            {t(language, "checkMyEligibility")}
          </button>
          <button 
            onClick={async () => {
              const { generateApplicationPDF } = await import("../utils/pdfGenerator");
              await generateApplicationPDF(profile, scheme.name);
            }} 
            className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 transition"
          >
            Generate Auto-Filled PDF
          </button>
          <button onClick={() => api.post("/api/schemes/save", { scheme_id: scheme.id })} className="inline-flex min-h-12 items-center rounded-xl border px-4 font-semibold">
            {t(language, "saveScheme")}
          </button>
          <a href={String(scheme.official_link)} target="_blank" className="inline-flex min-h-12 items-center rounded-xl border px-4 font-semibold" rel="noreferrer">
            {t(language, "officialSource")} →
          </a>
        </div>
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title={t(language, "benefitsForYou")}>
          <ul className="space-y-2 text-sm text-slate-700">
            {scheme.benefits.map((item: string) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-sahaya-green font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title={t(language, "eligibility")}>
          <ul className="space-y-2 text-sm text-slate-700">
            {scheme.eligibility.map((item: string) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-sahaya-green font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title={t(language, "requiredDocuments")}>
          <ul className="space-y-2 text-sm text-slate-700">
            {scheme.required_documents.map((item: string) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-sahaya-green font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title={t(language, "applicationSteps")}>
          <ol className="space-y-2 text-sm text-slate-700">
            {scheme.application_steps.map((item: string, idx: number) => (
              <li key={item} className="flex items-start gap-2">
                <span className="font-bold text-sahaya-green">{idx + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </SectionCard>

        <SectionCard title={t(language, "evidenceSource")}>
          <div className="space-y-1 text-sm text-slate-700">
            <div><span className="font-semibold">{t(language, "officialSource")}:</span> {scheme.source_name}</div>
            <div><span className="font-semibold">{t(language, "lastVerified")}:</span> {scheme.last_verified}</div>
            <div className="mt-2 text-xs text-slate-600">{scheme.source_reference}</div>
          </div>
        </SectionCard>

        <SectionCard title={t(language, "alternatives")}>
          {scheme.alternative_scheme_ids.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {scheme.alternative_scheme_ids.map((item: string) => (
                <Link key={item} to={`/schemes/${item}`} className="rounded-lg border bg-stone-50 px-3 py-1.5 text-xs font-semibold text-sahaya-green">
                  {item}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">{t(language, "none")}</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
