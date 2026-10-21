import type { ReactNode } from "react";

/** White card shell used across the app pages. */
export default function Panel({
  title,
  subtitle,
  kicker,
  className,
  children,
}: {
  title?: string;
  subtitle?: string;
  /** Small uppercase label rendered above the title. */
  kicker?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex flex-col gap-5 rounded-xl border border-theme-line bg-white p-6 shadow-sm md:p-7 ${className ?? ""}`}
    >
      {title || kicker || subtitle ? (
        <div className="flex flex-col gap-1.5">
          {kicker ? (
            <span className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
              {kicker}
            </span>
          ) : null}
          {title ? <h2 className="text-lg font-bold text-theme-ink">{title}</h2> : null}
          {subtitle ? <p className="text-sm text-theme-gray">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
