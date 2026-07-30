from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class Message(BaseModel):
    detail: str


class AccountCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=256)
    display_name: str = Field(min_length=1, max_length=120)


class BootstrapRequest(AccountCreate):
    bootstrap_code: str | None = Field(default=None, min_length=1, max_length=512)


class RegisterRequest(AccountCreate):
    invite_token: str = Field(min_length=20, max_length=256)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    totp_code: str | None = Field(default=None, pattern=r"^\d{6}$")


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=512)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class LoginChallengeResponse(BaseModel):
    requires_2fa: bool = True
    challenge_token: str


class Login2FARequest(BaseModel):
    challenge_token: str = Field(min_length=20, max_length=2048)
    code: str = Field(pattern=r"^\d{6}$")


class TotpCodeRequest(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str


class PasskeyNameRequest(BaseModel):
    name: str = Field(default="Passkey", min_length=1, max_length=120)


class HeartRateZone(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    min_bpm: int = Field(ge=30, le=250)
    max_bpm: int = Field(ge=30, le=250)
    color: str = Field(default="#607D8B", pattern=r"^#[0-9A-Fa-f]{6}$")

    @field_validator("max_bpm")
    @classmethod
    def max_not_empty(cls, value: int) -> int:
        return value


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    display_name: str
    is_admin: bool
    hr_max: int
    hr_rest: int
    hr_zones: list[HeartRateZone]
    training_goals: list[str] = Field(default_factory=list)
    ui_mode: Literal["classic", "minimal"] = "classic"
    avatar_data_url: str | None = None


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    hr_max: int | None = Field(default=None, ge=80, le=250)
    hr_rest: int | None = Field(default=None, ge=30, le=150)
    hr_zones: list[HeartRateZone] | None = Field(default=None, min_length=1, max_length=10)
    training_goals: list[str] | None = Field(default=None, max_length=12)
    ui_mode: Literal["classic", "minimal"] | None = None

    @field_validator("training_goals")
    @classmethod
    def normalize_training_goals(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        normalized = list(dict.fromkeys(goal.strip() for goal in value if goal.strip()))
        if any(len(goal) > 80 for goal in normalized):
            raise ValueError("Ein Trainingsziel darf höchstens 80 Zeichen lang sein.")
        return normalized


class ProfilePasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=10, max_length=256)


class InvitationCreate(BaseModel):
    email: EmailStr | None = None
    expires_in_days: int = Field(default=7, ge=1, le=90)


class InvitationResponse(BaseModel):
    id: str
    token: str
    email: EmailStr | None
    expires_at: datetime


class PasswordResetCreate(BaseModel):
    email: EmailStr
    expires_in_minutes: int = Field(default=60, ge=5, le=1440)


class PasswordResetCreated(BaseModel):
    token: str
    email: EmailStr
    expires_at: datetime


class PasswordResetRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)
    new_password: str = Field(min_length=10, max_length=256)


class AIDataPeriod(BaseModel):
    started_at: datetime | None = None
    ended_at: datetime | None = None
    timezone: str | None = None
    label: str | None = None


class AIDataMetric(BaseModel):
    name: str
    value: Any
    unit: str | None = None
    activity_id: str | None = None
    source: str
    method: str


class AIDataMethod(BaseModel):
    name: str
    description: str
    parameters: dict[str, Any] = Field(default_factory=dict)


class AIDataBasis(BaseModel):
    schema_version: str = "1.0"
    generated_at: datetime
    period: AIDataPeriod | None = None
    activity_ids: list[str] = Field(default_factory=list)
    metrics: list[AIDataMetric] = Field(default_factory=list)
    methods: list[AIDataMethod] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    facts: dict[str, Any] = Field(default_factory=dict)


class ActivityUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    type: str | None = Field(default=None, min_length=1, max_length=50)
    notes: str | None = Field(default=None, max_length=10000)
    hydration_ml: int | None = Field(default=None, ge=0, le=20_000)
    include_in_statistics: bool | None = None


class ActivityResponse(BaseModel):
    id: str
    title: str
    type: str
    notes: str | None
    hydration_ml: int | None = None
    original_filename: str
    started_at: datetime
    ended_at: datetime
    distance_m: float
    duration_s: float
    moving_time_s: float
    pause_time_s: float
    avg_speed_mps: float | None
    max_speed_mps: float
    elevation_gain_m: float
    avg_hr_bpm: float | None
    max_hr_bpm: int | None
    avg_cadence_rpm: float | None
    max_cadence_rpm: int | None
    avg_power_w: float | None
    max_power_w: int | None
    training_load: float
    hr_zone_seconds: dict[str, float]
    weather: dict[str, Any] | None
    weather_status: str
    ai_summary: str | None
    ai_provider: str | None
    ai_data_basis: AIDataBasis | None = None
    data_quality_flags: list[dict[str, Any]] = Field(default_factory=list)
    metric_provenance: dict[str, Any] = Field(default_factory=dict)
    include_in_statistics: bool = True
    created_at: datetime
    updated_at: datetime


class ActivityListResponse(BaseModel):
    items: list[ActivityResponse]
    total: int
    limit: int
    offset: int


class TrackPointResponse(BaseModel):
    time: datetime
    latitude: float | None = None
    longitude: float | None = None
    altitude_m: float | None = None
    distance_m: float | None = None
    heart_rate_bpm: int | None = None
    cadence_rpm: int | None = None
    power_w: int | None = None
    speed_mps: float | None = None


class TrackResponse(BaseModel):
    activity_id: str
    points: list[TrackPointResponse]


class WeatherResponse(BaseModel):
    status: str
    data: dict[str, Any] | None = None
    updated_at: datetime | None = None


class SummaryResponse(BaseModel):
    summary: str
    provider: str
    updated_at: datetime
    data_basis: AIDataBasis | None = None


class ActivityPhotoResponse(BaseModel):
    id: str
    activity_id: str
    original_filename: str
    content_type: str
    size_bytes: int
    original_size_bytes: int
    width: int
    height: int
    captured_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    caption: str | None = None
    file_url: str
    original_file_url: str
    processing_status: str
    created_at: datetime
    updated_at: datetime


class ActivityPhotoListResponse(BaseModel):
    items: list[ActivityPhotoResponse]
    total: int


class ActivityPhotoUpdate(BaseModel):
    captured_at: datetime | None = None
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    caption: str | None = Field(default=None, max_length=1000)

    @field_validator("captured_at")
    @classmethod
    def captured_at_has_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("captured_at muss eine Zeitzone enthalten.")
        return value


class ActivityMediaResponse(BaseModel):
    id: str
    activity_id: str
    media_type: Literal["image", "video"]
    original_filename: str
    content_type: str
    size_bytes: int
    original_size_bytes: int
    width: int
    height: int
    duration_s: float | None = None
    container_format: str | None = None
    video_codec: str | None = None
    audio_codec: str | None = None
    orientation_degrees: int | None = None
    captured_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    caption: str | None = None
    file_url: str
    original_file_url: str
    poster_url: str | None = None
    processing_status: Literal["pending", "processing", "ready", "failed"]
    processing_error: str | None = None
    created_at: datetime
    updated_at: datetime


class ActivityMediaListResponse(BaseModel):
    items: list[ActivityMediaResponse]
    total: int


class StatisticsSeriesPoint(BaseModel):
    period_start: date
    activity_count: int
    distance_m: float
    duration_s: float
    moving_time_s: float
    elevation_gain_m: float
    training_load: float
    avg_speed_mps: float | None
    avg_hr_bpm: float | None
    hydration_ml: int = 0
    hydration_activity_count: int = 0


class StatisticsComparison(BaseModel):
    date_from: date
    date_to: date
    activity_count: int
    distance_m: float
    duration_s: float
    moving_time_s: float
    elevation_gain_m: float
    training_load: float
    avg_speed_mps: float | None
    avg_hr_bpm: float | None
    hydration_ml: int = 0
    hydration_activity_count: int = 0
    changes: dict[str, float | None]


class StatisticsOverview(BaseModel):
    activity_count: int
    distance_m: float
    duration_s: float
    moving_time_s: float
    elevation_gain_m: float
    training_load: float
    avg_speed_mps: float | None
    avg_hr_bpm: float | None = None
    hydration_ml: int = 0
    hydration_activity_count: int = 0
    granularity: str = "month"
    series: list[StatisticsSeriesPoint] = Field(default_factory=list)
    comparison: StatisticsComparison | None = None
    by_month: list[dict[str, Any]]


class CompareRequest(BaseModel):
    activity_ids: list[str] = Field(min_length=2, max_length=10)


class ActivityExportRequest(BaseModel):
    activity_ids: list[str] = Field(default_factory=list, max_length=200)
    date_from: date | None = None
    date_to: date | None = None
    include_original: bool = True
    redact_private_data: bool = False


class SavedSegmentCreate(BaseModel):
    activity_id: str
    name: str = Field(min_length=1, max_length=120)
    start_m: float = Field(ge=0)
    end_m: float = Field(gt=0)

    @model_validator(mode="after")
    def ordered(self) -> "SavedSegmentCreate":
        if self.end_m <= self.start_m: raise ValueError("Das Segmentende muss hinter dem Segmentstart liegen.")
        return self


class SavedSegmentResponse(BaseModel):
    id: str
    activity_id: str
    name: str
    start_m: float
    end_m: float
    route_signature: list[str]
    metrics: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ComparisonMetric(BaseModel):
    activity_id: str
    title: str
    distance_m: float
    duration_s: float
    moving_time_s: float
    elevation_gain_m: float
    avg_speed_mps: float | None
    avg_hr_bpm: float | None
    max_hr_bpm: int | None
    efficiency_kmh_per_bpm: float | None
    headwind_kmh: float | None
    hydration_ml: int | None = None
    hydration_rate_ml_per_hour: float | None = None
    relative_score: float | None


class ComparisonProfilePoint(BaseModel):
    progress_percent: float
    distance_km: float
    elevation_m: float | None
    speed_kmh: float | None
    heart_rate_bpm: int | None


class ComparisonProfile(BaseModel):
    activity_id: str
    title: str
    points: list[ComparisonProfilePoint]


class CompareResponse(BaseModel):
    activities: list[ActivityResponse]
    metrics: list[ComparisonMetric] = Field(default_factory=list)
    profiles: list[ComparisonProfile] = Field(default_factory=list)
    ai_summary: str | None = None
    ai_provider: str | None = None
    ai_data_basis: AIDataBasis | None = None


class DistanceRecord(BaseModel):
    target_distance_m: int
    duration_s: float
    avg_speed_mps: float
    activity_id: str
    title: str
    started_at: datetime
    source: str
    estimated: bool
    segment_start_m: float
    segment_end_m: float


class ActivityRecord(BaseModel):
    activity_id: str
    title: str
    started_at: datetime
    distance_m: float
    moving_time_s: float
    avg_speed_mps: float
    elevation_gain_m: float


class PersonalRecordsResponse(BaseModel):
    generated_at: datetime
    distance_records: list[DistanceRecord]
    longest_ride: ActivityRecord | None = None
    highest_average_speed: ActivityRecord | None = None
    highest_elevation_gain: ActivityRecord | None = None
    methods: list[AIDataMethod] = Field(default_factory=list)


class InsightPeriod(BaseModel):
    date_from: date
    date_to: date


class InsightAggregate(BaseModel):
    period: str
    period_start: date
    period_end: date
    activity_count: int
    distance_m: float
    moving_time_s: float
    elevation_gain_m: float
    training_load: float
    avg_speed_mps: float | None
    avg_hr_bpm: float | None
    hydration_ml: int = 0
    changes_from_previous: dict[str, float | None] = Field(default_factory=dict)


class FitnessTrend(BaseModel):
    status: str
    confidence: str
    sample_size: int
    speed_change_percent: float | None = None
    heart_rate_efficiency_change_percent: float | None = None
    statement: str


class InsightPattern(BaseModel):
    kind: str
    confidence: str
    sample_size: int
    statement: str
    evidence: dict[str, Any]
    method: str


class LongTermInsightsResponse(BaseModel):
    generated_at: datetime
    period: InsightPeriod
    current: dict[str, Any]
    previous_period: InsightPeriod
    previous: dict[str, Any]
    changes: dict[str, float | None]
    monthly: list[InsightAggregate]
    yearly: list[InsightAggregate]
    fitness_trend: FitnessTrend
    patterns: list[InsightPattern]
    methods: list[AIDataMethod]
    disclaimer: str


class PeriodReviewResponse(BaseModel):
    year: int
    season: str
    period: InsightPeriod
    summary: str
    provider: str
    generated_at: datetime
    data_basis: AIDataBasis


class GamificationMetric(str, Enum):
    distance_m = "distance_m"
    activity_count = "activity_count"
    elevation_gain_m = "elevation_gain_m"
    moving_time_s = "moving_time_s"
    training_load = "training_load"
    active_weeks = "active_weeks"
    places_visited = "places_visited"
    hydration_activity_count = "hydration_activity_count"
    hydration_ml = "hydration_ml"
    recovery_gap_count = "recovery_gap_count"
    intensity_variety = "intensity_variety"
    weather_activity_count = "weather_activity_count"
    village_count = "village_count"
    city_count = "city_count"
    municipality_count = "municipality_count"
    state_count = "state_count"
    country_count = "country_count"
    longest_ride_m = "longest_ride_m"
    highest_elevation_m = "highest_elevation_m"
    best_average_speed_mps = "best_average_speed_mps"


class GamificationPeriod(str, Enum):
    week = "week"
    month = "month"
    year = "year"
    custom = "custom"
    lifetime = "lifetime"


class GamificationDiscoveryKind(str, Enum):
    village = "village"
    city = "city"
    municipality = "municipality"
    state = "state"
    country = "country"


def _trim_gamification_text(value: str) -> str:
    normalized = " ".join(value.split())
    if not normalized:
        raise ValueError("Der Text darf nicht leer sein.")
    return normalized


class GamificationGoalCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    title: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    metric: GamificationMetric
    target_value: float = Field(gt=0, le=1_000_000_000_000)
    period: GamificationPeriod = GamificationPeriod.custom
    starts_at: date | None = None
    deadline: date | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return _trim_gamification_text(value)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None

    @field_validator("starts_at", "deadline")
    @classmethod
    def supported_goal_date(cls, value: date | None) -> date | None:
        if value is not None and not date(1900, 1, 1) <= value <= date(9998, 12, 31):
            raise ValueError("Gamification-Zeiträume müssen zwischen 1900 und 9998 liegen.")
        return value

    @model_validator(mode="after")
    def goal_dates_are_ordered(self) -> "GamificationGoalCreate":
        if self.starts_at and self.deadline and self.deadline < self.starts_at:
            raise ValueError("Das Enddatum muss am oder nach dem Startdatum liegen.")
        return self


class GamificationGoalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    title: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=500)
    metric: GamificationMetric | None = None
    target_value: float | None = Field(default=None, gt=0, le=1_000_000_000_000)
    period: GamificationPeriod | None = None
    starts_at: date | None = None
    deadline: date | None = None
    status: str | None = Field(default=None, pattern=r"^(active|paused)$")

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        return _trim_gamification_text(value) if value is not None else None

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized or None

    @field_validator("starts_at", "deadline")
    @classmethod
    def supported_goal_date(cls, value: date | None) -> date | None:
        if value is not None and not date(1900, 1, 1) <= value <= date(9998, 12, 31):
            raise ValueError("Gamification-Zeiträume müssen zwischen 1900 und 9998 liegen.")
        return value

    @model_validator(mode="after")
    def goal_dates_are_ordered(self) -> "GamificationGoalUpdate":
        if self.starts_at and self.deadline and self.deadline < self.starts_at:
            raise ValueError("Das Enddatum muss am oder nach dem Startdatum liegen.")
        return self


