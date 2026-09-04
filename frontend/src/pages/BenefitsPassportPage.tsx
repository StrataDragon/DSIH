import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Award,
  ShieldCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  UploadCloud,
  Calendar,
  FileText,
  ExternalLink,
  HelpCircle,
  AlertCircle,
  Compass,
  Check,
  XCircle,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { SectionCard } from "../components/SectionCard";
import { useAppContext } from "../context/AppContext";
import { api } from "../services/api";
import { t } from "../utils/i18n";

interface BenefitsPassportData {
  profile_complete: boolean;
  missing_profile_fields: string[];
  summary: {
    eligible_count: number;
    almost_eligible_count: number;
    future_count: number;
    verified_documents_count: number;
    total_documents_count: number;
    expiring_documents_count: number;
    profile_completion_percentage: number;
  };
  eligible_now: Array<{
    scheme_id: string;
    name: string;
    category: string;
    department: string;
    official_link: string;
    benefits: string[];
    matched_reasons: string[];
    verified_documents_used: string[];
    score: number;
  }>;
  almost_eligible: Array<{
    scheme_id: string;
    name: string;
    category: string;
    department: string;
    blocking_reason_category: string;
    unmet_conditions: string[];
    missing_document_name: string | null;
    missing_document_status: "NOT_UPLOADED" | "UPLOADED_BUT_UNVERIFIED" | "VERIFICATION_FAILED" | "VERIFIED";
    unlock_action: string;
    action_route: string;
  }>;
  eligibility_radar: Array<{
    scheme_id: string;
    name: string;
    category: string;
    trigger_condition: string;
    estimated_date: string | null;
    current_value: string | null;
    required_value: string | null;
    confidence: string;
  }>;
  document_alerts: Array<{
    document_type: string;
    file_name: string | null;
    expires_at: string | null;
    days_remaining: number | null;
    affected_schemes_count: number;
    affected_scheme_names: string[];
    alert_level: string;
    recommendation: string;
  }>;
  priority_actions: Array<{
    id: string;
    priority: number;
    title: string;
    description: string;
    unlocked_schemes_count: number;
    unlocked_scheme_names: string[];
    action_route: string;
    action_label: string;
    category: string;
  }>;
  timeline: Array<{
    time_label: string;
    title: string;
    type: string;
    detail: string;
    badge: string;
  }>;
  recent_changes: Array<{
    title: string;
    description: string;
    type: string;
  }>;
}

