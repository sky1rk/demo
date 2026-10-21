/**
 * Map Supabase auth error messages/codes to friendly copy that never leaks
 * internal details. Unknown failures fall back to a generic message while the
 * raw error is available to the caller for console logging.
 */

type AuthErrorLike = {
  message?: string;
  code?: string | null;
};

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

function normalize(error: unknown): AuthErrorLike | null {
  if (error === null || error === undefined) return null;
  if (typeof error === "object") return error as AuthErrorLike;
  if (typeof error === "string") return { message: error };
  return null;
}

export function guide(error: unknown, fallback = GENERIC_MESSAGE): string {
  const detail = normalize(error);
  if (detail == null) return fallback;

  const message = detail.message ?? "";
  const code = detail.code ?? "";

  switch (code) {
    case "invalid_credentials":
    case "user_not_found":
    case "bad_jwt":
      return "The email address or password is incorrect.";
    case "email_not_confirmed":
      return "Your email is not confirmed yet. Check your inbox for the confirmation link.";
    case "user_banned":
      return "Your account is disabled. Contact an administrator for help.";
    case "over_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    case "captcha_integrity_failed":
      return "Security check failed. Reload the page and try again.";
    case "weak_password":
      return `Password does not meet the requirements${
        message.includes(":") ? ` — ${message.split(":").slice(1).join(":").trim()}` : ""
      }`;
    case "user_already_exists":
      return "An account with this email already exists.";
    case "same_password":
      return "Your new password must be different from the old one.";
    case "recovery_rate_limit":
      return "A password-reset email was just sent. Check your inbox before requesting another.";
    case "validation_failed":
      return "Please check the form and try again.";
    default:
      break;
  }

  // Older-style plain messages (no `code`) come through as text.
  if (message.includes("Invalid login credentials")) {
    return "The email address or password is incorrect.";
  }
  if (message.includes("Email not confirmed")) {
    return "Your email is not confirmed yet. Check your inbox for the confirmation link.";
  }
  if (message.includes("already registered") || message.includes("already exists")) {
    return "An account with this email already exists.";
  }
  if (
    message.includes("rate limit") ||
    message.includes("Too many requests") ||
    message.includes("only requested once per minute")
  ) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (message.includes("New password should be different") || message.includes("same as")) {
    return "Your new password must be different from the old one.";
  }
  if (message.includes("Password should be")) {
    return `Password does not meet the requirements — ${message}`;
  }

  console.error("[palse auth]", detail.message ?? detail);
  return fallback;
}

/**
 * Supabase reports "email exists" only via a special signUp result shape in
 * some flow variants; callers can treat "risky" status explicitly.
 */
export function isRateLimitError(error: unknown): boolean {
  const message = normalize(error)?.message ?? "";
  return (
    message.includes("rate limit") ||
    message.includes("Too many requests") ||
    message.includes("only requested once per minute")
  );
}

export { GENERIC_MESSAGE as FALLBACK_ERROR_MESSAGE };
