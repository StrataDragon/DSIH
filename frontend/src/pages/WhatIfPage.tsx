import { useState, useEffect } from "react";
import {
  GitCompareArrows,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ArrowDown,
  Info,
  TrendingUp,
  FileCheck2,
  RotateCcw,
} from "lucide-react";
import { SectionCard } from "../components/SectionCard";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";
import { getLocalizedScheme } from "../utils/schemeLocalization";
import { ALL_INDIAN_STATES_AND_UTS } from "../data/indianStates";

// Reusable status configuration for citizen-friendly display
export function getStatusConfig(status: string | undefined | null) {
  switch (status) {
    case "eligible":
      return {
        label: "Eligible",
        subLabel: "Criteria met",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
        borderClass: "border-emerald-200",
        bgClass: "bg-emerald-50/70",
        iconColor: "text-emerald-600",
        icon: CheckCircle2,
        description: "All deterministic scheme criteria are satisfied.",
      };
    case "document_verification_required":
      return {
        label: "Verification Required",
        subLabel: "Pending authentic document",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
        borderClass: "border-amber-200",
        bgClass: "bg-amber-50/70",
        iconColor: "text-amber-600",
        icon: ShieldAlert,
        description:
          "Eligibility cannot be confirmed because a required document has not passed verification.",
      };
    case "not_eligible":
      return {
        label: "Not Currently Eligible",
        subLabel: "Criteria not met",
        badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
        borderClass: "border-rose-200",
        bgClass: "bg-rose-50/70",
        iconColor: "text-rose-600",
        icon: XCircle,
        description: "One or more deterministic eligibility conditions are not met.",
      };
    case "needs_more_information":
      return {
        label: "More Information Needed",
        subLabel: "Profile details incomplete",
        badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
        borderClass: "border-blue-200",
        bgClass: "bg-blue-50/70",
        iconColor: "text-blue-600",
        icon: HelpCircle,
        description: "Additional profile details are required to complete this evaluation.",
      };
    default:
      return {
        label: status
          ? status
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())
          : "Status Pending",
        subLabel: "Awaiting evaluation",
        badgeClass: "bg-slate-100 text-slate-800 border-slate-300",
        borderClass: "border-slate-200",
        bgClass: "bg-slate-50",
        iconColor: "text-slate-600",
        icon: AlertCircle,
        description: "Evaluation completed.",
      };
  }
}

// Reusable transition summary evaluation
interface TransitionSummary {
  title: string;
  subtitle: string;
  bannerClass: string;
  icon: any;
  iconClass: string;
}

export function getTransitionSummary(before: any, after: any): TransitionSummary {
  const beforeStatus = before?.status;
  const afterStatus = after?.status;
  const beforeEligible = Boolean(before?.eligible);
  const afterEligible = Boolean(after?.eligible);

  // Exact same outcome
  if (beforeStatus === afterStatus && beforeEligible === afterEligible) {
    if (afterEligible) {
      return {
        title: "No Eligibility Change",
        subtitle: "You remain eligible under both your current profile and the simulated changes.",
        bannerClass: "border-emerald-200 bg-emerald-50 text-emerald-900",
        icon: CheckCircle2,
        iconClass: "text-emerald-600",
      };
    }
    if (afterStatus === "document_verification_required") {
      return {
        title: "Eligibility Cannot Be Confirmed",
        subtitle: "Document verification is required under both current and simulated profiles.",
        bannerClass: "border-amber-200 bg-amber-50 text-amber-900",
        icon: ShieldAlert,
        iconClass: "text-amber-600",
      };
    }
    return {
      title: "No Eligibility Change",
      subtitle: "The simulated values do not alter your eligibility outcome for this scheme.",
      bannerClass: "border-slate-200 bg-slate-50 text-slate-800",
      icon: GitCompareArrows,
      iconClass: "text-slate-600",
    };
  }

  // Transitions
  if (!beforeEligible && afterEligible) {
    return {
      title: "🎉 Your Eligibility Changed: Now Eligible!",
      subtitle: "The simulated profile satisfies all criteria required by this scheme.",
      bannerClass: "border-emerald-300 bg-emerald-50 text-emerald-900",
      icon: Sparkles,
      iconClass: "text-emerald-600",
    };
  }

  if (beforeEligible && !afterEligible) {
    return {
      title: "⚠️ Your Eligibility Changed: No Longer Eligible",
      subtitle: "The simulated profile causes one or more required conditions to fail.",
      bannerClass: "border-rose-300 bg-rose-50 text-rose-900",
      icon: AlertTriangle,
      iconClass: "text-rose-600",
    };
  }

  if (afterStatus === "document_verification_required") {
    return {
      title: "Eligibility Cannot Be Confirmed",
      subtitle:
        "Verification Required — Core criteria are satisfied, but an official verified document is required.",
      bannerClass: "border-amber-300 bg-amber-50 text-amber-900",
      icon: ShieldAlert,
      iconClass: "text-amber-600",
    };
  }

  if (afterStatus === "needs_more_information") {
    return {
      title: "Eligibility Cannot Be Confirmed",
      subtitle: "Additional profile details are required before eligibility can be verified.",
      bannerClass: "border-blue-300 bg-blue-50 text-blue-900",
      icon: HelpCircle,
      iconClass: "text-blue-600",
    };
  }

  return {
    title: "Your Eligibility Changed",
    subtitle: "The simulated changes resulted in a different evaluation outcome.",
    bannerClass: "border-indigo-200 bg-indigo-50 text-indigo-900",
    icon: TrendingUp,
    iconClass: "text-indigo-600",
  };
}

