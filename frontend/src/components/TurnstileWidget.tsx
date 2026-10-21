import { useEffect, useId, useRef } from "react";

import { captchaSiteKey } from "../lib/captcha.ts";

/**
 * Cloudflare Turnstile challenge.
 *
 * Renders nothing (and skips the challenge entirely) when
 * `VITE_TURNSTILE_SITE_KEY` is not configured, e.g. local development.
 * Callers should pair it with `isCaptchaEnabled()`.
 *
 * The token is surfaced through `onVerify`; stale challenges are reported via
 * `onExpire` so the caller can clear the stored token.
 */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptReady: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile?.render) return Promise.resolve();
  if (scriptReady) return scriptReady;

  scriptReady = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptReady = null;
      reject(new Error("Failed to load Turnstile script"));
    };
    document.head.append(script);
  });
  return scriptReady;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

export default function TurnstileWidget({
  onVerify,
  onExpire,
  className,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const widgetDomId = useId();

  // Keep handler refs fresh outside of render (React compiler friendly).
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
  });

  const siteKey = captchaSiteKey();
  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    void loadTurnstileScript().then(() => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current !== null) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "light",
        callback: (token) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current?.(),
        "error-callback": () => onExpireRef.current?.(),
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Widget may already be gone after an HMR remount.
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <div id={widgetDomId} ref={containerRef} className="min-h-16" />
    </div>
  );
}
