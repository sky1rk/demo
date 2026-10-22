import MsIcon from "./MsIcon.tsx";
import { passwordChecks } from "../lib/password.ts";

/**
 * Live requirement checklist mirroring the Supabase Auth password policy:
 * 12+ characters plus lowercase, uppercase, digits, and symbols.
 * Renders nothing once every requirement is met (or while empty).
 */
export default function PasswordRequirements({ password }: { password: string }) {
  const checks = passwordChecks(password);
  const incomplete = !checks.every((check) => check.passed);

  if (password.length === 0) return null;

  if (!incomplete) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-risk-low-fg">
        <MsIcon name="check_circle" fill={1} className="text-[14px]" optical={20} />
        Meets all requirements
      </p>
    );
  }

  return (
    <div aria-live="polite" className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
      {checks.map((check) => (
        <span
          key={check.label}
          className={`flex items-center gap-1.5 text-xs ${
            check.passed ? "text-risk-low-fg" : "text-theme-placeholder"
          }`}
        >
          {check.passed ? (
            <MsIcon name="check" fill={1} className="text-[14px]" optical={20} />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-theme-line" aria-hidden />
          )}
          {check.label}
        </span>
      ))}
    </div>
  );
}