class GamificationGoalResponse(BaseModel):
    id: str
    title: str
    description: str | None = None
    metric: str
    current_value: float
    target_value: float
    unit: str
    period: str
    progress_percent: float
    remaining_value: float
    status: str
    starts_at: date | None = None
    deadline: date | None = None
    completed_at: datetime | None = None
    reward_xp: int
    created_at: datetime
    updated_at: datetime


class GamificationGoalListResponse(BaseModel):
    items: list[GamificationGoalResponse]
    total: int


class GamificationChallengeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    metric: GamificationMetric
    target_value: float = Field(gt=0, le=1_000_000_000_000)
    duration_days: int = Field(default=7, ge=1, le=366)
    weather_sensitive: bool = False
    safety_note: str | None = Field(default=None, max_length=500)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return _trim_gamification_text(value)

    @field_validator("description", "safety_note")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = " ".join(value.split())
        return normalized


class GamificationChallengeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    title: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    metric: GamificationMetric | None = None
    target_value: float | None = Field(default=None, gt=0, le=1_000_000_000_000)
    duration_days: int | None = Field(default=None, ge=1, le=366)
    weather_sensitive: bool | None = None
    safety_note: str | None = Field(default=None, max_length=500)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        return _trim_gamification_text(value) if value is not None else None

    @field_validator("description", "safety_note")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return " ".join(value.split())


