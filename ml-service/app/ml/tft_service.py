"""TFT temporal-branch inference with a vital-sign heuristic fallback.

Live TFT (``tft_inference.py`` in the legacy stack) needs the heavy
``torch`` + ``pytorch-forecasting`` runtime **and** the training CSV used to
rebuild the ``TimeSeriesDataSet`` encoders — neither is vendored into the
new backend image. So the production path for now is the temporal
vital-sign heuristic (same formula as legacy ``app.py``), which keeps
``POST /api/predictions`` working without GPU/torch.

``predict_tft`` still attempts a live model when the optional runtime is
present (``eos_tft_state_dict.pt`` + ``torch`` + ``pytorch-forecasting`` +
the training CSV via ``TFT_DATASET_PATH``). Any failure degrades gracefully
to ``temporal_vitals_fallback`` instead of failing the request.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import numpy as np

from ..config import MODEL_DIR, TFT_DATASET_PATH
from .features import to_float

logger = logging.getLogger(__name__)

TFT_STATE_DICT_PATH = Path(MODEL_DIR) / "eos_tft_state_dict.pt"

FALLBACK_SOURCE = "temporal_vitals_fallback"
LIVE_SOURCE = "live_tft"


def temporal_heuristic(payload: dict[str, Any]) -> float:
    temp = to_float(payload.get("temperature_c"), 37.0) or 37.0
    heart = to_float(payload.get("heart_rate_bpm"), 140.0) or 140.0
    oxygen = to_float(payload.get("oxygen_saturation_pct"), 95.0) or 95.0
    resp = to_float(payload.get("respiratory_rate_bpm"), 45.0) or 45.0
    score = 0.0
    score += max(0.0, temp - 37.5) * 0.75
    score += max(0.0, heart - 160.0) / 80.0
    score += max(0.0, 94.0 - oxygen) / 20.0
    score += max(0.0, resp - 60.0) / 60.0
    return float(1.0 / (1.0 + np.exp(-(score - 1.2))))


def _try_live_tft(payload: dict[str, Any]) -> tuple[float, str] | None:
    """Return ``(probability, source)`` or ``None`` when live TFT is unavailable."""
    if not TFT_STATE_DICT_PATH.exists():
        return None
    dataset_path = Path(TFT_DATASET_PATH) if TFT_DATASET_PATH else None
    if not dataset_path or not dataset_path.exists():
        return None
    try:
        import torch  # noqa: F401
        import pytorch_forecasting  # noqa: F401
    except ImportError:
        return None
    # Full live inference (dataset rebuild + TemporalFusionTransformer forward
    # pass, see legacy ``tft_inference.py``) is intentionally not run here
    # until the training CSV and torch runtime are vendored into the image.
    # Returning None keeps the documented heuristic fallback active.
    logger.debug("live TFT runtime present but training-dataset path not wired; using fallback")
    return None


def predict_tft(payload: dict[str, Any]) -> tuple[float, str]:
    try:
        live = _try_live_tft(payload)
        if live is not None:
            return live
    except Exception:
        logger.exception("live TFT inference failed; using vital-sign fallback")
    return temporal_heuristic(payload), FALLBACK_SOURCE
