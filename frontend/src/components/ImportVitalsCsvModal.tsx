import { useMemo, useState } from "react";

import Modal from "./Modal.tsx";
import PrimaryButton from "./PrimaryButton.tsx";
import Notice from "./Notice.tsx";
import { addVitalObservations } from "../lib/db.ts";
import { guide } from "../lib/authErrors.ts";
import {
  CSV_IMPORT_LIMIT,
  parseVitalsCsv,
  type ParsedCsv,
} from "../lib/vitalsCsv.ts";
import { formatDateTimeLabel } from "../lib/patient.ts";
import type { VitalObservation } from "../lib/vitals.ts";

/**
 * CSV importer for earlier/later vital readings, shared by /monitor and the
 * wizard's readings block. Parses with the tolerant aliases documented in
 * `vitals-import-example.csv` (project root), previews the first rows with
 * per-row errors, then inserts the valid batch in one call.
 *
 * Readings have no natural key: importing the same file twice adds
 * duplicates — the intro copy says so and the readings table offers deletes.
 */
export default function ImportVitalsCsvModal({
  patientId,
  patientName: patientForText,
  assessmentId,
  onClose,
  onImported,
}: {
  patientId: string;
  /** Null when the host doesn't want the name echoed into copy (e.g. wizard). */
  patientName: string | null;
  assessmentId?: string | null;
  onClose: () => void;
  /** Receives the newly inserted rows (newest-last ordering). */
  onImported: (rows: VitalObservation[]) => void;
}) {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => (parsed?.rows ?? []).slice(0, 8), [parsed]);

  function readFile(file: File) {
    setResult(null);
    setParsed(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setError(`Could not read “${file.name}”. Try saving it as plain text CSV.`);
    };
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      const outcome = parseVitalsCsv(text, { patientId, assessmentId });
      setFileName(file.name);
      setParsed(outcome);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (parsed == null || parsed.rows.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const inserted = await addVitalObservations(
        parsed.rows.map((entry) => entry.row),
      );
      const skipped = parsed.errors.length;
      setResult(
        `Imported ${inserted.length} reading${inserted.length === 1 ? "" : "s"}${
          patientForText != null ? ` for ${patientForText}` : ""
        }${
          skipped > 0 ? ` — ${skipped} row${skipped === 1 ? "" : "s"} skipped (listed below).` : "."
        }`,
      );
      onImported(inserted);
      setParsed(null);
      setFileName(null);
    } catch (importError) {
      console.error("[palse] vitals CSV import failed", importError);
      setError(guide(importError, "Could not import the readings. Try again."));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="Import vital readings (CSV)" onClose={onClose}>
      <div className="flex flex-col gap-4 text-sm text-theme-ink-soft">
        {result != null ? <Notice tone="success">{result}</Notice> : null}
        {error != null ? <Notice tone="danger">{error}</Notice> : null}

        <p className="text-xs leading-5 text-theme-gray">
          Columns{" "}
          <code className="rounded bg-theme-light-gray px-1 py-0.5 text-[11px]">
            recorded_at, heart_rate_bpm, temperature_c, sbp_mmhg, dbp_mmhg,
            oxygen_saturation_pct, respiratory_rate_per_min
          </code>
          — every vital column is optional per row (leave blank), timestamps may
          be ISO or <span className="whitespace-nowrap">YYYY-MM-DD HH:MM</span>. Aliases
          like <span className="italic">hr</span>, <span className="italic">spo2</span>, or{" "}
          <span className="italic">resp_rate</span> match automatically. Re-importing the
          same file adds duplicate readings — delete extras from the table.
        </p>

        <label
          htmlFor="vitals-csv-file"
          className="cursor-pointer rounded-lg border border-dashed border-theme-line px-4 py-3 text-center text-sm text-theme-ink transition-colors hover:border-theme-maroon hover:bg-theme-maroon/5"
        >
          {fileName ?? "Choose a .csv file…"}
          <input
            id="vitals-csv-file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file != null) readFile(file);
            }}
          />
        </label>

        {parsed != null ? (
          <div className="flex flex-col gap-2">
            {parsed.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-theme-line">
                <table className="w-full text-xs">
                  <caption className="sr-only">CSV preview</caption>
                  <thead>
                    <tr className="border-b border-theme-line text-left uppercase tracking-wide text-theme-gray">
                      <th scope="col" className="px-3 py-1.5 font-semibold">Row</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">Recorded</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">HR</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">Temp</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">SBP/DBP</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">O2</th>
                      <th scope="col" className="px-3 py-1.5 font-semibold">RR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((entry) => {
                      const v = entry.row;
                      return (
                        <tr key={entry.sourceLine} className="border-b border-theme-line/60 last:border-0 tabular-nums">
                          <td className="px-3 py-1.5 text-theme-gray">{entry.sourceLine}</td>
                          <td className="px-3 py-1.5 text-theme-ink">
                            {formatDateTimeLabel(v.recordedAt)}
                          </td>
                          <td className="px-3 py-1.5">{v.heartRateBpm ?? "—"}</td>
                          <td className="px-3 py-1.5">{v.temperatureC ?? "—"}</td>
                          <td className="px-3 py-1.5">
                            {v.sbpMmHg == null && v.dbpMmHg == null
                              ? "—"
                              : `${v.sbpMmHg ?? "—"} / ${v.dbpMmHg ?? "—"}`}
                          </td>
                          <td className="px-3 py-1.5">{v.oxygenSaturationPct ?? "—"}</td>
                          <td className="px-3 py-1.5">{v.respiratoryRatePerMin ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {parsed.rows.length > preview.length ? (
                  <p className="border-t border-theme-line px-3 py-1.5 text-[11px] text-theme-gray">
                    …and {parsed.rows.length - preview.length} more valid rows.
                  </p>
                ) : null}
              </div>
            ) : null}

            {parsed.errors.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-lg border border-risk-moderate-fg/30 bg-risk-moderate-bg/40 px-3 py-2 text-xs">
                {parsed.errors.slice(0, 6).map((lineError, index) => (
                  <li key={`${lineError.sourceLine}-${index}`}>
                    {lineError.sourceLine > 0 ? (
                      <>
                        Line {lineError.sourceLine}: {lineError.message}
                      </>
                    ) : (
                      lineError.message
                    )}
                  </li>
                ))}
                {parsed.errors.length > 6 ? (
                  <li>…{parsed.errors.length - 6} more skipped rows.</li>
                ) : null}
              </ul>
            ) : null}

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-theme-gray">
                {parsed.rows.length > CSV_IMPORT_LIMIT / 2 ? (
                  <>Batch {parsed.rows.length}/{CSV_IMPORT_LIMIT} rows.</>
                ) : (
                  <>
                    {parsed.rows.length} valid row
                    {parsed.rows.length === 1 ? "" : "s"}
                  </>
                )}
              </span>
              <PrimaryButton
                pending={importing}
                disabled={parsed.rows.length === 0}
                onClick={() => void handleImport()}
                type="button"
                className="w-auto"
              >
                {parsed.rows.length === 0 ? "Nothing to import" : `Import ${parsed.rows.length} readings`}
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
