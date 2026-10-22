import type { MlEngineError } from "../lib/ml.ts";
import Notice from "./Notice.tsx";

/**
 * Shared presentation for a failed engine scoring attempt whose underlying
 * record was saved (assessment wizard, patient editing, vitals monitor).
 *
 * Rendered in the amber "warning" tone — the data is safe, but part of the
 * workflow did not finish — and offers an inline retry so a transient engine
 * outage doesn't force the user onto the retroactive-scoring path. Only the
 * outage-scoped kinds (unreachable/timeout/server) reach this component;
 * callers keep `auth` / `not_configured` failures in their own info notices.
 */
const HEADLINES: Record<
  "unreachable" | "timeout" | "server",
  string
> = {
  unreachable: "The prediction engine could not be reached.",
  timeout: "The prediction engine did not respond in time.",
  server: "The prediction engine reported a server error.",
};

export default function ScoringFailureNotice({
  error,
  onRetry,
  retryPending = false,
  className,
}: {
  error: MlEngineError;
  /** Present when the caller can retry scoring with the same inputs. */
  onRetry?: () => void;
  retryPending?: boolean;
  className?: string;
}) {
  return (
    <Notice tone="warning" className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">
            {error.kind === "not_configured" || error.kind === "auth"
              ? "Scoring could not be completed."
              : HEADLINES[error.kind]}
          </p>
          <p>
            The record was saved and will be scored automatically once the
            engine is back online.
          </p>
          {error.kind === "server" ? (
            <p className="text-xs opacity-80">{error.message}</p>
          ) : null}
        </div>
        {onRetry != null ? (
          <button
            type="button"
            disabled={retryPending}
            onClick={onRetry}
            className="shrink-0 self-start rounded-lg border border-theme-maroon px-4 py-2 text-sm font-semibold text-theme-maroon transition-colors hover:bg-theme-maroon/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon disabled:opacity-60"
          >
            {retryPending ? "Scoring…" : "Retry scoring"}
          </button>
        ) : null}
      </div>
    </Notice>
  );
}
