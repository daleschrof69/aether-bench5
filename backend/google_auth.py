"""Direct Google authorization-code flow with PKCE and browser-bound state."""
import base64
import hashlib
import os
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx


@dataclass(frozen=True)
class GoogleConfig:
    client_id: str
    client_secret: str
    redirect_uri: str
    app_origin: str

    @property
    def enabled(self):
        return bool(self.client_id and self.client_secret and self.redirect_uri)


def configuration():
    origin = os.environ.get("APP_ORIGIN", "http://localhost:3000").rstrip("/")
    return GoogleConfig(
        os.environ.get("GOOGLE_CLIENT_ID", ""),
        os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        os.environ.get("GOOGLE_REDIRECT_URI", f"{origin}/api/auth/google/callback"),
        origin,
    )


def authorization_url(config: GoogleConfig, state: str, verifier: str):
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
        "client_id": config.client_id, "redirect_uri": config.redirect_uri,
        "response_type": "code", "scope": "openid email profile",
        "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
    })


async def exchange_code(config: GoogleConfig, code: str, verifier: str):
    async with httpx.AsyncClient(timeout=15) as http:
        tokens = await http.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": config.client_id, "client_secret": config.client_secret,
            "redirect_uri": config.redirect_uri, "grant_type": "authorization_code",
            "code_verifier": verifier,
        })
        tokens.raise_for_status()
        access_token = tokens.json()["access_token"]
        profile = await http.get("https://openidconnect.googleapis.com/v1/userinfo",
                                 headers={"Authorization": f"Bearer {access_token}"})
        profile.raise_for_status()
    data = profile.json()
    if data.get("email_verified") is not True or not data.get("email") or not data.get("sub"):
        raise ValueError("Google account must have a verified email")
    data["email"] = data["email"].lower().strip()
    return data
