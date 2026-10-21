import { useState } from "react";

import FormInput from "../components/FormInput.tsx";
import Modal from "../components/Modal.tsx";
import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import PasswordEye from "../components/PasswordEye.tsx";
import PasswordRequirements from "../components/PasswordRequirements.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import SettingsTabs from "../components/SettingsTabs.tsx";
import { FALLBACK_ERROR_MESSAGE, guide } from "../lib/authErrors.ts";
import { passwordViolations } from "../lib/password.ts";
import { supabase } from "../lib/supabase.ts";
import { useAuth } from "../context/useAuth.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";

function isWrongPassword(error: { code?: string | null; message?: string }): boolean {
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "invalid_credentials" ||
    message.includes("Invalid login credentials")
  );
}

export default function ProfileSecurityPage() {
  usePageTitle("Security");

  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signedOutVisible, setSignedOutVisible] = useState(false);

  const violations = passwordViolations(newPassword);
  const passwordsMatch =
    confirmPassword === "" || confirmPassword === newPassword;

  async function handleChangePassword() {
    if (pending) return;
    setError(null);
    setSavedVisible(false);

    if (currentPassword === "") {
      setError("Enter your current password first.");
      return;
    }
    if (violations.length > 0) {
      setError(`New password requirements not met: ${violations.join("; ")}.`);
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password must be different from the current one.");
      return;
    }
    if (confirmPassword !== newPassword) {
      setError("The confirmation doesn't match the new password.");
      return;
    }

    setPending(true);
    try {
      // Supabase's password update has no current-password check, so verify
      // explicitly via re-auth before the swap (protects an unlocked session).
      const email = user?.email;
      if (email == null) {
        setError("Your session is missing an email; sign in again and retry.");
        return;
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError != null) {
        setError(
          isWrongPassword(reauthError)
            ? "Your current password is incorrect."
            : guide(reauthError),
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError != null) throw updateError;

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSavedVisible(true);
      window.setTimeout(() => setSavedVisible(false), 5000);
    } catch (changeError) {
      console.error("[palse] password change failed", changeError);
      setError(guide(changeError));
    } finally {
      setPending(false);
    }
  }

  async function handleSignOutOthers() {
    if (signOutPending) return;
    setSignOutPending(true);
    try {
      const { error: signOutError } = await supabase.auth.signOut({
        scope: "others",
      });
      if (signOutError != null) throw signOutError;
      setConfirmOpen(false);
      setSignedOutVisible(true);
      window.setTimeout(() => setSignedOutVisible(false), 4000);
    } catch (caughtError) {
      console.error("[palse] sign-out-others failed", caughtError);
      setSignOutError(guide(caughtError, FALLBACK_ERROR_MESSAGE));
      setConfirmOpen(false);
    } finally {
      setSignOutPending(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Settings · Manage your account
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Security</h1>
      </header>

      <SettingsTabs />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {savedVisible ? (
        <Notice tone="success">Password updated — use it next time you sign in.</Notice>
      ) : null}
      {signedOutVisible ? (
        <Notice tone="success">All other sessions have been signed out.</Notice>
      ) : null}
      {signOutError ? <Notice tone="danger">{signOutError}</Notice> : null}

      <Panel
        title="Change password"
        subtitle="Your session is re-verified against the current password before the change is applied."
      >
        <div className="flex flex-col gap-5">
          <FormInput
            id="security-current"
            label="Current password"
            autoComplete="current-password"
            type="password"
            placeholder="••••••••••••"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={pending}
            trailing={
              <PasswordEye
                visible={showCurrent}
                onToggle={() => setShowCurrent((value) => !value)}
              />
            }
          />

          <div className="flex flex-col gap-2">
            <FormInput
              id="security-new"
              label="New password"
              autoComplete="new-password"
              type="password"
              placeholder="••••••••••••"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={pending}
              trailing={
                <PasswordEye
                  visible={showNew}
                  onToggle={() => setShowNew((value) => !value)}
                />
              }
            />
            <PasswordRequirements password={newPassword} />
          </div>

          <FormInput
            id="security-confirm"
            label="Confirm new password"
            autoComplete="new-password"
            type="password"
            placeholder="••••••••••••"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={
              passwordsMatch
                ? null
                : "The confirmation doesn't match the new password."
            }
            disabled={pending}
            trailing={
              <PasswordEye
                visible={showConfirm}
                onToggle={() => setShowConfirm((value) => !value)}
              />
            }
          />

          <div className="flex items-center justify-end gap-3 border-t border-theme-line pt-5">
            <PrimaryButton pending={pending} onClick={() => void handleChangePassword()} className="w-auto px-5">
              Update password
            </PrimaryButton>
          </div>
        </div>
      </Panel>

      <Panel title="Sign out other sessions">
        <p className="text-sm text-theme-gray">
          Signed in on another device or browser? Ending those sessions keeps
          them from holding an open account — your current session stays active.
        </p>
        <div className="flex justify-end border-t border-theme-line pt-5">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
          >
            Sign out other sessions
          </button>
        </div>
      </Panel>

      {confirmOpen ? (
        <Modal title="Sign out other sessions" onClose={() => setConfirmOpen(false)}>
          <div className="flex flex-col gap-5">
            <p className="text-sm text-theme-ink-soft">
              Every session except this one will be signed out and its tokens
              revoked. Any unsaved clinical work in those windows will be lost.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
              >
                Cancel
              </button>
              <PrimaryButton pending={signOutPending} onClick={() => void handleSignOutOthers()} className="w-auto px-4">
                Sign out others
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
