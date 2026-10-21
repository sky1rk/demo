import {
  type Assessment,
  type AssessmentSections,
  type AssessmentStatus,
  type ClinicalSections,
} from "./assessment.ts";
import { type Patient, type RiskLevel, type Sex } from "./patient.ts";
import { supabase } from "./supabase.ts";

/**
 * Direct Supabase data access for the clinical app. These functions are the
 * seam for the future backend (Render + prediction engine) — the UI never
 * touches the supabase client outside of here.
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
  treatment: AssessmentSections["treatment"];
  comorbidities: AssessmentSections["comorbidities"];
  created_at: string;
  updated_at: string;
};

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
    treatment: row.treatment,
    comorbidities: row.comorbidities,
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
      treatment: input.sections.treatment,
      comorbidities: input.sections.comorbidities,
    })
    .select("id")
    .single();

  if (error != null) throw error;
  return (data as { id: string }).id;
}
