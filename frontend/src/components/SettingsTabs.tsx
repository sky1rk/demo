import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/profile", label: "Profile" },
  { to: "/profile/security", label: "Security" },
];

/** Tab strip shared by the Settings (profile) pages. */
export default function SettingsTabs() {
  return (
    <div className="flex gap-1.5 border-b border-theme-line" role="tablist">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          role="tab"
          className={({ isActive }) => [
            "-mb-px rounded-t-lg border border-transparent border-b-0 px-4 py-2.5 text-sm font-semibold transition-colors",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
            isActive
              ? "border-theme-line bg-white text-theme-maroon"
              : "text-theme-gray hover:text-theme-ink",
          ].join(" ")}
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
