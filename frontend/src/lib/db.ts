import {
  type Assessment,
  type AssessmentSections,
  type AssessmentStatus,
  type ClinicalSections,
  type StoredPrediction,
} from "./assessment.ts";
import type { PredictionResult } from "./ml.ts";
import { type Outcome, type Patient, type RiskLevel, type Sex } from "./patient.ts";
import { supabase } from "./supabase.ts";

/**
 * Direct Supabase data access for the clinical app. The EOS inference service
 * (`lib/ml.ts`) computes scores; everything else — auth, storage, ownership —
 * lives here and nowhere else.
 */

type PatientsRow = {
  id: string;
  created_by: string;
  mrn: string | null;
  first_name: string;
  last_name: string;
  sex: string | null;
  date_of_birth: string | null;
  gestational_age_weeks: number | null;
  birth_weight_grams: number | null;
  delivery_mode: string | null;
  risk_level: string;
  outcome: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toPatient(row: PatientsRow): Patient {
  return {
    id: row.id,
    createdBy: row.created_by,
    mrn: row.mrn,
    firstName: row.first_name,
    lastName: row.last_name,
    sex: (row.sex as Sex) ?? null,
    dateOfBirth: row.date_of_birth,
    gestationalAgeWeeks: row.gestational_age_weeks,
    birthWeightGrams: row.birth_weight_grams,
    deliveryMode: (row.delivery_mode as Patient["deliveryMode"]) ?? null,
    riskLevel: row.risk_level as RiskLevel,
    outcome: (row.outcome ?? "pending") as Outcome,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Registry list, newest first. */
export async function listPatients(): Promise<Patient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error != null) throw error;
  return ((data ?? []) as PatientsRow[]).map(toPatient);
}

interface CreatePatientInput {
  firstName: string;
  lastName: string;
  sex: Sex;
  gestationalAgeWeeks: number | null;
  birthWeightGrams: number | null;
  mrn: string | null;
}

interface CreatePatientExtras {
  dateOfBirth?: string | null;
  deliveryMode?: "vaginal" | "cesarean" | null;
  notes?: string | null;
}

export async function createPatient(
  input: CreatePatientInput,
  extras: CreatePatientExtras = {},
): Promise<Patient> {
  const { data, error } = await supabase
    .from("patients")
    .insert({
      mrn: input.mrn,
      first_name: input.firstName,
      last_name: input.lastName,
      sex: input.sex,
      gestational_age_weeks: input.gestationalAgeWeeks,
      birth_weight_grams: input.birthWeightGrams,
      date_of_birth: extras.dateOfBirth ?? null,
      delivery_mode: extras.deliveryMode ?? null,
      notes: extras.notes ?? null,
    })
    .select("*")
    .single();

  if (error != null) throw error;
  return toPatient(data as PatientsRow);
}

export interface UpdatePatientInput {
  firstName: string;
  lastName: string;
  sex: Exclude<Sex, null> | null;
  dateOfBirth: string | null;
  gestationalAgeWeeks: number | null;
  birthWeightGrams: number | null;
  deliveryMode: "vaginal" | "cesarean" | null;
  mrn: string | null;
  notes: string | null;
  riskLevel: RiskLevel;
}

export async function getPatient(id: string): Promise<Patient | null> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error != null) throw error;
  return data == null ? null : toPatient(data as PatientsRow);
}

export async function updatePatient(
  id: string,
  input: UpdatePatientInput,
): Promise<Patient> {
  const { data, error } = await supabase
    .from("patients")
    .update({
      first_name: input.firstName,
      last_name: input.lastName,
      sex: input.sex,
      date_of_birth: input.dateOfBirth,
      gestational_age_weeks: input.gestationalAgeWeeks,
      birth_weight_grams: input.birthWeightGrams,
      delivery_mode: input.deliveryMode,
      mrn: input.mrn,
      notes: input.notes,
      risk_level: input.riskLevel,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error != null) throw error;
  return toPatient(data as PatientsRow);
}

/** Removes the patient and, by cascade, all of their assessments. */
export async function deletePatient(id: string): Promise<void> {
  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error != null) throw error;
}

