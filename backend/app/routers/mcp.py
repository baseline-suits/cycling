from __future__ import annotations

import json
from time import perf_counter
from typing import Annotated, Any, Mapping
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..config import get_settings
from ..mcp_models import (
    MCP_SCOPES,
    McpAccessTokenRequest,
    McpAccessTokenResponse,
    McpAuditLog,
    McpAuditResponse,
    McpClient,
    McpClientCreate,
    McpClientCreated,
    McpClientResponse,
    McpClientUpdate,
    McpSecretRotated,
)
from ..mcp_security import (
    MAX_MCP_BODY_BYTES,
    MAX_TOKEN_BODY_BYTES,
    McpAuthenticationError,
    McpCredentialError,
    McpPrincipal,
    audit_mcp_request,
    authenticate_mcp_bearer,
    generate_client_id,
    generate_client_secret,
    hash_client_secret,
    issue_mcp_access_token,
    mcp_origin_allowed,
    revoke_client_tokens,
    utcnow,
)
from ..mcp_oauth import (
    OAuthClientRegistrationRequest,
    OAuthRequestError,
    authorization_form,
    create_authorization_code,
    exchange_authorization_code,
    get_oauth_client,
    oauth_www_authenticate,
    refresh_oauth_token,
    register_oauth_client,
    scope_string,
    user_from_password,
    validate_authorization_request,
)
from ..mcp_service import (
    McpToolError,
    execute_tool,
    serialize_tool_result,
    tool_is_allowed,
    tool_is_known,
    tools_for_scopes,
)
from ..models import User
from ..passkeys import authenticate_credential, authentication_options


router = APIRouter(tags=["MCP"])

RPC_PATH = "/api/v1/mcp/rpc"
SUPPORTED_PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26")
CURRENT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]
NO_STORE_HEADERS = {"Cache-Control": "no-store", "Pragma": "no-cache"}
RPC_HEADERS = {**NO_STORE_HEADERS, "MCP-Protocol-Version": CURRENT_PROTOCOL_VERSION}
ClientIdentifier = Annotated[
    str,
    Path(min_length=12, max_length=80, pattern=r"^avmcp_[A-Za-z0-9_-]+$"),
]


class _PayloadTooLarge(Exception):
    pass


class _InvalidBody(Exception):
    pass


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Administratorrechte erforderlich.")
    return current_user


def _request_origin(request: Request) -> str:
    settings = get_settings()
    configured = (settings.public_url or "").strip().rstrip("/")
    # PUBLIC_URL is the canonical externally visible origin. In deployments
    # behind Cloudflare and Caddy, X-Forwarded-Proto may describe the internal
    # proxy hop as HTTP and must not downgrade OAuth metadata to http://.
    if configured:
        return configured

    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", 1)[0].strip()
    forwarded_host = request.headers.get("x-forwarded-host", "").split(",", 1)[0].strip()
    if forwarded_host:
        scheme = forwarded_proto or request.url.scheme
        return f"{scheme}://{forwarded_host}".rstrip("/")
    scheme = forwarded_proto or request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    return f"{scheme}://{host}".rstrip("/")


def _mcp_resource_uri(request: Request) -> str:
    configured = (get_settings().mcp_resource_uri or "").strip().rstrip("/")
    return configured or f"{_request_origin(request)}{RPC_PATH}"


def _oauth_metadata(request: Request) -> dict[str, object]:
    origin = _request_origin(request)
    return {
        "issuer": origin,
        "authorization_endpoint": f"{origin}/oauth/authorize",
        "token_endpoint": f"{origin}/oauth/token",
        "registration_endpoint": f"{origin}/oauth/register",
        "response_types_supported": ["code"],
        "response_modes_supported": ["query"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": list(MCP_SCOPES),
    }


def _protected_resource_metadata(request: Request) -> dict[str, object]:
    origin = _request_origin(request)
    return {
        "resource": _mcp_resource_uri(request),
        "authorization_servers": [origin],
        "scopes_supported": list(MCP_SCOPES),
        "bearer_methods_supported": ["header"],
    }


@router.get(
    "/.well-known/oauth-protected-resource",
    include_in_schema=False,
)
@router.get(
    "/.well-known/oauth-protected-resource/api/v1/mcp/rpc",
    include_in_schema=False,
)
@router.get(
    "/api/v1/mcp/.well-known/oauth-protected-resource",
    include_in_schema=False,
)
def oauth_protected_resource_metadata(request: Request) -> JSONResponse:
    return JSONResponse(_protected_resource_metadata(request), headers=NO_STORE_HEADERS)


@router.get("/.well-known/oauth-authorization-server", include_in_schema=False)
@router.get("/api/v1/mcp/.well-known/oauth-authorization-server", include_in_schema=False)
def oauth_authorization_server_metadata(request: Request) -> JSONResponse:
    return JSONResponse(_oauth_metadata(request), headers=NO_STORE_HEADERS)


def _oauth_error_response(error: OAuthRequestError) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"error": error.code, "error_description": error.description},
        headers=NO_STORE_HEADERS,
    )


