import type { AssessmentSections } from "./assessment.ts";
import { supabase } from "./supabase.ts";

/**
 * Client for the EOS inference service (`service/`, hosted on Render).
 *
 * The request payload uses the legacy dashboard's snake_case contract — the
 * saved XGBoost/TFT/residual artifacts were trained on exactly that shape, so
 * `sectionsToMlPayload` below is the single docs-on-code mapping from our
 * wizard sections JSONB to the model features. Every field is optional; the
 * service imputes/defaults whatever is missing exactly like the legacy stack.
 *
 * Access control: the caller must pass the session access token from
 * AuthContext; the service verifies it against Supabase's public JWKS. This
 * page-level gating (AuthGuard) plus the token keep scoring signed-in-only.
 *
 * When VITE_ML_API_URL is unset the UI stays in fallback mode (assessments are
 * stored unscored, results panels keep their "pending engine" placeholders).
 */

export type RiskLabel = "LOW RISK" | "MODERATE RISK" | "HIGH RISK";

/** POST /predict response — the legacy build_prediction contract. */
export interface PredictionResult {
  probability: number;
  probabilityPercent: number;
  riskLabel: RiskLabel;
  resultTitle: string;
  predictedEos: boolean;
  threshold: number;
  xgbEosProbability: number;
  tftEosProbability: number;
  tftSource: string;
  interpretation: string;
  recommendedActions: string[];
  inferenceMs: number;
}

const ML_API_URL = (import.meta.env.VITE_ML_API_URL ?? "").replace(/\/+$/, "");

/** True when an inference service URL is configured for this build. */
export function engineConfigured(): boolean {
  return ML_API_URL !== "";
}

type Binary = 0 | 1;

function binary(value: boolean | null | undefined): Binary | undefined {
  if (value == null) return undefined;
  return value ? 1 : 0;
}