class GamificationChallengeAccept(BaseModel):
    model_config = ConfigDict(extra="forbid")

    starts_at: date | None = None

    @field_validator("starts_at")
    @classmethod
    def supported_start_date(cls, value: date | None) -> date | None:
        if value is not None and not date(1900, 1, 1) <= value <= date(9998, 12, 31):
            raise ValueError("Der Challenge-Start muss zwischen 1900 und 9998 liegen.")
        return value


class GamificationChallengeResponse(BaseModel):
    id: str
    title: str
    description: str
    metric: str
    current_value: float
    target_value: float
    unit: str
    progress_percent: float
    remaining_value: float
    duration_days: int
    reward_xp: int
    status: str
    source: str
    ai_generated: bool
    personalization_reason: str | None = None
    weather_sensitive: bool
    safety_note: str | None = None
    starts_at: date | None = None
    expires_at: date | None = None
    accepted_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class GamificationChallengeListResponse(BaseModel):
    items: list[GamificationChallengeResponse]
    total: int
    ai_challenges_available: bool


class GamificationBadgeResponse(BaseModel):
    id: str
    key: str
    name: str
    description: str
    category: str
    tier: str
    icon: str | None = None
    reward_xp: int
    unlocked: bool
    unlocked_at: datetime | None = None
    source_activity_id: str | None = None
    current_value: float
    target_value: float
    unit: str
    progress_percent: float


