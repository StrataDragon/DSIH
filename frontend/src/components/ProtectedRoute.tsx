import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAppContext } from "../context/AppContext";
import { isProfileComplete } from "../utils/profileUtils";
import type { Role } from "../types";

export function ProtectedRoute({ children }: { children: React.ReactElement }) {
  const { user, token, profile, authLoading } = useAppContext();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-sahaya-green" />
          <p className="text-sm text-slate-500 font-medium">Loading Tech Sahaya...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // Mandatory Profile Completion for citizen users
  if (user.role === "citizen" && !isProfileComplete(profile)) {
    if (location.pathname !== "/profile") {
      return <Navigate to="/profile" replace />;
    }
  }

  return children;
}

export function RoleProtectedRoute({ children, roles }: { children: React.ReactElement; roles: Role[] }) {
  const { user, authLoading } = useAppContext();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-sahaya-green" />
          <p className="text-sm text-slate-500 font-medium">Loading Tech Sahaya...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to="/access-restricted" replace />;
  }
  return children;
}
