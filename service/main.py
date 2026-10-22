"""Pal.se EOS inference service (trimmed port of the legacy FastAPI stack).

Serves ONLY the model: the legacy auth (cookies + own Postgres) and the
patients/predictions/reports persistence endpoints are NOT ported — Supabase
owns auth and storage. Endpoints:

  GET  /health    → liveness probe (no auth)
  POST /predict   → run XGBoost + TFT + residual fusion; requires a Supabase
                    session token (verified against Supabase's public JWKS)

The POST body is the legacy dashboard JSON (snake_case fields, all optional —
missing values are imputed/defaulted to match the saved artifacts). The
response is the legacy ``build_prediction`` contract plus ``inference_ms``:

  { "probability": 0.78, "probability_percent": 78.0, "risk_label": "HIGH RISK",
    "result_title": "Sepsis Risk Detected", "predicted_eos": true,
    "threshold": 0.93, "xgb_eos_probability": 0.61, "tft_eos_probability": 0.52,
    "tft_source": "...", "interpretation": "...",
    "recommended_actions": [...], "inference_ms": 142 }
"""

from __future__ import annotations

import logging
import time

import uvicorn
from fastapi import Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import AuthError, verify_bearer_token
from app.config import ALLOWED_ORIGINS
from app.ml.ensemble import build_prediction

logger = logging.getLogger(__name__)

app = FastAPI(title="PAL.SE EOS Inference API")


@app.exception_handler(AuthError)
def auth_error_handler(request: Request, exc: AuthError) -> JSONResponse:
    """Map token problems (missing SUPABASE_URL config, invalid JWT) to 401."""
    return JSONResponse(status_code=401, content={"detail": str(exc)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # we use Authorization headers, not cookies
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["authorization", "content-type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/predict",
    status_code=status.HTTP_200_OK,
    responses={
        401: {"description": "Missing/invalid Supabase session token"},
        400: {"description": "Model rejected the clinical values"},
        503: {"description": "Model artifacts unavailable"},
    },
)
async def predict(
    request: Request,
    claims: dict = Depends(verify_bearer_token),
) -> dict:
    """Run the EOS residual-ensemble prediction for one clinical payload."""
    try:
        payload = await request.json()
    except Exception as exc:  # noqa: BLE001 - FastAPI can't pre-parse dict bodies
        return JSONResponse(status_code=400, content={"detail": "Body must be valid JSON."})

    if not isinstance(payload, dict):
        return JSONResponse(status_code=400, content={"detail": "Body must be a JSON object."})

    started = time.perf_counter()
    try:
        prediction = build_prediction(payload)
    except FileNotFoundError as exc:
        raise_msg = str(exc)
        logger.error("model artifact missing: %s", exc)
        return JSONResponse(status_code=503, content={"detail": raise_msg})
    except RuntimeError as exc:
        logger.exception("prediction model unavailable")
        return JSONResponse(status_code=503, content={"detail": str(exc)})
    except ValueError as exc:
        logger.warning("prediction rejected invalid input: %s", exc)
        return JSONResponse(status_code=400, content={"detail": str(exc)})
    except Exception as exc:  # noqa: BLE001 - surface model errors as 400 like legacy Flask
        logger.exception("prediction failed")
        return JSONResponse(
            status_code=400,
            content={
                "detail": "Failed to generate the EOS risk prediction. Please review the "
                "entered clinical values for validity (e.g. numeric fields such as "
                "gestational age, birth weight and lab results) and try again."
            },
        )

    prediction["inference_ms"] = int((time.perf_counter() - started) * 1000)
    prediction["caller"] = claims.get("sub")  # audit hint only; not persisted here
    return prediction


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