class GamificationBadgeListResponse(BaseModel):
    items: list[GamificationBadgeResponse]
    total: int
    unlocked: int


class GamificationLevelResponse(BaseModel):
    level: int
    name: str
    total_xp: int
    current_xp: int
    next_level_xp: int
    progress_percent: float
    breakdown: dict[str, int] = Field(default_factory=dict)


class GamificationStreakResponse(BaseModel):
    current_weeks: int
    best_weeks: int
    weekly_target: int
    current_week_progress: int
    pause_protection_available: bool
    pause_protection_active: bool
    protected_until: date | None = None
    next_check_at: datetime | None = None
    active_week_starts: list[date] = Field(default_factory=list)
    method: str


class GamificationRecordChaseResponse(BaseModel):
    id: str
    title: str
    description: str
    metric: str
    current_value: float
    target_value: float
    unit: str
    progress_percent: float
    activity_id: str | None = None
    achieved: bool


class GamificationDiscoveryResponse(BaseModel):
    id: str
    kind: str
    name: str
    region: str | None = None
    country_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    first_discovered_at: datetime
    first_activity_id: str | None = None


class GamificationDiscoverySummary(BaseModel):
    scope: str
    label: str
    count: int
    total_available: int | None = None
    progress_percent: float | None = None
    places: list[str] = Field(default_factory=list)