function numberField(value: string): number | undefined {
  const text = value.trim();
  if (text === "") return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Wizard sections JSONB → legacy model payload. Field provenance per section:
 *
 * demographic: sex, gestational_age_weeks, birth_weight_g, delivery_mode,
 *              multiple_birth                                    (model: static)
 * maternal:    maternal_age_years, anc_4plus, prom_over_18h, maternal_fever,
 *              maternal_uti, maternal_hiv                        (model: static)
 * neonatal:    age_at_onset_hours, apgar_5min + the six observed-sign
 *              binaries (legacy apgar_1min is derived from apgar_5min by the
 *              feature mapper)                                   (model: static)
 * vitals:      temperature_c, heart_rate_bpm, blood_pressure,
 *              oxygen_saturation_pct, respiratory_rate_bpm       (model: static+TFT)
 * laboratory:  crp_mg_l, wbc_count, platelet_count — omitted keys become
 *              "not ordered" (`*_ordered = 0`)                   (model: static)
 * treatment:   central_venous_line, inotrope, intubate — umbilicalArterialLine
 *              has no model feature (kept for future artifacts)  (model: static)
 * comorbidities: no feature columns in the current artifact — forwarded for
 *              future retro-scoring; the service ignores unknown keys.
 */
export function sectionsToMlPayload(sections: AssessmentSections): Record<string, unknown> {
  const { demographic, maternal, neonatal, vitals, laboratory, treatment, comorbidities } =
    sections;

  const bp = vitals.bloodPressure.trim();

  return {
    sex: demographic.sex ?? undefined,
    gestational_age_weeks: numberField(demographic.gestationalAgeWeeks),
    birth_weight_g: numberField(demographic.birthWeightGrams),
    delivery_mode: demographic.deliveryMode ?? undefined,
    multiple_birth: binary(demographic.multipleBirth),

    maternal_age_years: numberField(maternal.maternalAge),
    anc_4plus: binary(maternal.ancVisitsFourPlus),
    prom_over_18h: binary(maternal.promOver18h),
    maternal_fever: binary(maternal.feverAtLeast38C),
    maternal_uti: binary(maternal.utiDuringPregnancy),
    maternal_hiv: binary(maternal.hivPositive),

    age_at_onset_hours: numberField(neonatal.ageAtAdmissionHours),
    apgar_5min: numberField(neonatal.apgarFiveMinutes),
    poor_feeding: binary(neonatal.poorFeeding),
    lethargy: binary(neonatal.lethargy),
    convulsions: binary(neonatal.convulsions),
    respiratory_distress: binary(neonatal.respiratoryDistress),
    jaundice: binary(neonatal.jaundice),
    bulging_fontanelle: binary(neonatal.bulgingFontanelle),

    heart_rate_bpm: numberField(vitals.heartRateBpm),
    temperature_c: numberField(vitals.temperatureC),
    blood_pressure: bp === "" ? undefined : bp,
    oxygen_saturation_pct: numberField(vitals.oxygenSaturationPct),
    respiratory_rate_bpm: numberField(vitals.respiratoryRatePerMin),

    crp_mg_l: numberField(laboratory.crpMgL),
    wbc_count: numberField(laboratory.wbcCount),
    platelet_count: numberField(laboratory.plateletCount),

    central_venous_line: binary(treatment.centralVenousLine),
    inotrope: binary(treatment.inotrope),
    intubate: binary(treatment.intubated),

    comorbidities: { ...comorbidities },
  };
}

const REQUEST_TIMEOUT_MS = 20_000;

/** Runs POST /predict and returns the legacy prediction contract. */
export async function runPrediction(
  sections: AssessmentSections,
  accessToken: string,
): Promise<PredictionResult> {
  if (!engineConfigured()) {
    throw new Error("Prediction engine is not configured for this build.");
  }

  const payload = sectionsToMlPayload(sections);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${ML_API_URL}/predict`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "The prediction engine took too long to respond. Please try again.",
      );
    }
    throw new Error(
      "Could not reach the prediction engine. Check your connection and try again.",
    );
  } finally {
    window.clearTimeout(timeout);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.status === 401) {
    // Propagate the engine's reason: a real expired session and a
    // misconfigured engine (e.g. SUPABASE_URL unset) both arrive as 401, but
    // need very different remedies. Fall back to the session-expired guidance
    // when the engine's detail is unavailable.
    const detail =
      body != null && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : null;
    throw new Error(
      detail ?? "Your session expired. Please sign in again to run scoring.",
    );
  }
  if (!response.ok) {
    const detail =
      body != null && typeof body === "object" && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : null;
    throw new Error(
      detail ??
        `The prediction engine returned an error (${response.status}). Please review the clinical values and try again.`,
    );
  }

  return toPredictionResult(body);
}

/** Refreshes the session token (supabase-js reuses valid tokens internally). */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token == null) {
    throw new Error("Your session expired. Please sign in again to run scoring.");
  }
  return token;
}

interface RawPrediction {
  probability?: number;
  probability_percent?: number;
  risk_label?: string;
  result_title?: string;
  predicted_eos?: boolean;
  threshold?: number;
  xgb_eos_probability?: number;
  tft_eos_probability?: number;
  tft_source?: string;
  interpretation?: string;
  recommended_actions?: unknown;
  inference_ms?: number;
}

function toPredictionResult(raw: unknown): PredictionResult {
  const source = (raw ?? {}) as RawPrediction;
  const label = source.risk_label;
  return {
    probability: Number(source.probability ?? 0),
    probabilityPercent: Number(
      source.probability_percent ?? (Number(source.probability ?? 0) * 100),
    ),
    riskLabel:
      label === "HIGH RISK"
        ? "HIGH RISK"
        : label === "LOW RISK"
          ? "LOW RISK"
          : "MODERATE RISK",
    resultTitle: String(source.result_title ?? "EOS risk assessed"),
    predictedEos: Boolean(source.predicted_eos),
    threshold: Number(source.threshold ?? 0),
    xgbEosProbability: Number(source.xgb_eos_probability ?? 0),
    tftEosProbability: Number(source.tft_eos_probability ?? 0),
    tftSource: String(source.tft_source ?? "unknown"),
    interpretation: String(source.interpretation ?? ""),
    recommendedActions: Array.isArray(source.recommended_actions)
      ? source.recommended_actions.map(String)
      : [],
    inferenceMs: Number(source.inference_ms ?? 0),
  };
}
