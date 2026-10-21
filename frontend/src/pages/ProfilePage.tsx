import { useEffect, useState } from "react";

import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import SettingsTabs from "../components/SettingsTabs.tsx";
import { guide } from "../lib/authErrors.ts";
import { supabase } from "../lib/supabase.ts";
import { useAuth } from "../context/useAuth.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";

interface ProfileForm {
  firstName: string;
  lastName: string;
  department: string;
  role: string;
}

export default function ProfilePage() {
  usePageTitle("Profile");

  const { user, profile } = useAuth();

  const [form, setForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    department: "",
    role: "",
  });
  const [hydrated, setHydrated] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);

  // Synch the form once the profile (or the metadata fallback) arrives.
  useEffect(() => {
    if (hydrated) return;
    const first =
      profile?.first_name ?? (user?.user_metadata?.first_name as string | undefined) ?? "";
    const last =
      profile?.last_name ?? (user?.user_metadata?.last_name as string | undefined) ?? "";
    const department = profile?.department ?? "";
    const role = profile?.role ?? "";
    setForm({ firstName: first, lastName: last, department, role });
    setHydrated(true);
  }, [hydrated, profile, user]);

  const email = user?.email ?? "—";
  const memberSince =
    user?.created_at != null
      ? new Date(user.created_at).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : null;

  async function handleSave() {
    if (pending) return;
    setError(null);

    if (form.firstName.trim() === "" && form.lastName.trim() === "") {
      setError("Keep at least a name on record — both fields can't be empty.");
      return;
    }

    setPending(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        data: {
          first_name: form.firstName.trim(),
          last_name: form.lastName.trim(),
        },
      });
      if (updateError != null) throw updateError;

      if (profile != null) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            first_name: form.firstName.trim() || "Unknown",
            last_name: form.lastName.trim() || "Unknown",
            department: form.department.trim() === "" ? null : form.department.trim(),
            role: form.role.trim() === "" ? null : form.role.trim(),
          })
          .eq("id", profile.id);
        if (profileError != null) throw profileError;
      }

      setSavedVisible(true);
      window.setTimeout(() => setSavedVisible(false), 4000);
    } catch (saveError) {
      console.error("[palse] profile save failed", saveError);
      setError(guide(saveError, "Could not save your profile. Please try again."));
    } finally {
      setPending(false);
    }
  }

  function patch(update: Partial<ProfileForm>) {
    setForm((prev) => ({ ...prev, ...update }));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Settings · Manage your account
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Profile</h1>
      </header>

      <SettingsTabs />

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {savedVisible ? (
        <Notice tone="success">Profile changes saved.</Notice>
      ) : null}

      <Panel title="Profile information">
        <div className="grid gap-5 md:grid-cols-2">
          <FormInput
            id="profile-first-name"
            label="First name"
            value={form.firstName}
            onChange={(event) => patch({ firstName: event.target.value })}
          />
          <FormInput
            id="profile-last-name"
            label="Last name"
            value={form.lastName}
            onChange={(event) => patch({ lastName: event.target.value })}
          />
          <FormInput
            id="profile-department"
            label="Department"
            placeholder="e.g. Neonatology"
            value={form.department}
            onChange={(event) => patch({ department: event.target.value })}
          />
          <FormInput
            id="profile-role"
            label="Role"
            placeholder="e.g. Neonatologist"
            value={form.role}
            onChange={(event) => patch({ role: event.target.value })}
          />

          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-theme-gray">Email</span>
            <span className="text-sm text-theme-ink-soft">{email}</span>
            <span className="text-xs text-theme-gray">
              Set at signup — used for account recovery.
            </span>
          </div>
          {memberSince != null ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-theme-gray">Member since</span>
              <span className="text-sm text-theme-ink-soft">{memberSince}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-theme-line pt-5">
          <span className="text-xs text-theme-gray">
            Displayed to your team in the top bar.
          </span>
          <PrimaryButton
            pending={pending}
            onClick={() => void handleSave()}
            className="w-auto px-5"
          >
            Save changes
          </PrimaryButton>
        </div>
      </Panel>
    </div>
  );
}
