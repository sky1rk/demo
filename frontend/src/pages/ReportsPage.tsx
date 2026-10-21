import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import { listAllAssessments, listPatients } from "../lib/db.ts";
import { guide } from "../lib/authErrors.ts";
import {
  buildReportHtml,
  computeReportStats,
  downloadReport,
  type ReportEntry,
} from "../lib/report.ts";
import type { Assessment } from "../lib/assessment.ts";
import type { Patient, RiskLevel } from "../lib/patient.ts";
import {
  formatDateLabel,
  formatPatientName,
} from "../lib/patient.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";

const TIER_COLORS: Record<RiskLevel, string> = {
  high: "bg-risk-high-fg",
  moderate: "bg-risk-moderate-fg",
  low: "bg-risk-low-fg",
  pending: "bg-theme-gray",
};

const TIER_LABELS: Record<RiskLevel, string> = {
  high: "High risk",
  moderate: "Moderate risk",
  low: "Low risk",
  pending: "Pending",
};

export default function ReportsPage() {
  usePageTitle("Reports");

  const [assessments, setAssessments] = useState<Assessment[] | null>(null);
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedName, setGeneratedName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [allAssessments, registry] = await Promise.all([
          listAllAssessments(),
          listPatients(),
        ]);
        if (!active) return;
        setAssessments(allAssessments);
        setPatients(registry);
      } catch (error) {
        if (active) {
          console.error("[palse] reports load failed", error);
          setAssessments([]);
          setPatients([]);
          setLoadError(guide(error, "Could not load report data."));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(
    () => computeReportStats(assessments ?? [], patients ?? []),
    [assessments, patients],
  );

  const patientById = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const patient of patients ?? []) map.set(patient.id, patient);
    return map;
  }, [patients]);

  const recent = useMemo((): ReportEntry[] => {
    return (assessments ?? []).slice(0, 8).map((assessment) => ({
      id: assessment.id,
      patientName: patientById.get(assessment.patientId) != null
        ? formatPatientName(patientById.get(assessment.patientId) as Patient)
        : "—",
      status: assessment.status,
      createdAt: assessment.createdAt,
    }));
  }, [assessments, patientById]);

  const maxTier = Math.max(1, ...Object.values(stats.distribution));
  const loading = assessments === null || patients === null;

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const html = buildReportHtml(stats, recent, {
        clinicName: `${(patients ?? []).length} registered patients`,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      const name = downloadReport(html, `palse-report-${stamp}.html`);
      setGeneratedName(name);
      window.setTimeout(() => setGeneratedName(null), 5000);
    } catch (error) {
      console.error("[palse] report generation failed", error);
      setLoadError("Could not generate the report file. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
            Reports &amp; analytics
          </p>
          <h1 className="text-2xl font-bold text-theme-ink">
            Comprehensive sepsis prediction insights
          </h1>
          <p className="text-sm text-theme-gray">
            Aggregated from the clinical data already recorded in this team&apos;s
            registry.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || generating}
          onClick={() => void handleGenerate()}
          className="rounded-lg bg-theme-maroon px-4 py-2.5 text-sm font-semibold text-theme-white transition-colors hover:bg-theme-maroon-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon disabled:opacity-60"
        >
          {generating ? "Preparing…" : "Generate Report"}
        </button>
      </header>

      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {generatedName ? (
        <Notice tone="success">
          Report downloaded as <strong>{generatedName}</strong> — it also prints
          nicely to PDF from the browser.
        </Notice>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((card) => (
            <div
              key={card}
              className="h-32 animate-pulse rounded-xl border border-theme-line bg-white/70"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total assessments"
              value={String(stats.totalAssessments)}
              sub={`${stats.completed} completed · ${stats.drafts} draft${stats.drafts === 1 ? "" : "s"}`}
            />
            <StatCard
              label="High-risk cases"
              value={String(stats.highRiskPatients)}
              sub="Manually set risk levels"
              accent="bg-risk-high-fg"
            />
            <StatCard
              label="Accuracy rate"
              value="—"
              sub="Pending prediction engine"
              muted
            />
            <StatCard
              label="Avg response time"
              value="—"
              sub="Pending prediction engine"
              muted
            />
          </div>

          <Panel
            title="Risk distribution"
            subtitle="Where the registry's patients currently sit, as set manually on patient records."
          >
            <RiskDistribution distribution={stats.distribution} maxTier={maxTier} />
          </Panel>

          <Panel
            title="Recent assessments"
            subtitle="The eight most recent records across the whole team."
          >
            {recent.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-theme-gray">
                  No assessments recorded yet.
                </p>
                <Link
                  to="/dashboard"
                  className="text-sm font-semibold text-theme-maroon underline-offset-4 hover:underline"
                >
                  Run the first assessment →
                </Link>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto rounded-lg border border-theme-line md:block">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-theme-line bg-theme-light-gray/50 text-left text-xs font-bold uppercase tracking-wide text-theme-gray">
                        <th className="px-4 py-2.5">Assessment</th>
                        <th className="px-4 py-2.5">Patient</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Created</th>
                        <th className="px-4 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((entry) => (
                        <tr
                          key={entry.id}
                          className="border-b border-theme-line/60 last:border-0"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-theme-ink-soft">
                            {entry.id.slice(0, 8)}…
                          </td>
                          <td className="px-4 py-2.5 font-medium text-theme-ink">
                            {entry.patientName || "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusChip status={entry.status} />
                          </td>
                          <td className="px-4 py-2.5 text-theme-gray">
                            {formatDateLabel(entry.createdAt)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              to={`/monitor?patient=${
                                (assessments ?? []).find((a) => a.id === entry.id)
                                  ?.patientId ?? ""
                              }`}
                              className="text-xs font-semibold text-theme-maroon underline-offset-4 hover:underline"
                            >
                              Monitor
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="flex flex-col gap-2.5 md:hidden">
                  {recent.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-theme-line bg-white p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-theme-ink">
                          {entry.patientName || "—"}
                        </span>
                        <StatusChip status={entry.status} />
                      </div>
                      <div className="mt-1 text-xs text-theme-gray">
                        <span className="font-mono">{entry.id.slice(0, 8)}…</span>
                        {" · "}
                        {formatDateLabel(entry.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

/**
 * Horizontal CSS bar chart for the patient risk tiers — no chart library; the
 * registry's distributions are small and the brand palette speaks fine.
 */
function RiskDistribution({
  distribution,
  maxTier,
}: {
  distribution: Record<RiskLevel, number>;
  maxTier: number;
}) {
  const tiers: ReadonlyArray<RiskLevel> = ["high", "moderate", "low", "pending"];
  return (
    <div className="flex flex-col gap-3.5">
      {tiers.map((tier) => (
        <div key={tier} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-xs font-semibold text-theme-ink-soft">
            {TIER_LABELS[tier]}
          </span>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-theme-light-gray">
            <div
              className={`h-full rounded-full ${TIER_COLORS[tier]} transition-all duration-300`}
              style={{ width: `${(distribution[tier] / maxTier) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-sm font-bold text-theme-ink tabular-nums">
            {distribution[tier]}
          </span>
        </div>
      ))}
      {Object.values(distribution).every((n) => n === 0) ? (
        <p className="text-xs text-theme-gray">
          No patients registered yet — the chart fills as the registry grows.
        </p>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent = "bg-theme-maroon",
  muted = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
  /** True for the pending-engine placeholders. */
  muted?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-theme-line bg-white p-5 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden />
      <p className="text-xs font-bold uppercase tracking-wide text-theme-gray">
        {label}
      </p>
      <p
        className={[
          "mt-2 text-3xl font-bold tabular-nums",
          muted ? "text-theme-placeholder" : "text-theme-ink",
        ].join(" ")}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-theme-gray">{sub}</p>
    </div>
  );
}

function StatusChip({ status }: { status: "draft" | "complete" }) {
  return (
    <span
      className={[
        "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        status === "complete"
          ? "border-risk-low-fg/25 bg-risk-low-bg text-risk-low-fg"
          : "border-risk-moderate-fg/30 bg-risk-moderate-bg text-risk-moderate-fg",
      ].join(" ")}
    >
      {status === "complete" ? "Completed" : "Draft"}
    </span>
  );
}
