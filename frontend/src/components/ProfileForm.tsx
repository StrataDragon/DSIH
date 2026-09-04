import { useEffect, useState } from "react";
import { useAppContext } from "../context/AppContext";
import type { EligibilityProfile } from "../types";
import { t } from "../utils/i18n";
import { ALL_INDIAN_STATES_AND_UTS } from "../data/indianStates";

const defaults: EligibilityProfile = { available_documents: [] };

export function ProfileForm({
  initialValue,
  onSubmit,
  submitLabel,
}: {
  initialValue?: EligibilityProfile;
  onSubmit: (profile: EligibilityProfile) => void;
  submitLabel?: string;
}) {
  const { language, user } = useAppContext();
  const [form, setForm] = useState<EligibilityProfile>(() => ({
    ...defaults,
    ...initialValue,
    full_name: initialValue?.full_name || user?.full_name || "",
  }));

  useEffect(() => {
    setForm({
      ...defaults,
      ...initialValue,
      full_name: initialValue?.full_name || user?.full_name || "",
    });
  }, [initialValue, user?.full_name]);

  const update = (key: keyof EligibilityProfile, value: string | number | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const buttonText = submitLabel || t(language, "save");

  const DOCUMENT_OPTIONS = [
    { value: "income_certificate", label: t(language, "docIncomeCertificate") },
    { value: "land_record", label: t(language, "docLandRecord") },
    { value: "ration_card", label: t(language, "docRationCard") },
    { value: "disability_certificate", label: t(language, "docDisabilityCertificate") },
    { value: "caste_certificate", label: t(language, "docCasteCertificate") },
    { value: "marksheet_academic_record", label: t(language, "docMarksheetDigiLocker") },
    { value: "generic_sample_document", label: t(language, "docGenericSample") },
  ];

  const fullNameLabel =
    language === "hi"
      ? "पूरा नाम"
      : language === "kn"
      ? "ಪೂರ್ಣ ಹೆಸರು"
      : language === "te"
      ? "పూర్తి పేరు"
      : language === "ta"
      ? "முழு பெயர்"
      : language === "ml"
      ? "പൂർണ്ണമായ പേര്"
      : language === "bn"
      ? "পুরো নাম"
      : language === "mr"
      ? "पूर्ण नाव"
      : language === "gu"
      ? "પૂરું નામ"
      : "Full Name";

  const fullNamePlaceholder =
    language === "hi"
      ? "अपना पूरा नाम दर्ज करें"
      : language === "kn"
      ? "ನಿಮ್ಮ ಪೂರ್ಣ ಹೆಸರನ್ನು ನಮೂದಿಸಿ"
      : "Enter your full name";

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      {/* 1. Full Name (Mandatory) */}
      <div className="md:col-span-2">
        <label
          htmlFor="profile-full-name"
          className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
        >
          {fullNameLabel} <span className="text-red-500 font-bold">*</span>
        </label>
        <input
          id="profile-full-name"
          data-tour="profile-fullname-input"
          className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
          placeholder={fullNamePlaceholder}
          value={form.full_name || ""}
          required
          onChange={(e) => update("full_name", e.target.value)}
        />
        {(!form.full_name || !form.full_name.trim()) && (
          <p className="mt-1 text-xs text-amber-700">
            {language === "hi"
              ? "अनिवार्य प्रोफ़ाइल पूर्णता के लिए नाम आवश्यक है"
              : language === "kn"
              ? "ಕಡ್ಡಾಯ ಪ್ರೊಫೈಲ್ ಪೂರ್ಣಗೊಳಿಸಲು ಹೆಸರು ಅಗತ್ಯವಿದೆ"
              : "Full name is required for mandatory profile completion"}
          </p>
        )}
      </div>

      {/* 2. Age (Mandatory) */}
      <div>
        <label
          htmlFor="profile-age"
          className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
        >
          {t(language, "age") || "Age"} <span className="text-red-500 font-bold">*</span>
        </label>
        <input
          id="profile-age"
          className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
          placeholder={t(language, "age") || "Age"}
          type="number"
          min="0"
          max="130"
          value={form.age || ""}
          required
          onKeyDown={(e) => {
            if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
          }}
          onChange={(e) => update("age", Math.max(0, Number(e.target.value) || 0))}
        />
      </div>

      {/* 3. Gender */}
      <div>
        <label
          htmlFor="profile-gender"
          className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
        >
          {t(language, "gender") || "Gender"}
        </label>
        <select
          id="profile-gender"
          className="min-h-12 w-full rounded-xl border border-slate-300 p-3 bg-white text-slate-800 focus:border-emerald-500 focus:outline-none"
          value={form.gender || ""}
          onChange={(e) => update("gender", e.target.value)}
        >
          <option value="">{t(language, "gender") || "Select Gender"}</option>
          <option value="female">{t(language, "female") || "Female"}</option>
          <option value="male">{t(language, "male") || "Male"}</option>
        </select>
      </div>

      {/* 4. State (Mandatory) */}
      <div>
        <label
          htmlFor="profile-state"
          className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
        >
          {t(language, "state") || "State"} <span className="text-red-500 font-bold">*</span>
        </label>
        <select
          id="profile-state"
          data-tour="profile-state-select"
          className="min-h-12 w-full rounded-xl border border-slate-300 p-3 bg-white text-slate-800 focus:border-emerald-500 focus:outline-none"
          value={form.state || ""}
          required
          onChange={(e) => update("state", e.target.value)}
        >
          <option value="">{t(language, "state") || "Select State"}</option>
          {form.state && !ALL_INDIAN_STATES_AND_UTS.includes(form.state as any) && (
            <option value={form.state}>{form.state}</option>
          )}
          {ALL_INDIAN_STATES_AND_UTS.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      {/* 5. Occupation (Mandatory) */}
      <div>
        <label
          htmlFor="profile-occupation"
          className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
        >
          {t(language, "occupation") || "Occupation"} <span className="text-red-500 font-bold">*</span>
        </label>
        <input
          id="profile-occupation"
          data-tour="profile-occupation-select"
          className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
          placeholder={t(language, "occupation") || "e.g. Farmer, Student, Construction Worker"}
          value={form.occupation || ""}
          required
          onChange={(e) => update("occupation", e.target.value)}
        />
      </div>

      {/* 6. Income */}
      <div>
        <label
          htmlFor="profile-income"
          className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
        >
          {t(language, "income") || "Annual Income (₹)"}
        </label>
        <input
          id="profile-income"
          data-tour="profile-income-input"
          className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
          placeholder={t(language, "income") || "Annual Income in ₹"}
          type="number"
          min="0"
          value={form.income || ""}
          onKeyDown={(e) => {
            if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
          }}
          onChange={(e) => update("income", Math.max(0, Number(e.target.value) || 0))}
        />
      </div>

      {/* 7. Landholding */}
      <div>
        <label
          htmlFor="profile-landholding"
          className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1"
        >
          {t(language, "landholding") || "Landholding (Acres)"}
        </label>
        <input
          id="profile-landholding"
          className="min-h-12 w-full rounded-xl border border-slate-300 p-3 text-slate-800 focus:border-emerald-500 focus:outline-none"
          placeholder={t(language, "landholding") || "Landholding in Acres"}
          type="number"
          min="0"
          step="0.1"
          value={form.landholding || ""}
          onKeyDown={(e) => {
            if (e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
          }}
          onChange={(e) => update("landholding", Math.max(0, Number(e.target.value) || 0))}
        />
      </div>

      {/* 8. Disability Support */}
      <div className="md:col-span-2">
        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-slate-300 p-3 bg-white cursor-pointer hover:bg-slate-50 transition">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            checked={form.disability || false}
            onChange={(e) => update("disability", e.target.checked)}
          />
          <span className="text-sm font-medium text-slate-800">
            {t(language, "disability") || "Person with Disability (PwD)"}
          </span>
        </label>
      </div>

      {/* 9. Available Documents */}
      <div className="md:col-span-2 space-y-2">
        <label className="text-sm font-medium text-slate-700">
          {t(language, "requiredDocuments") || "Available Verification Documents"}
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DOCUMENT_OPTIONS.map((doc) => (
            <label
              key={doc.value}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/50 p-3 text-sm cursor-pointer hover:border-sahaya-green transition"
            >
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

      {/* 10. Family Members */}
      {form.family_members && form.family_members.length > 0 && (
        <div className="md:col-span-2 space-y-2 mt-2">
          <label className="text-sm font-medium text-slate-700">
            Family Members (Used for household eligibility)
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {form.family_members.map((member: any, i) => (
              <div
                key={i}
                className="flex gap-3 items-center text-slate-700 bg-white/50 p-3 rounded-xl border border-emerald-100 shadow-sm"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 font-bold text-lg">
                  {member?.name ? String(member.name).charAt(0).toUpperCase() : "?"}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    {String(member?.name || "Unnamed")}
                  </div>
                  <div className="text-xs text-slate-500">
                    {String(member?.relationship || "Dependent")} • {String(member?.age ?? "")} yrs
                    • {String(member?.gender || "Unknown")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        data-tour="profile-save-button"
        className="mt-4 min-h-12 rounded-xl bg-sahaya-green px-4 font-semibold text-white md:col-span-2 shadow-sm hover:opacity-90 transition"
        type="submit"
      >
        {buttonText}
      </button>
    </form>
  );
}
