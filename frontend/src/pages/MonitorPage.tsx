import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import Notice from "../components/Notice.tsx";
import Panel from "../components/Panel.tsx";
import ImportVitalsCsvModal from "../components/ImportVitalsCsvModal.tsx";
import RiskBadge from "../components/RiskBadge.tsx";
import ScoringFailureNotice from "../components/ScoringFailureNotice.tsx";
import Sparkline from "../components/Sparkline.tsx";
import TrendChart from "../components/TrendChart.tsx";
import MsIcon from "../components/MsIcon.tsx";
import VitalReadingForm from "../components/VitalReadingForm.tsx";
import type { VitalReadingPayload } from "../components/VitalReadingForm.tsx";
import { useAuth } from "../context/useAuth.ts";
import {
  addVitalObservation,
  assessmentPrediction,
  deleteVitalObservation,
  listAssessments,
  listPatients,
  listVitalObservations,
  riskLevelFromLabel,
  savePrediction,
  updateAssessmentSections,
} from "../lib/db.ts";
import { draftToNumericFields, observationError, observationSeries } from "../lib/vitals.ts";
import type { VitalObservation } from "../lib/vitals.ts";
import type { Assessment, AssessmentSections, VitalsSection } from "../lib/assessment.ts";
import type { PredictionResult } from "../lib/ml.ts";
import { engineConfigured, getAccessToken, MlEngineError, runPrediction } from "../lib/ml.ts";
import type { Patient } from "../lib/patient.ts";
import { formatPatientName, formatDateTimeLabel } from "../lib/patient.ts";
import { usePageTitle } from "../hooks/usePageTitle.ts";
import { guide } from "../lib/authErrors.ts";
import { supabase } from "../lib/supabase.ts";

/** How many readings the readings table lists (charts use all loaded). */
const TABLE_LIMIT = 8;

interface MetricConfig {
  key: string;
  label: string;
  unit: string;
  /** Material Symbols glyph shown in the metric card header. */
  icon: string;
  pick: (observation: VitalObservation) => number | null;
  fromAssessment: (vitals: VitalsSection) => string;
  min: number;
  max: number;
}

const METRICS: ReadonlyArray<MetricConfig> = [
  {
    key: "heart_rate_bpm",
    label: "Heart Rate",
    unit: "bpm",
    icon: "ecg_heart",
    pick: (observation) => observation.heartRateBpm,
    fromAssessment: (vitals) => vitals.heartRateBpm.trim(),
    min: 40,
    max: 260,
  },
  {
    key: "temperature_c",
    label: "Temperature",
    unit: "°C",
    icon: "device_thermostat",
    pick: (observation) => observation.temperatureC,
    fromAssessment: (vitals) => vitals.temperatureC.trim(),
    min: 30,
    max: 45,
  },
  {
    key: "oxygen_saturation_pct",
    label: "O2 Saturation",
    unit: "%",
    icon: "spo2",
    pick: (observation) => observation.oxygenSaturationPct,
    fromAssessment: (vitals) => vitals.oxygenSaturationPct.trim(),
    min: 40,
    max: 100,
  },
  {
    key: "respiratory_rate_per_min",
    label: "Respiratory Rate",
    unit: "/min",
    icon: "air",
    pick: (observation) => observation.respiratoryRatePerMin,
    fromAssessment: (vitals) => vitals.respiratoryRatePerMin.trim(),
    min: 10,
    max: 130,
  },
];

