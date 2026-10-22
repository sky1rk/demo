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
  /**
   * Base URL of the EOS inference service (e.g. http://127.0.0.1:8000 or the
   * Render URL). Empty/undefined keeps the results panels in fallback mode.
   */
  readonly VITE_ML_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
