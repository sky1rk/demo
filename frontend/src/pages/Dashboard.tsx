import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import ChipGroup from "../components/ChipGroup.tsx";
import type { ChipOption } from "../components/ChipGroup.tsx";
import ChoiceGroup from "../components/ChoiceGroup.tsx";
import type { ChoiceOption } from "../components/ChoiceGroup.tsx";
import FormInput from "../components/FormInput.tsx";
import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import PrimaryButton from "../components/PrimaryButton.tsx";
import {
  ComorbiditiesChips,
  LabFields,
  TreatmentChips,
  VitalsFields,
} from "../components/AssessmentSectionFields.tsx";
import PatientModal from "../components/PatientModal.tsx";
import PatientSearch from "../components/PatientSearch.tsx";
import ImportVitalsCsvModal from "../components/ImportVitalsCsvModal.tsx";
import VitalReadingForm from "../components/VitalReadingForm.tsx";
import type { VitalReadingPayload } from "../components/VitalReadingForm.tsx";
import MsIcon from "../components/MsIcon.tsx";
import { useAuth } from "../context/useAuth.ts";
import {
  addVitalObservation,
  createAssessment,
  latestDraftForPatient,
  listPatients,
  listVitalObservations,
  riskLevelFromLabel,
  savePrediction,
  updateDraftAssessment,
} from "../lib/db.ts";
import { draftToNumericFields, observationError } from "../lib/vitals.ts";
import type { VitalObservation } from "../lib/vitals.ts";
import type {
  Assessment,
  AssessmentSections,
  AssessmentStatus,
  MaternalSection,
  NeonatalSection,
} from "../lib/assessment.ts";
import type { PredictionResult } from "../lib/ml.ts";
import { engineConfigured, MlEngineError, runPrediction } from "../lib/ml.ts";
import { vitalsError, labsError, rangeFieldError } from "../lib/clinicalValidation.ts";
import ScoringFailureNotice from "../components/ScoringFailureNotice.tsx";
import { formatDateLabel, formatDateTimeLabel, formatPatientName } from "../lib/patient.ts";
import type { Patient } from "../lib/patient.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";
import { guide } from "../lib/authErrors.ts";

type SexChoice = "female" | "male";
type ModeChoice = "vaginal" | "cesarean";
type YesNo = boolean | null;

const STEPS = [
  { short: "Demographic", full: "Demographic & Perinatal", icon: "child_care" },
  { short: "Maternal", full: "Maternal Factors", icon: "pregnant_woman" },
  { short: "Neonatal", full: "Neonatal Clinical Signs", icon: "sick" },
  { short: "Vitals", full: "Physiological (Hourly)", icon: "monitor_heart" },
  { short: "Laboratory", full: "Laboratory Results", icon: "science" },
  { short: "Treatment", full: "Current Treatment", icon: "medication" },
  { short: "Comorbidities", full: "Comorbidities", icon: "coronavirus" },
] as const;

const YES_NO: ReadonlyArray<ChoiceOption<"yes" | "no">> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

type SignKey =
  | "poorFeeding"
  | "lethargy"
  | "convulsions"
  | "respiratoryDistress"
  | "jaundice"
  | "bulgingFontanelle";

const SEX_OPTIONS: ReadonlyArray<ChoiceOption<SexChoice>> = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

const MODE_OPTIONS: ReadonlyArray<ChoiceOption<ModeChoice>> = [
  { value: "vaginal", label: "Vaginal" },
  { value: "cesarean", label: "Cesarean" },
];

const SIGNS: ReadonlyArray<ChipOption<SignKey>> = [
  { key: "poorFeeding", label: "Poor Feeding" },
  { key: "lethargy", label: "Lethargy" },
  { key: "convulsions", label: "Convulsions" },
  { key: "respiratoryDistress", label: "Respiratory Distress" },
  { key: "jaundice", label: "Jaundice" },
  { key: "bulgingFontanelle", label: "Bulging Fontanelle" },
];

const EMPTY_SECTIONS: AssessmentSections = {
  demographic: {
    sex: null,
    gestationalAgeWeeks: "",
    birthWeightGrams: "",
    deliveryMode: null,
    multipleBirth: false,
  },
  maternal: {
    maternalAge: "",
    ancVisitsFourPlus: null,
    promOver18h: null,
    feverAtLeast38C: null,
    utiDuringPregnancy: null,
    hivPositive: null,
  },
  neonatal: {
    ageAtAdmissionHours: "",
    apgarOneMinute: "",
    apgarFiveMinutes: "",
    apgarTenMinutes: "",
    poorFeeding: false,
    lethargy: false,
    convulsions: false,
    respiratoryDistress: false,
    jaundice: false,
    bulgingFontanelle: false,
  },
  vitals: {
    heartRateBpm: "",
    temperatureC: "",
    bloodPressure: "",
    oxygenSaturationPct: "",
    respiratoryRatePerMin: "",
  },
  laboratory: {
    crpMgL: "",
    wbcCount: "",
    plateletCount: "",
  },
  treatment: {
    centralVenousLine: false,
    umbilicalArterialLine: false,
    inotrope: false,
    intubated: false,
  },
  comorbidities: {
    necrotizingEnterocolitis: false,
    nonCardiacSurgicalDisease: false,
    chronicLungDisease: false,
    congenitalCardiacDisease: false,
  },
};

/**
 * Assessment wizard: seven intake sections stored as JSONB on the patient's
 * assessment row. Completing the wizard runs the EOS inference service
 * (`lib/ml.ts` → legacy residual-ensemble stack) when VITE_ML_API_URL is
 * configured; the result lands in the Analysis results panel and on the
 * assessment row. Without the engine the wizard still stores safely (the
 * engine scores retroactively once deployed).
 */