def _redirect_with_params(uri: str, params: dict[str, str]) -> RedirectResponse:
    parsed = urlsplit(uri)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    query.extend(params.items())
    target = urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), ""))
    return RedirectResponse(target, status_code=status.HTTP_302_FOUND)


def _oauth_authorization_params(values: Mapping[str, object]) -> dict[str, str]:
    allowed = (
        "response_type",
        "client_id",
        "redirect_uri",
        "scope",
        "state",
        "code_challenge",
        "code_challenge_method",
        "resource",
    )
    return {
        key: str(values[key])
        for key in allowed
        if values.get(key) is not None and str(values[key]) != ""
    }


@router.post("/oauth/register", status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def oauth_register(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        return _oauth_error_response(OAuthRequestError("invalid_client_metadata", "JSON-Anfrage erforderlich."))
    try:
        payload = OAuthClientRegistrationRequest.model_validate(await request.json())
        client = register_oauth_client(db, payload)
    except (ValidationError, ValueError) as exc:
        return _oauth_error_response(OAuthRequestError("invalid_client_metadata", str(exc)))
    except OAuthRequestError as exc:
        return _oauth_error_response(exc)
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "client_id": client.client_id,
            "client_id_issued_at": int(client.created_at.timestamp()),
            "client_name": client.client_name,
            "redirect_uris": list(client.redirect_uris or []),
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
            "scope": scope_string(MCP_SCOPES),
        },
        headers=NO_STORE_HEADERS,
    )


