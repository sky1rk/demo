import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import AuthFormShell from "../components/AuthFormShell.tsx";
import { AuthSplash } from "../components/AuthGuard.tsx";
import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import PasswordEye from "../components/PasswordEye.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import TurnstileWidget from "../components/TurnstileWidget.tsx";
import { isCaptchaEnabled } from "../lib/captcha.ts";
import { useAuth } from "../context/useAuth";
import { guide } from "../lib/authErrors.ts";
import { isEmailFormat } from "../lib/validation.ts";
import { supabase } from "../lib/supabase.ts";

interface Errors {
  email: string | null;
  password: string | null;
  form: string | null;
}

const blankErrors: Errors = { email: null, password: null, form: null };

export default function Signin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { loading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>(blankErrors);

  const isIdleSignOut = searchParams.get("idle") === "1";
  const cameFrom = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;
  const destination = cameFrom && cameFrom !== "/signin" ? cameFrom : "/dashboard";

  function validate(): boolean {
    const next: Errors = {
      email: email.trim().length === 0
        ? "Enter your email address."
        : !isEmailFormat(email.trim())
          ? "Enter a valid email address."
          : null,
      password: password.length === 0 ? "Enter your password." : null,
      form: null,
    };
    setErrors(next);
    return next.email === null && next.password === null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !validate()) return;

    setPending(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken: captchaToken ?? undefined },
      });

      if (error != null) {
        setErrors({ ...blankErrors, form: guide(error) });
        return;
      }

      await navigate(destination, { replace: true });
    } catch (cause) {
      console.error("[palse signin]", cause);
      setErrors({ ...blankErrors, form: "Sign-in failed. Please try again." });
    } finally {
      setPending(false);
    }
  }

  if (loading) return <AuthSplash />;

  return (
    <AuthFormShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="mt-2 text-sm text-theme-gray">
          Sign in to access the clinical dashboard.
        </p>
      </div>

      {isIdleSignOut ? (
        <Notice tone="info" className="mb-5">
          You were signed out after 15 minutes of inactivity. Please sign in again.
        </Notice>
      ) : null}

      <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {errors.form ? <Notice tone="danger">{errors.form}</Notice> : null}

        <FormInput
          id="email"
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@hospital.org"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          disabled={pending}
          autoFocus
        />

        <FormInput
          id="password"
          label="Password"
          type={showPassword ? "text" : "password"}
          name="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          disabled={pending}
          trailing={
            <PasswordEye
              visible={showPassword}
              onToggle={() => setShowPassword((value) => !value)}
            />
          }
        />

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-theme-maroon underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <TurnstileWidget
          className="w-[286px] max-w-full"
          onVerify={(token) => setCaptchaToken(token)}
          onExpire={() => setCaptchaToken(null)}
        />

        <PrimaryButton pending={pending} disabled={isCaptchaEnabled() && captchaToken == null}>
          Sign in
        </PrimaryButton>
      </form>

      <p className="mt-10 text-sm text-theme-gray">
        Don&apos;t have an account?{" "}
        <Link
          to="/signup"
          className="font-semibold text-theme-maroon underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthFormShell>
  );
}
