import { useState } from "react";

import FormInput from "./FormInput.tsx";
import PrimaryButton from "./PrimaryButton.tsx";
import {
  EMPTY_OBSERVATION_DRAFT,
  toLocalInput,
  type ObservationDraft,
} from "../lib/vitals.ts";

/** Submitted reading values from the form (raw strings + picker value). */
export interface VitalReadingPayload {
  draft: ObservationDraft;
  recordedAt: string;
}

/**
 * The six-field vital-reading entry form shared by /monitor's "Record
 * vitals" panel and the wizard's earlier/later readings block. Owns its
 * field state; on Save it hands the raw values to the parent's `onSave`,
 * which validates, persists, and surfaces errors back through `error`.
 * Hosts clear the form (patient switch / successful save) by changing their
 * `key` on the component — a remount re-seeds the time picker to now.
 *
 * `idPrefix` keeps the input ids unique — both hosts can be mounted at
 * once (monitor + dashboard).
 */
export default function VitalReadingForm({
  idPrefix,
  saving,
  error,
  onSave,
}: {
  idPrefix: string;
  saving: boolean;
  error?: string | null;
  onSave: (payload: VitalReadingPayload) => void;
}) {
  const [draft, setDraft] = useState<ObservationDraft>(EMPTY_OBSERVATION_DRAFT);
  const [recordedAt, setRecordedAt] = useState<string>(() => toLocalInput(new Date()));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label htmlFor={`${idPrefix}-recorded-at`} className="text-sm font-medium text-theme-ink">
          Reading time
          <span className="ml-2 text-xs font-normal text-theme-gray">
            backdate earlier readings here
          </span>
        </label>
        <input
          id={`${idPrefix}-recorded-at`}
          type="datetime-local"
          value={recordedAt}
          onChange={(event) => setRecordedAt(event.target.value)}
          className="rounded-lg border border-theme-line bg-white px-3 py-2 text-sm text-theme-ink focus:border-theme-maroon focus:outline-none focus:ring-2 focus:ring-theme-maroon/25"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FormInput
          id={`${idPrefix}-hr`}
          label="HR (bpm)"
          placeholder="e.g. 148"
          type="number"
          min={0}
          value={draft.heartRateBpm}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, heartRateBpm: event.target.value }))
          }
        />
        <FormInput
          id={`${idPrefix}-temp`}
          label="Temp (°C)"
          placeholder="e.g. 38.2"
          type="number"
          min={20}
          step="0.1"
          value={draft.temperatureC}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, temperatureC: event.target.value }))
          }
        />
        <FormInput
          id={`${idPrefix}-o2`}
          label="O2 Sat (%)"
          placeholder="e.g. 94"
          type="number"
          min={40}
          max={100}
          value={draft.oxygenSaturationPct}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, oxygenSaturationPct: event.target.value }))
          }
        />
        <FormInput
          id={`${idPrefix}-sbp`}
          label="SBP (mmHg)"
          placeholder="e.g. 78"
          type="number"
          min={0}
          value={draft.sbpMmHg}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, sbpMmHg: event.target.value }))
          }
        />
        <FormInput
          id={`${idPrefix}-dbp`}
          label="DBP (mmHg)"
          placeholder="e.g. 44"
          type="number"
          min={0}
          value={draft.dbpMmHg}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, dbpMmHg: event.target.value }))
          }
        />
        <FormInput
          id={`${idPrefix}-rr`}
          label="Resp Rate (/min)"
          placeholder="e.g. 52"
          type="number"
          min={0}
          value={draft.respiratoryRatePerMin}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, respiratoryRatePerMin: event.target.value }))
          }
        />
      </div>

      {error != null ? (
        <div className="text-sm font-medium text-risk-high-fg">{error}</div>
      ) : null}

      <PrimaryButton
        pending={saving}
        onClick={() => onSave({ draft, recordedAt })}
        className="w-auto"
        type="button"
      >
        Save reading
      </PrimaryButton>
    </div>
  );
}

/** Convenience re-export: hosts build NewVitalObservation from this shape. */
export type { ObservationDraft };
