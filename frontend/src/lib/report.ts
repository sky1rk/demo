import type { Assessment, AssessmentStatus } from "./assessment.ts";
import type { Patient, RiskLevel } from "./patient.ts";

export interface ReportStats {
  totalAssessments: number;
  completed: number;
  drafts: number;
  highRiskPatients: number;
  /** Patient counts per risk tier (drives the distribution chart). */
  distribution: Record<RiskLevel, number>;
}

export interface ReportEntry {
  id: string;
  patientName: string;
  status: AssessmentStatus;
  createdAt: string;
}

export function computeReportStats(
  assessments: Assessment[],
  patients: Patient[],
): ReportStats {
  const completed = assessments.filter(
    (assessment) => assessment.status === "complete",
  ).length;

  const distribution: Record<RiskLevel, number> = {
    low: 0,
    moderate: 0,
    high: 0,
    pending: 0,
  };
  for (const patient of patients) {
    distribution[patient.riskLevel] += 1;
  }

  return {
    totalAssessments: assessments.length,
    completed,
    drafts: assessments.length - completed,
    highRiskPatients: distribution.high,
    distribution,
  };
}

/**
 * Self-contained printable HTML summary of the current registry state —
 * downloaded client-side with no canvas/html2canvas whatsoever.
 */
export function buildReportHtml(
  stats: ReportStats,
  entries: ReportEntry[],
  options: { clinicName?: string } = {},
): string {
  const generatedAt = new Date().toLocaleString();
  const clinicName = options.clinicName ?? "Pal.se Clinical Team";

  const riskRows = (["high", "moderate", "low", "pending"] as const)
    .map((tier) => {
      const colors: Record<RiskLevel, string> = {
        high: "#b42318",
        moderate: "#9a5b00",
        low: "#1f7a45",
        pending: "#9a8f8c",
      };
      return `<tr>
        <td><span class="dot" style="background:${colors[tier]}"></span>${tier === "pending" ? "Pending" : `${tier[0].toUpperCase()}${tier.slice(1)} risk`}</td>
        <td class="num">${stats.distribution[tier]}</td>
      </tr>`;
    })
    .join("");

  const rows = entries
    .map(
      (entry) => `<tr>
        <td class="mono">${escapeHtml(entry.id.slice(0, 8))}…</td>
        <td>${escapeHtml(entry.patientName || "—")}</td>
        <td><span class="pill ${entry.status}">${entry.status === "complete" ? "Completed" : "Draft"}</span></td>
        <td>${escapeHtml(new Date(entry.createdAt).toLocaleString())}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pal.se Report — ${escapeHtml(new Date().toLocaleDateString())}</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; background: #f3f2ee; color: #0f1720; }
  .page { max-width: 860px; margin: 40px auto; padding: 0 24px; }
  header { background: #5b1616; color: #fbf8f5; border-radius: 14px 14px 0 0; padding: 28px 32px; }
  header h1 { margin: 0; font-size: 22px; letter-spacing: 0.2px; }
  header p { margin: 6px 0 0; opacity: 0.8; font-size: 13px; }
  section { background: #fff; padding: 24px 32px; border: 1px solid #e8e3dd; border-top: 0; }
  section:last-of-type { border-radius: 0 0 14px 14px; }
  h2 { font-size: 15px; margin: 0 0 14px; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .stat { border: 1px solid #e8e3dd; border-radius: 10px; padding: 14px 16px; }
  .stat .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #9a8f8c; }
  .stat .value { font-size: 30px; font-weight: 800; margin-top: 4px; }
  .stat .sub { font-size: 12px; color: #9a8f8c; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9a8f8c; border-bottom: 1px solid #e8e3dd; padding: 8px 10px; }
  td { border-bottom: 1px solid #f0ece6; padding: 9px 10px; }
  tr:last-child td { border-bottom: 0; }
  .num { font-weight: 700; }
  .mono { font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; }
  .pill { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; border: 1px solid; }
  .pill.complete { color: #1f7a45; background: #e8f5ee; border-color: #dbeee3; }
  .pill.draft { color: #9a5b00; background: #fff3cf; border-color: #f2e3b4; }
  footer { text-align: center; font-size: 11px; color: #9a8f8c; padding: 18px 0 40px; }
  .placeholder-note { font-size: 12px; color: #9a8f8c; }
  @media print { body { background: #fff; } .page { margin: 0; max-width: none; } }
</style>
</head>
<body>
  <div class="page">
    <header>
      <h1>Pal.se — Neonatal Sepsis Report</h1>
      <p>${escapeHtml(clinicName)} · Generated ${escapeHtml(generatedAt)}</p>
    </header>

    <section>
      <h2>Summary</h2>
      <div class="stats">
        <div class="stat"><div class="label">Total assessments</div><div class="value">${stats.totalAssessments}</div><div class="sub">${stats.completed} completed · ${stats.drafts} draft${stats.drafts === 1 ? "" : "s"}</div></div>
        <div class="stat"><div class="label">High-risk cases</div><div class="value">${stats.highRiskPatients}</div><div class="sub">Manually set risk levels</div></div>
        <div class="stat"><div class="label">Accuracy rate</div><div class="value">—</div><div class="sub placeholder-note">Pending prediction engine</div></div>
        <div class="stat"><div class="label">Avg response time</div><div class="value">—</div><div class="sub placeholder-note">Pending prediction engine</div></div>
      </div>
      ${Object.values(stats.distribution).every((n) => n === 0) ? `<p class="placeholder-note" style="margin-top:14px">No patients registered yet, so no risk distribution is available.</p>` : `<h2 style="margin-top:26px">Risk distribution (patients)</h2><table>${riskRows}</table>`}
    </section>

    <section>
      <h2>Recent assessments</h2>
      ${entries.length === 0 ? `<p class="placeholder-note">No assessments recorded yet — run the first one from the dashboard.</p>` : `<table>
        <thead><tr><th>Assessment</th><th>Patient</th><th>Status</th><th>Created</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`}
    </section>

    <footer>Generated client-side from Supabase data. Scores pending the prediction engine integration.</footer>
  </div>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Triggers a browser download; returns the suggested file name. */
export function downloadReport(html: string, fileName: string): string {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return fileName;
}
