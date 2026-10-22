import ChipGroup from "./ChipGroup.tsx";
import FormInput from "./FormInput.tsx";
import {
  LAB_FIELD_RANGES,
  VITAL_FIELD_RANGES,
  bloodPressureError,
  rangeFieldError,
} from "../lib/clinicalValidation.ts";
import type {
  ComorbiditiesSection,
  LabSection,
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
        inputMode="numeric"
        min={VITAL_FIELD_RANGES.heartRateBpm.min}
        max={VITAL_FIELD_RANGES.heartRateBpm.max}
        value={value.heartRateBpm}
        error={rangeFieldError(value.heartRateBpm, VITAL_FIELD_RANGES.heartRateBpm)}
        onChange={(event) => onChange({ heartRateBpm: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-temp`}
        label="Temp (°C)"
        placeholder="Temp (°C)"
        type="number"
        step="0.1"
        min={VITAL_FIELD_RANGES.temperatureC.min}
        max={VITAL_FIELD_RANGES.temperatureC.max}
        value={value.temperatureC}
        error={rangeFieldError(value.temperatureC, VITAL_FIELD_RANGES.temperatureC)}
        onChange={(event) => onChange({ temperatureC: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-bp`}
        label="SBP / DBP"
        placeholder="e.g. 74/44"
        describedBy={`${idPrefix}-bp-format`}
        value={value.bloodPressure}
        error={bloodPressureError(value.bloodPressure)}
        onChange={(event) => onChange({ bloodPressure: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-o2`}
        label="O2 Sat (%)"
        placeholder="O2 Sat (%)"
        type="number"
        inputMode="numeric"
        min={VITAL_FIELD_RANGES.oxygenSaturationPct.min}
        max={VITAL_FIELD_RANGES.oxygenSaturationPct.max}
        value={value.oxygenSaturationPct}
        error={rangeFieldError(value.oxygenSaturationPct, VITAL_FIELD_RANGES.oxygenSaturationPct)}
        onChange={(event) => onChange({ oxygenSaturationPct: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-rr`}
        label="Respiratory rate"
        placeholder="Resp Rate (/min)"
        type="number"
        inputMode="numeric"
        min={VITAL_FIELD_RANGES.respiratoryRatePerMin.min}
        max={VITAL_FIELD_RANGES.respiratoryRatePerMin.max}
        value={value.respiratoryRatePerMin}
        error={rangeFieldError(value.respiratoryRatePerMin, VITAL_FIELD_RANGES.respiratoryRatePerMin)}
        onChange={(event) => onChange({ respiratoryRatePerMin: event.target.value })}
      />
      <p id={`${idPrefix}-bp-format`} className="self-end text-xs text-theme-gray">
        Blood pressure as systolic/diastolic, e.g. 74/44.
      </p>
    </div>
  );
}

/**
 * Laboratory fields, shared by the assessment wizard and the patient-edit
 * page. Leaving a field empty means "not ordered" — the prediction engine
 * imputes accordingly. `idPrefix` keeps DOM ids unique when several forms
 * mount on the same page.
 */
export function LabFields({
  value,
  onChange,
  idPrefix,
}: {
  value: LabSection;
  onChange: (patch: Partial<LabSection>) => void;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <FormInput
        id={`${idPrefix}-crp`}
        label="CRP (mg/L)"
        placeholder="e.g. 18"
        type="number"
        inputMode="numeric"
        min={LAB_FIELD_RANGES.crpMgL.min}
        max={LAB_FIELD_RANGES.crpMgL.max}
        value={value.crpMgL}
        error={rangeFieldError(value.crpMgL, LAB_FIELD_RANGES.crpMgL)}
        onChange={(event) => onChange({ crpMgL: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-wbc`}
        label="WBC count (/µL)"
        placeholder="e.g. 14500"
        type="number"
        inputMode="numeric"
        min={LAB_FIELD_RANGES.wbcCount.min}
        max={LAB_FIELD_RANGES.wbcCount.max}
        value={value.wbcCount}
        error={rangeFieldError(value.wbcCount, LAB_FIELD_RANGES.wbcCount)}
        onChange={(event) => onChange({ wbcCount: event.target.value })}
      />
      <FormInput
        id={`${idPrefix}-platelets`}
        label="Platelets (/µL)"
        placeholder="e.g. 210000"
        type="number"
        inputMode="numeric"
        min={LAB_FIELD_RANGES.plateletCount.min}
        max={LAB_FIELD_RANGES.plateletCount.max}
        value={value.plateletCount}
        error={rangeFieldError(value.plateletCount, LAB_FIELD_RANGES.plateletCount)}
        onChange={(event) => onChange({ plateletCount: event.target.value })}
      />
      <p className="self-end text-xs text-theme-gray">
        Leave a field empty if the test was not ordered — the engine treats
        unmeasured labs as "not ordered" instead of a normal result.
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
