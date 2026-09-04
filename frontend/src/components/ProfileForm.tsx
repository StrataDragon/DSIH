import { useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import type { EligibilityProfile } from "../types";
import { t } from "../utils/i18n";
import { INDIAN_STATES, INDIAN_UNION_TERRITORIES, ALL_INDIAN_STATES_AND_UTS } from "../data/indianStates";

const defaults: EligibilityProfile = { available_documents: [] };

export function ProfileForm({
  initialValue,
  onSubmit,
  submitLabel
}: {
  initialValue?: EligibilityProfile;
  onSubmit: (profile: EligibilityProfile) => void;
  submitLabel?: string;
}) {
  const { language } = useAppContext();
  const [form, setForm] = useState<EligibilityProfile>(initialValue || defaults);
  useEffect(() => {
    setForm(initialValue || defaults);
  }, [initialValue]);
  const update = (key: keyof EligibilityProfile, value: string | number | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const buttonText = submitLabel || t(language, "save");

  const DOCUMENT_OPTIONS = [
    { value: "income_certificate", label: t(language, "docIncomeCertificate") },
    { value: "land_record", label: t(language, "docLandRecord") },
    { value: "ration_card", label: t(language, "docRationCard") },
    { value: "disability_certificate", label: t(language, "docDisabilityCertificate") },
    { value: "caste_certificate", label: t(language, "docCasteCertificate") },
    { value: "generic_sample_document", label: t(language, "docGenericSample") },
  ];

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <input
        className="min-h-12 rounded-xl border p-3"
        placeholder={t(language, "age")}
        type="number"
        min="0"
        max="130"
        value={form.age || ""}
        onKeyDown={(e) => {
          if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
        }}
        onChange={(e) => update("age", Math.max(0, Number(e.target.value) || 0))}
      />
      <select className="min-h-12 rounded-xl border p-3" value={form.gender || ""} onChange={(e) => update("gender", e.target.value)}>
        <option value="">{t(language, "gender")}</option>
        <option value="female">{t(language, "female")}</option>
        <option value="male">{t(language, "male")}</option>
      </select>
      <select
        data-tour="profile-state-select"
        className="min-h-12 rounded-xl border p-3 bg-white text-slate-800"
        value={form.state || ""}
        onChange={(e) => update("state", e.target.value)}
      >
        <option value="">{t(language, "state")}</option>
        {form.state && !ALL_INDIAN_STATES_AND_UTS.includes(form.state as any) && (
          <option value={form.state}>{form.state}</option>
        )}
        {ALL_INDIAN_STATES_AND_UTS.map((st) => (
          <option key={st} value={st}>
            {st}
          </option>
        ))}
      </select>
      <input data-tour="profile-occupation-select" className="min-h-12 rounded-xl border p-3" placeholder={t(language, "occupation")} value={form.occupation || ""} onChange={(e) => update("occupation", e.target.value)} />
      <input
        data-tour="profile-income-input"
        className="min-h-12 rounded-xl border p-3"
        placeholder={t(language, "income")}
        type="number"
        min="0"
        value={form.income || ""}
        onKeyDown={(e) => {
          if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
        }}
        onChange={(e) => update("income", Math.max(0, Number(e.target.value) || 0))}
      />
      <input
        className="min-h-12 rounded-xl border p-3"
        placeholder={t(language, "landholding")}
        type="number"
        min="0"
        step="0.1"
        value={form.landholding || ""}
        onKeyDown={(e) => {
          if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
        }}
        onChange={(e) => update("landholding", Math.max(0, Number(e.target.value) || 0))}
      />
      <label className="flex min-h-12 items-center gap-2 rounded-xl border p-3">
        <input type="checkbox" checked={form.disability || false} onChange={(e) => update("disability", e.target.checked)} />
        {t(language, "disability")}
      </label>

      <div className="md:col-span-2 space-y-2">
        <label className="text-sm font-medium text-slate-700">
          {t(language, "requiredDocuments") || "Available Verification Documents"}
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_OPTIONS.map((doc) => (
            <label key={doc.value} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/50 p-3 text-sm cursor-pointer hover:border-sahaya-green transition">
              <input
                type="checkbox"
                className="h-4 w-4 rounded text-sahaya-green focus:ring-sahaya-green"
                checked={(form.available_documents || []).includes(doc.value)}
                onChange={(e) => {
                  const current = form.available_documents || [];
                  const next = e.target.checked
                    ? [...current, doc.value]
                    : current.filter((v) => v !== doc.value);
                  update("available_documents", next as never);
                }}
              />
              <span className="text-slate-800">{doc.label}</span>
            </label>
          ))}
        </div>
      </div>

      {form.family_members && form.family_members.length > 0 && (
        <div className="md:col-span-2 space-y-2 mt-2">
          <label className="text-sm font-medium text-slate-700">
            Family Members (Used for eligibility)
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {form.family_members.map((member: any, i) => (
              <div key={i} className="flex gap-3 items-center text-slate-700 bg-white/50 p-3 rounded-xl border border-emerald-100 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-lg">
                  {member?.name ? String(member.name).charAt(0).toUpperCase() : "?"}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{String(member?.name || "Unnamed")}</div>
                  <div className="text-xs text-slate-500">{String(member?.relationship || "Dependent")} • {String(member?.age ?? "")} yrs • {String(member?.gender || "Unknown")}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button data-tour="profile-save-button" className="mt-4 min-h-12 rounded-xl bg-sahaya-green px-4 font-semibold text-white md:col-span-2 shadow-sm hover:opacity-90 transition" type="submit">{buttonText}</button>
    </form>
  );
}
