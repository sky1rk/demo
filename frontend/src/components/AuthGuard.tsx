import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

import BrandMastHead from "./BrandMastHead.tsx";
import { useAuth } from "../context/useAuth";

/** Full-page spinner shown until the initial auth state resolves. */
export function AuthSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-theme-maroon">
      <BrandMastHead />
      <span
        aria-label="Loading"
        className="h-5 w-5 animate-spin rounded-full border-2 border-theme-white/40 border-t-theme-white"
      />
    </div>
  );
}

/** Restricts children to authenticated users; bounces guests to /signin. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthSplash />;
  if (session == null) {
    return <Navigate replace state={{ from: location }} to="/signin" />;
  }
  return children;
}

/** Restricts children to guests; sends already-signed-in users to /dashboard. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <AuthSplash />;
  if (session != null) return <Navigate replace to="/dashboard" />;
  return children;
}
