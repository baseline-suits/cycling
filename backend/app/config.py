from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="AVENTO_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Baseline Cycling API"
    environment: str = "development"
    database_url: str = "sqlite:///./avento.db"
    secret_key: str = Field(default="development-only-secret-change-me-please", min_length=32)
    bootstrap_invite_code: str | None = Field(
        default=None,
        validation_alias=AliasChoices("AVENTO_BOOTSTRAP_INVITE_CODE", "BOOTSTRAP_INVITE_CODE"),
    )
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    timezone: str = "Europe/Berlin"
    upload_dir: Path = Path("./data/uploads")
    max_upload_bytes: int = 20 * 1024 * 1024
    max_video_upload_bytes: int = Field(default=500 * 1024 * 1024, ge=1)
    max_video_duration_seconds: float = Field(default=15 * 60, gt=0)
    max_video_pixels: int = Field(default=3840 * 2160, ge=1)
    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"
    max_avatar_bytes: int = 10 * 1024 * 1024
    avatar_size_px: int = 512
    max_avatar_pixels: int = 20_000_000
    auto_create_schema: bool = True

    # Read-only MCP clients use short-lived opaque tokens. Browser origins are
    # checked only when a client sends an Origin header; native MCP clients
    # normally omit it.
    mcp_access_token_minutes: int = Field(default=10, ge=1, le=15)
    mcp_allowed_origins: str = "http://localhost,http://127.0.0.1,http://[::1]"
    public_url: str | None = None
    webauthn_rp_name: str = "Baseline Cycling"
    webauthn_rp_id: str | None = None
    mcp_resource_uri: str | None = None
    mcp_oauth_access_token_minutes: int = Field(default=15, ge=1, le=60)
    mcp_oauth_refresh_token_days: int = Field(default=30, ge=1, le=365)

    weather_provider: str = "open_meteo"
    weather_timeout_seconds: float = 8.0
    weather_route_samples: int = Field(default=7, ge=3, le=12)

    # Reverse geocoding is deliberately opt-in because route coordinates are
    # personal data. The endpoint can be switched without a client update.
    reverse_geocoding_provider: str = "disabled"
    reverse_geocoding_base_url: str | None = None
    locationiq_api_key: SecretStr | None = Field(default=None, repr=False)
    reverse_geocoding_timeout_seconds: float = Field(default=3.0, ge=0.1, le=10.0)
    reverse_geocoding_max_samples: int = Field(default=8, ge=0, le=12)
    reverse_geocoding_minimum_spacing_m: float = Field(default=1_500.0, ge=0, le=1_000_000)
    reverse_geocoding_coordinate_precision: int = Field(default=4, ge=3, le=6)
    reverse_geocoding_user_agent: str = "Baseline Cycling/0.1 (self-hosted route insights)"
    reverse_geocoding_language: str = "de"
    reverse_geocoding_maximum_failures: int = Field(default=2, ge=1, le=3)
    reverse_geocoding_backfill_mode: bool = False

    openai_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("AVENTO_OPENAI_API_KEY", "OPENAI_API_KEY", "AVENTO_AI_API_KEY"),
    )
    openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        validation_alias=AliasChoices("AVENTO_OPENAI_BASE_URL", "OPENAI_BASE_URL", "AVENTO_AI_BASE_URL"),
    )
    openai_model: str = Field(
        default="gpt-5.4-mini",
        validation_alias=AliasChoices("AVENTO_OPENAI_MODEL", "OPENAI_MODEL", "AVENTO_AI_MODEL"),
    )
    ai_timeout_seconds: float = 20.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
