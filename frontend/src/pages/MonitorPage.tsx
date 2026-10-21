import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import { listAssessments, listPatients } from "../lib/db.ts";
import { guide } from "../lib/authErrors.ts";
import { formatPatientName, formatDateTimeLabel } from "../lib/patient.ts";
import type { Assessment } from "../lib/assessment.ts";
import type { Patient } from "../lib/patient.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";

type Reading = {
  label: string;
  unit: string;
  raw: string;
  valid: boolean;
  min: number;
  max: number;
};

const VITAL_RANGES = {
  hr: { min: 40, max: 260 },
  temp: { min: 30, max: 45 },
  o2: { min: 40, max: 100 },
  rr: { min: 10, max: 130 },
} as const;

/** Plausible-range flags — soft warnings, not errors (spot-check aid). */
function readings(assessment: Assessment): Reading[] {
  const v = assessment.vitals;
  const hr = v.heartRateBpm.trim();
  const temp = v.temperatureC.trim();
  const o2 = v.oxygenSaturationPct.trim();
  const rr = v.respiratoryRatePerMin.trim();

  return [
    {
      label: "Heart Rate",
      unit: "bpm",
      raw: hr,
      valid: hr === "" || Number.isFinite(Number(hr)),
      ...VITAL_RANGES.hr,
    },
    {
      label: "Temperature",
      unit: "°C",
      raw: temp,
      valid: temp === "" || Number.isFinite(Number(temp)),
      ...VITAL_RANGES.temp,
    },
    {
      label: "O2 Saturation",
      unit: "%",
      raw: o2,
      valid: o2 === "" || Number.isFinite(Number(o2)),
      ...VITAL_RANGES.o2,
    },
    {
      label: "Respiratory Rate",
      unit: "/min",
      raw: rr,
      valid: rr === "" || Number.isFinite(Number(rr)),
      ...VITAL_RANGES.rr,
    },
  ];
}

export default function MonitorPage() {
  usePageTitle("Vitals monitor");

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("patient");

  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listPatients()
      .then((rows) => {
        if (!active) return;
        setPatients(rows);
        if (requested != null && rows.some((p) => p.id === requested)) {
          setSelectedId(requested);
        } else {
          setSelectedId(rows[0]?.id ?? null);
          if (requested != null && requested !== "") {
            setSearchParams({}, { replace: true });
          }
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          console.error("[palse] monitor load failed", loadError);
          setPatients([]);
          setSelectedId(null);
          setError(guide(loadError, "Could not load patients."));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
    // Reload selection when the URL query changes.
  }, [requested, setSearchParams]);

  const refresh = useCallback(
    async (patientId: string | null) => {
      if (patientId == null) {
        setAssessment(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      try {
        const assessments = await listAssessments(patientId);
        setAssessment(assessments[0] ?? null);
        setError(null);
      } catch (loadError) {
        console.error("[palse] monitor assessment load failed", loadError);
        setError(guide(loadError, "Could not load the latest vitals."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void refresh(selectedId);
  }, [selectedId, refresh]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setRefreshing(true);
    if (id === "") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ patient: id }, { replace: true });
    }
  }

  const selected = patients?.find((p) => p.id === selectedId) ?? null;
  const patientLoading = patients === null;
  const list = readings(assessment ?? EMPTY);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Vitals monitor
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Vital Signs Monitor</h1>
        <p className="text-sm text-theme-gray">
          Hourly readings from the patient's latest assessment. Auto-sync
          (realtime channel) is planned.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="monitor-patient" className="text-sm font-medium text-theme-ink">
          Patient
        </label>
        <select
          id="monitor-patient"
          value={selectedId ?? ""}
          disabled={patientLoading}
          onChange={(event) => handleSelect(event.target.value)}
          className="min-w-56 rounded-lg border border-theme-line bg-white px-3.5 py-2 text-sm text-theme-ink transition-colors focus:border-theme-maroon focus:outline-none focus:ring-2 focus:ring-theme-maroon/25 disabled:opacity-60"
        >
          {patientLoading ? (
            <option value="">Loading registry…</option>
          ) : (
            <>
              <option value="">Select a patient</option>
              {(patients ?? []).map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {formatPatientName(patient)}
                  {patient.mrn ? ` — MRN ${patient.mrn}` : ""}
                </option>
              ))}
            </>
          )}
        </select>

        <button
          type="button"
          disabled={refreshing || selectedId == null}
          onClick={() => {
            setRefreshing(true);
            void refresh(selectedId);
          }}
          className="rounded-lg border border-theme-maroon px-4 py-2 text-sm font-semibold text-theme-maroon transition-colors hover:bg-theme-maroon/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon disabled:opacity-60"
        >
          {refreshing ? "Checking…" : "↻ Refresh"}
        </button>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {selected != null && assessment == null && !loading && !refreshing ? (
        <Notice tone="info">
          {formatPatientName(selected)} has no assessment records yet.{" "}
          <Link to="/dashboard" className="font-semibold underline underline-offset-2">
            Start one on the dashboard
          </Link>
          .
        </Notice>
      ) : null}

      {loading || refreshing ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((panel) => (
            <div
              key={panel}
              className="h-36 animate-pulse rounded-xl border border-theme-line bg-white/70"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {list.map((reading) => (
            <VitalPanel
              key={reading.label}
              label={reading.label}
              unit={reading.unit}
              value={reading.raw}
              recorded={assessment?.updatedAt ?? null}
              outOfRange={
                reading.raw !== "" &&
                Number.isFinite(Number(reading.raw)) &&
                (Number(reading.raw) < reading.min || Number(reading.raw) > reading.max)
              }
            />
          ))}
        </div>
      )}

      {assessment != null && selected != null ? (
        <Panel className="flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-theme-ink">
              {formatPatientName(selected)}
            </p>
            <p className="text-xs text-theme-gray">
              {assessment.status === "complete" ? "Completed" : "Draft"} assessment ·
              recorded {formatDateTimeLabel(assessment.createdAt)} · updated{" "}
              {formatDateTimeLabel(assessment.updatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-theme-gray">Risk:</span>
            <span className="rounded-full border border-theme-line bg-theme-light-gray px-2.5 py-0.5 font-semibold text-theme-gray">
              Pending scoring
            </span>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

const EMPTY = {
  vitals: {
    heartRateBpm: "",
    temperatureC: "",
    bloodPressure: "",
    oxygenSaturationPct: "",
    respiratoryRatePerMin: "",
  },
} as Assessment;

function VitalPanel({
  label,
  unit,
  value,
  recorded,
  outOfRange,
}: {
  label: string;
  unit: string;
  value: string;
  recorded: string | null;
  outOfRange: boolean;
}) {
  const hasValue = value !== "";

  return (
    <div className="flex min-h-36 flex-col justify-between rounded-xl border border-theme-line bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-theme-gray">
          {label}
        </span>
        {outOfRange ? (
          <span className="rounded-full border border-risk-moderate-fg/30 bg-risk-moderate-bg px-2 py-0.5 text-[10px] font-bold uppercase text-risk-moderate-fg">
            Check range
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-3xl font-bold text-theme-ink tabular-nums">
        {hasValue ? value : <span className="text-theme-placeholder">—</span>}
        {hasValue ? (
          <span className="ml-1.5 text-sm font-medium text-theme-gray">{unit}</span>
        ) : null}
      </p>

      <p className="mt-3 text-xs text-theme-gray">
        {hasValue
          ? `Recorded ${formatDateTimeLabel(recorded)}`
          : "Not recorded in the latest assessment"}
      </p>
    </div>
  );
}
