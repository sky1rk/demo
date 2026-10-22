"""Engine contract tests — the same checks humans would do with curl, minus
the process/port work. fastapi.testclient exercises main.app in-process.

Determinism notes:
- REQUIRE_AUTH=false is set before the app imports (workflow env), so
  verify_bearer_token passes through and no Supabase JWKS is needed.
- torch/pytorch-forecasting are NOT in requirements, so the TFT branch uses
  the deterministic vital-sign fallback: tft_source == temporal_vitals_fallback.
- The artifacts are strict: these assertions are the fenced-off drift alarms
  for requirements.txt pins (sklearn 1.5.2 / xgboost 2.1.4).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app  # noqa: E402 — needs REQUIRE_AUTH set first (workflow env)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


CANONICAL_PAYLOAD = {
    "patient_id": "PYTEST-001",
    "sex": "male",
    "gestational_age_weeks": 31,
    "birth_weight_g": 1800,
    "delivery_mode": "vaginal",
    "age_at_onset_hours": 8,
    # apgar_1min is a true model feature (feeds apgar_delta); apgar_10min must
    # be tolerated as an unknown key by the feature mapper.
    "apgar_1min": 7,
    "apgar_5min": 8,
    "apgar_10min": 9,
    "poor_feeding": 1,
    "respiratory_distress": 1,
    "temperature_c": 38.1,
    "heart_rate_bpm": 168,
    "oxygen_saturation_pct": 93,
    "respiratory_rate_bpm": 64,
    "crp_mg_l": 18,
    "wbc_count": 14500,
    "platelet_count": 210000,
}


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_predict_contract(client: TestClient) -> None:
    response = client.post("/predict", json=CANONICAL_PAYLOAD)
    assert response.status_code == 200, response.text

    body = response.json()
    # Legacy build_prediction contract fields the frontend depends on.
    assert body["risk_label"] == "HIGH RISK"
    assert body["predicted_eos"] is True
    assert body["result_title"] == "Sepsis Risk Detected"
    assert 0.0 < body["probability"] <= 1.0
    assert body["probability_percent"] == pytest.approx(body["probability"] * 100, abs=0.2)
    assert body["threshold"] == pytest.approx(0.93, abs=1e-6)
    assert 0.0 < body["xgb_eos_probability"] <= 1.0
    assert 0.0 <= body["tft_eos_probability"] <= 1.0
    assert body["tft_source"] == "temporal_vitals_fallback"
    assert isinstance(body["interpretation"], str) and body["interpretation"] != ""
    assert isinstance(body["recommended_actions"], list) and len(body["recommended_actions"]) > 0
    assert body["inference_ms"] >= 0


def test_predict_shapes_inference_ms(client: TestClient) -> None:
    response = client.post("/predict", json=CANONICAL_PAYLOAD)
    assert response.status_code == 200
    assert isinstance(response.json()["inference_ms"], int)
