"""XGBoost static-branch inference (lazy singleton over the joblib artifact)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np

from ..config import MODEL_DIR
from .features import build_feature_row

XGB_ARTIFACT_PATH = Path(MODEL_DIR) / "eos_xgboost_pipeline.joblib"

_xgb_artifact: dict[str, Any] | None = None


def load_xgb_artifact() -> dict[str, Any]:
    global _xgb_artifact
    if _xgb_artifact is None:
        try:
            if not XGB_ARTIFACT_PATH.exists():
                raise FileNotFoundError(f"XGBoost model file not found at {XGB_ARTIFACT_PATH}")
            _xgb_artifact = joblib.load(XGB_ARTIFACT_PATH)
        except (FileNotFoundError, OSError) as exc:
            raise FileNotFoundError(
                f"Required XGBoost model file is missing or not accessible. Please ensure model artifacts are properly installed."
            ) from exc
        except Exception as exc:
            raise RuntimeError(
                "Failed to load XGBoost model. The model file may be corrupted or incompatible with the current environment."
            ) from exc
    return _xgb_artifact


def predict_xgb(payload: dict[str, Any]) -> float:
    try:
        artifact = load_xgb_artifact()
        features = build_feature_row(payload, artifact["selected_features"])
        numeric = artifact["num_imputer"].transform(features[artifact["numeric_cols"]])
        categorical = artifact["cat_imputer"].transform(features[artifact["categorical_cols"]])
        encoded = artifact["onehot_encoder"].transform(categorical)
        prepared = np.hstack([numeric, encoded])
        return float(artifact["calibrated_model"].predict_proba(prepared)[:, 1][0])
    except (KeyError, IndexError, ValueError) as exc:
        raise ValueError(
            "Invalid input data for the XGBoost model. Please check your clinical values "
            "(for example, numeric fields such as gestational age, birth weight and lab "
            "results) and try again."
        ) from exc
    except Exception as exc:
        raise RuntimeError(
            "The XGBoost model could not be run. This usually means the installed "
            "machine-learning library versions are incompatible with the saved model files "
            "(the model requires scikit-learn 1.5.2 / xgboost 2.1.4)."
        ) from exc
