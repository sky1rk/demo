export type Sex = "female" | "male" | null;
export type RiskLevel = "pending" | "low" | "moderate" | "high";

/** Shape of `public.patients` rows as exposed to the app. */
export interface Patient {
  id: string;
  createdBy: string;
  mrn: string | null;
  firstName: string;
  lastName: string;
  sex: Sex;
  /** ISO date string. */
  dateOfBirth: string | null;
  gestationalAgeWeeks: number | null;
  birthWeightGrams: number | null;
  deliveryMode: "vaginal" | "cesarean" | null;
  riskLevel: RiskLevel;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewPatientInput {
  firstName: string;
  lastName: string;
  sex?: Exclude<Sex, null> | null;
  gestationalAgeWeeks?: number | null;
  birthWeightGrams?: number | null;
  mrn?: string | null;
}

export function formatPatientName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

/** Short human date for table cells and record stamps (e.g. "Jan 24, 2026"). */
export function formatDateLabel(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Human date + time for "recorded at" stamps (e.g. "Oct 22, 3:41 PM"). */
export function formatDateTimeLabel(iso: string | null): string {
  if (iso == null || iso === "") return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
