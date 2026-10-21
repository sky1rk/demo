import { useState } from "react";
import { Link } from "react-router-dom";

import AuthFormShell from "../components/AuthFormShell.tsx";
import { AuthSplash } from "../components/AuthGuard.tsx";
import CheckInbox from "../components/CheckInbox.tsx";
import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import TurnstileWidget from "../components/TurnstileWidget.tsx";
import { isCaptchaEnabled } from "../lib/captcha.ts";
import { useAuth } from "../context/useAuth";
import { guide } from "../lib/authErrors.ts";
import { isEmailFormat } from "../lib/validation.ts";
import { supabase } from "../lib/supabase.ts";

export default function ForgotPassword() {
  const { loading } = useAuth();

  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [sent, setSent] = useState<string | null>(null);
  const [resendPending, setResendPending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendCaptchaToken, setResendCaptchaToken] = useState<string | null>(null);

  function validate(): boolean {
    if (email.trim().length === 0) {
      setFieldError("Enter your email address.");
      return false;
    }
    if (!isEmailFormat(email.trim())) {
      setFieldError("Enter a valid email address.");
      return false;
    }
    setFieldError(null);
    return true;
  }

  async function requestReset(
    address: string,
    token: string | null,
    isResend: boolean,
  ): Promise<boolean> {
    if (isResend) setResendPending(true);
    else setPending(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        // Supabase sends the recovery link with this redirect target.
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken: token ?? undefined,
      });

      if (error != null) {
        setFormError(guide(error));
        return false;
      }

      return true;
    } catch (cause) {
      console.error("[palse forgot-password]", cause);
      setFormError("Could not send the reset email. Please try again.");
      return false;
    } finally {
      setPending(false);
      setResendPending(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    const ok = await requestReset(email.trim(), captchaToken, false);
    if (ok) {
      setSent(email.trim());
      setCaptchaToken(null);
    }
  }

  async function handleResend() {
    if (resendPending || sent == null) return;
    if (isCaptchaEnabled() && resendCaptchaToken == null) {
      setResendNotice("Complete the security check first.");
      return;
    }

    const ok = await requestReset(sent, resendCaptchaToken, true);
    if (ok) {
      setResendNotice(
        "Password-reset email sent. If it doesn't arrive, check your spam folder.",
      );
      setResendCaptchaToken(null);
    }
  }

  if (loading) return <AuthSplash />;

  if (sent != null) {
    return (
      <AuthFormShell>
        <CheckInbox
          email={sent}
          title="Reset link sent"
          description="If an account exists for this address, we sent a link to set a new password. It expires in one hour."
        >
          {resendNotice ? <Notice tone="info">{resendNotice}</Notice> : null}

          <TurnstileWidget
            className="mx-auto w-[286px] max-w-full"
            onVerify={(token) => setResendCaptchaToken(token)}
            onExpire={() => setResendCaptchaToken(null)}
          />

          <div className="flex items-center justify-center gap-3">
            <PrimaryButton
              className="w-auto min-w-44"
              type="button"
              pending={resendPending}
              disabled={isCaptchaEnabled() && resendCaptchaToken == null}
              onClick={handleResend}
            >
              Resend email
            </PrimaryButton>
            <Link
              to="/signin"
              className="text-sm font-semibold text-theme-maroon underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </CheckInbox>
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Forgot password?</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Enter the email tied to your account and we&apos;ll send a reset link.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <FormInput
          id="email"
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@hospital.org"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldError}
          disabled={pending}
          autoFocus
        />

        <TurnstileWidget
          className="w-[286px] max-w-full"
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        <PrimaryButton pending={pending} disabled={isCaptchaEnabled() && captchaToken == null}>
          Send reset link
        </PrimaryButton>
      </form>

      <p className="mt-10 text-sm text-theme-gray">
        <Link
          to="/signin"
          className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
        >
          ← Back to sign in
        </Link>
      </p>
    </AuthFormShell>
  );
}
