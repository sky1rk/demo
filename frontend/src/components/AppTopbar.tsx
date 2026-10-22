import { Link, useLocation } from "react-router-dom";
import type { ComponentType } from "react";

import { useAuth } from "../context/useAuth.ts";

/** Strip for small screens (< md): horizontal nav icons. */
export function AppMobileNav() {
  const links = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/patients", label: "Patients" },
    { to: "/reports", label: "Reports" },
  ];

  const location = useLocation();

  return (
    <nav
      aria-label="Primary"
      className="flex items-stretch gap-1 border-b border-theme-line bg-theme-white px-4 py-2 md:hidden"
    >
      {links.map((link) => {
        const active = location.pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition-colors",
              active
                ? "bg-theme-maroon text-theme-white"
                : "text-theme-gray hover:bg-theme-light-gray hover:text-theme-ink",
            ].join(" ")}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

const TOPBAR_LABELS: Array<{
  match: (path: string) => boolean;
  label: string;
}> = [
    { match: (p) => p.startsWith("/dashboard"), label: "Assessment" },
    { match: (p) => p.startsWith("/patients"), label: "Patient Registry" },
    { match: (p) => p.startsWith("/reports"), label: "Reports & Analytics" },
  ];

function titleForPath(path: string): string {
  return (
    TOPBAR_LABELS.find((entry) => entry.match(path))?.label ??
    "Clinical Console"
  );
}

function initialsOf(firstName: string | null, lastName: string | null): string {
  const a = firstName?.trim()?.[0] ?? "";
  const b = lastName?.trim()?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || "·";
}

/** Top app bar: page context + identity, linking to the profile page. */
const Topbar: ComponentType = function Topbar() {
  const { profile, user, session } = useAuth();
  const location = useLocation();

  const firstName =
    profile?.first_name ??
    (user?.user_metadata?.first_name as string | undefined) ??
    "";
  const lastName =
    profile?.last_name ??
    (user?.user_metadata?.last_name as string | undefined) ??
    "";
  const display =
    `${firstName} ${lastName}`.trim() || session?.user.email || "Clinician";

  return (
    <header className="sticky top-0 z-10 border-b border-theme-line bg-theme-white px-5 py-3 md:px-8">
      <div className="mx-auto flex w-full max-w-[68em] items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <Link
            to="/dashboard"
            className="text-sm font-semibold text-theme-ink"
          >
            {titleForPath(location.pathname)}
          </Link>
          {/* <span className="hidden text-xs text-theme-gray sm:inline"> */}
          {/*   • Neonatal Sepsis Prediction */}
          {/* </span> */}
        </div>

        <Link
          to="/profile"
          className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-theme-maroon"
        >
          <div className="hidden text-right sm:block">
            <div className="text-sm font-semibold text-theme-ink">
              {display}
            </div>
            <div className="text-xs text-theme-gray">
              {profile?.role || profile?.department || "Clinical team"}
            </div>
          </div>
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-theme-maroon text-xs font-bold text-theme-white"
          >
            {initialsOf(firstName, lastName)}
          </span>
        </Link>
      </div>
    </header>
  );
};

export default Topbar;