export interface NewAssessmentInput {
  patientId: string;
  status: AssessmentStatus;
  sections: AssessmentSections;
}

type AssessmentRow = {
  id: string;
  created_by: string;
  patient_id: string;
  status: AssessmentStatus;
  demographic: AssessmentSections["demographic"];
  maternal: AssessmentSections["maternal"];
  neonatal: AssessmentSections["neonatal"];
  vitals: AssessmentSections["vitals"];
  laboratory: AssessmentSections["laboratory"];
  treatment: AssessmentSections["treatment"];
  comorbidities: AssessmentSections["comorbidities"];
  prediction: StoredPrediction | null;
  predicted_at: string | null;
  created_at: string;
  updated_at: string;
};

function fromPredictionResult(result: PredictionResult): StoredPrediction {
  return {
    probability: result.probability,
    risk_label: result.riskLabel,
    decision_threshold: result.threshold,
    predicted_eos: result.predictedEos,
    xgb_eos_probability: result.xgbEosProbability,
    tft_eos_probability: result.tftEosProbability,
    tft_source: result.tftSource,
    inference_ms: result.inferenceMs,
    interpretation: result.interpretation,
    recommended_actions: result.recommendedActions,
  };
}

function toPredictionResult(stored: StoredPrediction): PredictionResult {
  return {
    probability: stored.probability,
    probabilityPercent: stored.probability * 100,
    riskLabel:
      stored.risk_label === "HIGH RISK"
        ? "HIGH RISK"
        : stored.risk_label === "LOW RISK"
          ? "LOW RISK"
          : "MODERATE RISK",
    resultTitle:
      stored.predicted_eos
        ? "Sepsis Risk Detected"
        : stored.risk_label === "MODERATE RISK"
          ? "Monitor Closely"
          : "Low EOS Risk",
    predictedEos: stored.predicted_eos,
    threshold: stored.decision_threshold,
    xgbEosProbability: stored.xgb_eos_probability,
    tftEosProbability: stored.tft_eos_probability,
    tftSource: stored.tft_source,
    interpretation: stored.interpretation,
    recommendedActions: stored.recommended_actions,
    inferenceMs: stored.inference_ms,
  };
}

/** Engine outcome surfaced with an assessment (null when never scored). */
export function assessmentPrediction(assessment: Assessment): PredictionResult | null {
  return assessment.prediction == null
    ? null
    : toPredictionResult(assessment.prediction);
}

function toAssessment(row: AssessmentRow): Assessment {
  return {
    id: row.id,
    createdBy: row.created_by,
    patientId: row.patient_id,
    status: row.status,
    demographic: row.demographic,
    maternal: row.maternal,
    neonatal: row.neonatal,
    vitals: row.vitals,
    laboratory: row.laboratory,
    treatment: row.treatment,
    comorbidities: row.comorbidities,
    prediction: row.prediction,
    predictedAt: row.predicted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** A patient's assessments, newest first. */
export async function listAssessments(patientId: string): Promise<Assessment[]> {
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });

  if (error != null) throw error;
  return ((data ?? []) as AssessmentRow[]).map(toAssessment);
}

/** Every assessment visible to the team, newest first (reports page). */
export async function listAllAssessments(): Promise<Assessment[]> {
  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error != null) throw error;
  return ((data ?? []) as AssessmentRow[]).map(toAssessment);
}

/**
 * Partially merges one or more clinical JSONB sections into an existing
 * assessment. Omitted keys are left untouched.
 */
export async function updateAssessmentSections(
  assessmentId: string,
  sections: Partial<ClinicalSections>,
): Promise<Assessment> {
  const { data, error } = await supabase
    .from("assessments")
    .update(sections)
    .eq("id", assessmentId)
    .select("*")
    .single();

  if (error != null) throw error;
  return toAssessment(data as AssessmentRow);
}

