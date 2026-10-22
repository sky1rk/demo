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
  /** Optional minutes-1 score; the legacy stack derived it as 5min − 1. */
  apgarOneMinute: string;
  apgarFiveMinutes: string;
  /** Minutes-10 score — informational context, not a current model feature. */
  apgarTenMinutes: string;
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

/** Section 5 — Laboratory. Optional values; an empty field means "not ordered". */
export interface LabSection {
  crpMgL: string;
  wbcCount: string;
  plateletCount: string;
}

/** Section 6 — Current Treatment (toggle chips). */
export type TreatmentSection = Record<
  "centralVenousLine" | "umbilicalArterialLine" | "inotrope" | "intubated",
  boolean
>;

/** Section 7 — Comorbidities (toggle chips). */
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
  laboratory: LabSection;
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
  laboratory: LabSection;
  treatment: TreatmentSection;
  comorbidities: ComorbiditiesSection;
  /** Engine score; null when the assessment has never been scored. */
  prediction: StoredPrediction | null;
  predictedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ClinicalSections = Pick<
  AssessmentSections,
  "vitals" | "laboratory" | "treatment" | "comorbidities"
>;

export const EMPTY_VITALS: VitalsSection = {
  heartRateBpm: "",
  temperatureC: "",
  bloodPressure: "",
  oxygenSaturationPct: "",
  respiratoryRatePerMin: "",
};

export const EMPTY_LABS: LabSection = {
  crpMgL: "",
  wbcCount: "",
  plateletCount: "",
};

/**
 * Prediction block persisted on the assessment row after the inference
 * service responds (`supabase/schema.sql` v3: `assessments.prediction` +
 * `predicted_at`). `risk_label` denormalizes the box for the registry; the
 * full legacy contract stays intact for reports.
 */
export interface StoredPrediction {
  probability: number;
  risk_label: string;
  decision_threshold: number;
  predicted_eos: boolean;
  xgb_eos_probability: number;
  tft_eos_probability: number;
  tft_source: string;
  inference_ms: number;
  interpretation: string;
  recommended_actions: string[];
}

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
