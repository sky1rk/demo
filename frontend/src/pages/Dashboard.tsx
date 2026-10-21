import BrandMastHead from "../components/BrandMastHead.tsx";
import { useAuth } from "../context/useAuth";

/**
 * Placeholder dashboard confirming the auth loop works. The real clinical
 * dashboard replaces the content below; the sign-out action stays.
 */
export default function Dashboard() {
  const { session, profile, signOut } = useAuth();
  const user = session?.user;

  const firstNameFromProfile = profile?.first_name;
  const firstNameFromMetadata = user?.user_metadata?.first_name as string | undefined;
  const firstName = firstNameFromProfile ?? firstNameFromMetadata ?? "there";

  return (
    <div className="flex min-h-screen flex-col bg-theme-light-gray">
      <header className="flex items-center justify-between bg-theme-maroon px-10 py-4 shadow-sm">
        <BrandMastHead compact />
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-theme-white/25 px-4 py-2 text-sm font-semibold text-theme-white transition-colors hover:bg-theme-white/10"
        >
          Sign out
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-theme-ink-gray">
        <h1 className="text-4xl font-bold">Welcome back, {firstName}.</h1>
        <p className="text-sm text-theme-gray">
          You&apos;re signed in as {user?.email}. The clinical workspace is under active
          development — this page verifies the authentication flow.
        </p>
      </main>
    </div>
  );
}
