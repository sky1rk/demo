import type { RiskLevel } from "../lib/patient.ts";

const TIER_STYLES: Record<RiskLevel, string> = {
  low: "border-risk-low-fg/25 bg-risk-low-bg text-risk-low-fg",
  moderate: "border-risk-moderate-fg/30 bg-risk-moderate-bg text-risk-moderate-fg",
  high: "border-risk-high-fg/25 bg-risk-high-bg text-risk-high-fg",
  pending: "border-theme-line bg-theme-light-gray text-theme-gray",
};

const TIER_LABELS: Record<RiskLevel, string> = {
  low: "Low risk",
  moderate: "Moderate risk",
  high: "High risk",
  pending: "Pending",
};

/** Colored pill for a patient's (manually set or pending) risk tier. */
export default function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TIER_STYLES[level]}`}
    >
      {TIER_LABELS[level]}
    </span>
  );
}
