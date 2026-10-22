"""Supabase JWT verification for /predict (the only authed endpoint).

The frontend posts the access token from AuthContext's supabase-js session as
``Authorization: Bearer <jwt>``. We verify the signature against Supabase's
public JWKS (``SUPABASE_URL/auth/v1/.well-known/jwks.json``) — no secret keys
are stored or needed server-side. Any authenticated Supabase user of the
project may call /predict; per-row clinical access control stays in the
frontend (AuthGuard + RLS on Supabase), mirroring the legacy stack's
"every prediction endpoint requires auth" guarantee.
"""

from __future__ import annotations

import logging
import jwt
from fastapi import Header

from .config import REQUIRE_AUTH, SUPABASE_URL

logger = logging.getLogger(__name__)

_jwks_client: jwt.PyJWKClient | None = None


class AuthError(Exception):
    """Raised when the request has no usable Supabase session token."""


def _get_jwks_client() -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        # Small cache window keeps Render free-tier egress sane while still
        # picking up rotated keys within a minute.
        _jwks_client = jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=60)
    return _jwks_client


def verify_bearer_token(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> dict:
    """Validate the Bearer token and return the session claims.

    Raises AuthError on any failure so main.py can map it to 401.
    """
    if not REQUIRE_AUTH:  # throwaway local debugging only
        return {}

    if not SUPABASE_URL:
        raise AuthError(
            "SUPABASE_URL is not configured on this service instance; "
            "tokens cannot be verified."
        )
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError("Missing bearer token. Include 'Authorization: Bearer <jwt>'.")

    token = authorization[7:].strip()
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            options={"verify_aud": False},  # aud=authenticated; role checked below
        )
    except jwt.PyJWTError as exc:
        raise AuthError("Invalid or expired session token.") from exc

    if not claims.get("sub") or claims.get("role") == "anon":
        raise AuthError("Token is not an authenticated session token.")
    return claims
