/**
 * CSV import for vital-sign readings (earlier/later records on /monitor and
 * in the wizard's readings block).
 *
 * Canonical headers (see `vitals-import-example.csv` at the project root):
 *
 *   recorded_at,heart_rate_bpm,temperature_c,sbp_mmhg,dbp_mmhg,
 *   oxygen_saturation_pct,respiratory_rate_per_min
 *
 * Column names are matched case/space-insensitively, with aliases; every
 * value column is optional per row but at least one vital must be present
 * (same rule as the manual form). Timestamps accept ISO 8601 or
 * "YYYY-MM-DD HH:MM" (read as local time, matching the backdating picker).
 */

import {
  type NewVitalObservation,
  draftToNumericFields,
  EMPTY_OBSERVATION_DRAFT,
  type ObservationDraft,
  observationError,
} from "./vitals.ts";

type ColumnSpec = {
  canonical: string;
  aliases: ReadonlyArray<string>;
};

const COLUMNS: ReadonlyArray<ColumnSpec & { target: keyof ObservationDraft }> = [
  { canonical: "heart_rate_bpm", target: "heartRateBpm", aliases: ["hr", "heart_rate", "heartrate"] },
  { canonical: "temperature_c", target: "temperatureC", aliases: ["temp", "temp_c", "temperature"] },
  { canonical: "sbp_mmhg", target: "sbpMmHg", aliases: ["sbp", "sys", "systolic", "bp_systolic"] },
  { canonical: "dbp_mmhg", target: "dbpMmHg", aliases: ["dbp", "dia", "diastolic", "bp_diastolic"] },
  {
    canonical: "oxygen_saturation_pct",
    target: "oxygenSaturationPct",
    aliases: ["spo2", "o2", "oxygen_saturation", "saturation"],
  },
  {
    canonical: "respiratory_rate_per_min",
    target: "respiratoryRatePerMin",
    aliases: ["rr", "resp_rate", "respiratory_rate", "resprate"],
  },
];

const TIMESTAMP_ALIASES: ReadonlyArray<string> = [
  "recorded_at",
  "recordedat",
  "recorded",
  "time",
  "datetime",
  "date_time",
  "timestamp",
  "date",
];

export interface ParsedRow {
  row: NewVitalObservation;
  /** Raw CSV row number the data came from (1-based, header included). */
  sourceLine: number;
  recordedAt: string;
}

export interface ParsedError {
  sourceLine: number;
  message: string;
}

export interface ParsedCsv {
  rows: ParsedRow[];
  errors: ParsedError[];
}

/** Hard cap so a huge file can't produce one enormous multi-row insert. */
export const CSV_IMPORT_LIMIT = 500;

/**
 * RFC-4180-ish parse: quoted fields with doubled quotes, CRLF/LF/newline
 * tolerant. Deliberately dependency-free — readings CSVs are flat numbers
 * and timestamps.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || (row.length === 1 && row[0].trim() !== "")) {
      rows.push(row);
    }
    row = [];
  };

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      endRow();
    } else {
      field += char;
    }
    i += 1;
  }
  // Final unterminated field/row (no trailing newline).
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Lowercase, strip spaces/underscores for tolerant header matching. */
function headerKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/** "2026-10-21 08:30" → ISO string; invalid → null. */
function toIsoTimestamp(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;
  // Accept a space instead of "T" for datetime-local-style values.
  const parsed = new Date(text.includes("T") ? text : text.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/**
 * Parses vital-observation CSV content into validated rows + per-row errors.
 * The caller supplies the patient (and optional assessment) the rows belong
 * to — the CSV itself only carries readings.
 */
export function parseVitalsCsv(
  text: string,
  belongsTo: { patientId: string; assessmentId?: string | null },
): ParsedCsv {
  const table = parseCsv(text);
  const rows: ParsedRow[] = [];
  const errors: ParsedError[] = [];

  if (table.length === 0) {
    errors.push({ sourceLine: 0, message: "The file is empty." });
    return { rows, errors };
  }

  const header = table[0].map(headerKey);
  const timestampIndex = header.findIndex((key) => TIMESTAMP_ALIASES.includes(key));
  if (timestampIndex === -1) {
    errors.push({
      sourceLine: 1,
      message:
        'Missing a recorded-time column — add a "recorded_at" header (accepts time / datetime / timestamp aliases).',
    });
    return { rows, errors };
  }

  const columnIndexes = COLUMNS.map(
    ({ canonical, aliases, target }): { target: keyof ObservationDraft; index: number } | null => {
      const allNames = [canonical, ...aliases].map(headerKey);
      const index = header.findIndex((key) => allNames.includes(key));
      return index === -1 ? null : { target, index };
    },
  ).filter((spec): spec is { target: keyof ObservationDraft; index: number } => spec != null);

  if (columnIndexes.length === 0) {
    errors.push({
      sourceLine: 1,
      message:
        "No vital-value column matched — expected one of: heart_rate_bpm, temperature_c, sbp_mmhg, dbp_mmhg, oxygen_saturation_pct, respiratory_rate_per_min.",
    });
    return { rows, errors };
  }

  for (let line = 1; line < table.length; line += 1) {
    const cells = table[line];
    const recordedIso = toIsoTimestamp(cells[timestampIndex] ?? "");
    if (recordedIso == null) {
      errors.push({
        sourceLine: line + 1,
        message: "recorded_at is missing or not a parseable timestamp.",
      });
      continue;
    }

    // Extra unrecognised columns are ignored — canonical names only.
    const draft: ObservationDraft = { ...EMPTY_OBSERVATION_DRAFT };
    for (const column of columnIndexes) {
      draft[column.target] = (cells[column.index] ?? "").trim();
    }

    const invalid = observationError(draft);
    if (invalid != null) {
      errors.push({ sourceLine: line + 1, message: invalid });
      continue;
    }

    rows.push({
      row: {
        patientId: belongsTo.patientId,
        assessmentId: belongsTo.assessmentId ?? null,
        recordedAt: recordedIso,
        ...draftToNumericFields(draft),
      },
      sourceLine: line + 1,
      recordedAt: recordedIso,
    });
    if (rows.length >= CSV_IMPORT_LIMIT) {
      errors.push({
        sourceLine: line + 1,
        message: `Import stopped at ${CSV_IMPORT_LIMIT} rows — split the file and import again.`,
      });
      break;
    }
  }

  return { rows, errors };
}
