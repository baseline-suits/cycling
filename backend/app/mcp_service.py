from __future__ import annotations

import copy
import json
import math
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, load_only

from .config import get_settings
from .mcp_models import MCP_SCOPES
from .mcp_security import MAX_TOOL_ARGUMENT_BYTES, MAX_TOOL_RESULT_BYTES
from .models import Activity
from .statistics import build_statistics


MIN_SUPPORTED_DATE = date(1900, 1, 1)
MAX_LIST_RANGE_DAYS = 3_653
MAX_STATISTICS_RANGE_DAYS = 3_653
MAX_RECORDS_RANGE_DAYS = 3_653
MAX_ANALYTIC_ROWS = 25_000

TOOL_SCOPES = {
    "list_activities": "activities:read",
    "get_activity_details": "activities:detail",
    "get_statistics": "statistics:read",
    "get_records_and_insights": "insights:read",
}

_READ_ONLY_ANNOTATIONS = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "openWorldHint": False,
}


def _object_schema(properties: dict[str, Any], *, required: list[str] | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": {**properties, "error": {"type": "string"}},
        "additionalProperties": False,
    }
    if required:
        # Success fields are intentionally optional at the root so structured tool errors
        # still conform to the advertised output schema.
        schema["allOf"] = [{"required": required}, {"not": {"required": ["error"]}}]
    return schema


_ACTIVITY_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "activity_id": {"type": "string"},
        "title": {"type": "string"},
        "type": {"type": "string"},
        "started_at": {"type": "string", "format": "date-time"},
        "distance_m": {"type": "number"},
        "duration_s": {"type": "number"},
        "moving_time_s": {"type": "number"},
        "elevation_gain_m": {"type": "number"},
        "avg_speed_mps": {"type": ["number", "null"]},
        "avg_hr_bpm": {"type": ["number", "null"]},
        "training_load": {"type": "number"},
        "hydration_ml": {"type": ["integer", "null"]},
    },
    "required": ["activity_id", "title", "type", "started_at", "distance_m"],
    "additionalProperties": False,
}

