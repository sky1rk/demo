import { useState } from "react";
import { Link } from "react-router-dom";

import AuthFormShell from "../components/AuthFormShell.tsx";
import { AuthSplash } from "../components/AuthGuard.tsx";
import CheckInbox from "../components/CheckInbox.tsx";
import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import PasswordEye from "../components/PasswordEye.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import PasswordRequirements from "../components/PasswordRequirements.tsx";
import TurnstileWidget from "../components/TurnstileWidget.tsx";
import { isCaptchaEnabled } from "../lib/captcha.ts";
import { useAuth } from "../context/useAuth";
import { guide } from "../lib/authErrors.ts";
import { MIN_PASSWORD_LENGTH, passwordPolicyMet } from "../lib/password.ts";
import { isEmailFormat } from "../lib/validation.ts";
import { supabase } from "../lib/supabase.ts";

interface SignupForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type FieldErrors = Partial<Record<keyof SignupForm, string>>;

const blankForm: SignupForm = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const RESEND_COOLDOWN_MS = 60_000;

export default function Signup() {
  const { loading } = useAuth();
  const [form, setForm] = useState<SignupForm>(blankForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [sent, setSent] = useState<string | null>(null);
  const [resendPending, setResendPending] = useState(false);
  const [resendReadyAt, setResendReadyAt] = useState<number | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendCaptchaToken, setResendCaptchaToken] = useState<string | null>(
    null,
  );

  function update<K extends keyof SignupForm>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validate(): boolean {
    const next: FieldErrors = {};

    if (form.firstName.trim().length === 0)
      next.firstName = "Enter your first name.";
    if (form.lastName.trim().length === 0)
      next.lastName = "Enter your last name.";

    if (form.email.trim().length === 0) {
      next.email = "Enter your email address.";
    } else if (!isEmailFormat(form.email.trim())) {
      next.email = "Enter a valid email address.";
    }

    if (!passwordPolicyMet(form.password)) {
      next.password = `Use ${MIN_PASSWORD_LENGTH}+ characters with lowercase, uppercase letters, numbers, and symbols.`;
    }

    if (form.confirmPassword !== form.password) {
      next.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    setPending(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.password,
        options: {
          data: {
            first_name: form.firstName.trim(),
            last_name: form.lastName.trim(),
          },
          captchaToken: captchaToken ?? undefined,
        },
      });

      if (error != null) {
        setFormError(guide(error));
        return;
      }

      // Email confirmation is required: the email lands with the confirmation
      // link and no session is returned yet.
      setSent(form.email.trim());
      setResendReadyAt(Date.now() + RESEND_COOLDOWN_MS);
    } catch (cause) {
      console.error("[palse signup]", cause);
      setFormError("Sign-up failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleResend() {
    if (resendPending || sent == null) return;

    const now = Date.now();
    if (resendReadyAt != null && now < resendReadyAt) {
      const seconds = Math.ceil((resendReadyAt - now) / 1000);
      setResendNotice(
        `Please wait ${seconds}s before requesting another email.`,
      );
      return;
    }
    if (isCaptchaEnabled() && resendCaptchaToken == null) {
      setResendNotice("Complete the security check first.");
      return;
    }

    setResendPending(true);
    setResendNotice(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: sent,
        options: { captchaToken: resendCaptchaToken ?? undefined },
      });

      if (error != null) {
        setResendNotice(guide(error));
        return;
      }

      setResendNotice(
        "Confirmation email sent. If it doesn't arrive, check your spam folder.",
      );
      setResendCaptchaToken(null);
      setResendReadyAt(Date.now() + RESEND_COOLDOWN_MS);
    } catch (cause) {
      console.error("[palse signup resend]", cause);
      setResendNotice(
        "Could not resend the email. Please wait a moment and try again.",
      );
    } finally {
      setResendPending(false);
    }
  }

  if (loading) return <AuthSplash />;

  if (sent != null) {
    return (
      <AuthFormShell>
        <CheckInbox
          email={sent}
          title="Check your inbox"
          description={
            <>
              We sent a confirmation link to <strong>{sent}</strong>. Click it
              to activate your account — link expires in 24 hours.
            </>
          }
        >
          {resendNotice ? <Notice tone="info">{resendNotice}</Notice> : null}

          <TurnstileWidget
            className="mx-auto w-[286px] max-w-full"
            onVerify={(token) => setResendCaptchaToken(token)}
            onExpire={() => setResendCaptchaToken(null)}
          />

          <div className="flex items-center justify-center gap-3">
            <PrimaryButton
              className="w-auto min-w-40 flex-1"
              pending={resendPending}
              disabled={isCaptchaEnabled() && resendCaptchaToken == null}
              onClick={handleResend}
              type="button"
            >
              Resend email
            </PrimaryButton>
            <Link
              to="/signin"
              className="text-sm font-semibold text-theme-maroon underline-offset-4 hover:underline flex-1"
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
        <h1 className="text-2xl font-bold">Create an account</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Sign up to access the clinical dashboard.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput
            id="first-name"
            label="First name"
            name="firstName"
            autoComplete="given-name"
            placeholder="Maria"
            value={form.firstName}
            onChange={(event) => update("firstName", event.target.value)}
            error={fieldErrors.firstName}
            disabled={pending}
            autoFocus
          />
          <FormInput
            id="last-name"
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            placeholder="Zardoya"
            value={form.lastName}
            onChange={(event) => update("lastName", event.target.value)}
            error={fieldErrors.lastName}
            disabled={pending}
          />
        </div>

        <FormInput
          id="email"
          label="Email address"
          hintClass="hidden [@media(min-height:800px)]:block"
          hint="This email is used for account confirmation and password recovery."
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@hospital.org"
          value={form.email}
          onChange={(event) => update("email", event.target.value)}
          error={fieldErrors.email}
          disabled={pending}
        />

        <div>
          <FormInput
            id="password"
            label="Password"
            hintClass="hidden [@media(min-height:800px)]:block"
            hint={`${MIN_PASSWORD_LENGTH}+ characters with lowercase and uppercase letters, numbers, and symbols.`}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={form.password}
            onChange={(event) => update("password", event.target.value)}
            error={fieldErrors.password}
            disabled={pending}
            trailing={
              <PasswordEye
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
              />
            }
          />
          <PasswordRequirements password={form.password} />
        </div>

        <FormInput
          id="confirm-password"
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={form.confirmPassword}
          onChange={(event) => update("confirmPassword", event.target.value)}
          error={fieldErrors.confirmPassword}
          disabled={pending}
        />

        <TurnstileWidget
          className="w-[286px] max-w-full"
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        <PrimaryButton
          pending={pending}
          disabled={isCaptchaEnabled() && captchaToken == null}
        >
          Create account
        </PrimaryButton>
      </form>

      <p className="mt-8 text-sm text-theme-gray">
        Already have an account?{" "}
        <Link
          to="/signin"
          className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthFormShell>
  );
}
