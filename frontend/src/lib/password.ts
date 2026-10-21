/**
 * Client-side password policy, matching the Supabase Auth settings:
 * minimum 12 characters with lowercase, uppercase, digit, and symbol
 * characters (the dashboard enforces the same server-side).
 */

export const MIN_PASSWORD_LENGTH = 12;

export interface PasswordCheck {
  label: string;
  passed: boolean;
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    {
      label: `${MIN_PASSWORD_LENGTH}+ characters`,
      passed: password.length >= MIN_PASSWORD_LENGTH,
    },
    { label: "Lowercase letter", passed: /[a-z]/.test(password) },
    { label: "Uppercase letter", passed: /[A-Z]/.test(password) },
    { label: "Number", passed: /[0-9]/.test(password) },
    { label: "Symbol", passed: /[^a-zA-Z0-9\s]/.test(password) },
  ];
}

export function passwordPolicyMet(password: string): boolean {
  return passwordChecks(password).every((check) => check.passed);
}

/** Human-readable summary of the unmet requirements, for inline errors. */
export function passwordViolations(password: string): string[] {
  return passwordChecks(password)
    .filter((check) => !check.passed)
    .map((check) => `add ${check.label.replace(/s$/, "").toLowerCase()}`);
}