TOOL_DEFINITIONS: tuple[dict[str, Any], ...] = (
    {
        "name": "list_activities",
        "title": "Aktivitäten auflisten",
        "description": "Listet kompakte Aktivitäten des verbundenen Baseline Cycling-Benutzers mit sicheren Filtern auf.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "date_from": {"type": ["string", "null"], "format": "date"},
                "date_to": {"type": ["string", "null"], "format": "date"},
                "query": {"type": ["string", "null"], "maxLength": 100},
                "activity_type": {"type": ["string", "null"], "maxLength": 50},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 20},
                "offset": {"type": "integer", "minimum": 0, "maximum": 10000, "default": 0},
            },
            "additionalProperties": False,
        },
        "outputSchema": _object_schema(
            {
                "items": {"type": "array", "items": _ACTIVITY_ITEM_SCHEMA, "maxItems": 50},
                "total": {"type": "integer"},
                "limit": {"type": "integer"},
                "offset": {"type": "integer"},
                "has_more": {"type": "boolean"},
            }
        ),
        "annotations": _READ_ONLY_ANNOTATIONS,
    },
    {
        "name": "get_activity_details",
        "title": "Aktivitätsdetails abrufen",
        "description": "Liefert begrenzte Trainings-, Sensor-, Zonen- und Wetterdetails einer eigenen Aktivität; keine Rohstrecke.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "activity_id": {"type": "string", "minLength": 1, "maxLength": 36},
            },
            "required": ["activity_id"],
            "additionalProperties": False,
        },
        "outputSchema": _object_schema(
            {
                "activity": {"type": "object", "additionalProperties": True},
                "heart_rate_zones_s": {
                    "type": "object",
                    "additionalProperties": {"type": "number"},
                },
                "weather": {"type": ["object", "null"], "additionalProperties": True},
            }
        ),
        "annotations": _READ_ONLY_ANNOTATIONS,
    },
    {
        "name": "get_statistics",
        "title": "Trainingsstatistik abrufen",
        "description": "Aggregiert eigene Aktivitäten für einen begrenzten Zeitraum samt kompakter Zeitreihe und Vorperiodenvergleich.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "date_from": {"type": ["string", "null"], "format": "date"},
                "date_to": {"type": ["string", "null"], "format": "date"},
                "granularity": {
                    "type": "string",
                    "enum": ["auto", "day", "week", "month"],
                    "default": "auto",
                },
            },
            "additionalProperties": False,
        },
        "outputSchema": _object_schema(
            {
                "date_from": {"type": "string", "format": "date"},
                "date_to": {"type": "string", "format": "date"},
                "activity_count": {"type": "integer"},
                "distance_m": {"type": "number"},
                "duration_s": {"type": "number"},
                "moving_time_s": {"type": "number"},
                "elevation_gain_m": {"type": "number"},
                "training_load": {"type": "number"},
                "avg_speed_mps": {"type": ["number", "null"]},
                "avg_hr_bpm": {"type": ["number", "null"]},
                "hydration_ml": {"type": "integer"},
                "hydration_activity_count": {"type": "integer"},
                "granularity": {"type": "string"},
                "series": {"type": "array", "items": {"type": "object"}, "maxItems": 130},
                "comparison": {"type": "object"},
                "by_month": {"type": "array", "items": {"type": "object"}, "maxItems": 121},
            }
        ),
        "annotations": _READ_ONLY_ANNOTATIONS,
    },
    {
        "name": "get_records_and_insights",
        "title": "Rekorde und Insights abrufen",
        "description": "Ermittelt persönliche Rekorde, Summen und begrenzte Trainingstrends aus den eigenen Aktivitäten.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "date_from": {"type": ["string", "null"], "format": "date"},
                "date_to": {"type": ["string", "null"], "format": "date"},
            },
            "additionalProperties": False,
        },
        "outputSchema": _object_schema(
            {
                "period": {"type": "object"},
                "summary": {"type": "object"},
                "records": {"type": "array", "items": {"type": "object"}, "maxItems": 6},
                "insights": {"type": "array", "items": {"type": "object"}, "maxItems": 4},
            }
        ),
        "annotations": _READ_ONLY_ANNOTATIONS,
    },
)

_TOOLS_BY_NAME = {tool["name"]: tool for tool in TOOL_DEFINITIONS}


class McpToolError(Exception):
    def __init__(self, error_type: str, safe_message: str):
        super().__init__(safe_message)
        self.error_type = error_type
        self.safe_message = safe_message


