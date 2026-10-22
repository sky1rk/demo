/**
 * Vital-sign observations over time — the time series behind /monitor.
 *
 * The wizard's `vitals` section is a point-in-time snapshot on the
 * assessment row; this table (`vital_observations`, schema v6) accumulates
 * every recorded reading so earlier/later records and trend charts work.
 */

export interface VitalObservation {
  id: string;
  createdBy: string;
  patientId: string;
  /** Assessment the reading was attached to, if any; delete of the parent clears it. */
  assessmentId: string | null;
  /** ISO timestamp; may be backdated for earlier records. */
  recordedAt: string;
  heartRateBpm: number | null;
  temperatureC: number | null;
  sbpMmHg: number | null;
  dbpMmHg: number | null;
  oxygenSaturationPct: number | null;
  respiratoryRatePerMin: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewVitalObservation {
  patientId: string;
  assessmentId?: string | null;
  recordedAt: string;
  heartRateBpm: number | null;
  temperatureC: number | null;
  sbpMmHg: number | null;
  dbpMmHg: number | null;
  oxygenSaturationPct: number | null;
  respiratoryRatePerMin: number | null;
}

interface ObservationDraft {
  heartRateBpm: string;
  temperatureC: string;
  sbpMmHg: string;
  dbpMmHg: string;
  oxygenSaturationPct: string;
  respiratoryRatePerMin: string;
}

export const EMPTY_OBSERVATION_DRAFT: ObservationDraft = {
  heartRateBpm: "",
  temperatureC: "",
  sbpMmHg: "",
  dbpMmHg: "",
  oxygenSaturationPct: "",
  respiratoryRatePerMin: "",
};

/**
 * Plausible clinical ranges for form validation (mirrors the wizard's
 * soft ranges; storage-level limits live in `supabase/schema.sql`).
 */
const OBSERVATION_RANGES: ReadonlyArray<readonly [keyof ObservationDraft, string, number, number]> = [
  ["heartRateBpm", "Heart rate", 40, 260],
  ["temperatureC", "Temperature", 30, 45],
  ["sbpMmHg", "Systolic blood pressure", 20, 200],
  ["dbpMmHg", "Diastolic blood pressure", 10, 150],
  ["oxygenSaturationPct", "O2 saturation", 40, 100],
  ["respiratoryRatePerMin", "Respiratory rate", 10, 130],
];

/** Returns the first error found, or null when the observation is valid. */
export function observationError(draft: ObservationDraft): string | null {
  let hasValue = false;
  for (const [key, label, min, max] of OBSERVATION_RANGES) {
    const raw = draft[key].trim();
    if (raw === "") continue;
    hasValue = true;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min || value > max) {
      return `${label} must be a number between ${min} and ${max}.`;
    }
  }
  if (!hasValue) {
    return "Enter at least one vital value for the reading.";
  }
  return null;
}

/** Postgres numeric → number|null per field, from a validated draft. */
export function draftToNumericFields(draft: ObservationDraft): {
  heartRateBpm: number | null;
  temperatureC: number | null;
  sbpMmHg: number | null;
  dbpMmHg: number | null;
  oxygenSaturationPct: number | null;
  respiratoryRatePerMin: number | null;
} {
  return {
    heartRateBpm: nullableNumber(draft.heartRateBpm),
    temperatureC: nullableNumber(draft.temperatureC),
    sbpMmHg: nullableNumber(draft.sbpMmHg),
    dbpMmHg: nullableNumber(draft.dbpMmHg),
    oxygenSaturationPct: nullableNumber(draft.oxygenSaturationPct),
    respiratoryRatePerMin: nullableNumber(draft.respiratoryRatePerMin),
  };
}

function nullableNumber(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return null;
  return Number.isFinite(Number(text)) ? Number(text) : null;
}

export type VitalSeriesPoint = { t: number; v: number };

/**
 * Extracts a chart series (recorded_at asc) from an observation list. Nulls
 * and blanks are skipped, so the line only connects real readings.
 */
export function observationSeries(
  observations: VitalObservation[],
  pick: (observation: VitalObservation) => number | null,
): VitalSeriesPoint[] {
  return observations
    .map((observation): VitalSeriesPoint | null => {
      const value = pick(observation);
      if (value == null) return null;
      return { t: Date.parse(observation.recordedAt), v: value };
    })
    .filter((point): point is VitalSeriesPoint => point != null)
    .sort((a, b) => a.t - b.t);
}
