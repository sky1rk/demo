/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project API base URL. */
  readonly VITE_SUPABASE_URL?: string;
  /**
   * Supabase publishable API key (`sb_publishable_...`), the replacement for
   * the deprecated legacy `anon` key.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Cloudflare Turnstile site key. Empty/undefined disables the captcha. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
