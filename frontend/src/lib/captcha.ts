/**
 * Cloudflare Turnstile site configuration. Reads the site key once; callers
 * pair it with `isCaptchaEnabled()` to short-circuit captcha logic when the
 * widget is unconfigured (e.g. local development).
 */
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

/**
 * Normalized site key: empty strings (e.g. `VITE_TURNSTILE_SITE_KEY=` in env
 * files) are treated the same as unset, so nothing is rendered or loaded.
 */
export function captchaSiteKey(): string | undefined {
  return SITE_KEY ? SITE_KEY : undefined;
}

export function isCaptchaEnabled(): boolean {
  return Boolean(SITE_KEY);
}