class GamificationDiscoveryListResponse(BaseModel):
    items: list[GamificationDiscoveryResponse]
    total: int
    by_scope: list[GamificationDiscoverySummary]


class GamificationGeocodingStatusResponse(BaseModel):
    status: Literal["disabled", "misconfigured", "ready", "rate_limited"]
    provider: str | None = None
    attribution_label: str | None = None
    attribution_url: str | None = None


class GamificationDiscoveryBackfillRequest(BaseModel):
    limit: int = Field(default=5, ge=1, le=10)
    retry_failed: bool = False


class GamificationDiscoveryBackfillResponse(BaseModel):
    processed: int
    available: int
    failed: int
    remaining: int
    total: int
    rate_limited: bool = False
    retry_after_seconds: int | None = None


class GamificationAnnualAwardResponse(BaseModel):
    id: str
    key: str
    year: int
    title: str
    description: str
    value: float | None = None
    unit: str | None = None
    tier: str
    earned: bool
    earned_at: datetime | None = None
    icon: str | None = None
    reward_xp: int
    is_final: bool


class GamificationAnnualAwardListResponse(BaseModel):
    items: list[GamificationAnnualAwardResponse]
    total: int
    years: list[int]


class GamificationOverviewResponse(BaseModel):
    generated_at: datetime
    privacy: str = "private"
    level: GamificationLevelResponse
    goals: list[GamificationGoalResponse]
    active_challenges: list[GamificationChallengeResponse]
    challenge_suggestions: list[GamificationChallengeResponse]
    ai_challenges_available: bool
    badges: list[GamificationBadgeResponse]
    streak: GamificationStreakResponse
    record_chases: list[GamificationRecordChaseResponse]
    discoveries: list[GamificationDiscoverySummary]
    geocoding: GamificationGeocodingStatusResponse
    annual_awards: list[GamificationAnnualAwardResponse]