export default function MonitorPage() {
  usePageTitle("Vitals monitor");

  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("patient");

  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [observations, setObservations] = useState<VitalObservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  /** Bumped after saves / patient switches so the shared form clears. */
  const [formResetKey, setFormResetKey] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreNotice, setRescoreNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);
  /** Engine outage on the last rescoring attempt; retryable via the notice. */
  const [scoringFailure, setScoringFailure] = useState<MlEngineError | null>(
    null,
  );

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

  const refresh = useCallback(async (patientId: string | null) => {
    if (patientId == null) {
      setAssessments([]);
      setObservations([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [assessmentRows, observationRows] = await Promise.all([
        listAssessments(patientId),
        listVitalObservations(patientId),
      ]);
      setAssessments(assessmentRows);
      setObservations(observationRows);
      setError(null);
    } catch (loadError) {
      console.error("[palse] monitor load failed", loadError);
      setError(guide(loadError, "Could not load the vital-sign data."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(selectedId);
  }, [selectedId, refresh]);

  // Live charts: Supabase Realtime pushes every insert/update/delete on this
  // patient's observation history from any tab or user (the supabase_realtime
  // publication + replica identity full are set in schema.sql v6).
  useEffect(() => {
    if (selectedId == null) return;
    const channel = supabase
      .channel(`vitals-monitor:${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vital_observations",
          filter: `patient_id=eq.${selectedId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            // replica identity full ships the old row; fall back to a full
            // refresh when the id is somehow unavailable.
            const id = (payload.old as { id?: string } | null)?.id ?? null;
            if (id != null) {
              setObservations((prev) => prev.filter((row) => row.id !== id));
            } else {
              setRefreshing(true);
              void refresh(selectedId);
            }
            return;
          }
          const raw = payload.new as Record<string, unknown> | null;
          if (raw == null || raw.id == null) return;
          const row = rowToObservation(raw);
          setObservations((prev) =>
            sortByRecordedDesc([...prev.filter((existing) => existing.id !== row.id), row]),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // refresh is stable (useCallback with no deps).
  }, [selectedId, refresh]);

  function handleSelect(id: string) {
    setSelectedId(id);
    setRefreshing(true);
    setError(null);
    setSavedNotice(null);
    setRescoreNotice(null);
    setFormError(null);
    setFormResetKey((key) => key + 1);
    setSearchParams(id === "" ? {} : { patient: id }, { replace: true });
  }

  async function handleRecordReading(payload: VitalReadingPayload) {
    const patientId = selectedId;
    if (patientId == null) return;
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
        assessmentId: assessments[0]?.id ?? null,
        recordedAt: recordedAt.toISOString(),
        ...draftToNumericFields(payload.draft),
      });
      setObservations((prev) => sortByRecordedDesc([...prev, row]));
      setFormResetKey((key) => key + 1);
      setSavedNotice(`Reading recorded (${formatDateTimeLabel(row.recordedAt)}).`);
    } catch (recordError) {
      console.error("[palse] observation record failed", recordError);
      setFormError(guide(recordError, "Could not record the reading. Try again."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(observationId: string) {
    try {
      await deleteVitalObservation(observationId);
      setObservations((prev) => prev.filter((row) => row.id !== observationId));
    } catch (deleteError) {
      console.error("[palse] observation delete failed", deleteError);
      setError(guide(deleteError, "Could not delete the reading."));
    }
  }

  async function handleRescore() {
    const latest: Assessment | undefined = assessments[0];
    const observation = latestObservation(observations);
    const patientId = selectedId;
    if (latest == null || patientId == null) return;

    if (!engineConfigured()) {
      setRescoreNotice({
        tone: "info",
        message:
          "The prediction engine is not configured for this build — the reading was saved on the observation history only.",
      });
      return;
    }
    let accessToken: string | null = null;
    try {
      accessToken = await getAccessToken();
    } catch {
      accessToken = null;
    }
    if (accessToken == null) {
      setRescoreNotice({
        tone: "info",
        message: "Your session expired. Sign in again to run scoring.",
      });
      return;
    }

    const vitals = observationToVitalsSection(observation, latest.vitals);
    setRescoring(true);
    try {
      await updateAssessmentSections(latest.id, { vitals });
      const mergedSections: AssessmentSections = {
        demographic: latest.demographic,
        maternal: latest.maternal,
        neonatal: latest.neonatal,
        vitals,
        laboratory: latest.laboratory,
        treatment: latest.treatment,
        comorbidities: latest.comorbidities,
      };
      const result = await runPrediction(mergedSections, accessToken);
      await savePrediction(latest.id, patientId, result);
      const rescoredRisk = riskLevelFromLabel(result.riskLabel);
      setAssessments((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        next[0] = {
          ...next[0],
          vitals,
          prediction: storedFromResult(result),
          predictedAt: new Date().toISOString(),
        };
        return next;
      });
      setRescoreNotice({
        tone: "success",
        message: `Scored ${formatDateTimeLabel(observation?.recordedAt ?? latest.updatedAt)}: risk level is now “${rescoredRisk}”.`,
      });
      setScoringFailure(null);
    } catch (scoreError) {
      console.error("[palse] monitor rescoring failed", scoreError);
      if (scoreError instanceof MlEngineError) {
        setScoringFailure(scoreError);
      } else {
        // Non-engine failure (e.g. saving the sections) — neutral copy.
        setRescoreNotice({
          tone: "info",
          message:
            "Could not rescore: the prediction engine could not be reached. The record will be scored retroactively.",
        });
      }
    } finally {
      setRescoring(false);
    }
  }

  const selected = patients?.find((p) => p.id === selectedId) ?? null;
  const patientLoading = patients === null;
  const latest = assessments[0] ?? null;

  /** Default value per metric: newest observation value, then the assessment's vitals. */
  const metricView = useMemo(
    () =>
      METRICS.map((metric) => {
        const observed = observations.find((row) => metric.pick(row) != null) ?? null;
        const fallbackRaw = latest == null ? "" : metric.fromAssessment(latest.vitals);
        const raw =
          observed != null
            ? String(metric.pick(observed))
            : fallbackRaw;
        const numeric = Number(raw);
        return {
          metric,
          observed,
          raw,
          outOfRange:
            raw !== "" &&
            Number.isFinite(numeric) &&
            (numeric < metric.min || numeric > metric.max),
        };
      }),
    [observations, latest],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-theme-maroon">
          Vitals monitor
        </p>
        <h1 className="text-2xl font-bold text-theme-ink">Vital Signs Monitor</h1>
        <p className="text-sm text-theme-gray">
          Live readings and trend charts from the observation history — updates
          push in automatically as readings are recorded.
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

      {selected != null && latest == null && observations.length === 0 && !loading && !refreshing ? (
        <Notice tone="info">
          {formatPatientName(selected)} has no assessment records yet, and no
          vital-sign readings.{" "}
          <Link to="/dashboard" className="font-semibold underline underline-offset-2">
            Start one on the dashboard
          </Link>{" "}
          or record the first reading below.
        </Notice>
      ) : null}

      {selected != null && latest != null && observations.length === 0 && !loading && !refreshing ? (
        <Notice tone="info">
          No vital-sign readings recorded yet for {formatPatientName(selected)}.
          The cards below show the latest assessment's vitals as the fallback —
          record the first reading to start the trend charts.
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
          {metricView.map(({ metric, observed, raw, outOfRange }) => (
            <VitalPanel
              key={metric.key}
              label={metric.label}
              unit={metric.unit}
              value={raw}
              recorded={observed?.recordedAt ?? latest?.updatedAt ?? null}
              sparkPoints={observationSeries(observations, metric.pick)}
              outOfRange={outOfRange}
            />
          ))}
        </div>
      )}

      {/* Trend charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {METRICS.map((metric) => {
          const series = observationSeries(observations, metric.pick);
          return (
            <TrendChart
              key={metric.key}
              title={metric.label}
              icon={metric.icon}
              unit={metric.unit}
              points={series}
              emptyHint={
                observations.length === 0
                  ? "Record two or more readings (below) to see the trend line."
                  : "Only one reading so far — add another to draw the trend."
              }
            />
          );
        })}
      </div>

      {/* Record + manage readings */}
      {selected != null ? (
        <Panel className="flex-col gap-4">
          <VitalReadingForm
            key={`monitor-obs-${formResetKey}`}
            idPrefix="monitor-obs"
            saving={saving}
            error={formError}
            onSave={(payload) => void handleRecordReading(payload)}
          />

          {savedNotice && !formError ? (
            <div className="text-sm font-medium text-theme-ink" role="status">
              {savedNotice}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-theme-line pt-4">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-theme-maroon px-4 py-2 text-sm font-semibold text-theme-maroon transition-colors hover:bg-theme-maroon/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
            >
              <MsIcon name="upload_file" className="text-[18px]" optical={20} />
              Import CSV
            </button>
            <button
              type="button"
              disabled={rescoring || latest == null || observations.length === 0}
              onClick={() => void handleRescore()}
              className="flex items-center gap-1.5 rounded-lg border border-theme-maroon px-4 py-2 text-sm font-semibold text-theme-maroon transition-colors hover:bg-theme-maroon/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon disabled:opacity-60"
            >
              <MsIcon name="refresh" className="text-[18px]" optical={20} />
              {rescoring
                ? "Scoring…"
                : "Recalculate risk score from latest reading"}
            </button>
            <span className="text-xs text-theme-gray">
              Pushes the newest reading into the latest assessment and re-runs the engine.
            </span>
          </div>

          {rescoreNotice ? (
            <Notice tone={rescoreNotice.tone}>{rescoreNotice.message}</Notice>
          ) : null}
          {scoringFailure != null ? (
            <ScoringFailureNotice
              error={scoringFailure}
              retryPending={rescoring}
              onRetry={() => void handleRescore()}
            />
          ) : null}

          <VitalsTable
            observations={observations.slice(0, TABLE_LIMIT)}
            userId={user?.id ?? null}
            onDelete={(id) => void handleDelete(id)}
          />
        </Panel>
      ) : null}

      {/* CSV import (same batch format as vitals-import-example.csv) */}
      {importOpen && selected != null ? (
        <ImportVitalsCsvModal
          patientId={selected.id}
          patientName={formatPatientName(selected)}
          assessmentId={assessments[0]?.id ?? null}
          onClose={() => setImportOpen(false)}
          onImported={(rows) =>
            setObservations((prev) => sortByRecordedDesc([...prev, ...rows]))
          }
        />
      ) : null}

      {/* Prediction history */}
      {latest != null && selected != null ? (
        <PredictionHistory patientName={formatPatientName(selected)} assessments={assessments} />
      ) : null}

      {latest != null && selected != null && !loading && !refreshing ? (
        <Panel className="flex-row items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-theme-ink">
              {formatPatientName(selected)}
            </p>
            <p className="text-xs text-theme-gray">
              {latest.status === "complete" ? "Completed" : "Draft"} assessment ·
              recorded {formatDateTimeLabel(latest.createdAt)} · updated{" "}
              {formatDateTimeLabel(latest.updatedAt)}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-theme-gray">Risk:</span>
            {latest.prediction != null ? (
              (() => {
                const prediction = assessmentPrediction(latest);
                if (prediction == null) return null;
                return (
                  <span className="flex items-center gap-2">
                    <RiskBadge level={selected.riskLevel} />
                    <span className="tabular-nums text-theme-gray">
                      {(prediction.probability * 100).toFixed(1)}%
                    </span>
                  </span>
                );
              })()
            ) : (
              <span className="rounded-full border border-theme-line bg-theme-light-gray px-2.5 py-0.5 font-semibold text-theme-gray">
                Not scored
              </span>
            )}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------- Helpers --------------------------------- */

function sortByRecordedDesc(rows: VitalObservation[]): VitalObservation[] {
  return [...rows].sort(
    (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
  );
}

/** Newest observation (the list is sorted desc already). */
function latestObservation(observations: VitalObservation[]): VitalObservation | null {
  return observations[0] ?? null;
}

/**
 * Maps an observation onto the assessment's vitals section string shape.
 * SBP/DBP become the legacy "SBP/DBP" string only when a systolic value is
 * present (the service reads the systolic side; a lone diastolic is ignored).
 */
function observationToVitalsSection(
  observation: VitalObservation | null,
  fallback: VitalsSection,
): VitalsSection {
  if (observation == null) return fallback;
  const str = (value: number | null): string => (value == null ? "" : String(value));
  return {
    heartRateBpm: str(observation.heartRateBpm),
    temperatureC: str(observation.temperatureC),
    bloodPressure:
      observation.sbpMmHg == null
        ? ""
        : observation.dbpMmHg == null
          ? String(observation.sbpMmHg)
          : `${observation.sbpMmHg}/${observation.dbpMmHg}`,
    oxygenSaturationPct: str(observation.oxygenSaturationPct),
    respiratoryRatePerMin: str(observation.respiratoryRatePerMin),
  };
}

function storedFromResult(result: PredictionResult): Assessment["prediction"] {
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

function rowToObservation(raw: Record<string, unknown>): VitalObservation {
  return {
    id: String(raw.id),
    createdBy: String(raw.created_by),
    patientId: String(raw.patient_id),
    assessmentId: raw.assessment_id == null ? null : String(raw.assessment_id),
    recordedAt: String(raw.recorded_at),
    heartRateBpm: (raw.heart_rate_bpm as number | null) ?? null,
    temperatureC: (raw.temperature_c as number | null) ?? null,
    sbpMmHg: (raw.sbp_mmhg as number | null) ?? null,
    dbpMmHg: (raw.dbp_mmhg as number | null) ?? null,
    oxygenSaturationPct: (raw.oxygen_saturation_pct as number | null) ?? null,
    respiratoryRatePerMin: (raw.respiratory_rate_per_min as number | null) ?? null,
    createdAt: String(raw.created_at),
    updatedAt: String(raw.updated_at),
  };
}

/* ------------------------------ Sub-render -------------------------------- */

function VitalPanel({
  label,
  unit,
  value,
  recorded,
  sparkPoints,
  outOfRange,
}: {
  label: string;
  unit: string;
  value: string;
  recorded: string | null;
  sparkPoints: ReturnType<typeof observationSeries>;
  outOfRange: boolean;
}) {
  const hasValue = value !== "";
  const fallback = sparkPoints.length === 0;

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

      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-3xl font-bold text-theme-ink tabular-nums">
          {hasValue ? value : <span className="text-theme-placeholder">—</span>}
          {hasValue ? (
            <span className="ml-1.5 text-sm font-medium text-theme-gray">{unit}</span>
          ) : null}
        </p>
        <Sparkline points={sparkPoints} />
      </div>

      <p className="mt-3 text-xs text-theme-gray">
        {hasValue
          ? `Recorded ${formatDateTimeLabel(recorded)}`
          : fallback
            ? "No readings recorded yet"
            : "Not recorded in the latest assessment"}
      </p>
    </div>
  );
}

function VitalsTable({
  observations,
  userId,
  onDelete,
}: {
  observations: VitalObservation[];
  userId: string | null;
  onDelete: (id: string) => void;
}) {
  if (observations.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Recent vital-sign readings</caption>
        <thead>
          <tr className="border-b border-theme-line text-left text-xs font-bold uppercase tracking-wide text-theme-gray">
            <th scope="col" className="py-2 pr-4">Recorded</th>
            <th scope="col" className="py-2 pr-4">HR</th>
            <th scope="col" className="py-2 pr-4">Temp</th>
            <th scope="col" className="py-2 pr-4">SBP/DBP</th>
            <th scope="col" className="py-2 pr-4">O2</th>
            <th scope="col" className="py-2 pr-4">RR</th>
            <th scope="col" className="py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {observations.map((row) => (
            <tr key={row.id} className="border-b border-theme-line/60 last:border-0">
              <td className="py-2 pr-4 whitespace-nowrap text-theme-ink">
                {formatDateTimeLabel(row.recordedAt)}
              </td>
              <td className="py-2 pr-4 tabular-nums">{row.heartRateBpm ?? "—"}</td>
              <td className="py-2 pr-4 tabular-nums">{row.temperatureC ?? "—"}</td>
              <td className="py-2 pr-4 tabular-nums">
                {row.sbpMmHg == null && row.dbpMmHg == null
                  ? "—"
                  : `${row.sbpMmHg ?? "—"} / ${row.dbpMmHg ?? "—"}`}
              </td>
              <td className="py-2 pr-4 tabular-nums">{row.oxygenSaturationPct ?? "—"}</td>
              <td className="py-2 pr-4 tabular-nums">{row.respiratoryRatePerMin ?? "—"}</td>
              <td className="py-2 text-right">
                {userId != null && row.createdBy === userId ? (
                  <button
                    type="button"
                    onClick={() => onDelete(row.id)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-theme-gray transition-colors hover:bg-risk-high-bg hover:text-risk-high-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-maroon"
                  >
                    <MsIcon name="delete" className="text-[14px]" optical={20} />
                    Delete
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredictionHistory({
  patientName,
  assessments,
}: {
  patientName: string;
  assessments: Assessment[];
}) {
  const scored = assessments.filter((assessment) => assessment.prediction != null);

  return (
    <Panel className="flex-col gap-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-theme-ink">
          Prediction history
        </h2>
        <p className="text-xs text-theme-gray">
          Every engine score stored for {patientName}, newest first.
        </p>
      </div>
      {scored.length === 0 ? (
        <p className="text-sm text-theme-gray">
          No scored predictions yet — complete an assessment to record one.
        </p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Prediction history for {patientName}</caption>
          <thead>
            <tr className="border-b border-theme-line text-left text-xs font-bold uppercase tracking-wide text-theme-gray">
              <th scope="col" className="py-2 pr-4">Scored</th>
              <th scope="col" className="py-2 pr-4">Level</th>
              <th scope="col" className="py-2 pr-4">Probability</th>
              <th scope="col" className="py-2">Assessment</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((row) => {
              const prediction = assessmentPrediction(row);
              if (prediction == null) return null;
              return (
                <tr key={row.id} className="border-b border-theme-line/60 last:border-0">
                  <td className="py-2 pr-4 whitespace-nowrap text-theme-ink">
                    {formatDateTimeLabel(row.predictedAt ?? row.updatedAt)}
                  </td>
                  <td className="py-2 pr-4">
                    <RiskBadge level={riskLevelFromLabel(prediction.riskLabel)} />
                  </td>
                  <td className="py-2 pr-4 tabular-nums">
                    {(prediction.probability * 100).toFixed(1)}%
                  </td>
                  <td className="py-2 text-xs text-theme-gray">
                    {row.status === "complete" ? "Completed" : "Draft"} ·{" "}
                    {formatDateTimeLabel(row.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
