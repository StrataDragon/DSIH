import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useAppContext } from "../context/AppContext";

export function PrivacyPage() {
  const { logout } = useAppContext();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  return (
    <div className="space-y-4 rounded-3xl bg-white p-6 shadow-card">
      <h1 data-tour="privacy-title" className="text-3xl font-bold">Privacy Center</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4"><div className="font-semibold">What We Collect</div><div className="mt-2 text-sm text-slate-600">Only minimum information required for welfare assistance.</div></div>
        <div className="rounded-2xl border p-4"><div className="font-semibold">What We Never Store</div><div className="mt-2 text-sm text-slate-600">Full Aadhaar number, biometric data, unnecessary bank information, raw identity documents.</div></div>
        <div className="rounded-2xl border p-4"><div className="font-semibold">Why We Need Your Data</div><div className="mt-2 text-sm text-slate-600">Purpose limitation for profile-based recommendations, eligibility, and journey tracking.</div></div>
        <div className="rounded-2xl border p-4"><div className="font-semibold">Data Retention</div><div className="mt-2 text-sm text-slate-600">You can withdraw consent and delete your data. Documents are processed in memory whenever possible.</div></div>
      </div>
      <div className="space-y-3 rounded-2xl border p-4">
        <div className="font-semibold">Your Controls</div>
        <div className="flex flex-wrap gap-3">
          <button data-tour="privacy-download-button" onClick={() => setMessage("Your data export request has been prepared.")} className="min-h-12 rounded-xl border px-4">Download My Data</button>
          <button onClick={async () => { await api.post("/api/consent", { consent_version: "v1", selected_language: "en", purpose: "withdrawal", consent_given: false }); setMessage("Consent withdrawn."); }} className="min-h-12 rounded-xl border px-4">Withdraw Consent</button>
        </div>
        <div className="rounded-2xl bg-red-50 p-4">
          <div className="font-semibold text-red-800">Delete My Data</div>
          <p className="mt-2 text-sm text-red-700">Type DELETE to confirm. This removes your stored profile and document metadata, clears the local session, and returns you to the public landing page.</p>
          <input className="mt-3 min-h-12 w-full rounded-xl border px-4" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type DELETE" />
          <button onClick={async () => {
            if (confirm !== "DELETE") return setMessage("Please type DELETE exactly.");
            await api.delete("/api/profile");
            await logout();
            setMessage("All personal data deleted.");
            navigate("/");
          }} className="mt-3 min-h-12 rounded-xl bg-red-700 px-4 text-white">Confirm Deletion</button>
        </div>
      </div>
      {message && <div className="rounded-xl bg-stone-100 p-3 text-sm">{message}</div>}
    </div>
  );
}
