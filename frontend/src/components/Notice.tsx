import type { ReactNode } from "react";

export type NoticeTone = "info" | "success" | "danger";

const TONES = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-risk-low-fg/30 bg-risk-low-bg text-risk-low-fg",
  danger: "border-risk-high-fg/25 bg-risk-high-bg text-risk-high-fg",
} as const;

export default function Notice({
  tone,
  className,
  children,
}: {
  tone: NoticeTone;
  className?: string;
  children: NonNullable<ReactNode>;
}) {
  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
