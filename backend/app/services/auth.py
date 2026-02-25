from __future__ import annotations

from typing import Annotated, Optional

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import get_settings


class SupabaseJWTVerifier:
    """
    Verifies Supabase access tokens (JWT) using the project's JWKS endpoint.
    """

    def __init__(
        self,
        supabase_url: str,
        audience: str = "authenticated",
        algorithms: Optional[list[str]] = None,
    ) -> None:
        self.supabase_url = supabase_url.rstrip("/")
        self.issuer = f"{self.supabase_url}/auth/v1"
        self.jwks_url = f"{self.issuer}/.well-known/jwks.json"
        self.audience = audience
        self.algorithms = algorithms or ["ES256"]
        self._jwks_client = PyJWKClient(self.jwks_url)

    def verify_and_get_sub(self, token: str) -> str:
        try:
            signing_key = self._jwks_client.get_signing_key_from_jwt(token).key
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=self.algorithms,
                issuer=self.issuer,
                audience=self.audience,
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid token")
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=401, detail="Token missing subject (sub)")
        return sub

security = HTTPBearer()

def get_supabase_verifier() -> SupabaseJWTVerifier:
    settings = get_settings()
    if not settings.supabase_url:
        raise RuntimeError("SUPABASE_URL is not configured in Settings")
    return SupabaseJWTVerifier(supabase_url=settings.supabase_url)


def get_current_user_id(
    creds: HTTPAuthorizationCredentials = Depends(security),
    verifier: SupabaseJWTVerifier = Depends(get_supabase_verifier),
) -> str:
    return verifier.verify_and_get_sub(creds.credentials)


UserId = Annotated[str, Depends(get_current_user_id)]