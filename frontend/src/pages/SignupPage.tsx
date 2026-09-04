import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { LanguageSelect } from "../components/LanguageSelect";

export function SignupPage() {
  const { signup } = useAppContext();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ full_name: "", email: "", password: "", confirm: "", preferred_language: "en", phone_number: "", consent_given: false });
  const strength = useMemo(() => {
    let score = 0;
    if (form.password.length >= 8) score++;
    if (/[A-Z]/.test(form.password)) score++;
    if (/[a-z]/.test(form.password)) score++;
    if (/\d/.test(form.password)) score++;
    if (/[^A-Za-z0-9]/.test(form.password)) score++;
    return score <= 2 ? "Weak" : score <= 4 ? "Medium" : "Strong";
  }, [form.password]);
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-5xl items-center px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-3xl border bg-white p-6 shadow-card">
        <h1 className="text-3xl font-bold">Create your Tech Sahaya account</h1>
        <p className="mt-2 text-slate-600">Sign up, review consent, complete profile setup, and continue to your citizen dashboard.</p>
        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          if (form.password !== form.confirm) { setError("Passwords do not match"); return; }
          if (!form.consent_given) { setError("You must accept terms and privacy consent"); return; }
          const result = await signup({ full_name: form.full_name, email: form.email, password: form.password, preferred_language: form.preferred_language, phone_number: form.phone_number || undefined, consent_given: form.consent_given });
          if (result) setError(result); else navigate("/login");
        }}>
          <input className="min-h-12 rounded-xl border px-4" placeholder="Full Name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <input className="min-h-12 rounded-xl border px-4" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="relative">
            <input className="min-h-12 w-full rounded-xl border px-4 pr-12" placeholder="Password" type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="absolute right-3 top-3" onClick={() => setShowPassword((s) => !s)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          <div className="relative">
            <input className="min-h-12 w-full rounded-xl border px-4 pr-12" placeholder="Confirm Password" type={showConfirm ? "text" : "password"} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            <button type="button" className="absolute right-3 top-3" onClick={() => setShowConfirm((s) => !s)}>{showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          <LanguageSelect
            className="min-h-12 rounded-xl border px-4 bg-white"
            value={form.preferred_language}
            onChange={(val) => setForm({ ...form, preferred_language: val })}
          />
          <input className="min-h-12 rounded-xl border px-4 md:col-span-2" placeholder="Optional phone number" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} />
          <div className="text-sm text-slate-600 md:col-span-2">Password strength: <span className="font-semibold">{strength}</span></div>
          <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.consent_given} onChange={(e) => setForm({ ...form, consent_given: e.target.checked })} /> I agree to the privacy-first terms and consent notice.</label>
          {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 md:col-span-2">{error}</div>}
          <button className="min-h-12 rounded-xl bg-sahaya-green text-white md:col-span-2">Sign Up</button>
          <Link to="/login" className="text-sm text-sahaya-green md:col-span-2">Already have an account? Login</Link>
        </form>
      </div>
    </div>
  );
}
