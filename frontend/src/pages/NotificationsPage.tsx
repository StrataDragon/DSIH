import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import { t } from "../utils/i18n";

export function NotificationsPage() {
  const { notifications, language } = useAppContext();
  return (
    <div className="rounded-3xl bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell className="text-sahaya-green" />
          <div>
            <h1 data-tour="notifications-title" className="text-2xl font-bold">{t(language, "notifications")}</h1>
            <p className="mt-1 text-sm text-slate-600">{t(language, "notificationHelp")}</p>
          </div>
        </div>
        <Link to="/dashboard" className="inline-flex min-h-12 items-center rounded-xl border px-4 font-semibold text-sahaya-green">{t(language, "goToDashboard")}</Link>
      </div>
      <div className="mt-6 space-y-3">
        {notifications.length === 0 && (
          <div className="rounded-2xl border border-dashed p-6 text-center">
            <Bell className="mx-auto text-sahaya-green" size={36} />
            <h2 className="mt-3 text-xl font-semibold">{t(language, "noNotifications")}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{t(language, "notificationEmptyHelp")}</p>
          </div>
        )}
        {notifications.map((item) => (
          <div key={item.id} className="rounded-lg border p-4">
            <div className="font-semibold">{item.title}</div>
            <div className="mt-1 text-sm text-slate-600">{item.message}</div>
            <div className="mt-2 text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
