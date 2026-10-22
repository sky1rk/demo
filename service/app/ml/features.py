"""Shared parsing/normalisation helpers ported from legacy ``app.py``.

The dashboard posts every field as a string (numbers arrive as strings,
selects may arrive as ``""``, checkboxes as 1/0). These helpers coerce the
raw payload into the numeric/binary/categorical values the saved XGBoost
pipeline was trained on.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def to_float(value: Any, default: float | None = np.nan) -> float | None:
    if value is None:
        return default
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return default
        if "/" in value:  # e.g. blood_pressure "70/42" -> systolic
            value = value.split("/", 1)[0].strip()
        if "=" in value:  # e.g. legacy "1 = Yes" labels
            value = value.split("=", 1)[0].strip()
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def to_binary(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    if isinstance(value, bool):
        return int(value)
    text = str(value).strip().lower()
    if text in {"1", "yes", "true", "on", "y", "1 = yes", "positive"}:
        return 1
    if text in {"0", "no", "false", "off", "n", "0 = no", "negative"}:
        return 0
    numeric = to_float(text, default=None)
    return int(numeric) if numeric is not None else default


def normalize_choice(value: Any, mapping: dict[str, str], default: str) -> str:
    if value is None or str(value).strip() == "":
        return default
    text = str(value).strip().lower().replace("-", "_").replace(" ", "_")
    return mapping.get(text, default)


def normalize_sex(value: Any, default: str = "M") -> str:
    return normalize_choice(value, {"male": "M", "m": "M", "female": "F", "f": "F"}, default)


def normalize_delivery_mode(value: Any) -> str:
    return normalize_choice(
        value,
        {
            "vaginal": "spontaneous_vaginal",
            "spontaneous_vaginal": "spontaneous_vaginal",
            "assisted_vaginal": "assisted_vaginal",
            "cesarean": "caesarean_section",
            "caesarean": "caesarean_section",
            "cesarean_section": "caesarean_section",
            "caesarean_section": "caesarean_section",
        },
        "spontaneous_vaginal",
    )


def normalize_place_of_birth(value: Any) -> str:
    return normalize_choice(
        value,
        {
            "home": "home",
            "in_transit": "in_transit",
            "other_facility": "other_facility",
            "this_facility": "this_facility",
        },
        "this_facility",
    )


def build_feature_row(payload: dict[str, Any], selected_features: list[str]) -> pd.DataFrame:
    """Map a dashboard payload onto one XGBoost pipeline input row.

    NOTE: ``respiratory_distress`` (double ``s``) is the literal feature
    name in the saved artifact — keep that spelling.
    """
    apgar_5min = to_float(payload.get("apgar_5min"), np.nan)
    apgar_1min = to_float(payload.get("apgar_1min"), np.nan)
    if pd.isna(apgar_1min) and not pd.isna(apgar_5min):
        apgar_1min = max(float(apgar_5min) - 1, 0)

    crp = to_float(payload.get("crp_mg_l"), -1)
    wbc = to_float(payload.get("wbc_count"), -1)
    platelet = to_float(payload.get("platelet_count"), -1)
    gestational_age = to_float(payload.get("gestational_age_weeks"), np.nan)
    birth_weight = to_float(payload.get("birth_weight_g"), np.nan)

    row: dict[str, Any] = {
        "sex": normalize_sex(payload.get("sex")),
        "gestational_age_weeks": gestational_age,
        "birth_weight_g": birth_weight,
        "delivery_mode": normalize_delivery_mode(payload.get("delivery_mode")),
        "place_of_birth": normalize_place_of_birth(payload.get("place_of_birth")),
        "maternal_age_years": to_float(payload.get("maternal_age_years"), np.nan),
        "apgar_1min": apgar_1min,
        "apgar_5min": apgar_5min,
        "resuscitation_at_birth": to_binary(payload.get("resuscitation_at_birth")),
        "prom_over_18h": to_binary(payload.get("prom_over_18h")),
        "maternal_fever": to_binary(payload.get("maternal_fever")),
        "maternal_uti": to_binary(payload.get("maternal_uti")),
        "unclean_cord_care": to_binary(payload.get("unclean_cord_care")),
        "maternal_hiv": to_binary(payload.get("maternal_hiv")),
        "multiple_birth": to_binary(payload.get("multiple_birth")),
        "anc_4plus": to_binary(payload.get("anc_4plus"), default=1),
        "temperature_c": to_float(payload.get("temperature_c"), np.nan),
        "poor_feeding": to_binary(payload.get("poor_feeding")),
        "lethargy": to_binary(payload.get("lethargy")),
        "respiratory_distress": to_binary(payload.get("respiratory_distress")),
        "convulsions": to_binary(payload.get("convulsions")),
        "abdominal_distension": to_binary(payload.get("abdominal_distension")),
        "jaundice": to_binary(payload.get("jaundice")),
        "umbilical_redness": to_binary(payload.get("umbilical_redness")),
        "skin_pustules": to_binary(payload.get("skin_pustules")),
        "bulging_fontanelle": to_binary(payload.get("bulging_fontanelle")),
        "crp_mg_l": crp,
        "wbc_count": wbc,
        "platelet_count": platelet,
    }

    for col in ["crp_mg_l", "wbc_count", "platelet_count"]:
        lab_value = to_float(row[col], np.nan)
        row[f"{col}_ordered"] = int(not pd.isna(lab_value) and lab_value != -1)

    if gestational_age and not pd.isna(gestational_age) and gestational_age != 0:
        row["weight_to_gestational_age_ratio"] = birth_weight / gestational_age
    else:
        row["weight_to_gestational_age_ratio"] = np.nan
    row["apgar_delta"] = (
        row["apgar_5min"] - row["apgar_1min"] if not pd.isna(row["apgar_5min"]) else np.nan
    )

    # Tolerate dashboard aliases without breaking the artifact column order.
    row.setdefault("respiratory_distress", to_binary(payload.get("respiratory_distress")))
    for feature in selected_features:
        row.setdefault(feature, np.nan)
    return pd.DataFrame([row], columns=selected_features)
