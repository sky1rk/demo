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
  TreatmentChips,
  VitalsFields,
} from "../components/AssessmentSectionFields.tsx";
import PatientModal from "../components/PatientModal.tsx";
import { createAssessment, listPatients } from "../lib/db.ts";
import type {
  AssessmentSections,
  AssessmentStatus,
  MaternalSection,
  NeonatalSection,
} from "../lib/assessment.ts";
import { formatPatientName } from "../lib/patient.ts";
import type { Patient } from "../lib/patient.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";
import { guide } from "../lib/authErrors.ts";
import { vitalsError } from "../lib/clinicalValidation.ts";

type SexChoice = "female" | "male";
type ModeChoice = "vaginal" | "cesarean";
type YesNo = boolean | null;

const STEPS = [
  { short: "Demographic", full: "Demographic & Perinatal" },
  { short: "Maternal", full: "Maternal Factors" },
  { short: "Neonatal", full: "Neonatal Clinical Signs" },
  { short: "Vitals", full: "Physiological (Hourly)" },
  { short: "Treatment", full: "Current Treatment" },
  { short: "Comorbidities", full: "Comorbidities" },
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
    apgarFiveMinutes: "",
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
 * Phase 1 assessment wizard: six intake sections stored as JSONB on the
 * patient's assessment row. The results panel is UI-only until the
 * prediction engine is connected.
 */
export default function Dashboard() {
  usePageTitle("Assessment");

  const [step, setStep] = useState(1);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [sections, setSections] = useState<AssessmentSections>(EMPTY_SECTIONS);

  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [saving, setSaving] = useState<AssessmentStatus | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ name: string; status: AssessmentStatus } | null>(null);

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
    for (let index = 0; index < STEPS.length; index += 1) {
      const error = validateStep(index + 1, patientId, sections);
      if (error != null) {
        setStep(index + 1);
        setStepError(error);
        return;
      }
    }

    setSaving(status);
    try {
      await createAssessment({
        patientId: patientId as string,
        status,
        sections,
      });
      setSaved({
        name: selectedPatient != null ? formatPatientName(selectedPatient) : "The patient",
        status,
      });
    } catch (error) {
      console.error("[palse] assessment save failed", error);
      setStepError(guide(error, "Could not save the assessment. Please try again."));
    } finally {
      setSaving(null);
    }
  }

  function startNew() {
    setSaved(null);
    setStep(1);
    setPatientId(null);
    setSections(EMPTY_SECTIONS);
    setStepError(null);
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
        <h1 className="text-2xl font-bold text-theme-ink">Neonatal Sepsis Prediction</h1>
        <p className="text-sm text-theme-gray">
          Complete the six intake sections. Records are saved directly to the
          patient&apos;s clinical history.
        </p>
      </header>

      {stepError ? (
        <Notice tone="danger">{stepError}</Notice>
      ) : null}
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <StepRail current={step} onJump={(target) => { setStepError(null); setStep(target); }} />

          <Panel title={STEPS[step - 1].full} kicker={`Step ${step} of ${STEPS.length}`}>
            <div className="flex flex-col gap-5">
              {renderStep(step, { patients, patientId, sections, patch, selectPatient, onQuickCreate: () => setQuickCreateOpen(true) })}

              <div className="flex items-center justify-between gap-3 border-t border-theme-line pt-5">
                {step > 1 ? (
                  <button
                    type="button"
                    onClick={goBack}
                    className="rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
                  >
                    Back
                  </button>
                ) : (
                  <span className="text-xs text-theme-gray">
                    Sections marked with indicators can be completed later.
                  </span>
                )}

                <div className="flex items-center gap-3">
                  {isLastStep ? (
                    <>
                      <button
                        type="button"
                        disabled={saving !== null}
                        onClick={() => void handleSave("draft")}
                        className="rounded-lg border border-theme-line px-4 py-2 text-sm font-semibold text-theme-ink transition-colors hover:bg-theme-light-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon disabled:opacity-60"
                      >
                        Save as draft
                      </button>
                      <PrimaryButton
                        pending={saving === "complete"}
                        onClick={() => void handleSave("complete")}
                        className="w-auto px-5"
                        type="button"
                      >
                        Complete assessment
                      </PrimaryButton>
                    </>
                  ) : (
                    <PrimaryButton type="button" onClick={goNext} className="w-auto px-5">
                      Next
                    </PrimaryButton>
                  )}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <aside className="min-w-0">
          <ResultsPanel patient={selectedPatient} />
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
};