// Compute clean human-readable attribute diffs
interface AttributeDiff {
  label: string;
  beforeVal: string;
  afterVal: string;
}

function computeAttributeDiffs(currentProfile: any, simulated: any): AttributeDiff[] {
  const diffs: AttributeDiff[] = [];

  // Age
  const beforeAge =
    currentProfile?.age !== undefined && currentProfile?.age !== null
      ? `${currentProfile.age} yrs`
      : "Not specified";
  const afterAge =
    simulated?.age !== undefined && simulated?.age !== ""
      ? `${simulated.age} yrs`
      : beforeAge;
  if (afterAge !== beforeAge) {
    diffs.push({ label: "Age", beforeVal: beforeAge, afterVal: afterAge });
  }

  // Income
  const beforeIncome =
    currentProfile?.income !== undefined && currentProfile?.income !== null
      ? `₹${Number(currentProfile.income).toLocaleString("en-IN")}`
      : "Not specified";
  const afterIncome =
    simulated?.income !== undefined && simulated?.income !== ""
      ? `₹${Number(simulated.income).toLocaleString("en-IN")}`
      : beforeIncome;
  if (afterIncome !== beforeIncome) {
    diffs.push({ label: "Income", beforeVal: beforeIncome, afterVal: afterIncome });
  }

  // Occupation
  const beforeOcc = currentProfile?.occupation || "Not specified";
  const afterOcc = simulated?.occupation || beforeOcc;
  if (afterOcc.toLowerCase() !== beforeOcc.toLowerCase()) {
    diffs.push({ label: "Occupation", beforeVal: beforeOcc, afterVal: afterOcc });
  }

  // State
  const beforeState = currentProfile?.state || "Not specified";
  const afterState = simulated?.state || beforeState;
  if (afterState !== beforeState) {
    diffs.push({ label: "State", beforeVal: beforeState, afterVal: afterState });
  }

  // Landholding
  const beforeLand =
    currentProfile?.landholding !== undefined && currentProfile?.landholding !== null
      ? `${currentProfile.landholding} acres`
      : "0 acres";
  const afterLand =
    simulated?.landholding !== undefined && simulated?.landholding !== ""
      ? `${simulated.landholding} acres`
      : beforeLand;
  if (afterLand !== beforeLand) {
    diffs.push({ label: "Landholding", beforeVal: beforeLand, afterVal: afterLand });
  }

  // Disability
  const beforeDis = currentProfile?.disability ? "Yes" : "No";
  const afterDis = simulated?.disability ? "Yes" : "No";
  if (afterDis !== beforeDis) {
    diffs.push({ label: "Disability Status", beforeVal: beforeDis, afterVal: afterDis });
  }

  return diffs;
}

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
  const [simulatedSnapshot, setSimulatedSnapshot] = useState<any | null>(null);

  // Synchronize field inputs when profile changes
  useEffect(() => {
    setAge(profile.age ?? "");
    setState(profile.state ?? "");
    setOccupation(profile.occupation ?? "");
    setIncome(profile.income ?? "");
    setLandholding(profile.landholding ?? "");
    setDisability(profile.disability ?? false);
  }, [profile]);

  const localizedSchemes = schemes.map((s) => getLocalizedScheme(s, language));

  const handleReset = () => {
    setAge(profile.age ?? "");
    setState(profile.state ?? "");
    setOccupation(profile.occupation ?? "");
    setIncome(profile.income ?? "");
    setLandholding(profile.landholding ?? "");
    setDisability(profile.disability ?? false);
    setResult(null);
    setError(null);
  };

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
      setSimulatedSnapshot({ age, state, occupation, income, landholding, disability });
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail || err?.message || "Failed to recalculate rules.";
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

  const beforeConfig = result ? getStatusConfig(result.before?.status) : null;
  const afterConfig = result ? getStatusConfig(result.after?.status) : null;
  const transition = result ? getTransitionSummary(result.before, result.after) : null;
  const attributeDiffs =
    result && simulatedSnapshot ? computeAttributeDiffs(profile, simulatedSnapshot) : [];

  const selectedSchemeObj = schemes.find((s) => s.id === schemeId);

  return (
    <div className="w-full max-w-full overflow-hidden space-y-4">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr] items-start">
        {/* Left Column: Simulation Form */}
        <SectionCard title={t(language, "whatIf")}>
          <p className="mb-3 text-sm text-slate-600">{t(language, "whatIfHelp")}</p>

          {/* Simulation Disclaimer */}
          <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-900">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-indigo-600" />
            <div>
              <span className="font-semibold">Interactive Simulation:</span> Values entered
              here are for scenario exploration and{" "}
              <span className="font-semibold underline">
                will not modify your actual profile
              </span>
              .
            </div>
          </div>

          {/* Scheme Selector */}
          <div className="mb-4">
            <label
              htmlFor="whatif-scheme"
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
            >
              {schemeSelectLabel}
            </label>
            <select
              id="whatif-scheme"
              className="min-h-12 w-full rounded-xl border border-slate-300 p-3 bg-white text-slate-800 focus:border-emerald-500 focus:outline-none"
              value={schemeId}
              onChange={(e) => {
                setSchemeId(e.target.value);
                setResult(null); // Clear stale results when switching scheme
              }}
            >
              {localizedSchemes.map((scheme) => (
                <option key={scheme.id} value={scheme.id}>
                  {scheme.name} ({scheme.category})
                </option>
              ))}
            </select>
            {selectedSchemeObj && (
              <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                {selectedSchemeObj.description}
              </p>
            )}
          </div>

          {/* Profile Simulation Fields */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Age */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t(language, "age")}
              </label>
              <input
                className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
                placeholder={t(language, "age")}
                type="number"
                min="0"
                max="130"
                value={age}
                onKeyDown={(e) => {
                  if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+")
                    e.preventDefault();
                }}
                onChange={(e) =>
                  setAge(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))
                }
              />
              {age !== "" && (
                <p className="mt-1 text-xs text-slate-500">
                  Simulated Age:{" "}
                  <span className="font-semibold text-slate-700">{age} years</span>
                </p>
              )}
            </div>

            {/* State */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t(language, "state")}
              </label>
              <select
                className="min-h-12 w-full rounded-xl border border-slate-300 p-3 bg-white text-slate-800 focus:border-emerald-500 focus:outline-none"
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
                className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
                placeholder={t(language, "occupation")}
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
              />
            </div>

            {/* Income */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t(language, "income")} (Annual)
              </label>
              <input
                className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
                placeholder={t(language, "income")}
                type="number"
                min="0"
                step="1000"
                value={income}
                onKeyDown={(e) => {
                  if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+")
                    e.preventDefault();
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
              {income !== "" && !isNaN(Number(income)) && (
                <p className="mt-1 text-xs text-slate-500">
                  Formatted:{" "}
                  <span className="font-semibold text-emerald-700">
                    ₹{Number(income).toLocaleString("en-IN")}
                  </span>
                </p>
              )}
            </div>

            {/* Landholding */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t(language, "landholding")} (Acres)
              </label>
              <input
                className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
                placeholder={t(language, "landholding")}
                type="number"
                min="0"
                step="0.1"
                value={landholding}
                onKeyDown={(e) => {
                  if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+")
                    e.preventDefault();
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
              {landholding !== "" && !isNaN(Number(landholding)) && (
                <p className="mt-1 text-xs text-slate-500">
                  Simulated:{" "}
                  <span className="font-semibold text-emerald-700">
                    {landholding} acres
                  </span>
                </p>
              )}
            </div>

            {/* Disability */}
            <div className="flex items-center">
              <label className="flex min-h-12 w-full items-center gap-2 rounded-xl border border-slate-300 p-3 bg-white cursor-pointer hover:bg-slate-50 transition">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  checked={disability}
                  onChange={(e) => setDisability(e.target.checked)}
                />
                <span className="text-sm font-medium text-slate-800">
                  {t(language, "disability")}
                </span>
              </label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={handleRecalculate}
              disabled={loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sahaya-green px-6 font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Simulating Rules...</span>
                </>
              ) : (
                <>
                  <GitCompareArrows size={18} />
                  <span>{t(language, "recalculate")}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={loading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              title="Reset fields to match your current profile"
            >
              <RotateCcw size={16} />
              <span>Reset to Profile</span>
            </button>
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </SectionCard>

        {/* Right Column: Before -> After Results */}
        <SectionCard title={t(language, "beforeAfter")}>
          {!result && (
            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 mb-3">
                <GitCompareArrows size={24} />
              </div>
              <h3 className="text-base font-semibold text-slate-800 mb-1">
                Ready to Test What-If Scenarios
              </h3>
              <p className="max-w-md text-sm text-slate-500 mb-4">
                Modify values like income, occupation, age, or landholding on the left and
                click <span className="font-semibold text-emerald-700">"Recalculate"</span> to
                observe how Tech Sahaya's deterministic rules respond.
              </p>
              <div className="text-xs text-slate-400">
                Authoritative evaluation powered by Tech Sahaya Eligibility Engine
              </div>
            </div>
          )}

          {result && beforeConfig && afterConfig && transition && (
            <div className="space-y-4 max-w-full overflow-hidden">
              {/* Transition Summary Banner */}
              <div
                className={`flex items-start gap-3 rounded-2xl border p-4 shadow-sm ${transition.bannerClass}`}
              >
                <div className="mt-0.5 shrink-0">
                  <transition.icon size={22} className={transition.iconClass} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold leading-snug break-words">
                    {transition.title}
                  </h3>
                  <p className="mt-0.5 text-xs sm:text-sm opacity-90 break-words">
                    {transition.subtitle}
                  </p>
                </div>
              </div>

              {/* Before vs After Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                {/* BEFORE CARD */}
                <div
                  className={`flex flex-col justify-between rounded-2xl border ${beforeConfig.borderClass} ${beforeConfig.bgClass} p-4 shadow-sm overflow-hidden`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {t(language, "before")} (Current)
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        Score: {result.before?.score ?? 0}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <beforeConfig.icon
                        size={20}
                        className={`${beforeConfig.iconColor} shrink-0`}
                      />
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-bold break-words ${beforeConfig.badgeClass}`}
                      >
                        {beforeConfig.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed break-words">
                      {result.before?.explanation || beforeConfig.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>
                      Matched:{" "}
                      <strong className="text-emerald-700">
                        {result.before?.matched?.length ?? 0}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Failed:{" "}
                      <strong className="text-rose-700">
                        {result.before?.failed?.length ?? 0}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* AFTER CARD */}
                <div
                  className={`flex flex-col justify-between rounded-2xl border ${afterConfig.borderClass} ${afterConfig.bgClass} p-4 shadow-sm overflow-hidden`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {t(language, "after")} (Simulated)
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        Score: {result.after?.score ?? 0}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                      <afterConfig.icon
                        size={20}
                        className={`${afterConfig.iconColor} shrink-0`}
                      />
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full border text-xs font-bold break-words ${afterConfig.badgeClass}`}
                      >
                        {afterConfig.label}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed break-words">
                      {result.after?.explanation || afterConfig.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>
                      Matched:{" "}
                      <strong className="text-emerald-700">
                        {result.after?.matched?.length ?? 0}
                      </strong>
                    </span>
                    <span>•</span>
                    <span>
                      Failed:{" "}
                      <strong className="text-rose-700">
                        {result.after?.failed?.length ?? 0}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Simulated Attribute Changes */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <GitCompareArrows size={16} className="text-emerald-600 shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Simulated Attribute Changes
                  </h4>
                </div>

                {attributeDiffs.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    No attributes were modified in this simulation run. Current profile matches
                    simulated fields.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {attributeDiffs.map((diff) => (
                      <div
                        key={diff.label}
                        className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs"
                      >
                        <div className="font-semibold text-slate-500 mb-1">{diff.label}</div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="line-through text-slate-400 break-all">
                            {diff.beforeVal}
                          </span>
                          <ArrowRight size={12} className="text-emerald-600 shrink-0" />
                          <span className="font-bold text-slate-900 break-all">
                            {diff.afterVal}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Rule Changes Explanation */}
              <div className="rounded-2xl border border-slate-200 bg-stone-50/80 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Info size={16} className="text-slate-600 shrink-0" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    {t(language, "changedRule")}
                  </h4>
                </div>

                {result.changed_rules && result.changed_rules.length > 0 ? (
                  <div className="space-y-1.5 mt-2">
                    {result.changed_rules.map((ruleStr: string, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 rounded-lg bg-white border border-slate-200 p-2 text-xs text-slate-700 break-words"
                      >
                        <FileCheck2 size={14} className="mt-0.5 text-emerald-600 shrink-0" />
                        <span className="font-mono text-[11px] text-slate-800 break-all">
                          {ruleStr}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {t(language, "noRuleChange")} — The modified attributes did not trigger a
                    change in which specific rule conditions passed or failed.
                  </p>
                )}

                {result.after?.next_action && (
                  <div className="mt-3 pt-3 border-t border-slate-200/80 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">Recommended Action: </span>
                    <span className="break-words">{result.after.next_action}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
