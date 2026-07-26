from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def uuid4_str() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    totp_secret_encrypted: Mapped[str | None] = mapped_column(String(512), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    display_name: Mapped[str] = mapped_column(String(120))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    hr_max: Mapped[int] = mapped_column(Integer, default=190)
    hr_rest: Mapped[int] = mapped_column(Integer, default=60)
    hr_zones: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    training_goals: Mapped[list[str]] = mapped_column(JSON, default=list)
    ui_mode: Mapped[str] = mapped_column(String(20), default="classic")
    avatar_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    avatar_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    passkeys: Mapped[list["PasskeyCredential"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    activities: Mapped[list["Activity"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    activity_photos: Mapped[list["ActivityPhoto"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    gamification_badges: Mapped[list["GamificationBadgeUnlock"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    gamification_goals: Mapped[list["GamificationGoal"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    gamification_challenges: Mapped[list["GamificationChallenge"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    gamification_discoveries: Mapped[list["GamificationDiscovery"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    gamification_yearly_awards: Mapped[list["GamificationYearlyAward"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PasskeyCredential(Base):
    __tablename__ = "passkey_credentials"
    __table_args__ = (UniqueConstraint("credential_id", name="uq_passkey_credential_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    credential_id: Mapped[str] = mapped_column(String(512), nullable=False)
    public_key: Mapped[bytes] = mapped_column(nullable=False)
    sign_count: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(120), default="Passkey")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="passkeys")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Activity(Base):
    __tablename__ = "activities"
    __table_args__ = (
        UniqueConstraint("user_id", "file_hash", name="uq_activity_user_hash"),
        CheckConstraint(
            "geography_status IN ('pending', 'available', 'unavailable', 'error')",
            name="ck_activity_geography_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    original_file_path: Mapped[str] = mapped_column(String(1024))
    title: Mapped[str] = mapped_column(String(200))
    activity_type: Mapped[str] = mapped_column(String(50), default="cycling")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    hydration_ml: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    distance_m: Mapped[float] = mapped_column(Float, default=0)
    duration_s: Mapped[float] = mapped_column(Float, default=0)
    moving_time_s: Mapped[float] = mapped_column(Float, default=0)
    pause_time_s: Mapped[float] = mapped_column(Float, default=0)
    avg_speed_mps: Mapped[float] = mapped_column(Float, default=0)
    max_speed_mps: Mapped[float] = mapped_column(Float, default=0)
    elevation_gain_m: Mapped[float] = mapped_column(Float, default=0)
    avg_hr_bpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_hr_bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_cadence_rpm: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_cadence_rpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_power_w: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_power_w: Mapped[int | None] = mapped_column(Integer, nullable=True)
    training_load: Mapped[float] = mapped_column(Float, default=0)
    hr_zone_seconds: Mapped[dict[str, float]] = mapped_column(JSON, default=dict)
    track_points: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)

    weather: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    weather_status: Mapped[str] = mapped_column(String(30), default="pending")
    weather_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    geography_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    geography_status: Mapped[str] = mapped_column(String(30), default="pending")
    geography_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    ai_data_basis: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    ai_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    data_quality_flags: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    metric_provenance: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    include_in_statistics: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="activities")
    photos: Mapped[list["ActivityPhoto"]] = relationship(
        back_populates="activity",
        cascade="all, delete-orphan",
    )


class ImportJob(Base):
    """Durable per-file state shared by web and mobile imports."""
    __tablename__ = "import_jobs"
    __table_args__ = (UniqueConstraint("user_id", "file_hash", name="uq_import_job_user_hash"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(1024))
    status: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    steps: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    warnings: Mapped[list[str]] = mapped_column(JSON, default=list)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    activity_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class SavedSegment(Base):
    __tablename__ = "saved_segments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    activity_id: Mapped[str] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    start_m: Mapped[float] = mapped_column(Float)
    end_m: Mapped[float] = mapped_column(Float)
    route_signature: Mapped[list[str]] = mapped_column(JSON, default=list)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ActivityPhoto(Base):
    __tablename__ = "activity_photos"
    __table_args__ = (
        UniqueConstraint("activity_id", "file_hash", name="uq_activity_photo_hash"),
        CheckConstraint("size_bytes > 0", name="ck_activity_photo_size_positive"),
        CheckConstraint("width > 0 AND height > 0", name="ck_activity_photo_dimensions_positive"),
        CheckConstraint("latitude IS NULL OR (latitude >= -90 AND latitude <= 90)", name="ck_activity_photo_latitude"),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="ck_activity_photo_longitude",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    activity_id: Mapped[str] = mapped_column(
        ForeignKey("activities.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # The original is immutable and is never replaced by an optimized variant.
    original_storage_path: Mapped[str] = mapped_column(String(1024), unique=True)
    original_content_type: Mapped[str] = mapped_column(String(100))
    original_size_bytes: Mapped[int] = mapped_column(Integer)
    storage_path: Mapped[str | None] = mapped_column(String(1024), unique=True, nullable=True)
    poster_storage_path: Mapped[str | None] = mapped_column(String(1024), unique=True, nullable=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(20), default="image", index=True)
    content_type: Mapped[str] = mapped_column(String(100))
    file_hash: Mapped[str] = mapped_column(String(64), index=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    duration_s: Mapped[float | None] = mapped_column(Float, nullable=True)
    container_format: Mapped[str | None] = mapped_column(String(100), nullable=True)
    video_codec: Mapped[str | None] = mapped_column(String(100), nullable=True)
    audio_codec: Mapped[str | None] = mapped_column(String(100), nullable=True)
    orientation_degrees: Mapped[int | None] = mapped_column(Integer, nullable=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    caption: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    processing_status: Mapped[str] = mapped_column(String(20), default="pending")
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    activity: Mapped[Activity] = relationship(back_populates="photos")
    user: Mapped[User] = relationship(back_populates="activity_photos")


class GamificationBadgeUnlock(Base):
    __tablename__ = "gamification_badge_unlocks"
    __table_args__ = (
        UniqueConstraint("user_id", "badge_key", name="uq_gam_badge_user_key"),
        CheckConstraint("reward_xp >= 0 AND reward_xp <= 100000", name="ck_gam_badge_reward_xp"),
        Index("ix_gam_badge_user_unlocked", "user_id", "unlocked_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    badge_key: Mapped[str] = mapped_column(String(80))
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source_activity_id: Mapped[str | None] = mapped_column(
        ForeignKey("activities.id", ondelete="SET NULL"),
        nullable=True,
    )
    reward_xp: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="gamification_badges")


class GamificationGoal(Base):
    __tablename__ = "gamification_goals"
    __table_args__ = (
        CheckConstraint(
            "metric IN ('distance_m', 'activity_count', 'elevation_gain_m', 'moving_time_s', "
            "'training_load', 'active_weeks', 'places_visited', 'hydration_activity_count', "
            "'hydration_ml', 'recovery_gap_count', 'intensity_variety', 'weather_activity_count', "
            "'village_count', 'city_count', "
            "'municipality_count', 'state_count', 'country_count', 'longest_ride_m', "
            "'highest_elevation_m', 'best_average_speed_mps')",
            name="ck_gam_goal_metric",
        ),
        CheckConstraint(
            "period IN ('week', 'month', 'year', 'custom', 'lifetime')",
            name="ck_gam_goal_period",
        ),
        CheckConstraint(
            "status IN ('active', 'paused', 'completed', 'expired')",
            name="ck_gam_goal_status",
        ),
        CheckConstraint("target_value > 0 AND target_value <= 1000000000000", name="ck_gam_goal_target"),
        CheckConstraint("reward_xp >= 0 AND reward_xp <= 100000", name="ck_gam_goal_reward_xp"),
        CheckConstraint("deadline IS NULL OR starts_on IS NULL OR deadline >= starts_on", name="ck_gam_goal_dates"),
        Index("ix_gam_goal_user_status", "user_id", "status"),
        Index("ix_gam_goal_user_deadline", "user_id", "deadline"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    metric: Mapped[str] = mapped_column(String(40))
    target_value: Mapped[float] = mapped_column(Float)
    period: Mapped[str] = mapped_column(String(20), default="custom")
    status: Mapped[str] = mapped_column(String(20), default="active")
    starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reward_xp: Mapped[int] = mapped_column(Integer, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="gamification_goals")


class GamificationChallenge(Base):
    __tablename__ = "gamification_challenges"
    __table_args__ = (
        UniqueConstraint("user_id", "template_key", name="uq_gam_challenge_user_template"),
        CheckConstraint(
            "metric IN ('distance_m', 'activity_count', 'elevation_gain_m', 'moving_time_s', "
            "'training_load', 'active_weeks', 'places_visited', 'hydration_activity_count', "
            "'hydration_ml', 'recovery_gap_count', 'intensity_variety', 'weather_activity_count', "
            "'village_count', 'city_count', "
            "'municipality_count', 'state_count', 'country_count', 'longest_ride_m', "
            "'highest_elevation_m', 'best_average_speed_mps')",
            name="ck_gam_challenge_metric",
        ),
        CheckConstraint(
            "status IN ('suggested', 'accepted', 'completed', 'declined', 'expired')",
            name="ck_gam_challenge_status",
        ),
        CheckConstraint("source IN ('local', 'ai', 'user')", name="ck_gam_challenge_source"),
        CheckConstraint("target_value > 0 AND target_value <= 1000000000000", name="ck_gam_challenge_target"),
        CheckConstraint("duration_days >= 1 AND duration_days <= 366", name="ck_gam_challenge_duration"),
        CheckConstraint("reward_xp >= 0 AND reward_xp <= 100000", name="ck_gam_challenge_reward_xp"),
        CheckConstraint("expires_on IS NULL OR starts_on IS NULL OR expires_on >= starts_on", name="ck_gam_challenge_dates"),
        Index("ix_gam_challenge_user_status", "user_id", "status"),
        Index("ix_gam_challenge_user_expiry", "user_id", "expires_on"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    template_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(1000), default="")
    metric: Mapped[str] = mapped_column(String(40))
    target_value: Mapped[float] = mapped_column(Float)
    duration_days: Mapped[int] = mapped_column(Integer, default=7)
    reward_xp: Mapped[int] = mapped_column(Integer, default=150)
    status: Mapped[str] = mapped_column(String(20), default="suggested")
    source: Mapped[str] = mapped_column(String(20), default="user")
    personalization_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    weather_sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    safety_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="gamification_challenges")


class GamificationDiscovery(Base):
    __tablename__ = "gamification_discoveries"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", "location_key", name="uq_gam_discovery_user_place"),
        CheckConstraint(
            "kind IN ('village', 'city', 'municipality', 'state', 'country')",
            name="ck_gam_discovery_kind",
        ),
        CheckConstraint("latitude IS NULL OR (latitude >= -90 AND latitude <= 90)", name="ck_gam_discovery_lat"),
        CheckConstraint("longitude IS NULL OR (longitude >= -180 AND longitude <= 180)", name="ck_gam_discovery_lon"),
        Index("ix_gam_discovery_user_kind", "user_id", "kind"),
        Index("ix_gam_discovery_user_first", "user_id", "first_discovered_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))
    location_key: Mapped[str] = mapped_column(String(96))
    name: Mapped[str] = mapped_column(String(200))
    region: Mapped[str | None] = mapped_column(String(200), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(3), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    first_discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    first_activity_id: Mapped[str | None] = mapped_column(
        ForeignKey("activities.id", ondelete="SET NULL"),
        nullable=True,
    )
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="gamification_discoveries")
    activity_links: Mapped[list["GamificationActivityDiscovery"]] = relationship(
        back_populates="discovery",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class GamificationActivityDiscovery(Base):
    __tablename__ = "gamification_activity_discoveries"
    __table_args__ = (
        UniqueConstraint("activity_id", "discovery_id", name="uq_gam_activity_discovery"),
        Index("ix_gam_actdisc_user_activity", "user_id", "activity_id"),
        Index("ix_gam_actdisc_user_discovery", "user_id", "discovery_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    activity_id: Mapped[str] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"), index=True)
    discovery_id: Mapped[str] = mapped_column(
        ForeignKey("gamification_discoveries.id", ondelete="CASCADE"),
        index=True,
    )
    discovered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    discovery: Mapped[GamificationDiscovery] = relationship(back_populates="activity_links")


class GamificationYearlyAward(Base):
    __tablename__ = "gamification_yearly_awards"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "award_key", name="uq_gam_award_user_year_key"),
        CheckConstraint("year >= 1900 AND year <= 9999", name="ck_gam_award_year"),
        CheckConstraint("value IS NULL OR value >= 0", name="ck_gam_award_value"),
        CheckConstraint("reward_xp >= 0 AND reward_xp <= 100000", name="ck_gam_award_reward_xp"),
        Index("ix_gam_award_user_year", "user_id", "year"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid4_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    award_key: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(1000))
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(30), nullable=True)
    tier: Mapped[str] = mapped_column(String(20), default="personal")
    icon: Mapped[str | None] = mapped_column(String(80), nullable=True)
    is_final: Mapped[bool] = mapped_column(Boolean, default=False)
    earned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reward_xp: Mapped[int] = mapped_column(Integer, default=0)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship(back_populates="gamification_yearly_awards")