function renderStep(
  step: number,
  props: DashboardSectionProps,
): ReactNode {
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
      return <ChipStep {...props} section="treatment" />;
    case 6:
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
}: DashboardSectionProps) {
  const demographic = sections.demographic;
  const loading = patients === null;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-1.5 md:col-span-2">
        <label htmlFor="patient" className="text-sm font-medium text-theme-ink">
          Patient
        </label>
        <div className="flex gap-2.5">
          <select
            id="patient"
            value={patientId ?? ""}
            onChange={(event) => selectPatient(event.target.value)}
            disabled={loading}
            className="w-full rounded-lg border border-theme-line bg-white px-3.5 py-2 text-sm text-theme-ink transition-colors focus:border-theme-maroon focus:outline-none focus:ring-2 focus:ring-theme-maroon/25 disabled:opacity-60"
          >
            <option value="">{loading ? "Loading registry…" : "Select a patient"}</option>
            {patients?.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {formatPatientName(patient)}
                {patient.mrn ? ` — MRN ${patient.mrn}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onQuickCreate}
            className="shrink-0 rounded-lg border border-theme-maroon px-3.5 py-2 text-sm font-semibold text-theme-maroon transition-colors hover:bg-theme-maroon/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
          >
            ＋ New
          </button>
        </div>
        {patients !== null && patients.length === 0 ? (
          <p className="text-xs text-theme-gray">
            The registry is empty — use ＋ New to register the first patient.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-theme-ink">Sex</span>
        <ChoiceGroup<SexChoice>
          options={SEX_OPTIONS}
          value={demographic.sex}
          onChange={(next) => patch("demographic", { sex: next })}
          allowUnset
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-theme-ink">Delivery mode</span>
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
        placeholder="e.g. 38"
        type="number"
        min={20}
        max={45}
        value={demographic.gestationalAgeWeeks}
        onChange={(event) =>
          patch("demographic", { gestationalAgeWeeks: event.target.value })
        }
      />

      <FormInput
        id="birth-weight"
        label="Birth weight (grams)"
        placeholder="e.g. 3200"
        type="number"
        min={200}
        max={8000}
        value={demographic.birthWeightGrams}
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
        min={10}
        max={70}
        value={maternal.maternalAge}
        onChange={(event) => patch("maternal", { maternalAge: event.target.value })}
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
          label="Age (h)"
          placeholder="e.g. 12"
          type="number"
          min={0}
          value={neonatal.ageAtAdmissionHours}
          onChange={(event) =>
            patch("neonatal", { ageAtAdmissionHours: event.target.value })
          }
        />
        <FormInput
          id="apgar-five"
          label="APGAR (5 min)"
          placeholder="e.g. 7"
          type="number"
          min={0}
          max={10}
          value={neonatal.apgarFiveMinutes}
          onChange={(event) =>
            patch("neonatal", { apgarFiveMinutes: event.target.value })
          }
        />
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
  sections,
  patch,
}: {
  sections: AssessmentSections;
  patch: DashboardSectionProps["patch"];
}) {
  return (
    <VitalsFields
      value={sections.vitals}
      onChange={(next) => patch("vitals", next)}
      idPrefix="vitals"
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
              <span aria-hidden>{done ? "✓" : number}</span>
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

function ResultsPanel({ patient }: { patient: Patient | null }) {
  const rows = [
    "Sepsis risk probability",
    "Clinical interpretation",
    "Recommended actions",
  ];

  return (
    <Panel kicker="Analysis results" title="Waiting for the prediction engine">
      <div className="rounded-lg border border-theme-line bg-theme-light-gray/60 px-4 py-3">
        {patient != null ? (
          <>
            <p className="text-sm font-semibold text-theme-ink">
              {formatPatientName(patient)}
            </p>
            <p className="mt-0.5 text-xs text-theme-gray">
              {patient.mrn ? `MRN ${patient.mrn} · ` : ""}Risk level: pending scoring
            </p>
          </>
        ) : (
          <p className="text-sm text-theme-gray">
            Select a patient in step 1 to start their assessment.
          </p>
        )}
      </div>

      <ul className="flex flex-col gap-3" aria-hidden>
        {rows.map((row) => (
          <li key={row} className="flex items-center gap-3">
            <span className="h-2 w-2 shrink-0 rounded-full bg-theme-line" />
            <span className="text-sm text-theme-gray">{row}</span>
          </li>
        ))}
      </ul>

      <p className="border-t border-theme-line pt-4 text-xs leading-relaxed text-theme-gray">
        Scores are computed by the ML prediction service, which is not connected
        yet. Assessments are stored safely in the meantime and will be scored
        retroactively once the engine is live.
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
        {patientName}&apos;s record has been {status === "draft" ? "stored as a draft" : "recorded"}.
        Scoring activates once the prediction engine is connected.
      </p>
      <PrimaryButton onClick={onNew} className="mx-auto mt-6 w-auto px-5" type="button">
        Start a new assessment
      </PrimaryButton>
    </Panel>
  );
}

/* ---------------------------- Validation -------------------------------- */

function validateStep(
  step: number,
  patientId: string | null,
  sections: AssessmentSections,
): string | null {
  switch (step) {
    case 1: {
      if (patientId == null) {
        return "Select or create a patient to continue.";
      }
      const { gestationalAgeWeeks, birthWeightGrams } = sections.demographic;
      const ga = gestationalAgeWeeks.trim();
      const bw = birthWeightGrams.trim();
      if (ga !== "" && !withinRange(Number(ga), 20, 45)) {
        return "Gestational age must be a number between 20 and 45 weeks.";
      }
      if (bw !== "" && !withinRange(Number(bw), 200, 8000)) {
        return "Birth weight must be a number between 200 and 8000 grams.";
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
      const { ageAtAdmissionHours, apgarFiveMinutes } = sections.neonatal;
      const age = ageAtAdmissionHours.trim();
      const apgar = apgarFiveMinutes.trim();
      if (age !== "" && !withinRange(Number(age), 0, 30 * 24)) {
        return "Age (h) must be a number of hours between 0 and 720.";
      }
      if (apgar !== "" && !withinRange(Number(apgar), 0, 10)) {
        return "APGAR (5 min) must be a number between 0 and 10.";
      }
      return null;
    }
    case 4: {
      return vitalsError(sections.vitals);
    }
    default:
      return null;
  }
}

function withinRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}