export async function createAssessment(input: NewAssessmentInput): Promise<string> {
  const { data, error } = await supabase
    .from("assessments")
    .insert({
      patient_id: input.patientId,
      status: input.status,
      demographic: input.sections.demographic,
      maternal: input.sections.maternal,
      neonatal: input.sections.neonatal,
      vitals: input.sections.vitals,
      laboratory: input.sections.laboratory,
      treatment: input.sections.treatment,
      comorbidities: input.sections.comorbidities,
    })
    .select("id")
    .single();

  if (error != null) throw error;
  return (data as { id: string }).id;
}

/**
 * The patient's open draft assessment, so the wizard can resume and complete
 * it in place instead of stacking duplicates. Scoped to the current user —
 * completing a draft is an UPDATE and its RLS policy allows the creator only.
 */
export async function latestDraftForPatient(
  patientId: string,
): Promise<Assessment | null> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (userId == null) return null;

  const { data, error } = await supabase
    .from("assessments")
    .select("*")
    .eq("patient_id", patientId)
    .eq("status", "draft")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error != null) throw error;
  const row = (data as AssessmentRow[] | null)?.[0];
  return row == null ? null : toAssessment(row);
}

/**
 * Re-saves an existing draft row (all seven sections) and flips its status
 * when the wizard completes it. Keeps one record per intake instead of
 * publishing a second assessment halfway through.
 */
export async function updateDraftAssessment(
  assessmentId: string,
  sections: AssessmentSections,
  status: AssessmentStatus,
): Promise<Assessment> {
  const { data, error } = await supabase
    .from("assessments")
    .update({
      status,
      demographic: sections.demographic,
      maternal: sections.maternal,
      neonatal: sections.neonatal,
      vitals: sections.vitals,
      laboratory: sections.laboratory,
      treatment: sections.treatment,
      comorbidities: sections.comorbidities,
    })
    .eq("id", assessmentId)
    .select("*")
    .single();

  if (error != null) throw error;
  return toAssessment(data as AssessmentRow);
}

/**
 * Persists an engine score on the assessment row (prediction JSONB +
 * denormalized columns) and updates the patient's registry risk level so
 * /patients pills reflect the engine instead of manual entry. Returns the
 * updated patient when the risk sync succeeds; a failure to sync the patient
 * never rolls back the stored prediction (legacy behavior: prediction rows
 * are immutable once recorded).
 */
export async function savePrediction(
  assessmentId: string,
  patientId: string,
  result: PredictionResult,
): Promise<void> {
  const { error } = await supabase
    .from("assessments")
    .update({
      prediction: fromPredictionResult(result),
      predicted_at: new Date().toISOString(),
    })
    .eq("id", assessmentId);

  if (error != null) throw error;

  await updatePatientRiskLevel(patientId, result);
}

/** Maps a legacy risk label onto the registry's low/moderate/high enum. */
export function riskLevelFromLabel(label: string): Exclude<RiskLevel, "pending"> {
  return label === "HIGH RISK" ? "high" : label === "LOW RISK" ? "low" : "moderate";
}

async function updatePatientRiskLevel(
  patientId: string,
  result: PredictionResult,
): Promise<void> {
  const { error } = await supabase
    .from("patients")
    .update({ risk_level: riskLevelFromLabel(result.riskLabel) })
    .eq("id", patientId);

  if (error != null) throw error;
}

/* ------------------------------ Outcomes -------------------------------- */

/**
 * Records a retroactive clinical outcome on the patient. Confirmed outcomes
 * are what make the Reports "Accuracy" card computable (engine prediction vs.
 * confirmed baseline), mirroring the legacy stack's per-user prediction/report
 * ownership with a team-scoped twist.
 */
export async function setPatientOutcome(
  patientId: string,
  outcome: Outcome,
): Promise<void> {
  const { error } = await supabase.from("patients").update({ outcome }).eq("id", patientId);
  if (error != null) throw error;
}