async def _authorize_request(
    request: Request,
    db: Session,
    values: Mapping[str, object],
) -> Response:
    params = _oauth_authorization_params(values)
    expected_resource = _mcp_resource_uri(request)
    try:
        client, scopes, resource = validate_authorization_request(
            db,
            response_type=params.get("response_type"),
            client_id=params.get("client_id"),
            redirect_uri=params.get("redirect_uri"),
            scope=params.get("scope"),
            code_challenge=params.get("code_challenge"),
            code_challenge_method=params.get("code_challenge_method"),
            resource=params.get("resource"),
            expected_resource=expected_resource,
        )
    except OAuthRequestError as exc:
        # Redirect errors only after the client and exact redirect URI have been validated.
        redirect_uri = params.get("redirect_uri")
        client_id = params.get("client_id")
        if redirect_uri and client_id:
            try:
                known_client = get_oauth_client(db, client_id)
                if redirect_uri in set(known_client.redirect_uris or []):
                    redirect_params = {"error": exc.code, "error_description": exc.description}
                    if params.get("state"):
                        redirect_params["state"] = params["state"]
                    return _redirect_with_params(redirect_uri, redirect_params)
            except OAuthRequestError:
                pass
        return _oauth_error_response(exc)

    params["resource"] = resource
    if request.method == "GET":
        return HTMLResponse(
            authorization_form(
                action="/oauth/authorize",
                params=params,
                client_name=client.client_name,
                scopes=scopes,
            )
        )

    form = await request.form()
    decision = str(form.get("decision", ""))
    if decision != "allow":
        redirect_params = {"error": "access_denied", "error_description": "Der Zugriff wurde abgelehnt."}
        if params.get("state"):
            redirect_params["state"] = params["state"]
        return _redirect_with_params(params["redirect_uri"], redirect_params)
    user = user_from_password(
        db, str(form.get("email", "")), str(form.get("password", "")), str(form.get("totp_code", ""))
    )
    if user is None:
        return HTMLResponse(
            authorization_form(
                action="/oauth/authorize",
                params=params,
                client_name=client.client_name,
                scopes=scopes,
                error="E-Mail-Adresse oder Passwort ist falsch.",
            ),
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
    code = create_authorization_code(
        db,
        client=client,
        user=user,
        redirect_uri=params["redirect_uri"],
        code_challenge=params["code_challenge"],
        scopes=scopes,
        resource=resource,
    )
    redirect_params = {"code": code}
    if params.get("state"):
        redirect_params["state"] = params["state"]
    return _redirect_with_params(params["redirect_uri"], redirect_params)


@router.get("/oauth/authorize", include_in_schema=False)
async def oauth_authorize_get(request: Request, db: Session = Depends(get_db)) -> Response:
    return await _authorize_request(request, db, request.query_params)


@router.post("/oauth/authorize", include_in_schema=False)
async def oauth_authorize_post(request: Request, db: Session = Depends(get_db)) -> Response:
    form = await request.form()
    return await _authorize_request(request, db, form)


@router.post("/oauth/authorize/passkey/options", include_in_schema=False)
async def oauth_passkey_options(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    body = await request.json()
    user = db.scalar(select(User).where(User.email == str(body.get("email", "")).strip().lower()))
    if user is None:
        raise HTTPException(status_code=404, detail="Nutzerkonto nicht gefunden.")
    return JSONResponse(authentication_options(request, user), headers=NO_STORE_HEADERS)


@router.post("/oauth/authorize/passkey", include_in_schema=False)
async def oauth_passkey_authorize(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    body = await request.json()
    values = {key: str(body[key]) for key in ("response_type", "client_id", "redirect_uri", "scope", "code_challenge", "code_challenge_method", "resource") if body.get(key) is not None}
    client, scopes, resource = validate_authorization_request(
        db, response_type=values.get("response_type"), client_id=values.get("client_id"),
        redirect_uri=values.get("redirect_uri"), scope=values.get("scope"), code_challenge=values.get("code_challenge"),
        code_challenge_method=values.get("code_challenge_method"), resource=values.get("resource"), expected_resource=_mcp_resource_uri(request),
    )
    user = authenticate_credential(request, body["credential"], str(body["challenge_token"]), db)
    code = create_authorization_code(db, client=client, user=user, redirect_uri=values["redirect_uri"], code_challenge=values["code_challenge"], scopes=scopes, resource=resource)
    params = {"code": code}
    if body.get("state"):
        params["state"] = str(body["state"])
    return JSONResponse({"redirect_uri": _redirect_with_params(values["redirect_uri"], params).headers["location"]}, headers=NO_STORE_HEADERS)


@router.post("/oauth/token", include_in_schema=False)
async def oauth_token(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/x-www-form-urlencoded":
        return _oauth_error_response(OAuthRequestError("invalid_request", "Formulardaten erforderlich."))
    form = await request.form()
    values = {key: str(value) for key, value in form.items()}
    client_id = values.get("client_id")
    if not client_id:
        return _oauth_error_response(OAuthRequestError("invalid_client", "client_id ist erforderlich.", status_code=401))
    try:
        resource = values.get("resource")
        expected_resource = _mcp_resource_uri(request)
        if values.get("grant_type") == "authorization_code":
            result = exchange_authorization_code(
                db,
                client_id=client_id,
                code_value=values.get("code", ""),
                redirect_uri=values.get("redirect_uri", ""),
                code_verifier=values.get("code_verifier", ""),
                resource=resource,
                expected_resource=expected_resource,
            )
        elif values.get("grant_type") == "refresh_token":
            result = refresh_oauth_token(
                db,
                client_id=client_id,
                refresh_value=values.get("refresh_token", ""),
                scope=values.get("scope"),
                resource=resource,
                expected_resource=expected_resource,
            )
        else:
            raise OAuthRequestError("unsupported_grant_type", "Dieser Grant-Typ wird nicht unterstützt.")
    except OAuthRequestError as exc:
        return _oauth_error_response(exc)
    return JSONResponse(result, headers=NO_STORE_HEADERS)


def _client_response(client: McpClient) -> McpClientResponse:
    return McpClientResponse(
        client_id=client.client_id,
        owner_user_id=client.owner_user_id,
        name=client.name,
        scopes=[scope for scope in MCP_SCOPES if scope in set(client.scopes or [])],
        is_active=client.is_active,
        revoked_at=client.revoked_at,
        last_used_at=client.last_used_at,
        created_at=client.created_at,
        updated_at=client.updated_at,
    )


def _managed_client(db: Session, client_id: str, *, for_update: bool = False) -> McpClient:
    statement = select(McpClient).where(McpClient.client_id == client_id)
    if for_update:
        statement = statement.with_for_update()
    client = db.scalar(statement)
    if client is None:
        raise HTTPException(status_code=404, detail="MCP-Client nicht gefunden.")
    return client


async def _read_limited_body(request: Request, maximum_bytes: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            announced = int(content_length)
        except ValueError:
            raise _InvalidBody from None
        if announced < 0:
            raise _InvalidBody
        if announced > maximum_bytes:
            raise _PayloadTooLarge
    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > maximum_bytes:
            raise _PayloadTooLarge
        data.extend(chunk)
    return bytes(data)


def _reject_json_constant(_: str) -> None:
    raise ValueError("Non-finite JSON number")


def _decode_json_object(data: bytes) -> dict[str, Any]:
    try:
        decoded = json.loads(data.decode("utf-8"), parse_constant=_reject_json_constant)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
        raise _InvalidBody from None
    if not isinstance(decoded, dict):
        raise _InvalidBody
    return decoded


@router.post(
    "/api/v1/mcp/clients",
    response_model=McpClientCreated,
    status_code=status.HTTP_201_CREATED,
    tags=["MCP-Verwaltung"],
)
def create_mcp_client(
    payload: McpClientCreate,
    response: Response,
    admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> McpClientCreated:
    if db.get(User, payload.owner_user_id) is None:
        raise HTTPException(status_code=404, detail="Besitzerkonto nicht gefunden.")
    client_secret = generate_client_secret()
    client = McpClient(
        client_id=generate_client_id(),
        owner_user_id=payload.owner_user_id,
        created_by_user_id=admin.id,
        name=payload.name,
        secret_hash=hash_client_secret(client_secret),
        scopes=payload.scopes,
    )
    db.add(client)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="MCP-Client konnte nicht angelegt werden.") from None
    db.refresh(client)
    response.headers.update(NO_STORE_HEADERS)
    view = _client_response(client)
    return McpClientCreated(**view.model_dump(), client_secret=client_secret)


@router.get(
    "/api/v1/mcp/clients",
    response_model=list[McpClientResponse],
    tags=["MCP-Verwaltung"],
)
def list_mcp_clients(
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    _admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> list[McpClientResponse]:
    clients = db.scalars(
        select(McpClient).order_by(McpClient.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return [_client_response(client) for client in clients]


@router.patch(
    "/api/v1/mcp/clients/{client_id}",
    response_model=McpClientResponse,
    tags=["MCP-Verwaltung"],
)
def update_mcp_client(
    client_id: ClientIdentifier,
    payload: McpClientUpdate,
    _admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> McpClientResponse:
    client = _managed_client(db, client_id, for_update=True)
    if payload.is_active is True and client.revoked_at is not None:
        raise HTTPException(status_code=409, detail="Ein widerrufener MCP-Client kann nicht reaktiviert werden.")
    changed_scopes = payload.scopes is not None and payload.scopes != list(client.scopes or [])
    if payload.name is not None:
        client.name = payload.name
    if payload.scopes is not None:
        client.scopes = payload.scopes
    if payload.is_active is not None and payload.is_active != client.is_active:
        client.is_active = payload.is_active
        if not payload.is_active:
            revoke_client_tokens(db, client.id)
    if changed_scopes:
        revoke_client_tokens(db, client.id)
    db.commit()
    db.refresh(client)
    return _client_response(client)


@router.post(
    "/api/v1/mcp/clients/{client_id}/rotate-secret",
    response_model=McpSecretRotated,
    tags=["MCP-Verwaltung"],
)
def rotate_mcp_client_secret(
    client_id: ClientIdentifier,
    response: Response,
    _admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> McpSecretRotated:
    client = _managed_client(db, client_id, for_update=True)
    if client.revoked_at is not None:
        raise HTTPException(status_code=409, detail="Der MCP-Client ist bereits widerrufen.")
    secret = generate_client_secret()
    client.secret_hash = hash_client_secret(secret)
    revoke_client_tokens(db, client.id)
    db.commit()
    response.headers.update(NO_STORE_HEADERS)
    return McpSecretRotated(client_id=client.client_id, client_secret=secret)


@router.post(
    "/api/v1/mcp/clients/{client_id}/revoke",
    response_model=McpClientResponse,
    tags=["MCP-Verwaltung"],
)
def revoke_mcp_client(
    client_id: ClientIdentifier,
    _admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> McpClientResponse:
    client = _managed_client(db, client_id, for_update=True)
    if client.revoked_at is None:
        client.revoked_at = utcnow()
        client.is_active = False
        revoke_client_tokens(db, client.id, when=client.revoked_at)
        db.commit()
        db.refresh(client)
    return _client_response(client)


@router.post(
    "/api/v1/mcp/clients/{client_id}/tokens/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["MCP-Verwaltung"],
)
def revoke_mcp_client_tokens(
    client_id: ClientIdentifier,
    _admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> Response:
    client = _managed_client(db, client_id, for_update=True)
    revoke_client_tokens(db, client.id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/api/v1/mcp/audit",
    response_model=list[McpAuditResponse],
    tags=["MCP-Verwaltung"],
)
def list_mcp_audit(
    client_id: str | None = Query(default=None, min_length=12, max_length=80),
    outcome: str | None = Query(default=None, pattern=r"^(success|accepted|rejected|failed)$"),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0, le=100_000),
    _admin: User = Depends(_require_admin),
    db: Session = Depends(get_db),
) -> list[McpAuditResponse]:
    statement = (
        select(McpAuditLog, McpClient.client_id)
        .outerjoin(McpClient, McpClient.id == McpAuditLog.client_pk)
        .order_by(McpAuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if client_id:
        statement = statement.where(McpClient.client_id == client_id)
    if outcome:
        statement = statement.where(McpAuditLog.outcome == outcome)
    rows = db.execute(statement).all()
    return [
        McpAuditResponse(
            client_id=public_client_id,
            method=entry.method,
            tool_name=entry.tool_name,
            outcome=entry.outcome,
            error_type=entry.error_type,
            jsonrpc_error_code=entry.jsonrpc_error_code,
            http_status=entry.http_status,
            duration_ms=entry.duration_ms,
            created_at=entry.created_at,
        )
        for entry, public_client_id in rows
    ]


@router.post("/api/v1/mcp/token", response_model=McpAccessTokenResponse, tags=["MCP-Token"])
async def create_mcp_access_token(request: Request, db: Session = Depends(get_db)) -> JSONResponse:
    if not mcp_origin_allowed(request.headers.get("origin")):
        return JSONResponse(
            status_code=403,
            content={"detail": "Anfrage nicht zulässig."},
            headers=NO_STORE_HEADERS,
        )
    if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        return JSONResponse(
            status_code=415,
            content={"detail": "JSON-Anfrage erforderlich."},
            headers=NO_STORE_HEADERS,
        )
    try:
        data = _decode_json_object(await _read_limited_body(request, MAX_TOKEN_BODY_BYTES))
        payload = McpAccessTokenRequest.model_validate(data)
    except _PayloadTooLarge:
        return JSONResponse(
            status_code=413,
            content={"detail": "Anfrage zu groß."},
            headers=NO_STORE_HEADERS,
        )
    except (_InvalidBody, ValidationError):
        return JSONResponse(
            status_code=400,
            content={"detail": "Ungültige Client-Anmeldedaten."},
            headers=NO_STORE_HEADERS,
        )
    try:
        access_token, expires_in, scopes = issue_mcp_access_token(
            db,
            payload.client_id,
            payload.client_secret,
            payload.scopes,
        )
    except McpCredentialError:
        return JSONResponse(
            status_code=401,
            content={"detail": "Ungültige Client-Anmeldedaten."},
            headers={**NO_STORE_HEADERS, "WWW-Authenticate": "Bearer"},
        )
    content = McpAccessTokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        scopes=scopes,
    ).model_dump()
    return JSONResponse(status_code=200, content=content, headers=NO_STORE_HEADERS)


def _rpc_error(request_id: object, code: int, message: str, *, http_status: int = 200) -> JSONResponse:
    return JSONResponse(
        status_code=http_status,
        content={
            "jsonrpc": "2.0",
            "id": request_id if isinstance(request_id, (str, int)) and not isinstance(request_id, bool) else None,
            "error": {"code": code, "message": message},
        },
        headers=RPC_HEADERS,
    )


def _rpc_result(request_id: str | int, result: dict[str, Any]) -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={"jsonrpc": "2.0", "id": request_id, "result": result},
        headers=RPC_HEADERS,
    )


def _duration_ms(started: float) -> int:
    return max(0, round((perf_counter() - started) * 1_000))


def _write_rpc_audit(
    db: Session,
    *,
    started: float,
    principal: McpPrincipal | None,
    request_id: object,
    method: object,
    tool_name: object,
    outcome: str,
    error_type: str | None,
    jsonrpc_error_code: int | None,
    http_status: int,
) -> None:
    audit_mcp_request(
        db,
        principal=principal,
        request_id=request_id,
        method=method,
        tool_name=tool_name,
        outcome=outcome,
        error_type=error_type,
        jsonrpc_error_code=jsonrpc_error_code,
        http_status=http_status,
        duration_ms=_duration_ms(started),
    )


def _identify_rpc_client(
    request: Request, db: Session
) -> tuple[McpPrincipal | None, McpAuthenticationError | None]:
    try:
        return (
            authenticate_mcp_bearer(
                db,
                request.headers.get("authorization"),
                expected_resource=_mcp_resource_uri(request),
            ),
            None,
        )
    except McpAuthenticationError as exc:
        return None, exc


def _transport_rejection(
    request: Request,
    db: Session,
    *,
    method: str,
) -> Response:
    started = perf_counter()
    principal, auth_error = _identify_rpc_client(request, db)
    audit_principal = principal or (auth_error.principal if auth_error else None)
    if not mcp_origin_allowed(request.headers.get("origin")):
        _write_rpc_audit(
            db,
            started=started,
            principal=audit_principal,
            request_id=None,
            method=method,
            tool_name=None,
            outcome="rejected",
            error_type="invalid_origin",
            jsonrpc_error_code=None,
            http_status=403,
        )
        return Response(status_code=403, headers=NO_STORE_HEADERS)
    if auth_error:
        _write_rpc_audit(
            db,
            started=started,
            principal=audit_principal,
            request_id=None,
            method=method,
            tool_name=None,
            outcome="rejected",
            error_type=auth_error.reason,
            jsonrpc_error_code=None,
            http_status=401,
        )
        return Response(
            status_code=401,
            headers={
                **NO_STORE_HEADERS,
                "WWW-Authenticate": oauth_www_authenticate(_request_origin(request)),
            },
        )
    _write_rpc_audit(
        db,
        started=started,
        principal=principal,
        request_id=None,
        method=method,
        tool_name=None,
        outcome="rejected",
        error_type="invalid_transport",
        jsonrpc_error_code=None,
        http_status=405,
    )
    return Response(status_code=405, headers={**NO_STORE_HEADERS, "Allow": "POST"})


@router.get(RPC_PATH, include_in_schema=False)
def mcp_stream_not_supported(request: Request, db: Session = Depends(get_db)) -> Response:
    return _transport_rejection(request, db, method="http/get")


@router.delete(RPC_PATH, include_in_schema=False)
def mcp_session_delete_not_supported(request: Request, db: Session = Depends(get_db)) -> Response:
    return _transport_rejection(request, db, method="http/delete")


@router.post(RPC_PATH, include_in_schema=False)
async def mcp_rpc(request: Request, db: Session = Depends(get_db)) -> Response:
    started = perf_counter()
    request_id: object = None
    method: object = None
    tool_name: object = None
    try:
        principal, auth_error = _identify_rpc_client(request, db)
    except SQLAlchemyError:
        db.rollback()
        return _rpc_error(None, -32603, "MCP vorübergehend nicht verfügbar.", http_status=503)
    audit_principal = principal or (auth_error.principal if auth_error else None)

    if not mcp_origin_allowed(request.headers.get("origin")):
        _write_rpc_audit(
            db,
            started=started,
            principal=audit_principal,
            request_id=None,
            method=None,
            tool_name=None,
            outcome="rejected",
            error_type="invalid_origin",
            jsonrpc_error_code=None,
            http_status=403,
        )
        return _rpc_error(None, -32001, "Anfrage nicht zulässig.", http_status=403)
    if auth_error:
        _write_rpc_audit(
            db,
            started=started,
            principal=audit_principal,
            request_id=None,
            method=None,
            tool_name=None,
            outcome="rejected",
            error_type=auth_error.reason,
            jsonrpc_error_code=None,
            http_status=401,
        )
        return JSONResponse(
            status_code=401,
            content={
                "jsonrpc": "2.0",
                "id": None,
                "error": {"code": -32001, "message": "Authentifizierung erforderlich."},
            },
            headers={
                **RPC_HEADERS,
                "WWW-Authenticate": oauth_www_authenticate(_request_origin(request)),
            },
        )

    media_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    accept = request.headers.get("accept", "*/*").lower()
    protocol_header = request.headers.get("mcp-protocol-version")
    if media_type != "application/json" or (
        "*/*" not in accept and not ("application/json" in accept and "text/event-stream" in accept)
    ):
        _write_rpc_audit(
            db,
            started=started,
            principal=principal,
            request_id=None,
            method=None,
            tool_name=None,
            outcome="rejected",
            error_type="invalid_transport",
            jsonrpc_error_code=None,
            http_status=415 if media_type != "application/json" else 406,
        )
        return _rpc_error(
            None,
            -32600,
            "Ungültiger HTTP-Transport.",
            http_status=415 if media_type != "application/json" else 406,
        )
    if protocol_header is not None and protocol_header not in SUPPORTED_PROTOCOL_VERSIONS:
        _write_rpc_audit(
            db,
            started=started,
            principal=principal,
            request_id=None,
            method=None,
            tool_name=None,
            outcome="rejected",
            error_type="unsupported_version",
            jsonrpc_error_code=None,
            http_status=400,
        )
        return _rpc_error(None, -32600, "Nicht unterstützte MCP-Protokollversion.", http_status=400)

    try:
        message = _decode_json_object(await _read_limited_body(request, MAX_MCP_BODY_BYTES))
    except _PayloadTooLarge:
        _write_rpc_audit(
            db,
            started=started,
            principal=principal,
            request_id=None,
            method=None,
            tool_name=None,
            outcome="rejected",
            error_type="payload_too_large",
            jsonrpc_error_code=None,
            http_status=413,
        )
        return _rpc_error(None, -32600, "MCP-Anfrage zu groß.", http_status=413)
    except _InvalidBody:
        _write_rpc_audit(
            db,
            started=started,
            principal=principal,
            request_id=None,
            method=None,
            tool_name=None,
            outcome="rejected",
            error_type="invalid_request",
            jsonrpc_error_code=-32700,
            http_status=400,
        )
        return _rpc_error(None, -32700, "Ungültiges JSON.", http_status=400)

    request_id = message.get("id")
    method = message.get("method")
    has_id = "id" in message
    valid_id = isinstance(request_id, (str, int)) and not isinstance(request_id, bool)
    params = message.get("params", {})
    if (
        message.get("jsonrpc") != "2.0"
        or not isinstance(method, str)
        or len(method) > 80
        or (has_id and not valid_id)
        or not isinstance(params, dict)
    ):
        _write_rpc_audit(
            db,
            started=started,
            principal=principal,
            request_id=request_id,
            method=method,
            tool_name=None,
            outcome="rejected",
            error_type="invalid_request",
            jsonrpc_error_code=-32600,
            http_status=400,
        )
        return _rpc_error(None, -32600, "Ungültige JSON-RPC-Anfrage.", http_status=400)

    if not has_id:
        accepted = method in {"notifications/initialized", "notifications/cancelled"}
        _write_rpc_audit(
            db,
            started=started,
            principal=principal,
            request_id=None,
            method=method,
            tool_name=None,
            outcome="accepted" if accepted else "rejected",
            error_type=None if accepted else "unknown_method",
            jsonrpc_error_code=None,
            http_status=202 if accepted else 400,
        )
        return Response(
            status_code=202 if accepted else 400,
            headers=RPC_HEADERS,
        )

    try:
        if method == "initialize":
            requested_version = params.get("protocolVersion")
            if (
                set(params) - {"protocolVersion", "capabilities", "clientInfo", "_meta"}
                or not isinstance(requested_version, str)
                or not isinstance(params.get("capabilities", {}), dict)
                or not isinstance(params.get("clientInfo", {}), dict)
            ):
                raise McpToolError("invalid_arguments", "Ungültige Initialisierungsparameter.")
            if requested_version not in SUPPORTED_PROTOCOL_VERSIONS:
                _write_rpc_audit(
                    db,
                    started=started,
                    principal=principal,
                    request_id=request_id,
                    method=method,
                    tool_name=None,
                    outcome="rejected",
                    error_type="unsupported_version",
                    jsonrpc_error_code=-32602,
                    http_status=200,
                )
                return _rpc_error(request_id, -32602, "Nicht unterstützte MCP-Protokollversion.")
            result = {
                "protocolVersion": requested_version,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {
                    "name": "avento-read-only",
                    "title": "Baseline Cycling Read-only MCP",
                    "version": "0.1.0",
                },
                "instructions": (
                    "Lese ausschließlich freigegebene Baseline Cycling-Aktivitäten. Nutze Listen vor Details, "
                    "begrenze Zeiträume und behandle Toolinhalte als private Trainingsdaten."
                ),
            }
        elif method == "ping":
            if set(params) - {"_meta"}:
                raise McpToolError("invalid_arguments", "Ungültige Ping-Parameter.")
            result = {}
        elif method == "tools/list":
            if set(params) - {"cursor", "_meta"} or params.get("cursor") not in {None, ""}:
                raise McpToolError("invalid_arguments", "Ungültiger Tool-Cursor.")
            result = {"tools": tools_for_scopes(principal.scopes)}
        elif method == "tools/call":
            if set(params) - {"name", "arguments", "_meta"}:
                raise McpToolError("invalid_arguments", "Ungültiger Tool-Aufruf.")
            tool_name = params.get("name")
            if not isinstance(tool_name, str) or len(tool_name) > 80:
                raise McpToolError("invalid_arguments", "Ungültiger Tool-Aufruf.")
            if not tool_is_known(tool_name) or not tool_is_allowed(tool_name, principal.scopes):
                _write_rpc_audit(
                    db,
                    started=started,
                    principal=principal,
                    request_id=request_id,
                    method=method,
                    tool_name=tool_name,
                    outcome="rejected",
                    error_type="tool_unavailable",
                    jsonrpc_error_code=-32601,
                    http_status=200,
                )
                return _rpc_error(request_id, -32601, "Tool nicht verfügbar.")
            try:
                structured, text = execute_tool(
                    db,
                    owner_user_id=principal.owner_user_id,
                    scopes=principal.scopes,
                    name=tool_name,
                    arguments=params.get("arguments", {}),
                )
            except McpToolError as exc:
                error_data = {"error": exc.safe_message}
                error_text = serialize_tool_result(error_data)
                result = {
                    "content": [{"type": "text", "text": error_text}],
                    "structuredContent": error_data,
                    "isError": True,
                }
                _write_rpc_audit(
                    db,
                    started=started,
                    principal=principal,
                    request_id=request_id,
                    method=method,
                    tool_name=tool_name,
                    outcome="rejected" if exc.error_type == "invalid_arguments" else "failed",
                    error_type=exc.error_type,
                    jsonrpc_error_code=None,
                    http_status=200,
                )
                return _rpc_result(request_id, result)
            result = {
                "content": [{"type": "text", "text": text}],
                "structuredContent": structured,
                "isError": False,
            }
        else:
            _write_rpc_audit(
                db,
                started=started,
                principal=principal,
                request_id=request_id,
                method=method,
                tool_name=None,
                outcome="rejected",
                error_type="unknown_method",
                jsonrpc_error_code=-32601,
                http_status=200,
            )
            return _rpc_error(request_id, -32601, "Methode nicht gefunden.")
    except McpToolError as exc:
        _write_rpc_audit(
            db,
            started=started,
            principal=principal,
            request_id=request_id,
            method=method,
            tool_name=tool_name,
            outcome="rejected",
            error_type=exc.error_type,
            jsonrpc_error_code=-32602,
            http_status=200,
        )
        return _rpc_error(request_id, -32602, exc.safe_message)
    except Exception:
        db.rollback()
        _write_rpc_audit(
            db,
            started=started,
            principal=principal,
            request_id=request_id,
            method=method,
            tool_name=tool_name,
            outcome="failed",
            error_type="internal_error",
            jsonrpc_error_code=-32603,
            http_status=200,
        )
        return _rpc_error(request_id, -32603, "Interner MCP-Fehler.")

    _write_rpc_audit(
        db,
        started=started,
        principal=principal,
        request_id=request_id,
        method=method,
        tool_name=tool_name,
        outcome="success",
        error_type=None,
        jsonrpc_error_code=None,
        http_status=200,
    )
    return _rpc_result(request_id, result)