class _Arguments(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _validate_period(start: date | None, end: date | None, maximum_days: int) -> None:
    if start is not None and start < MIN_SUPPORTED_DATE:
        raise ValueError("Der Zeitraum ist nicht zulässig.")
    if end is not None and (end < MIN_SUPPORTED_DATE or end.year >= 9999):
        raise ValueError("Der Zeitraum ist nicht zulässig.")
    if start is not None and end is not None:
        if end < start or (end - start).days + 1 > maximum_days:
            raise ValueError("Der Zeitraum ist nicht zulässig.")


class ListActivitiesArguments(_Arguments):
    date_from: date | None = None
    date_to: date | None = None
    query: str | None = Field(default=None, max_length=100)
    activity_type: str | None = Field(default=None, max_length=50)
    limit: int = Field(default=20, ge=1, le=50, strict=True)
    offset: int = Field(default=0, ge=0, le=10_000, strict=True)

    @model_validator(mode="after")
    def validate_values(self) -> "ListActivitiesArguments":
        if (self.date_from is None) != (self.date_to is None):
            raise ValueError("Start- und Enddatum müssen gemeinsam angegeben werden.")
        _validate_period(self.date_from, self.date_to, MAX_LIST_RANGE_DAYS)
        if self.query is not None:
            self.query = self.query.strip() or None
        if self.activity_type is not None:
            self.activity_type = self.activity_type.strip().lower() or None
        return self


class ActivityDetailsArguments(_Arguments):
    activity_id: str = Field(min_length=1, max_length=36, pattern=r"^[A-Za-z0-9-]+$")


class StatisticsArguments(_Arguments):
    date_from: date | None = None
    date_to: date | None = None
    granularity: Literal["auto", "day", "week", "month"] = "auto"

    @model_validator(mode="after")
    def validate_values(self) -> "StatisticsArguments":
        _validate_period(self.date_from, self.date_to, MAX_STATISTICS_RANGE_DAYS)
        return self


class RecordsArguments(_Arguments):
    date_from: date | None = None
    date_to: date | None = None

    @model_validator(mode="after")
    def validate_values(self) -> "RecordsArguments":
        if (self.date_from is None) != (self.date_to is None):
            raise ValueError("Start- und Enddatum müssen gemeinsam angegeben werden.")
        _validate_period(self.date_from, self.date_to, MAX_RECORDS_RANGE_DAYS)
        return self


_ARGUMENT_MODELS: dict[str, type[_Arguments]] = {
    "list_activities": ListActivitiesArguments,
    "get_activity_details": ActivityDetailsArguments,
    "get_statistics": StatisticsArguments,
    "get_records_and_insights": RecordsArguments,
}


def tools_for_scopes(scopes: tuple[str, ...] | list[str]) -> list[dict[str, Any]]:
    allowed = set(scopes) & set(MCP_SCOPES)
    return [
        copy.deepcopy(tool)
        for tool in TOOL_DEFINITIONS
        if TOOL_SCOPES[tool["name"]] in allowed
    ]


def tool_is_known(name: object) -> bool:
    return isinstance(name, str) and name in _TOOLS_BY_NAME


def tool_is_allowed(name: str, scopes: tuple[str, ...] | list[str]) -> bool:
    return name in TOOL_SCOPES and TOOL_SCOPES[name] in set(scopes)


def _argument_budget(value: object) -> None:
    try:
        encoded = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError):
        raise McpToolError("invalid_arguments", "Ungültige Tool-Argumente.") from None
    if len(encoded) > MAX_TOOL_ARGUMENT_BYTES:
        raise McpToolError("invalid_arguments", "Die Tool-Argumente sind zu groß.")

    nodes = 0

    def walk(item: object, depth: int) -> None:
        nonlocal nodes
        nodes += 1
        if depth > 8 or nodes > 250:
            raise McpToolError("invalid_arguments", "Die Tool-Argumente sind zu komplex.")
        if isinstance(item, dict):
            if len(item) > 30:
                raise McpToolError("invalid_arguments", "Die Tool-Argumente sind zu komplex.")
            for key, child in item.items():
                if not isinstance(key, str) or len(key) > 80:
                    raise McpToolError("invalid_arguments", "Ungültige Tool-Argumente.")
                walk(child, depth + 1)
        elif isinstance(item, list):
            if len(item) > 100:
                raise McpToolError("invalid_arguments", "Die Tool-Argumente sind zu komplex.")
            for child in item:
                walk(child, depth + 1)
        elif isinstance(item, str) and len(item) > 4_000:
            raise McpToolError("invalid_arguments", "Die Tool-Argumente sind zu groß.")

    walk(value, 0)


def _local_midnight(value: date, timezone_name: str) -> datetime:
    return datetime.combine(value, time.min, tzinfo=ZoneInfo(timezone_name)).astimezone(timezone.utc)


def _finite_number(value: object, digits: int = 2) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return round(number, digits) if math.isfinite(number) else None