export default function Dashboard() {
  usePageTitle("Assessment");

  const { session } = useAuth();
  const accessToken = session?.access_token ?? null;

  const [step, setStep] = useState(1);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [sections, setSections] = useState<AssessmentSections>(EMPTY_SECTIONS);
  /** The patient's open draft row once resumed; null fresh-wizard until "Resume draft". */
  const [resume, setResume] = useState<Assessment | null>(null);
  const [resumeLoaded, setResumeLoaded] = useState(false);

  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [engineNotice, setEngineNotice] = useState<{
    tone: "info" | "success";
    message: string;
  } | null>(null);
  /** Engine outage on the last completed assessment. The wizard resets once
   * saved, so the scored sections travel with the failure for the retry. */
  const [scoringFailure, setScoringFailure] = useState<{
    error: MlEngineError;
    patientId: string;
    assessmentId: string;
    sections: AssessmentSections;
  } | null>(null);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [saving, setSaving] = useState<AssessmentStatus | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [saved, setSaved] = useState<{
    name: string;
    status: AssessmentStatus;
    resumed?: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    listPatients()
      .then((rows) => {
        if (active) setPatients(rows);
      })
      .catch((error: unknown) => {
        if (active) {
          setPatients([]);
          setLoadError(guide(error, "Could not load the patient registry."));
        }
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  // Track the selected patient's open draft so step 1 offers Resume.
  useEffect(() => {
    if (patientId == null) {
      setResume(null);
      setResumeLoaded(false);
      return;
    }
    let active = true;
    latestDraftForPatient(patientId)
      .then((draft) => {
        if (active) {
          setResume(draft);
          setResumeLoaded(false);
        }
      })
      .catch((error: unknown) => {
        // Draft discovery is a convenience — never block the wizard on it.
        console.error("[palse] draft lookup failed", error);
        if (active) {
          setResume(null);
          setResumeLoaded(false);
        }
      });
    return () => {
      active = false;
    };
  }, [patientId]);

  const selectedPatient = useMemo(
    () => patients?.find((p) => p.id === patientId) ?? null,
    [patients, patientId],
  );

  function patch<K extends keyof AssessmentSections>(
    key: K,
    update: Partial<AssessmentSections[K]>,
  ) {
    setSections((prev) => ({ ...prev, [key]: { ...prev[key], ...update } }));
  }

  function selectPatient(id: string) {
    if (id !== patientId) {
      // A new intake context: drop the previous patient's scoring output so
      // the results panel is never read against the wrong child. It is
      // replaced by the next completed assessment's score.
      setResult(null);
      setScoringFailure(null);
      setEngineNotice(null);
    }
    setPatientId(id);
    const patient = patients?.find((p) => p.id === id);
    if (patient != null) {
      patch("demographic", {
        sex: patient.sex,
        gestationalAgeWeeks: patient.gestationalAgeWeeks?.toString() ?? "",
        birthWeightGrams: patient.birthWeightGrams?.toString() ?? "",
        deliveryMode: patient.deliveryMode,
      });
    }
    setStepError(null);
  }

  function patientCreated(patient: Patient) {
    // Fresh scoring context, same as switching patients in step 1.
    setResult(null);
    setScoringFailure(null);
    setEngineNotice(null);
    setPatients((prev) => [patient, ...(prev ?? [])]);
    setQuickCreateOpen(false);
    setPatientId(patient.id);
    patch("demographic", {
      sex: patient.sex,
      gestationalAgeWeeks: patient.gestationalAgeWeeks?.toString() ?? "",
      birthWeightGrams: patient.birthWeightGrams?.toString() ?? "",
      deliveryMode: patient.deliveryMode,
    });
  }

  /** Loads the stored draft's seven sections into the builder. */
  function resumeDraft() {
    if (resume == null) return;
    setSections({
      demographic: resume.demographic,
      maternal: resume.maternal,
      neonatal: resume.neonatal,
      vitals: resume.vitals,
      laboratory: resume.laboratory,
      treatment: resume.treatment,
      comorbidities: resume.comorbidities,
    });
    setResumeLoaded(true);
    setStepError(null);
    setEngineNotice(null);
    setScoringFailure(null);
  }

  function goNext() {
    const error = validateStep(step, patientId, sections);
    if (error != null) {
      setStepError(error);
      return;
    }
    setStepError(null);
    setStep((prev) => Math.min(prev + 1, STEPS.length));
  }

  function goBack() {
    setStepError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  }

  async function handleSave(status: AssessmentStatus) {
    // Drafts stay lenient (types/ranges only); completing enforces required
    // fields. Either way, jump to the first offending step with its reason.
    for (let index = 0; index < STEPS.length; index += 1) {
      const error = validateStep(index + 1, patientId, sections, status);
      if (error != null) {
        setStep(index + 1);
        setStepError(error);
        return;
      }
    }

    const patient = patientId as string;
    setSaving(status);
    try {
      let assessmentId: string;
      if (resume != null) {
        // Resumed draft: update the existing record in place (no duplicates);
        // completing it flips the row's status before scoring it.
        const stored = await updateDraftAssessment(resume.id, sections, status);
        assessmentId = stored.id;
      } else {
        assessmentId = await createAssessment({
          patientId: patient,
          status,
          sections,
        });
      }

      // Engine scoring happens for completed assessments only (drafts are
      // scored retroactively once the engine batch is wired). A failure here
      // never loses the saved assessment — the wizard surfaces the warning
      // notice with a "Retry scoring" action.
      if (status === "complete") {
        if (!engineConfigured()) {
          setEngineNotice({
            tone: "info",
            message:
              "The prediction engine is not configured for this build, so the record was saved without a score and will be scored retroactively once scoring is deployed.",
          });
        } else if (accessToken != null) {
          setPredicting(true);
          try {
            await scoreAssessment(patient, assessmentId, sections);
          } catch (error) {
            console.error("[palse] prediction failed", error);
            if (error instanceof MlEngineError) {
              setScoringFailure({
                error,
                patientId: patient,
                assessmentId,
                sections,
              });
            } else {
              // Non-engine failure (e.g. storing the result) — keep the
              // neutral fallback copy.
              setEngineNotice({
                tone: "info",
                message:
                  "Saved without a score: the prediction engine could not be reached. The record will be scored retroactively.",
              });
            }
          } finally {
            setPredicting(false);
          }
        } else {
          setEngineNotice({
            tone: "info",
            message:
              "Sign in again to run live scoring — the record was saved and will be scored retroactively meanwhile.",
          });
        }
        // Stay in place on a fresh wizard: the results panel keeps the scored
        // output until a new patient is selected. resetWizard also clears the
        // resume banner (the draft row is now a completed assessment).
        resetWizard();
      } else {
        setSaved({
          name:
            selectedPatient != null
              ? formatPatientName(selectedPatient)
              : "The patient",
          status,
        });
      }
    } catch (error) {
      console.error("[palse] assessment save failed", error);
      setStepError(
        guide(error, "Could not save the assessment. Please try again."),
      );
    } finally {
      setSaving(null);
    }
  }

  /** Returns the wizard to its default empty state without touching scoring
   * output — results and notices survive until a new patient is selected. */
  function resetWizard() {
    setStep(1);
    setPatientId(null);
    setSections(EMPTY_SECTIONS);
    setStepError(null);
    setResume(null);
    setResumeLoaded(false);
  }

  function startNew() {
    setSaved(null);
    setEngineNotice(null);
    setScoringFailure(null);
    setResult(null);
    resetWizard();
  }

  /** Runs the engine for a saved assessment and stores the result. Throws on
   * engine failure so callers choose how to surface it (info notice vs the
   * retryable scoring-failure notice). Takes `sections` explicitly: the
   * wizard may already be reset when this runs from a retry. */
  async function scoreAssessment(
    patientId: string,
    assessmentId: string,
    sections: AssessmentSections,
  ) {
    if (accessToken == null) return;
    const prediction = await runPrediction(sections, accessToken);
    await savePrediction(assessmentId, patientId, prediction);
    setResult(prediction);
    setScoringFailure(null);
    setEngineNotice({
      tone: "success",
      message:
        "Assessment saved — it has been scored by the prediction engine.",
    });
    setPatients((prev) =>
      (prev ?? []).map((row) =>
        row.id === patientId
          ? {
              ...row,
              riskLevel: riskLevelFromLabel(prediction.riskLabel),
            }
          : row,
      ),
    );
  }

  /** Re-runs scoring for the failed assessment straight from the captured
   * sections (the live wizard is already reset); surfaced by the
   * "Retry scoring" button on the failure notice. */
  function retryScoring() {
    const failure = scoringFailure;
    if (failure == null || predicting) return;
    setPredicting(true);
    scoreAssessment(
      failure.patientId,
      failure.assessmentId,
      failure.sections,
    )
      .catch((error) => {
        console.error("[palse] prediction retry failed", error);
        if (error instanceof MlEngineError) {
          setScoringFailure({ ...failure, error });
        } else {
          setEngineNotice({
            tone: "info",
            message:
              "Saved without a score: the prediction engine could not be reached. The record will be scored retroactively.",
          });
        }
      })
      .finally(() => {
        setPredicting(false);
      });
  }

  if (saved != null) {
    return (
      <SavedConfirmation
        patientName={saved.name}
        status={saved.status}
        onNew={startNew}
      />
    );
  }

  const isLastStep = step === STEPS.length;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Clinical intake workflow
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">
          Neonatal Sepsis Prediction
        </h1>
        <p className="text-sm text-theme-gray">
          Complete the seven intake sections. Records are saved directly to the
          patient&apos;s clinical history and scored by the prediction engine on
          completion.
        </p>
      </header>

      {stepError ? <Notice tone="danger">{stepError}</Notice> : null}
      {loadError ? (
        <Notice tone="danger">
          {loadError}{" "}
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => setReloadKey((prev) => prev + 1)}
          >
            Retry
          </button>
        </Notice>
      ) : null}

      {engineNotice ? (
        <Notice tone={engineNotice.tone}>{engineNotice.message}</Notice>
      ) : null}
      {scoringFailure != null ? (
        <ScoringFailureNotice
          error={scoringFailure.error}
          retryPending={predicting}
          onRetry={retryScoring}
        />
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <StepRail
            current={step}
            onJump={(target) => {
              setStepError(null);
              setStep(target);
            }}
          />

          <Panel
            title={STEPS[step - 1].full}
            kicker={`Step ${step} of ${STEPS.length}`}
            icon={
              <MsIcon
                name={STEPS[step - 1].icon}
                className="text-[22px] text-theme-maroon"
                optical={24}
              />
            }
          >
            <div className="flex flex-col gap-5">
              {renderStep(step, {
                patients,
                patientId,
                sections,
                patch,
                selectPatient,
                onQuickCreate: () => setQuickCreateOpen(true),
                resume,
                resumeLoaded,
                onResumeDraft: resumeDraft,
              })}

              <div className="flex items-center justify-between gap-3 border-t border-theme-line pt-5">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-1.5 rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
                  >
                    <MsIcon name="arrow_back" className="text-[18px]" optical={20} />
                    Back
                  </button>
                ) : (
                  <span className="text-xs text-theme-gray">
                    Required fields are marked <span className="font-bold text-theme-maroon">*</span> —
                    everything else can be completed later.
                  </span>
                )}

                <div className="flex flex-1 items-center gap-3">
                  {isLastStep ? (
                    <>
                      <button
                        type="button"
                        disabled={saving !== null}
                        onClick={() => void handleSave("draft")}
                        className="flex items-center gap-1.5 rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon disabled:opacity-60"
                      >
                        <MsIcon name="draft" className="text-[18px]" optical={20} />
                        Save as draft
                      </button>
                      <PrimaryButton
                        pending={saving === "complete"}
                        onClick={() => void handleSave("complete")}
                        className="w-auto px-5 flex-1 [&>.ms]:text-[18px]"
                        type="button"
                      >
                        <MsIcon name="calculate" optical={20} />
                        {resume != null
                          ? "Calculate risk score (finish draft)"
                          : "Complete assessment"}
                      </PrimaryButton>
                    </>
                  ) : (
                    <PrimaryButton
                      type="button"
                      onClick={goNext}
                      className="w-auto px-5 [&>.ms]:text-[18px]"
                    >
                      Next
                      <MsIcon name="arrow_forward" optical={20} />
                    </PrimaryButton>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="min-w-0">
          <ResultsPanel
            patient={selectedPatient}
            result={result}
            predicting={predicting}
            engineConfigured={engineConfigured()}
          />
        </aside>
      </div>

      {quickCreateOpen ? (
        <PatientModal
          mode="compact"
          title="Register a new patient"
          onClose={() => setQuickCreateOpen(false)}
          onCreated={patientCreated}
        />
      ) : null}
    </div>
  );
}

type DashboardSectionProps = {
  patients: Patient[] | null;
  patientId: string | null;
  sections: AssessmentSections;
  patch: <K extends keyof AssessmentSections>(
    key: K,
    update: Partial<AssessmentSections[K]>,
  ) => void;
  selectPatient: (id: string) => void;
  onQuickCreate: () => void;
  /** Selected patient's open draft + load action; null when none exists. */
  resume: Assessment | null;
  resumeLoaded: boolean;
  onResumeDraft: () => void;
};

function renderStep(step: number, props: DashboardSectionProps): ReactNode {
  switch (step) {
    case 1:
      return <DemographicStep {...props} />;
    case 2:
      return <MaternalStep {...props} />;
    case 3:
      return <NeonatalStep {...props} />;
    case 4:
      return <VitalsStep {...props} />;
    case 5:
      return <LabStep {...props} />;
    case 6:
      return <ChipStep {...props} section="treatment" />;
    case 7:
      return <ChipStep {...props} section="comorbidities" />;
    default:
      return null;
  }
}

/* ------------------------------ Step 1 ---------------------------------- */

function DemographicStep({
  patients,
  patientId,
  sections,
  patch,
  selectPatient,
  onQuickCreate,
  resume,
  resumeLoaded,
  onResumeDraft,
}: DashboardSectionProps) {
  const demographic = sections.demographic;
  const selected = patients?.find((p) => p.id === patientId) ?? null;
  const loading = patients === null;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <label htmlFor="patient" className="text-sm font-medium text-theme-ink">
          Patient
          <span aria-hidden className="ml-1 font-bold text-theme-maroon" title="Required">
            *
          </span>
        </label>
        <PatientSearch
          patients={patients}
          selected={selected}
          disabled={loading}
          onSelect={selectPatient}
          onQuickCreate={onQuickCreate}
        />
        {patients !== null && patients.length === 0 ? (
          <p className="text-xs text-theme-gray">
            The registry is empty — use ＋ New to register the first patient.
          </p>
        ) : null}
      </div>

      {resume != null ? (
        <div
          className={`md:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 text-sm ${
            resumeLoaded
              ? "border-theme-line bg-theme-light-gray/60 text-theme-ink"
              : "border-theme-maroon/30 bg-theme-maroon/5 text-theme-ink"
          }`}
        >
          <span>
            {resumeLoaded ? (
              <>
                Draft loaded ({formatDateLabel(resume.createdAt)}) — saving
                updates this record in place.
              </>
            ) : (
              <>
                Draft in progress from {formatDateLabel(resume.createdAt)} —{" "}
                <button
                  type="button"
                  onClick={onResumeDraft}
                  className="font-semibold text-theme-maroon underline decoration-2 underline-offset-2 hover:text-theme-maroon/80"
                >
                  Resume
                </button>
              </>
            )}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-theme-ink">
          Sex
          <span aria-hidden className="ml-1 font-bold text-theme-maroon" title="Required">
            *
          </span>
        </span>
        <ChoiceGroup<SexChoice>
          options={SEX_OPTIONS}
          value={demographic.sex}
          onChange={(next) => patch("demographic", { sex: next })}
          allowUnset
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-theme-ink">
          Delivery mode
        </span>
        <ChoiceGroup<ModeChoice>
          options={MODE_OPTIONS}
          value={demographic.deliveryMode}
          onChange={(next) => patch("demographic", { deliveryMode: next })}
          allowUnset
        />
      </div>

      <FormInput
        id="gestational-age"
        label="Gestational age (weeks)"
        required
        hint="Completed weeks of gestation — prefilled from the patient record."
        placeholder="e.g. 38"
        type="number"
        inputMode="numeric"
        min={20}
        max={45}
        value={demographic.gestationalAgeWeeks}
        error={liveRangeError(demographic.gestationalAgeWeeks, {
          label: "Gestational age",
          min: 20,
          max: 45,
        })}
        onChange={(event) =>
          patch("demographic", { gestationalAgeWeeks: event.target.value })
        }
      />

      <FormInput
        id="birth-weight"
        label="Birth weight (grams)"
        required
        hint="Grams at delivery — prefilled from the patient record."
        placeholder="e.g. 3200"
        type="number"
        inputMode="numeric"
        min={200}
        max={8000}
        value={demographic.birthWeightGrams}
        error={liveRangeError(demographic.birthWeightGrams, {
          label: "Birth weight",
          min: 200,
          max: 8000,
        })}
        onChange={(event) =>
          patch("demographic", { birthWeightGrams: event.target.value })
        }
      />

      <div className="md:col-span-2">
        <ToggleSwitch
          label="Multiple birth"
          checked={demographic.multipleBirth}
          onChange={(next) => patch("demographic", { multipleBirth: next })}
        />
      </div>
    </div>
  );
}

/* ------------------------------ Step 2 ---------------------------------- */

function MaternalStep({
  sections,
  patch,
}: {
  sections: AssessmentSections;
  patch: DashboardSectionProps["patch"];
}) {
  const maternal = sections.maternal;
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <FormInput
        id="maternal-age"
        label="Maternal age"
        placeholder="e.g. 29"
        type="number"
        inputMode="numeric"
        min={10}
        max={70}
        value={maternal.maternalAge}
        error={liveRangeError(maternal.maternalAge, {
          label: "Maternal age",
          min: 10,
          max: 70,
        })}
        onChange={(event) =>
          patch("maternal", { maternalAge: event.target.value })
        }
      />
      <MaternalChoicer
        label="ANC visits (>= 4)"
        value={maternal.ancVisitsFourPlus}
        onChange={(next) => patch("maternal", { ancVisitsFourPlus: next })}
      />
      <MaternalChoicer
        label="PROM > 18h"
        value={maternal.promOver18h}
        onChange={(next) => patch("maternal", { promOver18h: next })}
      />
      <MaternalChoicer
        label="Fever (>= 38°C)"
        value={maternal.feverAtLeast38C}
        onChange={(next) => patch("maternal", { feverAtLeast38C: next })}
      />
      <MaternalChoicer
        label="UTI during pregnancy"
        value={maternal.utiDuringPregnancy}
        onChange={(next) => patch("maternal", { utiDuringPregnancy: next })}
      />
      <MaternalChoicer
        label="HIV positive"
        value={maternal.hivPositive}
        onChange={(next) => patch("maternal", { hivPositive: next })}
      />
    </div>
  );
}

function MaternalChoicer({
  label,
  value,
  onChange,
}: {
  label: string;
  value: YesNo;
  onChange: (next: YesNo) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-theme-ink">{label}</span>
      <YesNoChoice value={value} onChange={onChange} />
    </div>
  );
}

function YesNoChoice({
  value,
  onChange,
}: {
  value: YesNo;
  onChange: (next: YesNo) => void;
}) {
  return (
    <ChoiceGroup<"yes" | "no">
      options={YES_NO}
      value={value == null ? null : value ? "yes" : "no"}
      onChange={(next) => onChange(next == null ? null : next === "yes")}
      allowUnset
    />
  );
}

/* ------------------------------ Step 3 ---------------------------------- */

function NeonatalStep({
  sections,
  patch,
}: {
  sections: AssessmentSections;
  patch: DashboardSectionProps["patch"];
}) {
  const neonatal: NeonatalSection = sections.neonatal;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 md:grid-cols-2">
        <FormInput
          id="age-hours"
          label="Age at admission (hours)"
          required
          hint="Hours since birth when first admitted — required by the model."
          placeholder="e.g. 12"
          type="number"
          inputMode="numeric"
          min={0}
          max={720}
          value={neonatal.ageAtAdmissionHours}
          error={liveRangeError(neonatal.ageAtAdmissionHours, {
            label: "Age at admission",
            min: 0,
            max: 720,
          })}
          onChange={(event) =>
            patch("neonatal", { ageAtAdmissionHours: event.target.value })
          }
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-theme-ink">
            APGAR score (1 / 5 / 10 min)
          </span>
          <div className="grid grid-cols-3 gap-3">
            <FormInput
              id="apgar-one"
              label="1 min"
              placeholder="e.g. 6"
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={neonatal.apgarOneMinute}
              error={liveRangeError(neonatal.apgarOneMinute, { label: "APGAR (1 min)", min: 0, max: 10 })}
              onChange={(event) =>
                patch("neonatal", { apgarOneMinute: event.target.value })
              }
            />
            <FormInput
              id="apgar-five"
              label="5 min"
              placeholder="e.g. 7"
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={neonatal.apgarFiveMinutes}
              error={liveRangeError(neonatal.apgarFiveMinutes, { label: "APGAR (5 min)", min: 0, max: 10 })}
              onChange={(event) =>
                patch("neonatal", { apgarFiveMinutes: event.target.value })
              }
            />
            <FormInput
              id="apgar-ten"
              label="10 min"
              placeholder="e.g. 8"
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={neonatal.apgarTenMinutes}
              error={liveRangeError(neonatal.apgarTenMinutes, { label: "APGAR (10 min)", min: 0, max: 10 })}
              onChange={(event) =>
                patch("neonatal", { apgarTenMinutes: event.target.value })
              }
            />
          </div>
        </div>
      </div>
      <ChipGroup<SignKey>
        legend="Observed signs"
        options={SIGNS}
        values={neonatal}
        onChange={(next) => patch("neonatal", next)}
      />
    </div>
  );
}

/* ------------------------------ Step 4 ---------------------------------- */

function VitalsStep({
  patientId,
  resume,
  sections,
  patch,
}: DashboardSectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <VitalsFields
        value={sections.vitals}
        onChange={(next) => patch("vitals", next)}
        idPrefix="vitals"
      />
      <VitalsHistoryBlock patientId={patientId} assessmentId={resume?.id ?? null} />
    </div>
  );
}

/**
 * Earlier/later vital readings inside the wizard (step 4). Saves to the
 * shared `vital_observations` history — /monitor's charts (and their live
 * realtime pushes) read from it, so a reading recorded here shows up in the
 * monitor without touching this assessment's vitals snapshot.
 */
function VitalsHistoryBlock({
  patientId,
  assessmentId,
}: {
  patientId: string | null;
  assessmentId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<VitalObservation[]>([]);
  const [saving, setSaving] = useState(false);
  const [formResetKey, setFormResetKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && patientId != null && recent.length === 0) {
      listVitalObservations(patientId, 3)
        .then((rows) => setRecent(rows))
        .catch((loadError: unknown) => {
          console.error("[palse] wizard readings lookup failed", loadError);
        });
    }
  }

  async function handleSave(payload: VitalReadingPayload) {
    if (patientId == null) {
      setFormError("Select a patient in step 1 before recording readings.");
      return;
    }
    const invalid = observationError(payload.draft);
    if (invalid != null) {
      setFormError(invalid);
      return;
    }
    const recordedAt = new Date(payload.recordedAt);
    if (!Number.isFinite(recordedAt.getTime())) {
      setFormError("The reading time is invalid — use the date/time picker.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const row = await addVitalObservation({
        patientId,
        assessmentId,
        recordedAt: recordedAt.toISOString(),
        ...draftToNumericFields(payload.draft),
      });
      setRecent((prev) =>
        sortByRecordedDesc([...prev, row]).slice(0, 3),
      );
      setFormResetKey((key) => key + 1);
      setSavedNotice(`Reading recorded (${formatDateTimeLabel(row.recordedAt)}).`);
    } catch (recordError) {
      console.error("[palse] wizard reading record failed", recordError);
      setFormError(guide(recordError, "Could not record the reading. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-theme-line bg-theme-light-gray/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-lg text-sm font-bold uppercase tracking-wide text-theme-ink transition-colors hover:text-theme-maroon focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
        >
          <span aria-hidden className={`ms transition-transform ${open ? "rotate-90" : ""} text-[16px]`}>
            chevron_right
          </span>
          Earlier / later readings (optional)
        </button>
        {open && patientId != null ? (
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-theme-maroon px-3.5 py-1.5 text-xs font-semibold text-theme-maroon transition-colors hover:bg-theme-maroon/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
          >
            <MsIcon name="upload_file" className="text-[16px]" optical={20} />
            Import CSV
          </button>
        ) : null}
      </div>

      <p className="mt-1 text-xs text-theme-gray">
        Backdated or later readings saved to the observation history — the
        /monitor charts pull from it live. These readings don&apos;t change the
        snapshot fields above; manage and delete on the monitor page.
      </p>

      {open ? (
        <div className="mt-4 flex flex-col gap-3">
          {patientId == null ? (
            <p className="text-sm text-theme-gray">
              Select a patient in step 1 to record readings for them.
            </p>
          ) : (
            <VitalReadingForm
              key={`wizard-obs-${formResetKey}`}
              idPrefix="wizard-obs"
              saving={saving}
              error={formError}
              onSave={(payload) => void handleSave(payload)}
            />
          )}
          {savedNotice && !formError ? (
            <div className="text-sm font-medium text-theme-ink" role="status">
              {savedNotice}
            </div>
          ) : null}

          {recent.length > 0 ? (
            <ul className="flex flex-col border-t border-theme-line pt-2 text-xs text-theme-gray">
              {recent.map((row) => (
                <li key={row.id} className="py-1 tabular-nums">
                  {formatDateTimeLabel(row.recordedAt)} — {describeObservation(row)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {importOpen && patientId != null ? (
        <ImportVitalsCsvModal
          patientId={patientId}
          patientName={null}
          assessmentId={assessmentId}
          onClose={() => setImportOpen(false)}
          onImported={(rows) =>
            setRecent((prev) =>
              sortByRecordedDesc([...prev, ...rows]).slice(0, 3),
            )
          }
        />
      ) : null}
    </div>
  );
}

function describeObservation(row: VitalObservation): string {
  const parts: string[] = [];
  if (row.heartRateBpm != null) parts.push(`HR ${row.heartRateBpm}`);
  if (row.temperatureC != null) parts.push(`${row.temperatureC} °C`);
  if (row.sbpMmHg != null || row.dbpMmHg != null) {
    parts.push(`${row.sbpMmHg ?? "—"}/${row.dbpMmHg ?? "—"}`);
  }
  if (row.oxygenSaturationPct != null) parts.push(`O2 ${row.oxygenSaturationPct}%`);
  if (row.respiratoryRatePerMin != null) parts.push(`RR ${row.respiratoryRatePerMin}`);
  return parts.length > 0 ? parts.join(", ") : "no values";
}

function sortByRecordedDesc(rows: VitalObservation[]): VitalObservation[] {
  return [...rows].sort(
    (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
  );
}

/* ------------------------------ Step 5 ---------------------------------- */

function LabStep({
  sections,
  patch,
}: {
  sections: AssessmentSections;
  patch: DashboardSectionProps["patch"];
}) {
  return (
    <LabFields
      value={sections.laboratory}
      onChange={(next) => patch("laboratory", next)}
      idPrefix="labs"
    />
  );
}

/* --------------------------- Steps 5 & 6 -------------------------------- */

function ChipStep({
  section,
  sections,
  patch,
}: DashboardSectionProps & { section: "treatment" | "comorbidities" }) {
  if (section === "treatment") {
    return (
      <TreatmentChips
        value={sections.treatment}
        onChange={(next) => patch(section, next)}
      />
    );
  }
  return (
    <ComorbiditiesChips
      value={sections.comorbidities}
      onChange={(next) => patch(section, next)}
    />
  );
}

/* ------------------------- Wizard furniture ----------------------------- */

function StepRail({
  current,
  onJump,
}: {
  current: number;
  onJump: (step: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Wizard steps">
      {STEPS.map((entry, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;

        return (
          <li key={entry.short}>
            <button
              type="button"
              disabled={!done}
              title={done ? `Back to ${entry.full}` : entry.full}
              onClick={() => onJump(number)}
              className={[
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                done
                  ? "cursor-pointer border-theme-maroon bg-theme-maroon text-theme-white hover:bg-theme-maroon-hover"
                  : active
                    ? "border-theme-maroon bg-white text-theme-maroon"
                    : "cursor-default border-theme-line bg-white text-theme-gray",
              ].join(" ")}
            >
              <MsIcon
                name={done ? "check_circle" : entry.icon}
                fill={done ? 1 : 0}
                className="text-[16px]"
                optical={20}
              />
              {entry.short}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-theme-line bg-white px-3.5 py-2.5">
      <span className="text-sm font-medium text-theme-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={[
          "h-6 w-11 rounded-full p-0.5 transition-colors duration-150",
          checked ? "bg-theme-maroon" : "bg-theme-line",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon",
        ].join(" ")}
      >
        <span
          className={[
            "block h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </button>
    </div>
  );
}

function ResultsPanel({
  patient,
  result,
  predicting,
  engineConfigured,
}: {
  patient: Patient | null;
  result: PredictionResult | null;
  predicting: boolean;
  engineConfigured: boolean;
}) {
  if (result != null) {
    return <ScoredResultsPanel result={result} predicting={predicting} />;
  }

  const intro = predicting
    ? "Scoring with the prediction engine…"
    : engineConfigured
      ? "Complete the wizard and the engine will score this assessment."
      : "The prediction engine is not configured for this build.";

  return (
    <Panel
      kicker="Analysis results"
      title={predicting ? "Running engine…" : "Waiting for scoring"}
    >
      <div className="rounded-lg border border-theme-line bg-theme-light-gray/60 px-4 py-3">
        {patient != null ? (
          <>
            <p className="text-sm font-semibold text-theme-ink">
              {formatPatientName(patient)}
            </p>
            <p className="mt-0.5 text-xs text-theme-gray">
              {patient.mrn ? `MRN ${patient.mrn} · ` : ""}Risk level: pending
              scoring
            </p>
          </>
        ) : (
          <p className="text-sm text-theme-gray">
            Select a patient in step 1 to start their assessment.
          </p>
        )}
      </div>

      {predicting ? (
        <p
          className="flex items-center gap-2.5 text-sm text-theme-ink"
          aria-live="polite"
        >
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-theme-maroon border-t-transparent"
          />
          Scoring with the prediction engine…
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-hidden>
          {[
            "Sepsis risk probability",
            "Clinical interpretation",
            "Recommended actions",
          ].map((row) => (
            <li key={row} className="flex items-center gap-3">
              <span className="h-2 w-2 shrink-0 rounded-full bg-theme-line" />
              <span className="text-sm text-theme-gray">{row}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-theme-line pt-4 text-xs leading-relaxed text-theme-gray">
        {intro} Assessments are stored safely in the meantime and will be scored
        retroactively once the engine is live.
      </p>
    </Panel>
  );
}

/* ------------------------- Scored results view -------------------------- */

const DONUT_COLORS: Record<string, string> = {
  HIGH: "#b42318",
  MODERATE: "#9a5b00",
  LOW: "#1f7a45",
};

function ScoredResultsPanel({
  result,
  predicting,
}: {
  result: PredictionResult;
  predicting: boolean;
}) {
  const percent = Math.max(0, Math.min(100, result.probabilityPercent * 100));
  const color =
    DONUT_COLORS[result.riskLabel.split(" ")[0]] ?? DONUT_COLORS.MODERATE;
  const tone =
    result.riskLabel === "HIGH RISK"
      ? { bg: "bg-risk-high-bg", fg: "text-risk-high-fg" }
      : result.riskLabel === "LOW RISK"
        ? { bg: "bg-risk-low-bg", fg: "text-risk-low-fg" }
        : { bg: "bg-risk-moderate-bg", fg: "text-risk-moderate-fg" };

  return (
    <Panel kicker="Analysis results" title={result.resultTitle}>
      <div className="flex items-center gap-4">
        <div
          className="relative h-28 w-28 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${color} ${percent}%, var(--color-theme-line, #e5e7eb) ${percent}%)`,
          }}
          role="img"
          aria-label={`Sepsis risk probability ${result.probabilityPercent}%`}
        >
          <div className="absolute inset-[10px] flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full bg-white">
            <span className="text-xl font-bold text-theme-ink">
              {result.probabilityPercent}%
            </span>
            <span
              className={`mt-0.5 text-[10px] font-bold uppercase ${tone.fg}`}
            >
              {result.predictedEos ? "Predicted EOS" : "Below threshold"}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tone.bg} ${tone.fg}`}
          >
            {result.riskLabel}
          </span>
          <p className="mt-2 text-xs text-theme-gray">
            Decision threshold {result.threshold.toFixed(2)} ·{" "}
            {result.predictedEos ? "EOS predicted" : "no EOS prediction"}
          </p>
        </div>
      </div>

      {result.interpretation !== "" ? (
        <p className="text-sm leading-relaxed text-theme-ink">
          {result.interpretation}
        </p>
      ) : null}

      {result.recommendedActions.length > 0 ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
            Recommended actions
          </p>
          <ul className="mt-2 flex list-inside list-disc flex-col gap-1.5">
            {result.recommendedActions.map((action) => (
              <li key={action} className="text-sm text-theme-gray">
                {action}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-theme-line pt-3 text-xs text-theme-gray">
        Model provenance — XGBoost {Math.round(result.xgbEosProbability * 100)}%
        · TFT {Math.round(result.tftEosProbability * 100)}% ({result.tftSource})
        · {result.inferenceMs} ms
        {predicting ? " · rescoring…" : ""}
      </p>
    </Panel>
  );
}

function SavedConfirmation({
  patientName,
  status,
  onNew,
}: {
  patientName: string;
  status: AssessmentStatus;
  onNew: () => void;
}) {
  return (
    <Panel className="mx-auto max-w-xl py-12 text-center">
      <p className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-risk-low-bg text-xl font-bold text-risk-low-fg">
        ✓
      </p>
      <h2 className="text-xl font-bold text-theme-ink">
        {status === "draft" ? "Draft saved" : "Assessment complete"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-theme-gray">
        {patientName}&apos;s record has been{" "}
        {status === "draft" ? "stored as a draft" : "recorded"}. It has not
        been scored yet; it will be scored retroactively once the prediction
        engine is reachable.
      </p>
      <PrimaryButton
        onClick={onNew}
        className="mx-auto mt-6 w-auto px-5"
        type="button"
      >
        Start a new assessment
      </PrimaryButton>
    </Panel>
  );
}

/* ---------------------------- Validation -------------------------------- */

/**
 * Inline variant of rangeFieldError: silent while the field is empty so the
 * required mark (*) + the step gate carry that burden — a pristine form
 * shouldn't open plastered with red. Fires the moment a typed value is
 * non-numeric or out of range.
 */
function liveRangeError(
  raw: string,
  opts: { label: string; min: number; max: number },
): string | null {
  return raw.trim() === "" ? null : rangeFieldError(raw, opts);
}

/**
 * Step validation. `"complete"` mode enforces the required fields
 * (asterisks); `"draft"` mode only checks data types/ranges on whatever is
 * filled — drafts are allowed to be incomplete by definition.
 */
function validateStep(
  step: number,
  patientId: string | null,
  sections: AssessmentSections,
  mode: "draft" | "complete" = "complete",
): string | null {
  switch (step) {
    case 1: {
      if (patientId == null) {
        return "Select or create a patient to continue.";
      }
      const { sex, gestationalAgeWeeks, birthWeightGrams } = sections.demographic;
      if (mode === "complete" && sex == null) {
        return "Choose the patient's sex to continue.";
      }
      const gaError = rangeFieldError(gestationalAgeWeeks, {
        label: "Gestational age",
        min: 20,
        max: 45,
        required: mode === "complete",
      });
      if (gaError != null) {
        return `${gaError} (20–45 weeks).`;
      }
      const bwError = rangeFieldError(birthWeightGrams, {
        label: "Birth weight",
        min: 200,
        max: 8000,
        required: mode === "complete",
      });
      if (bwError != null) {
        return `${bwError} (200–8000 grams).`;
      }
      return null;
    }
    case 2: {
      const maternal: MaternalSection = sections.maternal;
      const unanswered = (
        [
          ["ANC visits (>= 4)", maternal.ancVisitsFourPlus],
          ["PROM > 18h", maternal.promOver18h],
          ["Fever (>= 38°C)", maternal.feverAtLeast38C],
          ["UTI during pregnancy", maternal.utiDuringPregnancy],
          ["HIV positive", maternal.hivPositive],
        ] as ReadonlyArray<readonly [string, YesNo]>
      ).find(([, value]) => value == null);
      if (unanswered != null) {
        return `Answer "${unanswered[0]}" to continue.`;
      }
      return null;
    }
    case 3: {
      const { ageAtAdmissionHours, apgarOneMinute, apgarFiveMinutes, apgarTenMinutes } =
        sections.neonatal;
      const ageError = rangeFieldError(ageAtAdmissionHours, {
        label: "Age at admission",
        min: 0,
        max: 30 * 24,
        required: mode === "complete",
      });
      if (ageError != null) {
        return `${ageError} (hours, 0–720).`;
      }
      const scores: ReadonlyArray<readonly [string, string]> = [
        ["APGAR (1 min)", apgarOneMinute],
        ["APGAR (5 min)", apgarFiveMinutes],
        ["APGAR (10 min)", apgarTenMinutes],
      ];
      for (const [label, raw] of scores) {
        const apgarError = rangeFieldError(raw, { label, min: 0, max: 10 });
        if (apgarError != null) {
          return `${apgarError} — a score between 0 and 10.`;
        }
      }
      return null;
    }
    case 4: {
      return vitalsError(sections.vitals);
    }
    case 5: {
      return labsError(sections.laboratory);
    }
    default:
      return null;
  }
}

