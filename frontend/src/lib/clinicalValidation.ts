import type { LabSection, VitalsSection } from "./assessment.ts";

function withinRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/**
 * Validation for the vitals section. Empty values are allowed (fields are
 * optional). Returns the first error found or null when the section is valid.
 */
export function vitalsError(vitals: VitalsSection): string | null {
  const checks: ReadonlyArray<readonly [string, string, number, number]> = [
    ["Heart rate", vitals.heartRateBpm, 40, 260],
    ["Temperature", vitals.temperatureC, 30, 45],
    ["O2 saturation", vitals.oxygenSaturationPct, 40, 100],
    ["Respiratory rate", vitals.respiratoryRatePerMin, 10, 130],
  ];
  for (const [label, raw, min, max] of checks) {
    const value = raw.trim();
    if (value !== "" && !withinRange(Number(value), min, max)) {
      return `${label} must be a number between ${min} and ${max}.`;
    }
  }
  const bp = vitals.bloodPressure.trim();
  if (bp !== "" && !/^\d{1,3}\s*\/\s*\d{1,3}$/.test(bp)) {
    return "Blood pressure must use the systolic/diastolic format, e.g. 74/44.";
  }
  return null;
}

/**
 * Validation for the laboratory section. Values are optional (leaving a field
 * empty means "not ordered" — the model imputes accordingly). Returns the
 * first error found or null when the section is valid.
 */
export function labsError(labs: LabSection): string | null {
  const checks: ReadonlyArray<readonly [string, string, number, number]> = [
    ["CRP", labs.crpMgL, 0, 500],
    ["WBC count", labs.wbcCount, 0, 100000],
    ["Platelet count", labs.plateletCount, 0, 1000000],
  ];
  for (const [label, raw, min, max] of checks) {
    const value = raw.trim();
    if (value !== "" && !withinRange(Number(value), min, max)) {
      return `${label} must be a number between ${min} and ${max}.`;
    }
  }
  return null;
}