def _activity_item(activity: Activity) -> dict[str, Any]:
    return {
        "activity_id": activity.id,
        "title": activity.title[:200],
        "type": activity.activity_type[:50],
        "started_at": activity.started_at.isoformat(),
        "distance_m": _finite_number(activity.distance_m) or 0.0,
        "duration_s": _finite_number(activity.duration_s) or 0.0,
        "moving_time_s": _finite_number(activity.moving_time_s) or 0.0,
        "elevation_gain_m": _finite_number(activity.elevation_gain_m) or 0.0,
        "avg_speed_mps": _finite_number(activity.avg_speed_mps, 3),
        "avg_hr_bpm": _finite_number(activity.avg_hr_bpm, 1),
        "training_load": _finite_number(activity.training_load, 1) or 0.0,
        "hydration_ml": activity.hydration_ml,
    }


def _list_activities(db: Session, owner_user_id: str, args: ListActivitiesArguments) -> dict[str, Any]:
    timezone_name = get_settings().timezone
    conditions: list[Any] = [Activity.user_id == owner_user_id]
    if args.date_from:
        conditions.append(Activity.started_at >= _local_midnight(args.date_from, timezone_name))
    if args.date_to:
        conditions.append(
            Activity.started_at < _local_midnight(args.date_to + timedelta(days=1), timezone_name)
        )
    if args.query:
        escaped = args.query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        conditions.append(
            or_(Activity.title.ilike(pattern, escape="\\"), Activity.notes.ilike(pattern, escape="\\"))
        )
    if args.activity_type:
        conditions.append(Activity.activity_type == args.activity_type)
    total = int(db.scalar(select(func.count()).select_from(Activity).where(*conditions)) or 0)
    items = db.scalars(
        select(Activity)
        .options(
            load_only(
                Activity.id,
                Activity.title,
                Activity.activity_type,
                Activity.started_at,
                Activity.distance_m,
                Activity.duration_s,
                Activity.moving_time_s,
                Activity.elevation_gain_m,
                Activity.avg_speed_mps,
                Activity.avg_hr_bpm,
                Activity.training_load,
                Activity.hydration_ml,
            )
        )
        .where(*conditions)
        .order_by(Activity.started_at.desc(), Activity.id.desc())
        .offset(args.offset)
        .limit(args.limit)
    ).all()
    return {
        "items": [_activity_item(activity) for activity in items],
        "total": total,
        "limit": args.limit,
        "offset": args.offset,
        "has_more": args.offset + len(items) < total,
    }


def _compact_weather(activity: Activity) -> dict[str, Any] | None:
    source = activity.weather if isinstance(activity.weather, dict) else {}
    values: dict[str, Any] = {}
    allowed_values = (
        "temperature_c",
        "apparent_temperature_c",
        "precipitation_mm",
        "weather_code",
        "wind_speed_kmh",
        "wind_direction_deg",
        "temperature_2m",
        "apparent_temperature",
        "precipitation",
        "wind_speed_10m",
        "wind_direction_10m",
    )
    for key in allowed_values:
        value = source.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            finite = _finite_number(value, 1)
            if finite is not None:
                values[key] = finite
    route_wind = source.get("route_wind")
    if isinstance(route_wind, dict):
        wind: dict[str, Any] = {}
        dominant = route_wind.get("dominant")
        if isinstance(dominant, str):
            wind["dominant"] = dominant[:20]
        for key in (
            "net_headwind_kmh",
            "avg_headwind_kmh",
            "avg_tailwind_kmh",
            "avg_crosswind_kmh",
            "headwind_share_percent",
            "tailwind_share_percent",
        ):
            finite = _finite_number(route_wind.get(key), 1)
            if finite is not None:
                wind[key] = finite
        if wind:
            values["route_wind"] = wind
    if not values and activity.weather_status == "pending":
        return {"status": "pending"}
    return {"status": activity.weather_status[:30], **values}


