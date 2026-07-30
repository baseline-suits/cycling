from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from . import mcp_models, models  # noqa: F401 - registers SQLAlchemy metadata
from .config import get_settings
from .database import Base, SessionLocal, engine
from .routers import activities, activity_photos, auth, chat, gamification, insights, mcp, profile


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment.lower() == "production" and settings.secret_key.startswith("development-only"):
        raise RuntimeError("AVENTO_SECRET_KEY muss in Produktion gesetzt werden.")
    if settings.environment.lower() == "production" and not settings.bootstrap_invite_code:
        raise RuntimeError("AVENTO_BOOTSTRAP_INVITE_CODE muss in Produktion gesetzt werden.")
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Zentrale API für die Baseline Cycling-Radfahranalyse.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(activities.router, prefix="/api/v1")
app.include_router(activity_photos.router, prefix="/api/v1")
app.include_router(insights.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(gamification.router, prefix="/api/v1")
app.include_router(mcp.router)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": settings.app_name, "version": "0.1.0", "docs": "/docs"}


@app.get("/health")
@app.get("/api/v1/health", include_in_schema=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ready")
def readiness() -> dict[str, str]:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Die Datenbank ist nicht erreichbar.") from exc
    return {"status": "ready"}
