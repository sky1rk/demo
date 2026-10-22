import { useEffect, useMemo, useState } from "react";
import { Link, useBlocker, useParams } from "react-router-dom";

import ChoiceGroup from "../components/ChoiceGroup.tsx";
import type { ChoiceOption } from "../components/ChoiceGroup.tsx";
import FormInput from "../components/FormInput.tsx";
import Modal from "../components/Modal.tsx";
import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import RiskBadge from "../components/RiskBadge.tsx";
import ScoringFailureNotice from "../components/ScoringFailureNotice.tsx";
import {
  ComorbiditiesChips,
  LabFields,
  TreatmentChips,
  VitalsFields,
} from "../components/AssessmentSectionFields.tsx";
import { labsError, vitalsError } from "../lib/clinicalValidation.ts";
import { guide } from "../lib/authErrors.ts";
import {
  getPatient,
  listAssessments,
  riskLevelFromLabel,
  savePrediction,
  setPatientOutcome,
  updateAssessmentSections,
  updatePatient,
} from "../lib/db.ts";
import { engineConfigured, MlEngineError, runPrediction } from "../lib/ml.ts";
import { useAuth } from "../context/useAuth.ts";
import type { Assessment, AssessmentSections } from "../lib/assessment.ts";
import {
  EMPTY_LABS,
  EMPTY_TREATMENT,
  EMPTY_VITALS,
  EMPTY_COMORBIDITIES,
} from "../lib/assessment.ts";
import type { Outcome, Patient, RiskLevel, Sex } from "../lib/patient.ts";
import { formatDateTimeLabel } from "../lib/patient.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";

const SEX_OPTIONS: ReadonlyArray<ChoiceOption<"female" | "male">> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

const MODE_OPTIONS: ReadonlyArray<ChoiceOption<"vaginal" | "cesarean">> = [
  { value: "vaginal", label: "Vaginal" },
  { value: "cesarean", label: "Cesarean" },
];

const RISK_OPTIONS: ReadonlyArray<{ value: RiskLevel; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
];

const OUTCOME_OPTIONS: ReadonlyArray<{ value: Outcome; label: string }> = [
  { value: "pending", label: "Pending confirmation" },
  { value: "confirmed_eos", label: "EOS confirmed" },
  { value: "ruled_out", label: "Sepsis ruled out" },
];

interface PatientForm {
  firstName: string;
  lastName: string;
  mrn: string;
  sex: Sex;
  dateOfBirth: string;
  gestationalAgeWeeks: string;
  birthWeightGrams: string;
  deliveryMode: "vaginal" | "cesarean" | null;
  notes: string;
  riskLevel: RiskLevel;
  outcome: Outcome;
}

function formFromPatient(patient: Patient): PatientForm {
  return {
    firstName: patient.firstName,
    lastName: patient.lastName,
    mrn: patient.mrn ?? "",
    sex: patient.sex,
    dateOfBirth: patient.dateOfBirth ?? "",
    gestationalAgeWeeks: patient.gestationalAgeWeeks?.toString() ?? "",
    birthWeightGrams: patient.birthWeightGrams?.toString() ?? "",
    deliveryMode: patient.deliveryMode,
    notes: patient.notes ?? "",
    riskLevel: patient.riskLevel,
    outcome: patient.outcome ?? "pending",
  };
}