def _activity_details(db: Session, owner_user_id: str, args: ActivityDetailsArguments) -> dict[str, Any]:
    activity = db.scalar(
        select(Activity)
        .options(
            load_only(
                Activity.id,
                Activity.title,
                Activity.activity_type,
                Activity.notes,
                Activity.hydration_ml,
                Activity.started_at,
                Activity.ended_at,
                Activity.distance_m,
                Activity.duration_s,
                Activity.moving_time_s,
                Activity.pause_time_s,
                Activity.avg_speed_mps,
                Activity.max_speed_mps,
                Activity.elevation_gain_m,
                Activity.avg_hr_bpm,
                Activity.max_hr_bpm,
                Activity.avg_cadence_rpm,
                Activity.max_cadence_rpm,
                Activity.avg_power_w,
                Activity.max_power_w,
                Activity.training_load,
                Activity.hr_zone_seconds,
                Activity.weather,
                Activity.weather_status,
                Activity.ai_summary,
            )
        )
        .where(Activity.id == args.activity_id, Activity.user_id == owner_user_id)
    )
    if activity is None:
        raise McpToolError("tool_failed", "Aktivität nicht gefunden.")
    zones: dict[str, float] = {}
    if isinstance(activity.hr_zone_seconds, dict):
        for raw_name, raw_value in list(activity.hr_zone_seconds.items())[:10]:
            name = str(raw_name)[:40]
            value = _finite_number(raw_value, 1)
            if value is not None:
                zones[name] = value
    return {
        "activity": {
            **_activity_item(activity),
            "ended_at": activity.ended_at.isoformat(),
            "pause_time_s": _finite_number(activity.pause_time_s) or 0.0,
            "max_speed_mps": _finite_number(activity.max_speed_mps, 3),
            "max_hr_bpm": activity.max_hr_bpm,
            "avg_cadence_rpm": _finite_number(activity.avg_cadence_rpm, 1),
            "max_cadence_rpm": activity.max_cadence_rpm,
            "avg_power_w": _finite_number(activity.avg_power_w, 1),
            "max_power_w": activity.max_power_w,
            "notes": activity.notes[:2_000] if activity.notes else None,
            "summary": activity.ai_summary[:4_000] if activity.ai_summary else None,
        },
        "heart_rate_zones_s": zones,
        "weather": _compact_weather(activity),
    }


_STAT_COLUMNS = (
    Activity.started_at,
    Activity.distance_m,
    Activity.duration_s,
    Activity.moving_time_s,
    Activity.elevation_gain_m,
    Activity.training_load,
    Activity.avg_hr_bpm,
    Activity.hydration_ml,
)


def _statistics_rows(db: Session, conditions: list[Any]) -> list[SimpleNamespace]:
    count = int(db.scalar(select(func.count()).select_from(Activity).where(*conditions)) or 0)
    if count > MAX_ANALYTIC_ROWS:
        raise McpToolError("tool_failed", "Der Statistikzeitraum enthält zu viele Aktivitäten.")
    rows = db.execute(select(*_STAT_COLUMNS).where(*conditions).order_by(Activity.started_at)).all()
    return [SimpleNamespace(**dict(row._mapping)) for row in rows]


def _statistics(db: Session, owner_user_id: str, args: StatisticsArguments) -> dict[str, Any]:
    timezone_name = get_settings().timezone
    today = datetime.now(ZoneInfo(timezone_name)).date()
    end = args.date_to or today
    start = args.date_from or (end - timedelta(days=89))
    _validate_period(start, end, MAX_STATISTICS_RANGE_DAYS)
    span = (end - start).days + 1
    if args.granularity == "day" and span > 120:
        raise McpToolError("invalid_arguments", "Tägliche Statistik ist auf 120 Tage begrenzt.")
    if args.granularity == "week" and span > 730:
        raise McpToolError("invalid_arguments", "Wöchentliche Statistik ist auf zwei Jahre begrenzt.")

    current_conditions = [
        Activity.user_id == owner_user_id,
        Activity.started_at >= _local_midnight(start, timezone_name),
        Activity.started_at < _local_midnight(end + timedelta(days=1), timezone_name),
    ]
    previous_to = start - timedelta(days=1)
    previous_from = previous_to - timedelta(days=span - 1)
    previous_conditions = [
        Activity.user_id == owner_user_id,
        Activity.started_at >= _local_midnight(previous_from, timezone_name),
        Activity.started_at < _local_midnight(previous_to + timedelta(days=1), timezone_name),
    ]
    result = build_statistics(
        _statistics_rows(db, current_conditions),
        _statistics_rows(db, previous_conditions),
        start,
        end,
        previous_from,
        previous_to,
        args.granularity,
        timezone_name,
    )
    return {"date_from": start.isoformat(), "date_to": end.isoformat(), **result}


