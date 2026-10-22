"""Residual-ensemble fusion: ``final = clip(xgb + predicted_residual, 0, 1)``.

The ensemble receives the five residual features recorded in the artifact
(``xgb_eos_probability, tft_eos_probability, tft_minus_xgb,
mean_probability, absolute_disagreement``) and the decision threshold comes
from the artifact itself (``residual_threshold`` = 0.93), not a hardcoded
value.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from ..config import MODEL_DIR
from .tft_service import predict_tft
from .xgboost_service import predict_xgb

RESIDUAL_ARTIFACT_PATH = Path(MODEL_DIR) / "eos_residual_ensemble.joblib"

_residual_artifact: dict[str, Any] | None = None


def load_residual_artifact() -> dict[str, Any]:
    global _residual_artifact
    if _residual_artifact is None:
        try:
            if not RESIDUAL_ARTIFACT_PATH.exists():
                raise FileNotFoundError(f"Residual ensemble model file not found at {RESIDUAL_ARTIFACT_PATH}")
            _residual_artifact = joblib.load(RESIDUAL_ARTIFACT_PATH)
        except (FileNotFoundError, OSError) as exc:
            raise FileNotFoundError(
                "Required residual ensemble model file is missing or not accessible. Please ensure model artifacts are properly installed."
            ) from exc
        except Exception as exc:
            raise RuntimeError(
                "Failed to load residual ensemble model. The model file may be corrupted or incompatible with the current environment."
            ) from exc
    return _residual_artifact


def residual_features(xgb_probability: float, tft_probability: float) -> pd.DataFrame:
    artifact = load_residual_artifact()
    row = {
        "xgb_eos_probability": xgb_probability,
        "tft_eos_probability": tft_probability,
        "tft_minus_xgb": tft_probability - xgb_probability,
        "mean_probability": (xgb_probability + tft_probability) / 2,
        "absolute_disagreement": abs(tft_probability - xgb_probability),
    }
    return pd.DataFrame([row], columns=artifact["residual_features"])


def risk_level(probability: float, threshold: float) -> tuple[str, str]:
    if probability >= threshold:
        return "HIGH RISK", "Sepsis Risk Detected"
    if probability >= 0.30:
        return "MODERATE RISK", "Monitor Closely"
    return "LOW RISK", "Low EOS Risk"


def clinical_text(risk_label: str, probability: float) -> tuple[str, list[str]]:
    percent = round(probability * 100, 1)
    if risk_label == "HIGH RISK":
        return (
            f"Alert: residual ensemble estimates {percent}% EOS risk. "
            "Review maternal, laboratory, and vital-sign findings promptly.",
            [
                "Initiate physician review immediately.",
                "Consider empirical IV antibiotics per protocol.",
                "Repeat CRP/CBC and maintain continuous monitoring.",
            ],
        )
    if risk_label == "MODERATE RISK":
        return (
            f"Residual ensemble estimates {percent}% EOS risk. "
            "Continue close observation and reassess if symptoms progress.",
            [
                "Increase vital-sign observation frequency.",
                "Repeat laboratory work if clinically indicated.",
                "Escalate if respiratory or feeding status worsens.",
            ],
        )
    return (
        f"Residual ensemble estimates {percent}% EOS risk. "
        "Current entries do not cross the model decision threshold.",
        [
            "Continue routine monitoring.",
            "Reassess if new EOS signs appear.",
            "Document clinical judgment alongside model output.",
        ],
    )


def build_prediction(payload: dict[str, Any]) -> dict[str, Any]:
    artifact = load_residual_artifact()
    try:
        threshold = float(artifact["residual_threshold"])
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(
            "The residual ensemble model artifact is malformed (missing decision threshold). "
            "Please reinstall or re-export the model files."
        ) from exc
    xgb_probability = predict_xgb(payload)
    tft_probability, tft_source = predict_tft(payload)
    try:
        predicted_residual = float(
            artifact["residual_model"].predict(
                residual_features(xgb_probability, tft_probability)
            )[0]
        )
    except (KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(
            "The residual ensemble model could not combine the XGBoost and TFT scores. "
            "The model artifact may be corrupted or incompatible."
        ) from exc
    probability = float(np.clip(xgb_probability + predicted_residual, 0, 1))
    risk_label, result_title = risk_level(probability, threshold)
    interpretation, actions = clinical_text(risk_label, probability)
    return {
        "probability": probability,
        "probability_percent": round(probability * 100, 1),
        "risk_label": risk_label,
        "result_title": result_title,
        "predicted_eos": probability >= threshold,
        "threshold": threshold,
        "xgb_eos_probability": xgb_probability,
        "tft_eos_probability": tft_probability,
        "tft_source": tft_source,
        "interpretation": interpretation,
        "recommended_actions": actions,
    }
