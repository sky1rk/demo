import type { Sex } from "./patient.ts";

export type DeliveryMode = "vaginal" | "cesarean" | null;

/** Section 1 — Demographic & Perinatal. */
export interface DemographicSection {
  sex: Sex;
  gestationalAgeWeeks: string;
  birthWeightGrams: string;
  deliveryMode: DeliveryMode;
  multipleBirth: boolean;
}

/** Section 2 — Maternal Factors. */
export interface MaternalSection {
  maternalAge: string;
  ancVisitsFourPlus: boolean | null;
  promOver18h: boolean | null;
  feverAtLeast38C: boolean | null;
  utiDuringPregnancy: boolean | null;
  hivPositive: boolean | null;
}

/** Section 3 — Neonatal Clinical Signs. */
export interface NeonatalSection {
  ageAtAdmissionHours: string;
  apgarFiveMinutes: string;
  poorFeeding: boolean;
  lethargy: boolean;
  convulsions: boolean;
  respiratoryDistress: boolean;
  jaundice: boolean;
  bulgingFontanelle: boolean;
}

/** Section 4 — Physiological (Hourly) vitals. */
export interface VitalsSection {
  heartRateBpm: string;
  temperatureC: string;
  bloodPressure: string;
  oxygenSaturationPct: string;
  respiratoryRatePerMin: string;
}

/** Section 5 — Current Treatment (toggle chips). */
export type TreatmentSection = Record<
  "centralVenousLine" | "umbilicalArterialLine" | "inotrope" | "intubated",
  boolean
>;

/** Section 6 — Comorbidities (toggle chips). */
export type ComorbiditiesSection = Record<
  | "necrotizingEnterocolitis"
  | "nonCardiacSurgicalDisease"
  | "chronicLungDisease"
  | "congenitalCardiacDisease",
  boolean
>;

export type AssessmentStatus = "draft" | "complete";

export interface AssessmentSections {
  demographic: DemographicSection;
  maternal: MaternalSection;
  neonatal: NeonatalSection;
  vitals: VitalsSection;
  treatment: TreatmentSection;
  comorbidities: ComorbiditiesSection;
}

/** Assessments row as exposed to the app (sections parsed from JSONB). */
export interface Assessment {
  id: string;
  createdBy: string;
  patientId: string;
  status: AssessmentStatus;
  demographic: DemographicSection;
  maternal: MaternalSection;
  neonatal: NeonatalSection;
  vitals: VitalsSection;
  treatment: TreatmentSection;
  comorbidities: ComorbiditiesSection;
  createdAt: string;
  updatedAt: string;
}

export type ClinicalSections = Pick<
  AssessmentSections,
  "vitals" | "treatment" | "comorbidities"
>;

export const EMPTY_VITALS: VitalsSection = {
  heartRateBpm: "",
  temperatureC: "",
  bloodPressure: "",
  oxygenSaturationPct: "",
  respiratoryRatePerMin: "",
};

export const EMPTY_TREATMENT: TreatmentSection = {
  centralVenousLine: false,
  umbilicalArterialLine: false,
  inotrope: false,
  intubated: false,
};

export const EMPTY_COMORBIDITIES: ComorbiditiesSection = {
  necrotizingEnterocolitis: false,
  nonCardiacSurgicalDisease: false,
  chronicLungDisease: false,
  congenitalCardiacDisease: false,
};
