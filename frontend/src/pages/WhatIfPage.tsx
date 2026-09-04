import { useState, useEffect } from "react";
import { GitCompareArrows, Loader2 } from "lucide-react";
import { SectionCard } from "../components/SectionCard";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";
import { getLocalizedScheme } from "../utils/schemeLocalization";
import { INDIAN_STATES, INDIAN_UNION_TERRITORIES, ALL_INDIAN_STATES_AND_UTS } from "../data/indianStates";

export function WhatIfPage() {
  const { profile, schemes, language } = useAppContext();
  const [schemeId, setSchemeId] = useState("pm-kisan");

  // Local state for simulated profile fields, initialized from current profile
  const [age, setAge] = useState<number | "">(profile.age ?? "");
  const [state, setState] = useState<string>(profile.state ?? "");
  const [occupation, setOccupation] = useState<string>(profile.occupation ?? "");
  const [income, setIncome] = useState<number | "">(profile.income ?? "");
  const [landholding, setLandholding] = useState<number | "">(profile.landholding ?? "");
  const [disability, setDisability] = useState<boolean>(profile.disability ?? false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  // Synchronize field inputs when profile changes (e.g. via loadPersona)
  useEffect(() => {
    setAge(profile.age ?? "");
    setState(profile.state ?? "");
    setOccupation(profile.occupation ?? "");
    setIncome(profile.income ?? "");
    setLandholding(profile.landholding ?? "");
    setDisability(profile.disability ?? false);
  }, [profile]);

  const localizedSchemes = schemes.map((s) => getLocalizedScheme(s, language));

  const handleRecalculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const simulatedChanges: Record<string, any> = {
        age: age === "" ? undefined : Number(age),
        state: state || undefined,
        occupation: occupation || undefined,
        income: income === "" ? undefined : Number(income),
        landholding: landholding === "" ? undefined : Number(landholding),
        disability,
      };

      const response = await api.post("/api/what-if", {
        scheme_id: schemeId,
        current_profile: profile,
        simulated_changes: simulatedChanges,
      });
      setResult(response.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || "Failed to recalculate rules.";
      setError(detail);
    } finally {
      setLoading(false);
    }
  };

  const schemeSelectLabel =
    language === "hi"
      ? "मूल्यांकन के लिए योजना चुनें"
      : language === "kn"
      ? "ಮೌಲ್ಯಮಾಪನ ಮಾಡಲು ಯೋಜನೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ"
      : "Select Scheme to Evaluate";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <SectionCard title={t(language, "whatIf")}>
        <p className="mb-4 text-sm text-slate-600">{t(language, "whatIfHelp")}</p>

        {/* Scheme Selector */}
        <div className="mb-4">
          <label htmlFor="whatif-scheme" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            {schemeSelectLabel}
          </label>
          <select
            id="whatif-scheme"
            className="min-h-12 w-full rounded-xl border p-3 bg-white"
            value={schemeId}
            onChange={(e) => setSchemeId(e.target.value)}
          >
            {localizedSchemes.map((scheme) => (
              <option key={scheme.id} value={scheme.id}>
                {scheme.name} ({scheme.category})
              </option>
            ))}
          </select>
        </div>

        {/* Profile Simulation Fields */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Age */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t(language, "age")}
            </label>
            <input
              className="min-h-12 w-full rounded-xl border p-3"
              placeholder={t(language, "age")}
              type="number"
              min="0"
              max="130"
              value={age}
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
              }}
              onChange={(e) => setAge(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
            />
          </div>

          {/* State */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t(language, "state")}
            </label>
            <select
              className="min-h-12 w-full rounded-xl border p-3 bg-white text-slate-800"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">{t(language, "state")}</option>
              {state && !ALL_INDIAN_STATES_AND_UTS.includes(state as any) && (
                <option value={state}>{state}</option>
              )}
              {ALL_INDIAN_STATES_AND_UTS.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Occupation */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t(language, "occupation")}
            </label>
            <input
              className="min-h-12 w-full rounded-xl border p-3"
              placeholder={t(language, "occupation")}
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
            />
          </div>

          {/* Income */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t(language, "income")}
            </label>
            <input
              className="min-h-12 w-full rounded-xl border p-3"
              placeholder={t(language, "income")}
              type="number"
              min="0"
              step="1000"
              value={income}
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (Number(text) < 0 || text.includes("-")) e.preventDefault();
              }}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : Number(e.target.value);
                setIncome(val === "" ? "" : Math.max(0, isNaN(val) ? 0 : val));
              }}
            />
          </div>

          {/* Landholding */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t(language, "landholding")}
            </label>
            <input
              className="min-h-12 w-full rounded-xl border p-3"
              placeholder={t(language, "landholding")}
              type="number"
              min="0"
              step="0.1"
              value={landholding}
              onKeyDown={(e) => {
                if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (Number(text) < 0 || text.includes("-")) e.preventDefault();
              }}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : Number(e.target.value);
                setLandholding(val === "" ? "" : Math.max(0, isNaN(val) ? 0 : val));
              }}
            />
          </div>

          {/* Disability */}
          <div className="md:col-span-2">
            <label className="flex min-h-12 items-center gap-2 rounded-xl border p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={disability}
                onChange={(e) => setDisability(e.target.checked)}
              />
              <span className="text-sm font-medium">{t(language, "disability")}</span>
            </label>
          </div>
        </div>

        {/* Action button with loading & error display */}
        <button
          onClick={handleRecalculate}
          disabled={loading}
          className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-sahaya-green px-4 font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <GitCompareArrows size={18} />}
          {t(language, "recalculate")}
        </button>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-xl border border-red-200">
            {error}
          </p>
        )}
      </SectionCard>

      {/* Before / After results */}
      <SectionCard title={t(language, "beforeAfter")}>
        {!result && <p className="text-sm text-slate-600">{t(language, "whatIfHelp")}</p>}
        {result && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border p-4">
                <div className="text-sm text-slate-500">{t(language, "before")}</div>
                <div className="text-xl font-bold">{result.before.status}</div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="text-sm text-slate-500">{t(language, "after")}</div>
                <div className="text-xl font-bold">{result.after.status}</div>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-stone-50 p-3">
              {t(language, "changedRule")}: {result.changed_rules.join(", ") || t(language, "noRuleChange")}
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