def _aggregate(db: Session, conditions: list[Any]) -> dict[str, Any]:
    row = db.execute(
        select(
            func.count(Activity.id).label("activity_count"),
            func.coalesce(func.sum(Activity.distance_m), 0).label("distance_m"),
            func.coalesce(func.sum(Activity.moving_time_s), 0).label("moving_time_s"),
            func.coalesce(func.sum(Activity.elevation_gain_m), 0).label("elevation_gain_m"),
            func.coalesce(func.sum(Activity.training_load), 0).label("training_load"),
            func.coalesce(func.sum(Activity.hydration_ml), 0).label("hydration_ml"),
            func.count(Activity.avg_hr_bpm).label("heart_rate_count"),
            func.count(Activity.hydration_ml).label("hydration_count"),
        ).where(*conditions)
    ).one()
    return {
        "activity_count": int(row.activity_count or 0),
        "distance_m": _finite_number(row.distance_m) or 0.0,
        "moving_time_s": _finite_number(row.moving_time_s) or 0.0,
        "elevation_gain_m": _finite_number(row.elevation_gain_m) or 0.0,
        "training_load": _finite_number(row.training_load, 1) or 0.0,
        "hydration_ml": int(row.hydration_ml or 0),
        "heart_rate_count": int(row.heart_rate_count or 0),
        "hydration_count": int(row.hydration_count or 0),
    }


def _change(current: float, previous: float) -> float | None:
    return round((current - previous) / abs(previous) * 100, 1) if previous else None


