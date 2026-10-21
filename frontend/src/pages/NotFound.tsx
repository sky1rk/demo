import { useEffect } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/useAuth.ts";

/**
 * Full-screen not-found page on the brand's light palette. The primary action
 * adapts to the auth state so both signed-in and signed-out visitors land
 * somewhere useful.
 */
export default function NotFound() {
  const { session } = useAuth();

  useEffect(() => {
    document.title = "Page not found — Pal.se";
    return () => {
      document.title = "Pal.se";
    };
  }, []);

  const primaryAction = session
    ? { to: "/dashboard", label: "Back to dashboard" }
    : { to: "/signin", label: "Back to sign in" };

  return (
    <main className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-theme-light-gray px-6 text-center text-theme-ink-gray">
      {/* Soft brand glow on the light backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-28 h-160 w-160"
        style={{
          background:
            "radial-gradient(circle, rgba(91, 22, 22, 0.06) 0%, rgba(0, 0, 0, 0) 50%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 h-140 w-140"
        style={{
          background:
            "radial-gradient(circle, rgba(102, 24, 31, 0.05) 0%, rgba(0, 0, 0, 0) 50%)",
        }}
      />
      {/* Gentle white wash down the middle so text stays crisp */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(251, 248, 245, 0.9), rgba(251, 248, 245, 0.55) 45%, rgba(251, 248, 245, 0))",
        }}
      />

      {/* Giant ghosted 404 behind the foreground content */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none"
      >
        <span className="text-[26vw] leading-none font-black tracking-tighter text-theme-maroon/5 md:text-72">
          404
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-7">
        <img
          src="/images/rob3.png"
          alt=""
          aria-hidden
          className="min-h-64 drop-shadow-lg transition-transform duration-300 md:h-44"
        />

        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold text-theme-ink md:text-4xl">
            Page not found
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-theme-gray">
            The page you&apos;re looking for doesn&apos;t exist, was moved, or
            never made it onto the ward.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to={primaryAction.to}
            className="rounded-lg bg-theme-maroon px-5 py-2.5 text-sm font-semibold text-theme-white shadow-sm transition-colors duration-150 hover:bg-theme-maroon-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
          >
            {primaryAction.label}
          </Link>
          <Link
            to="/signup"
            className="rounded-lg border border-theme-line px-5 py-2.5 text-sm font-semibold text-theme-ink transition-colors duration-150 hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
          >
            Create an account
          </Link>
        </div>

        <p className="text-xs text-theme-gray/80">
          If you think you reached this page in error, contact your
          administrator.
        </p>
      </div>
    </main>
  );
}
