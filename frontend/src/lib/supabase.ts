import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  console.error(
    "[palse] Missing Supabase environment variables. " +
      "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in frontend/.env.local.",
  );
}

/**
 * Supabase browser client.
 *
 * - Sessions persist in localStorage and refresh automatically.
 * - PKCE is the verification flow for any OAuth-style redirects.
 * - `detectSessionInUrl` picks up email confirmation / password-recovery
 *   links that redirect back into the app, so confirm and reset URLs can
 *   point straight at site pages.
 *
 * The browser uses the publishable API key (`sb_publishable_...`, the
 * replacement for the legacy `anon` key). It only reaches data the request
 * owner is entitled to via Row Level Security. Secret keys (`sb_secret_...`)
 * bypass RLS and must never be bundled into the frontend.
 */
export const supabase = createClient(
  supabaseUrl ?? "http://localhost:5173",
  supabasePublishableKey ?? "",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  },
);