export default function EditPatientPage() {
  const { id } = useParams<{ id: string }>();
  usePageTitle("Update patient");

  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [latest, setLatest] = useState<{
    id: string;
    status: "draft" | "complete";
    updatedAt: string;
    /** Full assessment row — supplies the sections the edit cards don't show
     * so the engine can rescore the complete clinical picture. */
    row: Assessment;
  } | null>(null);

  const [form, setForm] = useState<PatientForm | null>(null);
  const [vitals, setVitals] = useState(EMPTY_VITALS);
  const [labs, setLabs] = useState(EMPTY_LABS);
  const [treatment, setTreatment] = useState(EMPTY_TREATMENT);
  const [comorbidities, setComorbidities] = useState(EMPTY_COMORBIDITIES);

  const [initial, setInitial] = useState<{ patient: PatientForm; clinical: string } | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);
  const [rescoreNotice, setRescoreNotice] = useState<string | null>(null);
  /** Engine outage on the last rescoring attempt; retryable via the notice. */
  const [scoringFailure, setScoringFailure] = useState<MlEngineError | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    if (id == null) return;
    setLoading(true);
    setLoadError(null);
    void (async () => {
      try {
        const [loadedPatient, assessments] = await Promise.all([
          getPatient(id),
          listAssessments(id),
        ]);
        if (!active) return;
        if (loadedPatient == null) {
          setPatient(null);
          setLoading(false);
          return;
        }
        setPatient(loadedPatient);
        setForm(formFromPatient(loadedPatient));

        const first = assessments[0];
        if (first != null) {
          setLatest({
            id: first.id,
            status: first.status,
            updatedAt: first.updatedAt,
            row: first,
          });
          setVitals(first.vitals);
          setLabs(first.laboratory);
          setTreatment(first.treatment);
          setComorbidities(first.comorbidities);
          setInitial({
            patient: formFromPatient(loadedPatient),
            clinical: JSON.stringify({
              vitals: first.vitals,
              laboratory: first.laboratory,
              treatment: first.treatment,
              comorbidities: first.comorbidities,
            }),
          });
        } else {
          setInitial({
            patient: formFromPatient(loadedPatient),
            clinical: "",
          });
        }
      } catch (error) {
        if (active) {
          console.error("[palse] load patient failed", error);
          setLoadError(guide(error, "Could not load this patient."));
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const dirty = useMemo(() => {
    if (form == null || initial == null) return false;
    if (JSON.stringify(form) !== JSON.stringify(initial.patient)) return true;
    if (initial.clinical !== "") {
      return (
        JSON.stringify({ vitals, laboratory: labs, treatment, comorbidities }) !==
        initial.clinical
      );
    }
    return false;
  }, [form, initial, vitals, labs, treatment, comorbidities]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );

  // Warn before closing/reloading the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  if (loading) {
    return (
      <Panel className="items-center gap-4 py-14 text-center">
        <p className="text-sm text-theme-gray">Loading patient…</p>
      </Panel>
    );
  }

  if (loadError != null || patient == null || form == null) {
    return (
      <Panel className="items-center gap-4 py-14 text-center">
        <h1 className="text-xl font-bold text-theme-ink">
          {loadError != null ? "Something went wrong" : "Patient not found"}
        </h1>
        <p className="max-w-sm text-sm text-theme-gray">
          {loadError != null
            ? loadError
            : "This patient record does not exist or you don't have access to it."}
        </p>
        <Link
          to="/patients"
          className="rounded-lg bg-theme-maroon px-5 py-2.5 text-sm font-semibold text-theme-white transition-colors hover:bg-theme-maroon-hover"
        >
          Back to registry
        </Link>
      </Panel>
    );
  }

  async function handleSave() {
    if (savePending || form == null || patient == null) return;
    // Capture the narrowed values so the async body has non-nullable locals.
    const formState = form;
    const patientState = patient;
    setSaveError(null);
    setRescoreNotice(null);
    setScoringFailure(null);

    // Re-validate the essentials on save.
    if (formState.firstName.trim() === "" || formState.lastName.trim() === "") {
      setSaveError("The patient needs a first and last name.");
      return;
    }
    const ga = formState.gestationalAgeWeeks.trim();
    if (ga !== "" && !(Number(ga) >= 20 && Number(ga) <= 45)) {
      setSaveError("Gestational age must be between 20 and 45 weeks.");
      return;
    }
    const bw = formState.birthWeightGrams.trim();
    if (bw !== "" && !(Number(bw) >= 200 && Number(bw) <= 8000)) {
      setSaveError("Birth weight must be between 200 and 8000 grams.");
      return;
    }
    const vitalsValidationError = vitalsError(vitals);
    if (vitalsValidationError != null) {
      setSaveError(vitalsValidationError);
      return;
    }
    const labsValidationError = labsError(labs);
    if (labsValidationError != null) {
      setSaveError(labsValidationError);
      return;
    }

    setSavePending(true);
    // Engine rescore may override the manual risk level; tracked so the form
    // and the unsaved-changes baseline stay in sync with the engine result.
    let nextRisk: RiskLevel | null = null;
    try {
      const outcomeChanged = patientState.outcome !== formState.outcome;
      if (outcomeChanged) {
        await setPatientOutcome(patientState.id, formState.outcome);
      }
      const savedPatient = await updatePatient(patientState.id, {
        firstName: formState.firstName.trim(),
        lastName: formState.lastName.trim(),
        sex: formState.sex,
        dateOfBirth: formState.dateOfBirth === "" ? null : formState.dateOfBirth,
        gestationalAgeWeeks: ga === "" ? null : Number(ga),
        birthWeightGrams: bw === "" ? null : Number(bw),
        deliveryMode: formState.deliveryMode,
        mrn: formState.mrn.trim() === "" ? null : formState.mrn.trim(),
        notes: formState.notes.trim() === "" ? null : formState.notes.trim(),
        riskLevel: formState.riskLevel,
      });
      setPatient(
        outcomeChanged ? { ...savedPatient, outcome: formState.outcome } : savedPatient,
      );

      if (latest != null) {
        const saved = await updateAssessmentSections(latest.id, {
          vitals,
          laboratory: labs,
          treatment,
          comorbidities,
        });
        setLatest((prev) =>
          prev == null ? null : { ...prev, updatedAt: saved.updatedAt },
        );

        // Rescore with the engine when it's configured: the edited clinical
        // cards are merged over the latest row's full section set so the
        // model always sees the complete picture. A scoring failure never
        // rolls back the saved edits — it surfaces in the retryable notice.
        if (engineConfigured() && accessToken != null) {
          try {
            const rescoredRisk = await rescoreLatest(
              patientState.id,
              latest.id,
            );
            if (rescoredRisk != null) {
              nextRisk = rescoredRisk;
            }
          } catch (error) {
            console.error("[palse] edit rescoring failed", error);
            if (error instanceof MlEngineError) {
              setScoringFailure(error);
            } else {
              // Non-engine failure (e.g. storing the result) — neutral copy.
              setRescoreNotice(
                "Could not rescore: the prediction engine could not be reached. The record will be scored retroactively.",
              );
            }
          }
        }
      }

      const nextForm = formFromPatient({
        ...savedPatient,
        outcome: outcomeChanged ? formState.outcome : savedPatient.outcome,
        riskLevel: nextRisk ?? savedPatient.riskLevel,
      });
      setInitial({
        patient: nextForm,
        clinical:
          latest == null
            ? ""
            : JSON.stringify({ vitals, laboratory: labs, treatment, comorbidities }),
      });
      if (nextRisk != null) {
        const engineRisk = nextRisk; // narrow once for the state callback
        setForm((prev) => (prev == null ? prev : { ...prev, riskLevel: engineRisk }));
      }
      setSavedVisible(true);
      window.setTimeout(() => setSavedVisible(false), 4000);
    } catch (error) {
      console.error("[palse] patient update failed", error);
      setSaveError(guide(error, "Could not save the changes. Please try again."));
    } finally {
      setSavePending(false);
    }
  }

  /** Re-runs the engine over the latest assessment with the unsaved clinical
   * edits merged in, and stores the prediction. Throws MlEngineError on
   * engine failure so callers surface the retryable notice. */
  async function rescoreLatest(
    patientId: string,
    assessmentId: string,
  ): Promise<RiskLevel | null> {
    if (latest == null || accessToken == null) return null;
    const mergedSections: AssessmentSections = {
      demographic: latest.row.demographic,
      maternal: latest.row.maternal,
      neonatal: latest.row.neonatal,
      vitals,
      laboratory: labs,
      treatment,
      comorbidities,
    };
    const prediction = await runPrediction(mergedSections, accessToken);
    await savePrediction(assessmentId, patientId, prediction);
    const rescoredRisk = riskLevelFromLabel(prediction.riskLabel);
    setPatient((prev) =>
      prev == null ? prev : { ...prev, riskLevel: rescoredRisk },
    );
    setRescoreNotice(
      `Record rescored by the prediction engine — risk level is now “${rescoredRisk}”.`,
    );
    setScoringFailure(null);
    return rescoredRisk;
  }

  /** Re-runs the failed rescoring straight from the current clinical cards;
   * surfaced by the "Retry scoring" button on the failure notice. */
  function retryRescore() {
    if (savePending || latest == null || patient == null || accessToken == null) {
      return;
    }
    // Capture the narrowed values so the callback has non-nullable locals.
    const patientState = patient;
    setSavePending(true);
    rescoreLatest(patientState.id, latest.id)
      .catch((error) => {
        console.error("[palse] edit rescoring retry failed", error);
        if (error instanceof MlEngineError) {
          setScoringFailure(error);
        } else {
          setRescoreNotice(
            "Could not rescore: the prediction engine could not be reached. The record will be scored retroactively.",
          );
        }
      })
      .finally(() => {
        setSavePending(false);
      });
  }

  function patchForm(update: Partial<PatientForm>) {
    setForm((prev) => (prev == null ? prev : { ...prev, ...update }));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          to="/patients"
          className="text-xs font-semibold text-theme-gray underline-offset-4 hover:underline"
        >
          ← Patient registry
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
              Update patient data
            </p>
            <h1 className="text-2xl font-bold text-theme-ink">
              {form.firstName.trim() || "Unnamed"} {form.lastName.trim()}
            </h1>
            {form.mrn.trim() !== "" ? (
              <p className="text-xs text-theme-gray">MRN {form.mrn.trim()}</p>
            ) : null}
          </div>
          <RiskBadge level={form.riskLevel} />
        </div>
      </header>

      {saveError ? <Notice tone="danger">{saveError}</Notice> : null}
      {savedVisible ? (
        <Notice tone="success">
          Changes saved{latest != null ? " — including the latest assessment" : ""}.
        </Notice>
      ) : null}
      {rescoreNotice != null && !saveError ? (
        <Notice tone="success">{rescoreNotice}</Notice>
      ) : null}
      {scoringFailure != null && !saveError ? (
        <ScoringFailureNotice
          error={scoringFailure}
          retryPending={savePending}
          onRetry={() => retryRescore()}
        />
      ) : null}
      {dirty ? (
        <Notice tone="info">
          You have unsaved changes. Use “Save changes” to keep them.
        </Notice>
      ) : null}

      <Panel title="Demographics & perinatal">
        <div className="grid gap-5 md:grid-cols-2">
          <FormInput
            id="edit-first-name"
            label="First name"
            value={form.firstName}
            onChange={(event) => patchForm({ firstName: event.target.value })}
          />
          <FormInput
            id="edit-last-name"
            label="Last name"
            value={form.lastName}
            onChange={(event) => patchForm({ lastName: event.target.value })}
          />
          <FormInput
            id="edit-mrn"
            label="MRN №"
            placeholder="e.g. NEO-2024-001"
            value={form.mrn}
            onChange={(event) => patchForm({ mrn: event.target.value })}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-risk" className="text-sm font-medium text-theme-ink">
              Risk level{" "}
              <span className="text-xs font-normal text-theme-gray">
                (set automatically by the prediction engine)
              </span>
            </label>
            <select
              id="edit-risk"
              value={form.riskLevel}
              onChange={(event) => patchForm({ riskLevel: event.target.value as RiskLevel })}
              className="w-full rounded-lg border border-theme-line bg-white px-3.5 py-2 text-sm text-theme-ink transition-colors focus:border-theme-maroon focus:outline-none focus:ring-2 focus:ring-theme-maroon/25"
            >
              {RISK_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="edit-outcome" className="text-sm font-medium text-theme-ink">
              Outcome{" "}
              <span className="text-xs font-normal text-theme-gray">
                (confirmation of what actually happened)
              </span>
            </label>
            <select
              id="edit-outcome"
              value={form.outcome}
              onChange={(event) => patchForm({ outcome: event.target.value as Outcome })}
              className="w-full rounded-lg border border-theme-line bg-white px-3.5 py-2 text-sm text-theme-ink transition-colors focus:border-theme-maroon focus:outline-none focus:ring-2 focus:ring-theme-maroon/25"
            >
              {OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-theme-ink">Sex</span>
            <ChoiceGroup
              options={SEX_OPTIONS}
              value={form.sex}
              onChange={(next) => patchForm({ sex: next })}
              allowUnset
            />
          </div>
          <FormInput
            id="edit-dob"
            label="Date of birth"
            type="date"
            value={form.dateOfBirth}
            onChange={(event) => patchForm({ dateOfBirth: event.target.value })}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-theme-ink">Delivery mode</span>
            <ChoiceGroup
              options={MODE_OPTIONS}
              value={form.deliveryMode}
              onChange={(next) => patchForm({ deliveryMode: next })}
              allowUnset
            />
          </div>
          <FormInput
            id="edit-ga"
            label="Gestational age (weeks)"
            type="number"
            min={20}
            max={45}
            value={form.gestationalAgeWeeks}
            onChange={(event) => patchForm({ gestationalAgeWeeks: event.target.value })}
          />
          <FormInput
            id="edit-bw"
            label="Birth weight (grams)"
            type="number"
            min={200}
            max={8000}
            value={form.birthWeightGrams}
            onChange={(event) => patchForm({ birthWeightGrams: event.target.value })}
          />
          <div className="md:col-span-2">
            <FormInput
              id="edit-notes"
              label="Notes"
              placeholder="Allergies, birth complications, transfer context…"
              value={form.notes}
              onChange={(event) => patchForm({ notes: event.target.value })}
            />
          </div>
        </div>
      </Panel>

      {latest == null ? (
        <Notice tone="info">
          No assessment on record yet — the clinical cards (vitals, treatment,
          comorbidities) appear after the first assessment is completed on the
          dashboard.
        </Notice>
      ) : (
        <>
          <Panel
            title="Physiological (Hourly)"
            subtitle={`Latest assessment · ${latest.status === "complete" ? "completed" : "draft"} · as of ${formatDateTimeLabel(latest.updatedAt)}`}
          >
            <VitalsFields
              value={vitals}
              onChange={(next) => setVitals((prev) => ({ ...prev, ...next }))}
              idPrefix="edit"
            />
          </Panel>

          {/* Neonatal section is wizard-owned; shown read-only here. */}
          <Panel title="Neonatal context" subtitle="Read-only · from the latest assessment">
            <dl className="grid gap-4 md:grid-cols-4">
              {(
                [
                  ["Age at admission (h)", latest.row.neonatal.ageAtAdmissionHours.trim()],
                  ["APGAR 1 min", latest.row.neonatal.apgarOneMinute.trim()],
                  ["APGAR 5 min", latest.row.neonatal.apgarFiveMinutes.trim()],
                  ["APGAR 10 min", latest.row.neonatal.apgarTenMinutes.trim()],
                ] as ReadonlyArray<readonly [string, string]>
              ).map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <dt className="text-xs font-bold uppercase tracking-wide text-theme-gray">
                    {label}
                  </dt>
                  <dd className="text-sm tabular-nums text-theme-ink">
                    {value === "" ? "—" : value}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Laboratory Results">
            <LabFields
              value={labs}
              onChange={(next) => setLabs((prev) => ({ ...prev, ...next }))}
              idPrefix="edit"
            />
          </Panel>

          <Panel title="Current Treatment">
            <TreatmentChips value={treatment} onChange={setTreatment} />
          </Panel>

          <Panel title="Comorbidities">
            <ComorbiditiesChips value={comorbidities} onChange={setComorbidities} />
          </Panel>
        </>
      )}

      <div className="flex items-center justify-end gap-3">
        {dirty ? <span className="text-xs text-theme-gray">Unsaved changes</span> : null}
        <PrimaryButton
          pending={savePending}
          disabled={!dirty}
          onClick={() => void handleSave()}
          className="w-auto px-5"
        >
          Save changes
        </PrimaryButton>
      </div>

      {blocker.state === "blocked" ? (
        <Modal title="Leave without saving?" onClose={() => blocker.reset?.()}>
          <p className="text-sm text-theme-ink-soft">
            You have unsaved changes that will be lost if you leave this page.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => blocker.reset?.()}
              className="rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray"
            >
              Stay and edit
            </button>
            <button
              type="button"
              onClick={() => blocker.proceed?.()}
              className="rounded-lg bg-risk-high-fg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Discard changes
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
