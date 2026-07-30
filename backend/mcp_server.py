from __future__ import annotations

import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from app import mcp_models, models  # noqa: F401 - registers complete SQLAlchemy metadata
from app.config import get_settings
from app.database import Base, engine
from app.routers.mcp import RPC_PATH, router


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment.lower() == "production" and settings.secret_key.startswith("development-only"):
        raise RuntimeError("AVENTO_SECRET_KEY muss in Produktion gesetzt werden.")
    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Baseline Cycling Read-only MCP",
    version="0.1.0",
    description=f"Lokaler, authentifizierter MCP-Endpunkt unter {RPC_PATH}.",
    lifespan=lifespan,
)
app.include_router(router)


def _port() -> int:
    try:
        return max(1_024, min(int(os.getenv("AVENTO_MCP_PORT", "8765")), 65_535))
    except ValueError:
        return 8_765


def main() -> None:
    # Die feste Loopback-Bindung ist Teil des Schutzes gegen entfernten Netzwerkzugriff.
    uvicorn.run(app, host="127.0.0.1", port=_port(), log_level="info")


if __name__ == "__main__":
    main()
