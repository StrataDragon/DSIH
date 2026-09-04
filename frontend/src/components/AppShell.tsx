import { Bot, Bell, ChevronsLeft, ChevronsRight, CircleUser, Files, GitCompareArrows, HandHelping, LayoutDashboard, Lock, LogOut, Menu, MessageSquareText, Network, Search, ShieldCheck, UserCog, Users, WalletCards, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { t, type TranslationKey } from "../utils/i18n";
import { SUPPORTED_LANGUAGES } from "../utils/languages";
import { FloatingChatWidget } from "./FloatingChatWidget";
import { SpotlightOverlay } from "./SpotlightOverlay";
import { GuidedTour, type TourStep } from "./GuidedTour";
import { LanguageSelect } from "./LanguageSelect";
import { playWelcomeVoice } from "../utils/welcomeVoice";
import { isProfileComplete } from "../utils/profileUtils";

export const getTranslatedTourSteps = (language: string): TourStep[] => [
  // --- PART 1: The Global Layout & Menu ---
  { route: "/dashboard", target: '[data-tour="nav-dashboard"]', message: t(language, "tourStepDashboardNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-chat"]', message: t(language, "tourStepChatNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-schemes"]', message: t(language, "tourStepSchemesNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-eligibility"]', message: t(language, "tourStepEligibilityNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-welfare-gaps"]', message: t(language, "tourStepWelfareGapsNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-family"]', message: t(language, "tourStepFamilyNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-what-if"]', message: t(language, "tourStepWhatIfNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-documents"]', message: t(language, "tourStepDocumentsNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-journey"]', message: t(language, "tourStepJourneyNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-profile"]', message: t(language, "tourStepProfileNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="nav-privacy"]', message: t(language, "tourStepPrivacyNav"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="header-search"]', message: t(language, "tourStepSearchHeader"), placement: "bottom" },
  { route: "/dashboard", target: '[data-tour="header-language"]', message: t(language, "tourStepLanguageHeader"), placement: "bottom" },

  // --- PART 2: Page Operations ---
  // Dashboard internals
  { route: "/dashboard", target: '[data-tour="dashboard-title"]', message: t(language, "tourStepDashboardInternals"), placement: "bottom" },
  { route: "/dashboard", target: '[data-tour="dashboard-readiness-circle"]', message: t(language, "tourStepDashboardReadiness"), placement: "right" },
  { route: "/dashboard", target: '[data-tour="dashboard-checklist"]', message: t(language, "tourStepDashboardChecklist"), placement: "left" },

  // Chat internals
  { route: "/chat", target: '[data-tour="chat-title"]', message: t(language, "tourStepChatInternals"), placement: "bottom" },
  { route: "/chat", target: '[data-tour="chat-mic-button"]', message: t(language, "tourStepChatMic"), placement: "left" },

  // Find Schemes internals
  { route: "/find-schemes", target: '[data-tour="find-schemes-filter"]', message: t(language, "tourStepFindSchemesFilters"), placement: "bottom" },

  // Eligibility internals
  { route: "/eligibility", target: '[data-tour="eligibility-scheme-select"]', message: t(language, "tourStepEligibilitySelect"), placement: "bottom" },
  { route: "/eligibility", target: '[data-tour="eligibility-check-btn"]', message: t(language, "tourStepEligibilityCheck"), placement: "top" },

  // Welfare Journey internals
  { route: "/journey", target: '[data-tour="journey-title"]', message: t(language, "tourStepJourneyInternals"), placement: "bottom" },
  { route: "/journey", target: '[data-tour="journey-stage-card"]', message: t(language, "tourStepJourneyStages"), placement: "bottom" },

  // Privacy internals
  { route: "/privacy", target: '[data-tour="privacy-title"]', message: t(language, "tourStepPrivacyInternals"), placement: "bottom" },
  { route: "/privacy", target: '[data-tour="privacy-download-button"]', message: t(language, "tourStepPrivacyDownload"), placement: "bottom" },

  // Notifications internals
  { route: "/notifications", target: '[data-tour="notifications-title"]', message: t(language, "tourStepNotificationsInternals"), placement: "bottom" },

  // Profile internals
  { route: "/profile", target: '[data-tour="profile-language-select"]', message: t(language, "tourStepProfileLanguage"), placement: "bottom" },
  { route: "/profile", target: '[data-tour="profile-never-stored"]', message: t(language, "tourStepProfileNeverStored"), placement: "left" },

  // Documents internals (Last step)
  { route: "/documents", target: '[data-tour="documents-upload-input"]', message: t(language, "tourStepDocumentsUpload"), placement: "top" }
];

type NavItem = {
  to: string;
  label?: string;
  labelKey?: TranslationKey;
  icon: typeof LayoutDashboard;
  tourId?: string;
};

const citizenNav: NavItem[] = [
  { to: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, tourId: "nav-dashboard" },
  { to: "/chat", labelKey: "askSahaya", icon: MessageSquareText, tourId: "nav-chat" },
  { to: "/find-schemes", labelKey: "findBenefits", icon: Search, tourId: "nav-schemes" },
  { to: "/eligibility", labelKey: "eligibility", icon: WalletCards, tourId: "nav-eligibility" },
  { to: "/welfare-gaps", labelKey: "welfareGaps", icon: ShieldCheck, tourId: "nav-welfare-gaps" },
  { to: "/family", labelKey: "family", icon: Users, tourId: "nav-family" },
  { to: "/what-if", labelKey: "whatIf", icon: GitCompareArrows, tourId: "nav-what-if" },
  { to: "/documents", labelKey: "documents", icon: Files, tourId: "nav-documents" },
  { to: "/journey", labelKey: "welfareJourney", icon: Network, tourId: "nav-journey" },
  { to: "/notifications", labelKey: "notifications", icon: Bell, tourId: "nav-notifications" },
  { to: "/profile", labelKey: "profile", icon: CircleUser, tourId: "nav-profile" },
  { to: "/privacy", labelKey: "securityPrivacy", icon: UserCog, tourId: "nav-privacy" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, language, setLanguage, notifications, logout } = useAppContext();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tourActive, setTourActive] = useState(() => sessionStorage.getItem("techSahayaTourActive") === "true");

  useEffect(() => {
    if (tourActive) {
      sessionStorage.setItem("techSahayaTourActive", "true");
    } else {
      sessionStorage.removeItem("techSahayaTourActive");
      sessionStorage.removeItem("techSahayaTourStepIndex");
    }
  }, [tourActive]);

  // Trigger welcome voice message once per authenticated entry/session
  useEffect(() => {
    if (user?.id) {
      playWelcomeVoice(language, isProfileComplete(profile), user.id).catch(() => undefined);
    }
  }, [user?.id, language]);

  const roleNav: NavItem[] = user?.role === "admin" ? [
    { to: "/admin/dashboard", label: "Admin Dashboard", icon: LayoutDashboard },
    { to: "/admin/schemes", label: "Schemes", icon: Search },
    { to: "/admin/rules", label: "Rules", icon: ShieldCheck },
    { to: "/admin/sources", label: "Sources", icon: Files },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/audit", label: "Audit", icon: Bell }
  ] : user?.role === "csc_operator" ? [
    { to: "/csc/dashboard", label: "CSC Dashboard", icon: LayoutDashboard },
    { to: "/csc/citizen-session", label: "Citizen Session", icon: Users }
  ] : citizenNav;
  const labelFor = (item: { label?: string; labelKey?: TranslationKey }) => item.label || (item.labelKey ? t(language, item.labelKey) : "");

  const navContent = (
    <>
      <button
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={() => setCollapsed((value) => !value)}
        className="mb-3 hidden min-h-12 w-full items-center justify-center rounded-lg border text-slate-700 lg:flex"
      >
        {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
      </button>
      <nav className="space-y-2" aria-label="Main navigation">
        {roleNav.map((item) => {
          const Icon = item.icon;
          const label = labelFor(item);
          const isLocked = user?.role === "citizen" && !isProfileComplete(profile) && item.to !== "/profile";

          if (isLocked) {
            return (
              <div
                key={item.to}
                title={language === "hi" ? "अनलॉक करने के लिए अपनी प्रोफ़ाइल पूरी करें" : language === "kn" ? "ಅನ್‌ಲಾಕ್ ಮಾಡಲು ನಿಮ್ಮ ಪ್ರೊಫೈಲ್ ಪೂರ್ಣಗೊಳಿಸಿ" : "Complete your profile to unlock"}
                className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-slate-400 opacity-60 cursor-not-allowed ${collapsed ? "justify-center" : ""}`}
              >
                <Icon size={20} aria-hidden="true" />
                {!collapsed && <span>{label}</span>}
                {!collapsed && <Lock size={14} className="ml-auto text-amber-500" />}
              </div>
            );
          }

          return (
          <NavLink
            key={item.to}
            to={item.to}
            data-tour={item.tourId}
            title={collapsed ? label : undefined}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition ${collapsed ? "justify-center" : ""} ${isActive ? "bg-sahaya-green text-white shadow-sm" : "text-slate-700 hover:bg-stone-100 focus-visible:bg-stone-100"}`}
          >
            <Icon size={20} aria-hidden="true" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
          <div className="text-sm font-semibold">{user?.full_name}</div>
          <div className="text-xs capitalize text-slate-600">{user?.role?.replace("_", " ")}</div>
          <button onClick={() => logout()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-sahaya-green shadow-sm">
            <LogOut size={16} /> {t(language, "logout")}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-stone-50 pb-20 lg:pb-0 relative">
      {tourActive && (
        <GuidedTour
          steps={getTranslatedTourSteps(language)}
          onComplete={() => setTourActive(false)}
        />
      )}
      <SpotlightOverlay />
      {user?.role !== "admin" && <FloatingChatWidget />}

      <header className="sticky top-0 z-20 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link to={user?.role === "citizen" && !isProfileComplete(profile) ? "/profile" : "/dashboard"} className="flex items-center gap-3 text-sahaya-green">
            <div className="rounded-xl bg-sahaya-green p-2 text-white"><HandHelping size={20} /></div>
            <div>
              <div className="font-bold">Tech Sahaya</div>
              <div className="text-xs text-slate-500">{user?.role === "admin" ? t(language, "administration") : user?.role === "csc_operator" ? t(language, "cscAssistance") : t(language, "citizenPlatform")}</div>
            </div>
          </Link>

          <div className="hidden md:flex flex-1 max-w-md mx-4 relative" data-tour="header-search">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={t(language, "chatPlaceholder")}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sahaya-green/20 focus:border-sahaya-green transition"
            />
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button 
              onClick={() => setTourActive(true)}
              className="hidden sm:flex items-center gap-2 rounded-xl bg-blue-50 px-4 min-h-12 text-sm font-bold text-blue-600 hover:bg-blue-100 transition shadow-sm border border-blue-100"
            >
              <Bot size={18} /> {t(language, "guideMe" as TranslationKey) || "Guide Me"}
            </button>
            <LanguageSelect
              value={language}
              onChange={setLanguage}
              dataTour="header-language"
              ariaLabel={t(language, "chooseLanguage")}
              className="min-h-12 rounded-xl border px-3 text-sm bg-white"
            />
            <Link to="/notifications" aria-label={t(language, "openNotifications")} className="relative hidden min-h-12 items-center rounded-xl border px-3 text-sm sm:inline-flex">
              <Bell size={16} />
              {notifications.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-red-700 px-1.5 text-[10px] text-white">{notifications.length}</span>}
            </Link>
            <div className="hidden text-right md:block">
              <div className="text-sm font-semibold">{user?.full_name}</div>
              <div className="text-xs text-slate-500">{user?.role}</div>
            </div>
            <button onClick={() => logout()} className="hidden min-h-12 items-center gap-2 rounded-xl border px-4 font-semibold md:inline-flex"><LogOut size={16} /> {t(language, "logout")}</button>
            <button onClick={() => setMobileOpen(true)} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl border lg:hidden" aria-label="Open menu">
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>
      <div className={`mx-auto grid max-w-7xl gap-6 px-4 py-6 ${collapsed ? "lg:grid-cols-[84px_1fr]" : "lg:grid-cols-[260px_1fr]"}`}>
        <aside className="hidden rounded-lg bg-white p-3 shadow-card lg:block">
          {navContent}
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" role="dialog" aria-modal="true">
          <div className="h-full w-[86vw] max-w-sm overflow-y-auto bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-bold text-sahaya-green">{t(language, "menu")}</div>
              <button onClick={() => setMobileOpen(false)} className="min-h-12 min-w-12 rounded-xl border" aria-label="Close menu"><X className="mx-auto" size={20} /></button>
            </div>
            {navContent}
          </div>
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 gap-1 border-t bg-white p-2 lg:hidden" aria-label="Quick navigation">
        {roleNav.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const label = labelFor(item);
          const isLocked = user?.role === "citizen" && !isProfileComplete(profile) && item.to !== "/profile";

          if (isLocked) {
            return (
              <div key={item.to} className="flex min-h-12 flex-col items-center justify-center rounded-lg px-1 text-center text-[10px] font-semibold text-slate-300 opacity-50 cursor-not-allowed">
                <Icon size={16} />
                {label}
              </div>
            );
          }

          return (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `flex min-h-12 flex-col items-center justify-center rounded-lg px-1 text-center text-[10px] font-semibold ${isActive ? "bg-sahaya-green text-white" : "text-slate-600"}`}>
            <Icon size={16} />
            {label}
          </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

