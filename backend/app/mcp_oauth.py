from __future__ import annotations

import base64
import hashlib
import html
import secrets
from datetime import datetime, timedelta, timezone
from typing import Mapping
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .mcp_models import (
    MCP_SCOPES,
    McpOAuthAccessToken,
    McpOAuthAuthorizationCode,
    McpOAuthClient,
    McpOAuthRefreshToken,
)
from .models import User, utcnow
from .security import decrypt_factor_secret, generate_opaque_token, token_hash, verify_password, verify_totp


class OAuthRequestError(Exception):
    def __init__(self, code: str, description: str, *, status_code: int = 400):
        super().__init__(description)
        self.code = code
        self.description = description
        self.status_code = status_code


class OAuthClientRegistrationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    redirect_uris: list[str] = Field(min_length=1, max_length=10)
    client_name: str = Field(default="MCP-Client", min_length=1, max_length=120)

    @field_validator("client_name")
    @classmethod
    def normalize_client_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("client_name darf nicht leer sein.")
        return value


def resource_metadata_url(request_origin: str) -> str:
    return f"{request_origin.rstrip('/')}/.well-known/oauth-protected-resource"


def oauth_www_authenticate(request_origin: str) -> str:
    return f'Bearer resource_metadata="{resource_metadata_url(request_origin)}"'


def _safe_redirect_uri(value: str) -> bool:
    try:
        parsed = urlsplit(value)
        hostname = (parsed.hostname or "").lower().rstrip(".")
        port = parsed.port
    except ValueError:
        return False
    if not value or parsed.fragment or parsed.username is not None or parsed.password is not None:
        return False
    if parsed.scheme == "https":
        return bool(hostname)
    if parsed.scheme != "http":
        return False
    return hostname in {"localhost", "127.0.0.1", "[::1]", "::1"} and port is not None


def _canonical_scopes(raw: str | None) -> list[str]:
    if raw is None or not raw.strip():
        return list(MCP_SCOPES)
    requested = raw.split()
    if len(requested) != len(set(requested)) or not set(requested).issubset(MCP_SCOPES):
        raise OAuthRequestError("invalid_scope", "Mindestens ein angeforderter Scope ist ungültig.")
    return [scope for scope in MCP_SCOPES if scope in set(requested)]


def scope_string(scopes: list[str] | tuple[str, ...]) -> str:
    return " ".join(scopes)

def _aware_utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def get_oauth_client(db: Session, client_id: str) -> McpOAuthClient:
    client = db.scalar(
        select(McpOAuthClient).where(
            McpOAuthClient.client_id == client_id,
            McpOAuthClient.is_active.is_(True),
        )
    )
    if client is None:
        raise OAuthRequestError("invalid_client", "Der OAuth-Client ist unbekannt oder deaktiviert.")
    return client


