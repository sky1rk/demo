import ChipGroup from "./ChipGroup.tsx";
import FormInput from "./FormInput.tsx";
import type {
  ComorbiditiesSection,
  TreatmentSection,
  VitalsSection,
} from "../lib/assessment.ts";

const TREATMENT_OPTIONS = [
  { key: "centralVenousLine", label: "Central Venous Line" },
  { key: "umbilicalArterialLine", label: "Umbilical Arterial Line" },
  { key: "inotrope", label: "Inotrope" },
  { key: "intubated", label: "Intubated" },
] as const;

const COMORBIDITY_OPTIONS = [
  { key: "necrotizingEnterocolitis", label: "Necrotizing Enterocolitis" },
  { key: "nonCardiacSurgicalDisease", label: "Non-Cardiac Surgical Disease" },
  { key: "chronicLungDisease", label: "Chronic Lung Disease" },
  { key: "congenitalCardiacDisease", label: "Congenital Cardiac Disease" },
] as const;

/**
 * Physiological (hourly) vitals fields, shared by the assessment wizard and
 * the patient-edit page. `idPrefix` keeps DOM ids unique when several forms
 * mount on the same page.
 */
export function VitalsFields({
  value,
  onChange,
  idPrefix,
}: {
  value: VitalsSection;
  onChange: (patch: Partial<VitalsSection>) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <FormInput
        id={`${idPrefix}-hr`}
        label="HR (bpm)"
        placeholder="HR (bpm)"
        type="number"
        min={40}
        max={260}
        value={value.heartRateBpm}
        onChange={(event) => onChange({ heartRateBpm: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-temp`}
        label="Temp (°C)"
        placeholder="Temp (°C)"
        type="number"
        step="0.1"
        min={30}
        max={45}
        value={value.temperatureC}
        onChange={(event) => onChange({ temperatureC: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-bp`}
        label="SBP / DBP"
        placeholder="e.g. 74/44"
        describedBy={`${idPrefix}-bp-format`}
        value={value.bloodPressure}
        onChange={(event) => onChange({ bloodPressure: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-o2`}
        label="O2 Sat (%)"
        placeholder="O2 Sat (%)"
        type="number"
        min={40}
        max={100}
        value={value.oxygenSaturationPct}
        onChange={(event) => onChange({ oxygenSaturationPct: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-rr`}
        label="Respiratory rate"
        placeholder="Resp Rate (/min)"
        type="number"
        min={10}
        max={130}
        value={value.respiratoryRatePerMin}
        onChange={(event) => onChange({ respiratoryRatePerMin: event.target.value })}
      />
      <p id={`${idPrefix}-bp-format`} className="self-end text-xs text-theme-gray">
        Blood pressure as systolic/diastolic, e.g. 74/44.
      </p>
    </div>
  );
}

/** Current treatment toggle chips. */
export function TreatmentChips({
  value,
  onChange,
}: {
  value: TreatmentSection;
  onChange: (next: TreatmentSection) => void;
}) {
  return (
    <ChipGroup<keyof TreatmentSection>
      legend="Current treatment — toggle all that apply"
      options={TREATMENT_OPTIONS}
      values={value}
      onChange={onChange}
    />
  );
}

/** Comorbidity toggle chips. */
export function ComorbiditiesChips({
  value,
  onChange,
}: {
  value: ComorbiditiesSection;
  onChange: (next: ComorbiditiesSection) => void;
}) {
  return (
    <ChipGroup<keyof ComorbiditiesSection>
      legend="Diagnosed comorbidities — toggle all that apply"
      options={COMORBIDITY_OPTIONS}
      values={value}
      onChange={onChange}
    />
  );
}