export function BenefitsPassportPage() {
  const { user, profile, language } = useAppContext();
  const [data, setData] = useState<BenefitsPassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "eligible" | "almost" | "radar" | "timeline">("all");

  const fetchPassport = () => {
    setLoading(true);
    setError("");
    api
      .get("/api/benefits/passport")
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        console.error("Error loading benefits passport:", err);
        setError("Failed to load your Benefits Passport. Please try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchPassport();
  }, [profile]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-sahaya-green" />
        <p className="text-sm font-medium text-slate-600">Evaluating your Verified Benefits Passport & Radar...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center shadow-card">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
        <h3 className="mt-3 text-lg font-bold text-red-900">Unable to load Benefits Passport</h3>
        <p className="mt-1 text-sm text-red-700">{error || "Please try refreshing the page."}</p>
        <button
          onClick={fetchPassport}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition"
        >
          <RefreshCw size={16} /> Retry
        </button>
      </div>
    );
  }

  const { summary } = data;

  return (
    <div className="space-y-6">
      {/* Clean Dashboard Header */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl bg-white p-5 shadow-card border border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sahaya-green border border-emerald-100">
            <Award size={22} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Verified Benefits Passport</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Know what benefits you qualify for right now, what is blocking close schemes, and what you may become eligible for next.
            </p>
          </div>
        </div>

        <button
          onClick={fetchPassport}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition self-start sm:self-auto shrink-0 shadow-sm"
        >
          <RefreshCw size={14} /> Refresh Evaluation
        </button>
      </section>

      {/* Snapshot Metric Cards in Main Content Area */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-4">
        {/* Available Now */}
        <button
          type="button"
          onClick={() => setActiveTab("eligible")}
          className={`rounded-2xl border p-4 text-left transition bg-white shadow-card hover:border-emerald-300 hover:shadow-md ${
            activeTab === "eligible" ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-slate-200/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Available Now</span>
            <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">{summary.eligible_count}</div>
          <p className="mt-1 text-[11px] text-slate-500">Ready to apply today</p>
        </button>

        {/* One Step Away */}
        <button
          type="button"
          onClick={() => setActiveTab("almost")}
          className={`rounded-2xl border p-4 text-left transition bg-white shadow-card hover:border-amber-300 hover:shadow-md ${
            activeTab === "almost" ? "border-amber-500 ring-2 ring-amber-500/20" : "border-slate-200/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">One Step Away</span>
            <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600">
              <AlertCircle size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">{summary.almost_eligible_count}</div>
          <p className="mt-1 text-[11px] text-slate-500">Missing 1 requirement</p>
        </button>

        {/* Future Radar */}
        <button
          type="button"
          onClick={() => setActiveTab("radar")}
          className={`rounded-2xl border p-4 text-left transition bg-white shadow-card hover:border-blue-300 hover:shadow-md ${
            activeTab === "radar" ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200/80"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Future Radar</span>
            <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
              <Compass size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">{summary.future_count}</div>
          <p className="mt-1 text-[11px] text-slate-500">Predictable milestones</p>
        </button>

        {/* Verified Proofs */}
        <Link
          to="/documents"
          className="rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-card hover:border-purple-300 hover:shadow-md transition block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Verified Proofs</span>
            <div className="rounded-lg bg-purple-50 p-1.5 text-purple-600">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">{summary.verified_documents_count}</div>
          <p className="mt-1 text-[11px] text-slate-500">Tamper-checked claims</p>
        </Link>

        {/* Profile Readiness */}
        <Link
          to="/profile"
          className="col-span-2 sm:col-span-1 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-card hover:border-emerald-300 hover:shadow-md transition block"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Profile Readiness</span>
            <span className="text-xs font-bold text-emerald-600">{summary.profile_completion_percentage}%</span>
          </div>
          <div className="mt-2 text-2xl sm:text-3xl font-bold text-slate-900">{summary.profile_completion_percentage}%</div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-sahaya-green transition-all duration-500"
              style={{ width: `${summary.profile_completion_percentage}%` }}
            />
          </div>
        </Link>
      </div>

      {/* Incomplete Profile Alert */}
      {!data.profile_complete && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 text-amber-600 flex-shrink-0" size={20} />
            <div>
              <h4 className="font-bold text-amber-950">Complete your profile to unlock full personalized benefits</h4>
              <p className="text-xs sm:text-sm text-amber-800 mt-0.5">
                Missing required fields: {data.missing_profile_fields.map((f) => f.toUpperCase()).join(", ")}. Schemes requiring these attributes are waiting.
              </p>
            </div>
          </div>
          <Link
            to="/profile"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
          >
            Complete Profile <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Document Expiry Alerts */}
      {data.document_alerts.map((alert) => (
        <div
          key={alert.document_type}
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 text-rose-600 flex-shrink-0" size={20} />
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-md bg-rose-200/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-rose-800 mb-1">
                Protect Your Benefits
              </div>
              <h4 className="font-bold text-rose-950">
                {alert.document_type} expires in {alert.days_remaining} days
              </h4>
              <p className="text-xs sm:text-sm text-rose-800 mt-0.5">
                {alert.recommendation} Supported schemes: {alert.affected_scheme_names.join(", ") || "General welfare"}.
              </p>
            </div>
          </div>
          <Link
            to="/documents"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
          >
            Renew Certificate <ArrowRight size={14} />
          </Link>
        </div>
      ))}

      {/* Navigation Filter Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition ${
            activeTab === "all" ? "bg-sahaya-green text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          All Sections
        </button>
        <button
          onClick={() => setActiveTab("eligible")}
          className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition flex items-center gap-1.5 ${
            activeTab === "eligible" ? "bg-sahaya-green text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <CheckCircle2 size={16} /> Available Now ({summary.eligible_count})
        </button>
        <button
          onClick={() => setActiveTab("almost")}
          className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition flex items-center gap-1.5 ${
            activeTab === "almost" ? "bg-sahaya-green text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <AlertCircle size={16} /> One Step Away ({summary.almost_eligible_count})
        </button>
        <button
          onClick={() => setActiveTab("radar")}
          className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition flex items-center gap-1.5 ${
            activeTab === "radar" ? "bg-sahaya-green text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Compass size={16} /> Radar ({summary.future_count})
        </button>
        <button
          onClick={() => setActiveTab("timeline")}
          className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition flex items-center gap-1.5 ${
            activeTab === "timeline" ? "bg-sahaya-green text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Calendar size={16} /> Timeline
        </button>
      </div>

      {/* Priority Actions ("What should I do next?") */}
      {data.priority_actions.length > 0 && (activeTab === "all" || activeTab === "almost") && (
        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-card border border-slate-100">
          <div className="flex items-center gap-2 text-sahaya-ink">
            <Sparkles className="text-amber-500" size={22} />
            <h2 className="text-lg sm:text-xl font-bold">What Should I Do Next?</h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Prioritized actions deterministically ranked by the highest number of schemes they unlock for you.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.priority_actions.map((act) => (
              <div
                key={act.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/50 p-4 hover:border-sahaya-green transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      Priority #{act.priority}
                    </span>
                    {act.unlocked_schemes_count > 0 && (
                      <span className="text-xs font-extrabold text-sahaya-green">
                        +{act.unlocked_schemes_count} schemes
                      </span>
                    )}
                  </div>
                  <h4 className="mt-2 font-bold text-slate-900 text-sm">{act.title}</h4>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-3">{act.description}</p>
                </div>

                <Link
                  to={act.action_route}
                  className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sahaya-green px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-sahaya-green/90 transition"
                >
                  {act.action_label} <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 1: "Available Now" (Eligible Schemes) */}
      {(activeTab === "all" || activeTab === "eligible") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="text-emerald-600" size={22} /> Benefits Available Now
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                All deterministic rules satisfied. Derived strictly from your verified profile and documents.
              </p>
            </div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              {data.eligible_now.length} Qualified
            </span>
          </div>

          {data.eligible_now.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
              <p className="text-sm text-slate-600">
                No schemes are fully unlocked yet. Check the <b>One Step Away</b> section below to see what single document will unlock benefits for you.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.eligible_now.map((scheme) => (
                <div
                  key={scheme.scheme_id}
                  className="flex flex-col justify-between rounded-2xl border border-emerald-200/80 bg-white p-5 shadow-card hover:border-emerald-400 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        {scheme.category.toUpperCase()}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                        <Check size={14} /> Deterministic Match
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-bold text-slate-900">{scheme.name}</h3>
                    <p className="text-xs text-slate-500">{scheme.department}</p>

                    {/* Matched reasons */}
                    <div className="mt-3 space-y-1.5 rounded-xl bg-emerald-50/50 p-3 text-xs text-slate-700">
                      <div className="font-semibold text-emerald-900 flex items-center gap-1">
                        <CheckCircle2 size={13} className="text-emerald-600" /> Why You Qualify:
                      </div>
                      <ul className="space-y-1 pl-4 list-disc text-slate-600">
                        {scheme.matched_reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>

                    {scheme.verified_documents_used.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {scheme.verified_documents_used.map((doc, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
                          >
                            <FileText size={10} /> {doc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                    <Link
                      to={`/schemes/${scheme.scheme_id}`}
                      className="text-xs font-bold text-sahaya-green hover:underline inline-flex items-center gap-1"
                    >
                      View Details <ChevronRight size={14} />
                    </Link>

                    {scheme.official_link && (
                      <a
                        href={scheme.official_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
                      >
                        Official Portal <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Section 2: "One Step Away" (Almost Eligible) */}
      {(activeTab === "all" || activeTab === "almost") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <AlertCircle className="text-amber-500" size={22} /> One Step Away (Almost Eligible)
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Schemes where you satisfy almost all criteria but are blocked by a single actionable requirement.
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
              {data.almost_eligible.length} Pending
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.almost_eligible.map((item) => {
              const isVerifFailed = item.missing_document_status === "VERIFICATION_FAILED";
              const isUnverified = item.missing_document_status === "UPLOADED_BUT_UNVERIFIED";

              return (
                <div
                  key={item.scheme_id}
                  className="flex flex-col justify-between rounded-2xl border border-amber-200 bg-white p-5 shadow-card hover:border-amber-400 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        {item.category.toUpperCase()}
                      </span>
                      {isVerifFailed ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                          <XCircle size={12} /> Verification Failed
                        </span>
                      ) : isUnverified ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Clock size={12} /> Under Review
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          Not Uploaded
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 text-base font-bold text-slate-900">{item.name}</h3>
                    <p className="text-xs text-slate-500">{item.department}</p>

                    <div className="mt-3 space-y-1.5 rounded-xl border border-amber-200/60 bg-amber-50/40 p-3 text-xs">
                      <div className="font-semibold text-amber-900 flex items-center gap-1">
                        <AlertTriangle size={13} className="text-amber-600" /> Blocking Condition:
                      </div>
                      <p className="text-slate-700 font-medium">{item.unlock_action}</p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                    <Link
                      to={item.action_route}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 transition shadow-sm"
                    >
                      <UploadCloud size={13} /> {isVerifFailed ? "Re-upload Verified Original" : "Fulfill Requirement"}
                    </Link>

                    <Link
                      to={`/schemes/${item.scheme_id}`}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                    >
                      Scheme Rules
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 3: "Eligibility Radar" (Future Predictable Milestones) */}
      {(activeTab === "all" || activeTab === "radar") && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Compass className="text-indigo-600" size={22} /> Eligibility Radar (Future Benefits)
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
                Mathematically calculated upcoming opportunities based on your age and predictable life milestones.
              </p>
            </div>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800">
              {data.eligibility_radar.length} Approaching
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.eligibility_radar.map((item) => (
              <div
                key={item.scheme_id}
                className="flex flex-col justify-between rounded-2xl border border-indigo-200 bg-white p-5 shadow-card hover:border-indigo-400 transition"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                      {item.category.toUpperCase()}
                    </span>
                    <span className="text-xs font-extrabold text-indigo-600 flex items-center gap-1">
                      <Calendar size={13} /> {item.estimated_date}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900">{item.name}</h3>

                  <div className="mt-3 space-y-1.5 rounded-xl bg-indigo-50/50 p-3 text-xs text-indigo-950">
                    <div className="font-semibold text-indigo-900">Unlock Milestone:</div>
                    <p className="text-slate-700">{item.trigger_condition}</p>
                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
                      <span>Current: {item.current_value}</span>
                      <span>Target: {item.required_value}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-500">Confidence: {item.confidence}</span>
                  <Link to={`/schemes/${item.scheme_id}`} className="font-bold text-indigo-600 hover:underline">
                    Preview Scheme Rules
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 4: Benefit Timeline */}
      {(activeTab === "all" || activeTab === "timeline") && (
        <section className="rounded-3xl bg-white p-5 sm:p-6 shadow-card border border-slate-100">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="text-sahaya-green" size={22} /> Your Benefit Timeline
          </h2>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-600">
            A continuous chronological map of your active welfare entitlements and future opportunities.
          </p>

          <div className="mt-6 relative border-l-2 border-slate-200 ml-4 space-y-6">
            {data.timeline.map((evt, idx) => (
              <div key={idx} className="relative pl-6">
                <div
                  className={`absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white ${
                    evt.type === "current_eligible"
                      ? "bg-emerald-500"
                      : evt.type === "missing_document"
                      ? "bg-amber-500"
                      : evt.type === "document_expiry"
                      ? "bg-rose-500"
                      : "bg-indigo-500"
                  }`}
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{evt.time_label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      evt.type === "current_eligible"
                        ? "bg-emerald-100 text-emerald-800"
                        : evt.type === "missing_document"
                        ? "bg-amber-100 text-amber-800"
                        : evt.type === "document_expiry"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-indigo-100 text-indigo-800"
                    }`}
                  >
                    {evt.badge}
                  </span>
                </div>
                <h4 className="mt-1 font-bold text-slate-900 text-sm">{evt.title}</h4>
                <p className="text-xs text-slate-600 mt-0.5">{evt.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Section 5: What Changed */}
      {data.recent_changes.length > 0 && activeTab === "all" && (
        <section className="rounded-3xl bg-slate-50 p-5 sm:p-6 border border-slate-200">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp size={18} className="text-sahaya-green" /> What Changed in Your Welfare State?
          </h3>
          <div className="mt-3 space-y-2">
            {data.recent_changes.map((chg, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 bg-white p-3 rounded-xl border border-slate-200">
                <CheckCircle2 size={16} className="text-sahaya-green mt-0.5 flex-shrink-0" />
                <div>
                  <span className="font-bold text-slate-900">{chg.title}: </span>
                  {chg.description}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