def register_oauth_client(db: Session, payload: OAuthClientRegistrationRequest) -> McpOAuthClient:
    normalized_uris: list[str] = []
    for redirect_uri in payload.redirect_uris:
        if not _safe_redirect_uri(redirect_uri):
            raise OAuthRequestError(
                "invalid_redirect_uri",
                "Nur HTTPS- oder lokale HTTP-Redirect-URIs sind zulässig.",
            )
        if redirect_uri in normalized_uris:
            raise OAuthRequestError("invalid_redirect_uri", "Redirect-URIs dürfen nicht doppelt vorkommen.")
        normalized_uris.append(redirect_uri)
    client = McpOAuthClient(
        client_id=f"mcp_oauth_{secrets.token_urlsafe(24)}",
        client_name=payload.client_name,
        redirect_uris=normalized_uris,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def validate_authorization_request(
    db: Session,
    *,
    response_type: str | None,
    client_id: str | None,
    redirect_uri: str | None,
    scope: str | None,
    code_challenge: str | None,
    code_challenge_method: str | None,
    resource: str | None,
    expected_resource: str,
) -> tuple[McpOAuthClient, list[str], str]:
    if response_type != "code":
        raise OAuthRequestError("unsupported_response_type", "Nur response_type=code wird unterstützt.")
    if not client_id or not redirect_uri:
        raise OAuthRequestError("invalid_request", "client_id und redirect_uri sind erforderlich.")
    client = get_oauth_client(db, client_id)
    if redirect_uri not in set(client.redirect_uris or []):
        raise OAuthRequestError("invalid_request", "Die Redirect-URI ist für diesen Client nicht registriert.")
    if not code_challenge or len(code_challenge) > 128 or code_challenge_method != "S256":
        raise OAuthRequestError("invalid_request", "PKCE mit S256 ist erforderlich.")
    requested_resource = resource or expected_resource
    if requested_resource != expected_resource:
        raise OAuthRequestError("invalid_target", "Der OAuth-Token ist für einen anderen MCP-Server bestimmt.")
    return client, _canonical_scopes(scope), requested_resource


def _pkce_matches(verifier: str, challenge: str) -> bool:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return secrets.compare_digest(base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii"), challenge)


def create_authorization_code(
    db: Session,
    *,
    client: McpOAuthClient,
    user: User,
    redirect_uri: str,
    code_challenge: str,
    scopes: list[str],
    resource: str,
) -> str:
    value = f"avmcp_code_{generate_opaque_token()}"
    db.add(
        McpOAuthAuthorizationCode(
            code_hash=token_hash(value),
            client_pk=client.id,
            user_id=user.id,
            redirect_uri=redirect_uri,
            code_challenge=code_challenge,
            code_challenge_method="S256",
            scopes=scopes,
            resource=resource,
            expires_at=utcnow() + timedelta(minutes=5),
        )
    )
    db.commit()
    return value


def _token_response(
    db: Session,
    *,
    client: McpOAuthClient,
    user: User,
    scopes: list[str],
    resource: str,
) -> dict[str, object]:
    settings = get_settings()
    access_value = f"avmcp_oauth_at_{generate_opaque_token()}"
    refresh_value = f"avmcp_oauth_rt_{generate_opaque_token()}"
    expires_in = settings.mcp_oauth_access_token_minutes * 60
    now = utcnow()
    db.add(
        McpOAuthAccessToken(
            token_hash=token_hash(access_value),
            client_pk=client.id,
            user_id=user.id,
            scopes=scopes,
            resource=resource,
            expires_at=now + timedelta(seconds=expires_in),
        )
    )
    db.add(
        McpOAuthRefreshToken(
            token_hash=token_hash(refresh_value),
            client_pk=client.id,
            user_id=user.id,
            scopes=scopes,
            resource=resource,
            expires_at=now + timedelta(days=settings.mcp_oauth_refresh_token_days),
        )
    )
    client.last_used_at = now
    db.commit()
    return {
        "access_token": access_value,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "refresh_token": refresh_value,
        "scope": scope_string(scopes),
    }


def exchange_authorization_code(
    db: Session,
    *,
    client_id: str,
    code_value: str,
    redirect_uri: str,
    code_verifier: str,
    resource: str | None,
    expected_resource: str,
) -> dict[str, object]:
    if not code_verifier or len(code_verifier) > 256:
        raise OAuthRequestError("invalid_grant", "Der PKCE-Verifier ist ungültig.")
    client = get_oauth_client(db, client_id)
    code = db.scalar(
        select(McpOAuthAuthorizationCode)
        .where(McpOAuthAuthorizationCode.code_hash == token_hash(code_value))
        .with_for_update()
    )
    now = utcnow()
    if (
        code is None
        or code.client_pk != client.id
        or code.used_at is not None
        or code.redirect_uri != redirect_uri
        or _aware_utc(code.expires_at) <= now
        or (resource and resource != code.resource)
        or code.resource != expected_resource
        or not _pkce_matches(code_verifier, code.code_challenge)
    ):
        raise OAuthRequestError("invalid_grant", "Der Authorization Code ist ungültig oder abgelaufen.")
    user = db.get(User, code.user_id)
    if user is None:
        raise OAuthRequestError("invalid_grant", "Der Authorization Code ist ungültig oder abgelaufen.")
    code.used_at = now
    return _token_response(db, client=client, user=user, scopes=list(code.scopes or []), resource=code.resource)


def refresh_oauth_token(
    db: Session,
    *,
    client_id: str,
    refresh_value: str,
    scope: str | None,
    resource: str | None,
    expected_resource: str,
) -> dict[str, object]:
    client = get_oauth_client(db, client_id)
    stored = db.scalar(
        select(McpOAuthRefreshToken)
        .where(McpOAuthRefreshToken.token_hash == token_hash(refresh_value))
        .with_for_update()
    )
    now = utcnow()
    if (
        stored is None
        or stored.client_pk != client.id
        or stored.revoked_at is not None
        or _aware_utc(stored.expires_at) <= now
        or (resource and resource != stored.resource)
        or stored.resource != expected_resource
    ):
        raise OAuthRequestError("invalid_grant", "Der Refresh-Token ist ungültig oder abgelaufen.")
    stored_scopes = list(stored.scopes or [])
    requested_scopes = _canonical_scopes(scope) if scope is not None else stored_scopes
    if not set(requested_scopes).issubset(stored_scopes):
        raise OAuthRequestError("invalid_scope", "Der Scope kann beim Erneuern nicht erweitert werden.")
    user = db.get(User, stored.user_id)
    if user is None:
        raise OAuthRequestError("invalid_grant", "Der Refresh-Token ist ungültig oder abgelaufen.")
    stored.revoked_at = now
    return _token_response(
        db,
        client=client,
        user=user,
        scopes=requested_scopes,
        resource=stored.resource,
    )


def user_from_password(db: Session, email: str, password: str, totp_code: str | None = None) -> User | None:
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None or not verify_password(password, user.password_hash):
        return None
    if user.totp_enabled and not verify_totp(decrypt_factor_secret(user.totp_secret_encrypted), totp_code or ""):
        return None
    return user


def _hidden_input(name: str, value: str) -> str:
    return f'<input type="hidden" name="{html.escape(name)}" value="{html.escape(value, quote=True)}">'


def authorization_form(
    *,
    action: str,
    params: Mapping[str, str],
    client_name: str,
    scopes: list[str],
    error: str | None = None,
) -> str:
    hidden = "".join(_hidden_input(name, value) for name, value in params.items())
    scope_list = "".join(f"<li>{html.escape(scope)}</li>" for scope in scopes)
    error_html = f'<p class="error">{html.escape(error)}</p>' if error else ""
    passkey_script = """<script>
const b64 = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4)), c => c.charCodeAt(0)).buffer;
const out = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
document.getElementById('passkey').addEventListener('click', async () => {
  const form = document.querySelector('form'); const values = Object.fromEntries(new FormData(form));
  try {
    const start = await fetch('/oauth/authorize/passkey/options', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:values.email})});
    if (!start.ok) throw new Error('Passkey-Optionen konnten nicht geladen werden.');
    const data = await start.json(); const o = data.options; o.challenge = b64(o.challenge);
    o.allowCredentials = (o.allowCredentials || []).map(c => ({...c, id:b64(c.id)}));
    const c = await navigator.credentials.get({publicKey:o}); if (!c) throw new Error('Keine Passkey-Anmeldung erhalten.');
    const r = c.response;
    const credential = {id:c.id, rawId:out(c.rawId), type:c.type, response:{clientDataJSON:out(r.clientDataJSON), authenticatorData:out(r.authenticatorData), signature:out(r.signature), userHandle:r.userHandle ? out(r.userHandle) : null}};
    const finish = await fetch('/oauth/authorize/passkey', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...values, credential, challenge_token:data.challenge_token})});
    if (!finish.ok) throw new Error('Passkey konnte nicht bestätigt werden.');
    location.href = (await finish.json()).redirect_uri;
  } catch (e) { alert(e.message || 'Passkey-Anmeldung fehlgeschlagen.'); }
});
</script>"""
    return f"""<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Baseline Cycling-Zugriff freigeben</title>
<style>body{{font:16px system-ui,sans-serif;background:#f5f2eb;color:#25231f;max-width:34rem;margin:4rem auto;padding:0 1rem}}main{{background:white;border-radius:1rem;padding:2rem;box-shadow:0 8px 32px #0001}}h1{{margin-top:0}}label{{display:block;margin:.9rem 0 .3rem;font-weight:600}}input{{box-sizing:border-box;width:100%;padding:.7rem;border:1px solid #bbb;border-radius:.45rem;font:inherit}}button{{margin-top:1.2rem;padding:.75rem 1rem;border:0;border-radius:.5rem;background:#176b53;color:white;font-weight:700;cursor:pointer}}button.deny{{margin-left:.5rem;background:#777}}.error{{color:#a32222}}small{{color:#666}}</style></head>
<body><main><h1>Baseline Cycling-Zugriff</h1><p><strong>{html.escape(client_name)}</strong> möchte auf deine Baseline Cycling-Daten zugreifen.</p>
<ul>{scope_list}</ul>{error_html}<form method="post" action="{html.escape(action, quote=True)}">{hidden}
<label for="email">E-Mail-Adresse</label><input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Passwort</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<label for="totp_code">Authenticator-Code <small>(falls aktiviert)</small></label><input id="totp_code" name="totp_code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code">
<button name="decision" value="allow" type="submit">Zugriff erlauben</button><button id="passkey" type="button">Mit Passkey freigeben</button><button class="deny" name="decision" value="deny" type="submit">Ablehnen</button>
</form><p><small>Die Verbindung verwendet OAuth 2.1 mit PKCE. Baseline Cycling speichert kein MCP-Client-Secret.</small></p>{passkey_script}</main></body></html>"""
