import type { LabSection, VitalsSection } from "./assessment.ts";

function withinRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Single numeric-field validator shared by the wizard's inline errors and
 * the step gate. Empty is either required (asterisk fields) or fine (the
 * model imputes). Note `Number("") === 0` in JS, so emptiness is checked
 * before any Number() conversion.
 */
export function rangeFieldError(
  raw: string,
  opts: { label: string; min: number; max: number; required?: boolean },
): string | null {
  const value = raw.trim();
  if (value === "") {
    return opts.required === true ? `${opts.label} is required.` : null;
  }
  if (!Number.isFinite(Number(value))) {
    return `${opts.label} must be a number.`;
  }
  if (!withinRange(Number(value), opts.min, opts.max)) {
    return `${opts.label} must be between ${opts.min} and ${opts.max}.`;
  }
  return null;
}

/** Ranges for each vital field — shared by the section gate and the field
 * components so the numbers only live here. */
export const VITAL_FIELD_RANGES = {
  heartRateBpm: { label: "Heart rate", min: 40, max: 260 },
  temperatureC: { label: "Temperature", min: 30, max: 45 },
  oxygenSaturationPct: { label: "O2 saturation", min: 40, max: 100 },
  respiratoryRatePerMin: { label: "Respiratory rate", min: 10, max: 130 },
} as const;

/** Ranges for each laboratory field (lab values optional; imputed when
 * "not ordered"). */
export const LAB_FIELD_RANGES = {
  crpMgL: { label: "CRP", min: 0, max: 500 },
  wbcCount: { label: "WBC count", min: 0, max: 100000 },
  plateletCount: { label: "Platelet count", min: 0, max: 1000000 },
} as const;

const BP_FORMAT = /^\d{1,3}\s*\/\s*\d{1,3}$/;

/** Systolic/diastolic format check for the paired BP field. */
export function bloodPressureError(raw: string): string | null {
  const bp = raw.trim();
  if (bp !== "" && !BP_FORMAT.test(bp)) {
    return "Blood pressure must use the systolic/diastolic format, e.g. 74/44.";
  }
  return null;
}

/**
 * Validation for the vitals section. Empty values are allowed (fields are
 * optional). Returns the first error found or null when the section is valid.
 */
export function vitalsError(vitals: VitalsSection): string | null {
  for (const [field, opts] of Object.entries(VITAL_FIELD_RANGES)) {
    const error = rangeFieldError(
      vitals[field as keyof VitalsSection],
      opts,
    );
    if (error != null) return error;
  }
  return bloodPressureError(vitals.bloodPressure);
}

/**
 * Validation for the laboratory section. Values are optional (leaving a field
 * empty means "not ordered" — the model imputes accordingly). Returns the
 * first error found or null when the section is valid.
 */
export function labsError(labs: LabSection): string | null {
  for (const [field, opts] of Object.entries(LAB_FIELD_RANGES)) {
    const error = rangeFieldError(
      labs[field as keyof LabSection],
      opts,
    );
    if (error != null) return error;
  }
  return null;
}
