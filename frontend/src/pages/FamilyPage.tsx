import { useState } from "react";
import { Plus, UsersRound, Trash2 } from "lucide-react";
import { SectionCard } from "../components/SectionCard";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";

export function FamilyPage() {
  const { language, profile, setProfile } = useAppContext();
  const [members, setMembers] = useState<any[]>(profile.family_members?.length ? profile.family_members : [{ name: "", relationship: "", available_documents: [] }]);
  const [result, setResult] = useState<any | null>(null);

  const addMember = () => setMembers((prev) => [...prev, { name: "", relationship: "", available_documents: [] }]);
  
  const removeMember = (index: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <SectionCard title={t(language, "familyBenefits")}>
        <p className="mb-4 text-sm text-slate-600">{t(language, "familyOptimizerHelp")}</p>
        <div className="space-y-3" data-tour="family-members-section">
          {members.map((member, index) => (
            <div key={index} className="flex gap-2 items-center">
              <div className="flex-1 grid gap-2 rounded-2xl border p-3 md:grid-cols-2 bg-white">
                <input
                  className="min-h-12 rounded-xl border p-3"
                  placeholder={language === "hi" ? "नाम" : language === "kn" ? "ಹೆಸರು" : "Name"}
                  value={member.name}
                  onChange={(e) => setMembers((prev) => prev.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)))}
                />
                <input
                  className="min-h-12 rounded-xl border p-3"
                  placeholder={language === "hi" ? "संबंध (उदा. स्वयं, पत्नी, पुत्र)" : language === "kn" ? "ಸಂಬಂಧ (ಉದಾ. ಸ್ವತಃ, ಪತ್ನಿ, ಮಗ)" : "Relationship (e.g. self, spouse)"}
                  value={member.relationship}
                  onChange={(e) => setMembers((prev) => prev.map((item, i) => (i === index ? { ...item, relationship: e.target.value } : item)))}
                />
              </div>
              <button 
                onClick={() => removeMember(index)} 
                className="w-12 h-12 flex items-center justify-center rounded-xl border border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 transition flex-shrink-0"
                title="Remove Member"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}
          <div className="flex gap-3">
            <button onClick={addMember} className="inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 font-semibold">
              <Plus size={18} /> {t(language, "addMember")}
            </button>
            <button 
              data-tour="family-analyze-btn" 
              onClick={async () => {
                const newProfile = { ...profile, family_members: members };
                setProfile(newProfile);
                try { await api.put("/api/profile", newProfile); } catch (e) {}
                setResult((await api.post("/api/family/analyze", { members })).data);
              }} 
              className="min-h-12 rounded-xl bg-sahaya-green px-4 font-semibold text-white shadow-sm hover:opacity-90 transition"
            >
              {t(language, "analyzeFamily")}
            </button>
          </div>
        </div>
      </SectionCard>


      <SectionCard title={t(language, "familyBenefitMap")}>
        {!result && (
          <div className="rounded-2xl border border-dashed p-6 text-center">
            <UsersRound className="mx-auto text-sahaya-green" />
            <p className="mt-2 text-sm text-slate-600">{t(language, "noFamilyResult")}</p>
          </div>
        )}
        {result &&
          result.members.map((member: any) => (
            <div key={member.member} className="mb-4 rounded-xl border p-3">
              <div className="font-semibold">{member.member}</div>
              <div className="mt-1 text-sm text-slate-600">{member.eligible_schemes.map((scheme: any) => scheme.scheme_name).join(", ") || t(language, "noMatchingSchemes")}</div>
            </div>
          ))}
      </SectionCard>
    </div>
  );
}
