import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import BrandMastHead from "./BrandMastHead.tsx";
import Icon from "./Icon.tsx";
import { useAuth } from "../context/useAuth.ts";
import dashboardIcon from "../assets/icons/nav-dashboard.svg";
import patientsIcon from "../assets/icons/nav-patients.svg";
import reportsIcon from "../assets/icons/nav-reports.svg";
import logoutIcon from "../assets/icons/logout.svg";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: dashboardIcon },
  { to: "/patients", label: "Patients", icon: patientsIcon },
  { to: "/reports", label: "Reports", icon: reportsIcon },
];

export default function AppSidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  async function handleLogout() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      navigate("/signin", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-theme-maroon px-4 py-6 md:flex">
      <div className="px-3 pb-8">
        <BrandMastHead compact />
      </div>

      <nav className="flex flex-col gap-1.5" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium",
                "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-theme-white/60",
                isActive
                  ? "bg-theme-white/10 text-theme-white"
                  : "text-theme-white/60 hover:bg-theme-white/5 hover:text-theme-white/90",
              ].join(" ")
            }
          >
            <Icon src={item.icon} className="h-5 w-5 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-theme-white/60 transition-colors duration-150 hover:bg-theme-white/5 hover:text-theme-white/90 focus-visible:outline-2 focus-visible:outline-theme-white/60 disabled:opacity-60"
        >
          <Icon src={logoutIcon} className="h-5 w-5 shrink-0" />
          {signingOut ? "Signing out…" : "Logout"}
        </button>
      </div>
    </aside>
  );
}