def _records_and_insights(db: Session, owner_user_id: str, args: RecordsArguments) -> dict[str, Any]:
    timezone_name = get_settings().timezone
    conditions: list[Any] = [Activity.user_id == owner_user_id]
    if args.date_from and args.date_to:
        conditions.extend(
            [
                Activity.started_at >= _local_midnight(args.date_from, timezone_name),
                Activity.started_at < _local_midnight(args.date_to + timedelta(days=1), timezone_name),
            ]
        )
    summary = _aggregate(db, conditions)
    heart_rate_count = summary.pop("heart_rate_count")
    hydration_count = summary.pop("hydration_count")

    record_specs = (
        ("longest_distance", Activity.distance_m, "m", 2),
        ("fastest_average_speed", Activity.avg_speed_mps, "m/s", 3),
        ("most_elevation_gain", Activity.elevation_gain_m, "m", 2),
        ("highest_training_load", Activity.training_load, "points", 1),
        ("highest_average_power", Activity.avg_power_w, "W", 1),
        ("highest_maximum_power", Activity.max_power_w, "W", 0),
    )
    records: list[dict[str, Any]] = []
    for record_type, column, unit, digits in record_specs:
        row = db.execute(
            select(
                Activity.id.label("activity_id"),
                Activity.title,
                Activity.started_at,
                column.label("value"),
            )
            .where(*conditions, column.is_not(None))
            .order_by(column.desc(), Activity.started_at.desc())
            .limit(1)
        ).first()
        if row is None:
            continue
        value = _finite_number(row.value, digits)
        if value is None:
            continue
        records.append(
            {
                "type": record_type,
                "activity_id": row.activity_id,
                "title": row.title[:200],
                "started_at": row.started_at.isoformat(),
                "value": value,
                "unit": unit,
            }
        )

    if args.date_from and args.date_to:
        trend_end = args.date_to
        trend_start = args.date_from
        trend_span = max(1, (trend_end - trend_start).days + 1)
    else:
        trend_end = datetime.now(ZoneInfo(timezone_name)).date()
        trend_span = 30
        trend_start = trend_end - timedelta(days=trend_span - 1)
    previous_end = trend_start - timedelta(days=1)
    previous_start = previous_end - timedelta(days=trend_span - 1)
    current_trend = _aggregate(
        db,
        [
            Activity.user_id == owner_user_id,
            Activity.started_at >= _local_midnight(trend_start, timezone_name),
            Activity.started_at < _local_midnight(trend_end + timedelta(days=1), timezone_name),
        ],
    )
    previous_trend = _aggregate(
        db,
        [
            Activity.user_id == owner_user_id,
            Activity.started_at >= _local_midnight(previous_start, timezone_name),
            Activity.started_at < _local_midnight(previous_end + timedelta(days=1), timezone_name),
        ],
    )
    insights = [
        {
            "type": "period_trend",
            "date_from": trend_start.isoformat(),
            "date_to": trend_end.isoformat(),
            "activity_count": current_trend["activity_count"],
            "previous_activity_count": previous_trend["activity_count"],
            "distance_change_percent": _change(
                float(current_trend["distance_m"]), float(previous_trend["distance_m"])
            ),
            "training_load_change_percent": _change(
                float(current_trend["training_load"]), float(previous_trend["training_load"])
            ),
        },
        {
            "type": "heart_rate_coverage",
            "activity_percent": round(heart_rate_count / summary["activity_count"] * 100, 1)
            if summary["activity_count"]
            else 0.0,
        },
        {
            "type": "hydration_coverage",
            "activity_percent": round(hydration_count / summary["activity_count"] * 100, 1)
            if summary["activity_count"]
            else 0.0,
        },
    ]
    return {
        "period": {
            "date_from": args.date_from.isoformat() if args.date_from else None,
            "date_to": args.date_to.isoformat() if args.date_to else None,
            "all_time": args.date_from is None,
        },
        "summary": summary,
        "records": records,
        "insights": insights,
    }


def serialize_tool_result(result: dict[str, Any]) -> str:
    try:
        encoded = json.dumps(
            result,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
            allow_nan=False,
        )
    except (TypeError, ValueError):
        raise McpToolError("tool_failed", "Das Tool-Ergebnis konnte nicht sicher serialisiert werden.") from None
    if len(encoded.encode("utf-8")) > MAX_TOOL_RESULT_BYTES:
        raise McpToolError("result_too_large", "Das Tool-Ergebnis überschreitet die sichere Größenbegrenzung.")
    return encoded


def execute_tool(
    db: Session,
    *,
    owner_user_id: str,
    scopes: tuple[str, ...] | list[str],
    name: str,
    arguments: object,
) -> tuple[dict[str, Any], str]:
    if name not in _TOOLS_BY_NAME or not tool_is_allowed(name, scopes):
        raise McpToolError("tool_unavailable", "Tool nicht verfügbar.")
    if not isinstance(arguments, dict):
        raise McpToolError("invalid_arguments", "Ungültige Tool-Argumente.")
    _argument_budget(arguments)
    try:
        parsed = _ARGUMENT_MODELS[name].model_validate(arguments)
    except ValidationError:
        raise McpToolError("invalid_arguments", "Ungültige Tool-Argumente.") from None

    if name == "list_activities":
        result = _list_activities(db, owner_user_id, parsed)
    elif name == "get_activity_details":
        result = _activity_details(db, owner_user_id, parsed)
    elif name == "get_statistics":
        result = _statistics(db, owner_user_id, parsed)
    else:
        result = _records_and_insights(db, owner_user_id, parsed)
    return result, serialize_tool_result(result)
