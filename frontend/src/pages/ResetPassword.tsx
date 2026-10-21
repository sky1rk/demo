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
import { useAuth } from "../context/useAuth";
import { guide } from "../lib/authErrors.ts";
import { MIN_PASSWORD_LENGTH, passwordPolicyMet } from "../lib/password.ts";
import { supabase } from "../lib/supabase.ts";

export default function ResetPassword() {
  const { session, loading } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    password: string | null;
    confirmPassword: string | null;
  }>({ password: null, confirmPassword: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  function validate(): boolean {
    const next = {
      password: null as string | null,
      confirmPassword: null as string | null,
    };

    if (!passwordPolicyMet(password)) {
      next.password = `Use ${MIN_PASSWORD_LENGTH}+ characters with lowercase, uppercase letters, numbers, and symbols.`;
    }
    if (confirmPassword !== password) {
      next.confirmPassword = "Passwords do not match.";
    }

    setFieldErrors(next);
    return next.password === null && next.confirmPassword === null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    setPending(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error != null) {
        setFormError(guide(error));
        return;
      }

      setDone(true);
    } catch (cause) {
      console.error("[palse reset-password]", cause);
      setFormError("Could not update the password. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (loading) return <AuthSplash />;

  if (session == null) {
    return (
      <AuthFormShell>
        <CheckInbox
          email="your inbox"
          title="Link expired"
          description="This password-reset link is invalid or has already been used. Request a new one to continue."
        >
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/forgot-password"
              className="text-sm font-semibold text-theme-maroon underline-offset-4 hover:underline"
            >
              Request new link
            </Link>
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

  if (done) {
    return (
      <AuthFormShell>
        <CheckInbox
          email={session.user.email ?? "your account"}
          title="Password updated"
          description="Your password has been reset. You can now sign in with the new password."
        >
          <Link
            to="/signin"
            className="text-sm font-semibold text-theme-maroon underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </CheckInbox>
      </AuthFormShell>
    );
  }

  return (
    <AuthFormShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Choose a strong password you haven&apos;t used before.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {formError ? <Notice tone="danger">{formError}</Notice> : null}

        <div>
          <FormInput
            id="password"
            label="New password"
            hint={`${MIN_PASSWORD_LENGTH}+ characters with lowercase and uppercase letters, numbers, and symbols.`}
            hintClass="hidden [@media(min-height:800px)]:block"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            disabled={pending}
            autoFocus
            trailing={
              <PasswordEye
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
              />
            }
          />
          <PasswordRequirements password={password} />
        </div>

        <FormInput
          id="confirm-password"
          label="Confirm new password"
          type={showPassword ? "text" : "password"}
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••••••"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={fieldErrors.confirmPassword}
          disabled={pending}
        />

        <PrimaryButton pending={pending}>Update password</PrimaryButton>
      </form>
    </AuthFormShell>
  );
}
