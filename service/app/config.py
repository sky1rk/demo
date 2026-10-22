"""Minimal config for the Pal.se inference service.

Only model-serving settings live here — the legacy auth/database config from
``legacy/backend/app/config.py`` is intentionally NOT ported: auth is Supabase
(JWT verified against Supabase's public JWKS) and persistence happens in the
frontend via supabase-js.
"""

import os

# Optional local overrides (service/.env) so every launch style — `fastapi dev`
# from a plain shell, uvicorn, Render — reaches the same configuration without
# remembering env vars. Real env vars always win; the file is gitignored.
try:
    from dotenv import load_dotenv

    load_dotenv(
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
        override=False,
    )
except ImportError:  # python-dotenv ships with fastapi-cli; plain uvicorn may skip it
    pass

# Public-safe: the project URL is embedded in the frontend build already.
# Used for two things: fetching Supabase's public JWKS to verify access
# tokens, and (once configured) locating the training CSV for live TFT.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")

# Comma-separated CORS origins allowed to call /predict. Local dev default.
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173",
    ).split(",")
    if origin.strip()
]

# If true (Render default), an invalid/unauthenticated JWT fails /predict with
# 401. Keep false ONLY for throwaway local debugging.
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() != "false"

# Directory holding the EOS model artifacts (eos_xgboost_pipeline.joblib,
# eos_residual_ensemble.joblib, eos_tft_state_dict.pt). Overridable for
# Docker/local layouts; defaults to service/models next to this package.
MODEL_DIR = os.getenv(
    "MODEL_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models"),
)

# Optional training CSV used to rebuild TFT TimeSeriesDataSet encoders for
# live inference. When unset/missing, predict_tft() uses the vital-sign
# heuristic fallback and reports tft_source="temporal_vitals_fallback".
TFT_DATASET_PATH = os.getenv("TFT_DATASET_PATH", "")
