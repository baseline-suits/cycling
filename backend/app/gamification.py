from __future__ import annotations

import calendar
import hashlib
import math
import statistics
import unicodedata
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    Activity,
    GamificationActivityDiscovery,
    GamificationBadgeUnlock,
    GamificationChallenge,
    GamificationDiscovery,
    GamificationGoal,
    GamificationYearlyAward,
    User,
    utcnow,
)


SUPPORTED_METRICS = {
    "distance_m",
    "activity_count",
    "elevation_gain_m",
    "moving_time_s",
    "training_load",
    "active_weeks",
    "places_visited",
    "hydration_activity_count",
    "hydration_ml",
    "recovery_gap_count",
    "intensity_variety",
    "weather_activity_count",
    "village_count",
    "city_count",
    "municipality_count",
    "state_count",
    "country_count",
    "longest_ride_m",
    "highest_elevation_m",
    "best_average_speed_mps",
}

METRIC_UNITS = {
    "distance_m": "m",
    "activity_count": "Fahrten",
    "elevation_gain_m": "hm",
    "moving_time_s": "s",
    "training_load": "Belastung",
    "active_weeks": "Wochen",
    "places_visited": "Orte",
    "hydration_activity_count": "Fahrten",
    "hydration_ml": "ml",
    "recovery_gap_count": "Pausen",
    "intensity_variety": "Bereiche",
    "weather_activity_count": "Fahrten",
    "village_count": "Dörfer",
    "city_count": "Städte",
    "municipality_count": "Kommunen",
    "state_count": "Bundesländer",
    "country_count": "Länder",
    "longest_ride_m": "m",
    "highest_elevation_m": "hm",
    "best_average_speed_mps": "m/s",
}

DISCOVERY_KINDS = {"village", "city", "municipality", "state", "country"}


class GamificationUserNotFoundError(LookupError):
    pass


class GamificationActivityNotFoundError(LookupError):
    pass


@dataclass(frozen=True)
class NormalizedDiscovery:
    kind: str
    location_key: str
    name: str
    region: str | None
    country_code: str | None
    latitude: float | None
    longitude: float | None
    details: dict[str, Any]


@dataclass(frozen=True)
class BadgeDefinition:
    key: str
    name: str
    description: str
    category: str
    tier: str
    icon: str
    criterion: str
    target: float
    unit: str
    reward_xp: int


@dataclass
class GamificationSnapshot:
    user: User
    generated_at: datetime
    timezone_name: str
    activities: list[Activity]
    discoveries: list[GamificationDiscovery]
    badge_unlocks: list[GamificationBadgeUnlock]
    goals: list[GamificationGoal]
    challenges: list[GamificationChallenge]
    yearly_awards: list[GamificationYearlyAward]
    streak: dict[str, Any]


BADGE_DEFINITIONS = (
    BadgeDefinition(
        "first_ride",
        "Erste Runde",
        "Die erste aufgezeichnete Aktivität ist geschafft.",
        "Aktivität",
        "bronze",
        "pedal_bike",
        "activity_count",
        1,
        "Fahrt",
        50,
    ),
    BadgeDefinition(
        "ten_rides",
        "Zehnmal unterwegs",
        "Zehn eigene Aktivitäten wurden aufgezeichnet.",
        "Aktivität",
        "silver",
        "route",
        "activity_count",
        10,
        "Fahrten",
        100,
    ),
    BadgeDefinition(
        "distance_100k",
        "Hundert Kilometer",
        "Insgesamt 100 Kilometer aus eigener Kraft dokumentiert.",
        "Distanz",
        "bronze",
        "straighten",
        "distance_m",
        100_000,
        "m",
        100,
    ),
    BadgeDefinition(
        "distance_1000k",
        "Kilometer-Sammler:in",
        "Insgesamt 1.000 Kilometer dokumentiert.",
        "Distanz",
        "gold",
        "map",
        "distance_m",
        1_000_000,
        "m",
        300,
    ),
    BadgeDefinition(
        "long_ride_50k",
        "Lange Runde",
        "Eine einzelne Aktivität über mindestens 50 Kilometer.",
        "Rekord",
        "silver",
        "conversion_path",
        "longest_ride_m",
        50_000,
        "m",
        150,
    ),
    BadgeDefinition(
        "climbing_1000",
        "Höhenluft",
        "Insgesamt 1.000 Höhenmeter gesammelt.",
        "Höhenmeter",
        "bronze",
        "landscape",
        "elevation_gain_m",
        1_000,
        "hm",
        100,
    ),
    BadgeDefinition(
        "weekly_rhythm_4",
        "Vier Wochen im Rhythmus",
        "Vier aktive Wochen mit fairer Pausenregel erreicht.",
        "Gewohnheit",
        "silver",
        "local_fire_department",
        "longest_streak_weeks",
        4,
        "Wochen",
        150,
    ),
    BadgeDefinition(
        "hydration_5",
        "Trinken dokumentiert",
        "Bei fünf Aktivitäten wurde eine Trinkmenge festgehalten.",
        "Gesunde Gewohnheit",
        "bronze",
        "water_drop",
        "hydration_activity_count",
        5,
        "Fahrten",
        75,
    ),
    BadgeDefinition(
        "recovery_rhythm",
        "Pausen im Rhythmus",
        "Mehrfach lagen mindestens 36 Stunden zwischen zwei Aktivitäten.",
        "Gesunde Gewohnheit",
        "silver",
        "bedtime",
        "recovery_gap_count",
        3,
        "Pausen",
        100,
    ),
    BadgeDefinition(
        "intensity_variety",
        "Abwechslungsreich trainiert",
        "Lockere, mittlere und fordernde Belastungsbereiche sind in der eigenen Historie vertreten.",
        "Gesunde Gewohnheit",
        "silver",
        "tune",
        "intensity_variety",
        3,
        "Bereiche",
        125,
    ),
    BadgeDefinition(
        "own_progress",
        "Besser als früher",
        "Das jüngere mittlere Tempo liegt mindestens drei Prozent über dem eigenen früheren Wert.",
        "Persönlicher Fortschritt",
        "gold",
        "trending_up",
        "personal_speed_improvement",
        3,
        "%",
        200,
    ),
    BadgeDefinition(
        "weather_observer",
        "Wetterbeobachter:in",
        "Für fünf Aktivitäten liegen bereits gespeicherte Wetterdaten vor.",
        "Wetter",
        "bronze",
        "partly_cloudy_day",
        "weather_activity_count",
        5,
        "Fahrten",
        75,
    ),
    BadgeDefinition(
        "rain_ride",
        "Regenrunde",
        "Eine Aktivität mit bereits dokumentiertem Niederschlag – ohne Anreiz, bei unsicheren Bedingungen zu fahren.",
        "Wetter",
        "bronze",
        "rainy",
        "rain_activity_count",
        1,
        "Fahrt",
        50,
    ),
    BadgeDefinition(
        "explorer_5",
        "Neugierig unterwegs",
        "Fünf unterschiedliche Orte wurden aus gespeicherten Geodaten erkannt.",
        "Entdeckungen",
        "silver",
        "explore",
        "places_visited",
        5,
        "Orte",
        125,
    ),
    BadgeDefinition(
        "countries_3",
        "Grenzenlos privat",
        "Aktivitäten in drei Ländern wurden in der eigenen Historie erkannt.",
        "Entdeckungen",
        "gold",
        "public",
        "country_count",
        3,
        "Länder",
        250,
    ),
)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None and value.utcoffset() is not None else value.replace(tzinfo=timezone.utc)


def _local_date(value: datetime, timezone_name: str) -> date:
    return _aware(value).astimezone(ZoneInfo(timezone_name)).date()


def _week_start(value: date) -> date:
    return value - timedelta(days=value.weekday())


def _safe_number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def goal_period_bounds(
    period: str,
    today: date,
    starts_at: date | None = None,
    deadline: date | None = None,
) -> tuple[date | None, date | None]:
    """Return deterministic local-calendar bounds for a user-created goal."""

    if period == "lifetime":
        return starts_at, deadline
    if period == "week":
        start = starts_at or _week_start(today)
        return start, deadline or start + timedelta(days=6)
    if period == "month":
        start = starts_at or today.replace(day=1)
        end = date(start.year, start.month, calendar.monthrange(start.year, start.month)[1])
        return start, deadline or end
    if period == "year":
        start = starts_at or date(today.year, 1, 1)
        return start, deadline or date(start.year, 12, 31)
    return starts_at or today, deadline


def _activities_in_bounds(
    activities: Iterable[Activity],
    timezone_name: str,
    starts_on: date | None,
    ends_on: date | None,
) -> list[Activity]:
    return [
        activity
        for activity in activities
        if (starts_on is None or _local_date(activity.started_at, timezone_name) >= starts_on)
        and (ends_on is None or _local_date(activity.started_at, timezone_name) <= ends_on)
    ]


def _discoveries_in_bounds(
    discoveries: Iterable[GamificationDiscovery],
    timezone_name: str,
    starts_on: date | None,
    ends_on: date | None,
) -> list[GamificationDiscovery]:
    return [
        discovery
        for discovery in discoveries
        if (starts_on is None or _local_date(discovery.first_discovered_at, timezone_name) >= starts_on)
        and (ends_on is None or _local_date(discovery.first_discovered_at, timezone_name) <= ends_on)
    ]


def _weather_available(activity: Activity) -> bool:
    return isinstance(activity.weather, dict) and bool(activity.weather)


def _weather_values(payload: Any, keys: set[str]) -> list[float]:
    values: list[float] = []
    if isinstance(payload, Mapping):
        for key, value in payload.items():
            if str(key).lower() in keys:
                if isinstance(value, list):
                    values.extend(_safe_number(item) for item in value)
                else:
                    values.append(_safe_number(value))
            elif isinstance(value, (Mapping, list)):
                values.extend(_weather_values(value, keys))
    elif isinstance(payload, list):
        for item in payload:
            values.extend(_weather_values(item, keys))
    return values


def _rain_activity(activity: Activity) -> bool:
    if not _weather_available(activity):
        return False
    rain_keys = {"precipitation", "precipitation_mm", "rain", "rain_mm", "showers", "snowfall"}
    return any(value > 0 for value in _weather_values(activity.weather, rain_keys))


def _intensity_bucket(activity: Activity, hr_max: int) -> str | None:
    hours = max(_safe_number(activity.moving_time_s), 0) / 3600
    load = max(_safe_number(activity.training_load), 0)
    if hours > 0 and load > 0:
        load_per_hour = load / hours
        if load_per_hour < 35:
            return "easy"
        if load_per_hour < 70:
            return "moderate"
        return "hard"
    if activity.avg_hr_bpm and hr_max > 0:
        ratio = _safe_number(activity.avg_hr_bpm) / hr_max
        if ratio < 0.68:
            return "easy"
        if ratio < 0.82:
            return "moderate"
        return "hard"
    return None


def _recovery_gap_count(activities: Iterable[Activity]) -> int:
    ordered = sorted((_aware(activity.started_at) for activity in activities))
    return sum(1 for previous, current in zip(ordered, ordered[1:]) if timedelta(hours=36) <= current - previous <= timedelta(days=14))


def _personal_speed_comparison(activities: Iterable[Activity]) -> tuple[float, float, float]:
    speeds = [_safe_number(activity.avg_speed_mps) for activity in activities if _safe_number(activity.avg_speed_mps) > 0]
    if len(speeds) < 6:
        return 0.0, 0.0, 0.0
    midpoint = len(speeds) // 2
    earlier = statistics.median(speeds[:midpoint])
    recent = statistics.median(speeds[midpoint:])
    improvement = ((recent / earlier) - 1) * 100 if earlier > 0 else 0.0
    return earlier, recent, improvement


def metric_value(
    metric: str,
    activities: Iterable[Activity],
    discoveries: Iterable[GamificationDiscovery],
    timezone_name: str,
    starts_on: date | None = None,
    ends_on: date | None = None,
    hr_max: int = 190,
) -> float:
    """Calculate one metric from local, already persisted user data only."""

    items = _activities_in_bounds(activities, timezone_name, starts_on, ends_on)
    places = _discoveries_in_bounds(discoveries, timezone_name, starts_on, ends_on)
    if metric == "activity_count":
        return float(len(items))
    if metric in {"distance_m", "elevation_gain_m", "moving_time_s", "training_load"}:
        return sum(max(_safe_number(getattr(activity, metric)), 0) for activity in items)
    if metric == "active_weeks":
        return float(len({_week_start(_local_date(activity.started_at, timezone_name)) for activity in items}))
    if metric == "places_visited":
        return float(len(places))
    if metric == "hydration_activity_count":
        return float(sum(1 for activity in items if activity.hydration_ml is not None))
    if metric == "hydration_ml":
        return sum(max(float(activity.hydration_ml or 0), 0) for activity in items)
    if metric == "recovery_gap_count":
        return float(_recovery_gap_count(items))
    if metric == "intensity_variety":
        return float(len({bucket for activity in items if (bucket := _intensity_bucket(activity, hr_max))}))
    if metric == "weather_activity_count":
        return float(sum(1 for activity in items if _weather_available(activity)))
    if metric == "village_count":
        return float(sum(1 for discovery in places if discovery.kind == "village"))
    if metric == "city_count":
        return float(sum(1 for discovery in places if discovery.kind == "city"))
    if metric == "municipality_count":
        return float(sum(1 for discovery in places if discovery.kind in {"city", "municipality"}))
    if metric == "state_count":
        return float(sum(1 for discovery in places if discovery.kind == "state"))
    if metric == "country_count":
        return float(sum(1 for discovery in places if discovery.kind == "country"))
    if metric == "longest_ride_m":
        return max((max(_safe_number(activity.distance_m), 0) for activity in items), default=0.0)
    if metric == "highest_elevation_m":
        return max((max(_safe_number(activity.elevation_gain_m), 0) for activity in items), default=0.0)
    if metric == "best_average_speed_mps":
        return max((max(_safe_number(activity.avg_speed_mps), 0) for activity in items), default=0.0)
    raise ValueError(f"Nicht unterstützte Gamification-Metrik: {metric}")


def weekly_streak(
    activities: Iterable[Activity],
    timezone_name: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Calculate a weekly streak with one completed pause week per streak."""

    generated_at = _aware(now or utcnow())
    today = generated_at.astimezone(ZoneInfo(timezone_name)).date()
    current_week = _week_start(today)
    counts: dict[date, int] = defaultdict(int)
    for activity in activities:
        week = _week_start(_local_date(activity.started_at, timezone_name))
        if week <= current_week:
            counts[week] += 1
    weeks = sorted(counts)
    if not weeks:
        next_local = datetime.combine(current_week + timedelta(days=7), time.min, ZoneInfo(timezone_name))
        return {
            "current_weeks": 0,
            "best_weeks": 0,
            "weekly_target": 1,
            "current_week_progress": 0,
            "pause_protection_available": True,
            "pause_protection_active": False,
            "protected_until": None,
            "next_check_at": next_local.astimezone(timezone.utc),
            "active_week_starts": [],
            "method": "Eine Aktivität pro Kalenderwoche; die laufende Woche bricht nichts und eine abgeschlossene Pausenwoche ist pro Serie geschützt.",
        }

    segments: list[tuple[list[date], bool]] = []
    segment = [weeks[0]]
    pause_used = False
    for week in weeks[1:]:
        gap = (week - segment[-1]).days // 7
        if gap == 1:
            segment.append(week)
        elif gap == 2 and not pause_used:
            segment.append(week)
            pause_used = True
        else:
            segments.append((segment, pause_used))
            segment = [week]
            pause_used = False
    segments.append((segment, pause_used))
    best = max(len(item[0]) for item in segments)
    latest_weeks, latest_pause_used = segments[-1]
    last_week = latest_weeks[-1]
    distance_to_current = (current_week - last_week).days // 7
    pause_active = False
    protected_until: date | None = None
    if distance_to_current == 0:
        current = len(latest_weeks)
    elif distance_to_current == 1:
        current = len(latest_weeks)
    elif distance_to_current == 2 and not latest_pause_used:
        current = len(latest_weeks)
        latest_pause_used = True
        pause_active = True
        protected_until = current_week + timedelta(days=6)
    else:
        current = 0
    next_local = datetime.combine(current_week + timedelta(days=7), time.min, ZoneInfo(timezone_name))
    return {
        "current_weeks": current,
        "best_weeks": best,
        "weekly_target": 1,
        "current_week_progress": counts.get(current_week, 0),
        "pause_protection_available": current > 0 and not latest_pause_used,
        "pause_protection_active": pause_active,
        "protected_until": protected_until,
        "next_check_at": next_local.astimezone(timezone.utc),
        "active_week_starts": weeks,
        "method": "Eine Aktivität pro Kalenderwoche; die laufende Woche bricht nichts und eine abgeschlossene Pausenwoche ist pro Serie geschützt.",
    }


_DISCOVERY_KIND_ALIASES = {
    "village": "village",
    "hamlet": "village",
    "dorf": "village",
    "city": "city",
    "town": "city",
    "stadt": "city",
    "municipality": "municipality",
    "municipal": "municipality",
    "commune": "municipality",
    "community": "municipality",
    "gemeinde": "municipality",
    "kommune": "municipality",
    "state": "state",
    "province": "state",
    "federal_state": "state",
    "bundesland": "state",
    "country": "country",
    "land": "country",
}

_DISCOVERY_CONTAINER_KEYS = {
    "address",
    "discoveries",
    "geography",
    "geography_data",
    "location",
    "locations",
    "place",
    "places",
    "route_geography",
    "route_locations",
    "route_places",
    "start_location",
    "end_location",
}


def _kind_alias(value: Any) -> str | None:
    if value is None:
        return None
    return _DISCOVERY_KIND_ALIASES.get(str(value).strip().lower().replace("-", "_"))


def _text_value(value: Any) -> str | None:
    if isinstance(value, str):
        normalized = " ".join(value.split())
        return normalized or None
    if isinstance(value, Mapping):
        for key in ("name", "label", "display_name", "value"):
            if text := _text_value(value.get(key)):
                return text
    return None


def _coordinate(value: Any, minimum: float, maximum: float) -> float | None:
    if value is None:
        return None
    number = _safe_number(value, math.nan)
    return number if math.isfinite(number) and minimum <= number <= maximum else None


def _location_key(
    kind: str,
    name: str,
    region: str | None,
    country_code: str | None,
    external_id: str | None,
) -> str:
    identity = external_id or "|".join(filter(None, (country_code, region, name)))
    canonical = unicodedata.normalize("NFKC", identity).casefold().strip()
    return f"{kind}:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"


def _normalized_discovery(
    kind: str,
    name: str,
    payload: Mapping[str, Any],
    inherited_region: str | None,
    inherited_country_code: str | None,
) -> NormalizedDiscovery | None:
    normalized_name = " ".join(name.split())[:200]
    if not normalized_name:
        return None
    region = _text_value(payload.get("region")) or _text_value(payload.get("state")) or inherited_region
    if region == normalized_name:
        region = inherited_region
    country_code_value = payload.get("country_code") or payload.get("countryCode") or inherited_country_code
    country_code = str(country_code_value).strip().upper()[:3] if country_code_value else None
    latitude = _coordinate(payload.get("latitude", payload.get("lat")), -90, 90)
    longitude = _coordinate(payload.get("longitude", payload.get("lon", payload.get("lng"))), -180, 180)
    external_id: str | None = None
    for key in ("osm_id", "geoname_id", "wikidata_id", "place_id", "external_id"):
        if payload.get(key) is not None:
            external_id = f"{key}:{payload[key]}"
            break
    details = dict(payload.get("metadata")) if isinstance(payload.get("metadata"), Mapping) else {}
    if provider := _text_value(payload.get("provider")):
        details["provider"] = provider
    if attribution := _text_value(payload.get("attribution")):
        details["attribution"] = attribution
    if external_id:
        details["external_id"] = external_id
    return NormalizedDiscovery(
        kind=kind,
        location_key=_location_key(kind, normalized_name, region, country_code, external_id),
        name=normalized_name,
        region=region[:200] if region else None,
        country_code=country_code,
        latitude=latitude,
        longitude=longitude,
        details=details,
    )


def normalize_discoveries(payload: Any) -> list[NormalizedDiscovery]:
    """Normalize cached provider payloads without performing network requests."""

    found: dict[tuple[str, str], NormalizedDiscovery] = {}

    def visit(
        node: Any,
        kind_hint: str | None = None,
        inherited_region: str | None = None,
        inherited_country_code: str | None = None,
        depth: int = 0,
    ) -> None:
        if depth > 8 or node is None:
            return
        if isinstance(node, str):
            if kind_hint:
                item = _normalized_discovery(kind_hint, node, {}, inherited_region, inherited_country_code)
                if item:
                    found[(item.kind, item.location_key)] = item
            return
        if isinstance(node, list):
            for item in node:
                visit(item, kind_hint, inherited_region, inherited_country_code, depth + 1)
            return
        if not isinstance(node, Mapping):
            return

        region = _text_value(node.get("region")) or _text_value(node.get("state")) or inherited_region
        country_code_value = node.get("country_code") or node.get("countryCode") or inherited_country_code
        country_code = str(country_code_value).strip().upper()[:3] if country_code_value else None
        explicit_kind = _kind_alias(
            node.get("kind") or node.get("type") or node.get("place_type") or node.get("scope") or node.get("level")
        )
        name = _text_value(node.get("name")) or _text_value(node.get("label")) or _text_value(node.get("display_name"))
        effective_kind = explicit_kind or kind_hint
        if effective_kind and name:
            item = _normalized_discovery(effective_kind, name, node, region, country_code)
            if item:
                found[(item.kind, item.location_key)] = item

        for raw_key, value in node.items():
            key = str(raw_key).strip().lower().replace("-", "_")
            aliased_kind = _kind_alias(key)
            if aliased_kind:
                if isinstance(value, str):
                    item = _normalized_discovery(aliased_kind, value, node, region, country_code)
                    if item:
                        found[(item.kind, item.location_key)] = item
                else:
                    visit(value, aliased_kind, region, country_code, depth + 1)
            elif key in _DISCOVERY_CONTAINER_KEYS:
                visit(value, None, region, country_code, depth + 1)

    visit(payload)
    return list(found.values())


def extract_activity_discoveries(activity: Activity) -> list[NormalizedDiscovery]:
    """Read only geography that is already attached to an activity or its cached weather."""

    payloads: list[Any] = []
    for attribute in (
        "discoveries",
        "geography",
        "geography_data",
        "location",
        "locations",
        "places",
        "route_geography",
        "route_places",
    ):
        value = getattr(activity, attribute, None)
        if value:
            payloads.append(value)
    if isinstance(activity.weather, Mapping):
        for key in _DISCOVERY_CONTAINER_KEYS:
            if activity.weather.get(key):
                payloads.append(activity.weather[key])
    for point in activity.track_points or []:
        if not isinstance(point, Mapping):
            continue
        for key in _DISCOVERY_CONTAINER_KEYS:
            if point.get(key):
                payloads.append(point[key])

    unique: dict[tuple[str, str], NormalizedDiscovery] = {}
    for payload in payloads:
        for item in normalize_discoveries(payload):
            unique[(item.kind, item.location_key)] = item
    return list(unique.values())


def _upsert_discovery(
    db: Session,
    user_id: str,
    normalized: NormalizedDiscovery,
    existing: dict[tuple[str, str], GamificationDiscovery],
    first_activity: Activity,
) -> GamificationDiscovery:
    key = (normalized.kind, normalized.location_key)
    discovery = existing.get(key)
    if discovery is None:
        discovery = GamificationDiscovery(
            user_id=user_id,
            kind=normalized.kind,
            location_key=normalized.location_key,
            name=normalized.name,
            region=normalized.region,
            country_code=normalized.country_code,
            latitude=normalized.latitude,
            longitude=normalized.longitude,
            first_discovered_at=first_activity.started_at,
            first_activity_id=first_activity.id,
            details=normalized.details,
        )
        db.add(discovery)
        db.flush()
        existing[key] = discovery
        return discovery
    for attribute in ("name", "region", "country_code", "latitude", "longitude", "details"):
        value = getattr(normalized, attribute)
        if value is not None and getattr(discovery, attribute) != value:
            setattr(discovery, attribute, value)
    return discovery


def _reconcile_discovery_first_seen(db: Session, user_id: str) -> list[GamificationDiscovery]:
    discoveries = list(
        db.scalars(
            select(GamificationDiscovery)
            .where(GamificationDiscovery.user_id == user_id)
            .order_by(GamificationDiscovery.first_discovered_at)
        ).all()
    )
    links = list(
        db.scalars(
            select(GamificationActivityDiscovery)
            .where(GamificationActivityDiscovery.user_id == user_id)
            .order_by(GamificationActivityDiscovery.discovered_at, GamificationActivityDiscovery.activity_id)
        ).all()
    )
    by_discovery: dict[str, list[GamificationActivityDiscovery]] = defaultdict(list)
    for link in links:
        by_discovery[link.discovery_id].append(link)
    result: list[GamificationDiscovery] = []
    for discovery in discoveries:
        occurrences = by_discovery.get(discovery.id, [])
        if not occurrences:
            db.delete(discovery)
            continue
        first = occurrences[0]
        discovery.first_discovered_at = first.discovered_at
        discovery.first_activity_id = first.activity_id
        result.append(discovery)
    db.flush()
    return sorted(result, key=lambda item: _aware(item.first_discovered_at))


def _replace_discovery_links(
    db: Session,
    user_id: str,
    activity: Activity,
    normalized_items: Iterable[NormalizedDiscovery],
) -> list[GamificationDiscovery]:
    existing_discoveries = {
        (item.kind, item.location_key): item
        for item in db.scalars(select(GamificationDiscovery).where(GamificationDiscovery.user_id == user_id)).all()
    }
    desired_discoveries: dict[str, GamificationDiscovery] = {}
    for normalized in normalized_items:
        discovery = _upsert_discovery(db, user_id, normalized, existing_discoveries, activity)
        desired_discoveries[discovery.id] = discovery
    existing_links = list(
        db.scalars(
            select(GamificationActivityDiscovery).where(
                GamificationActivityDiscovery.user_id == user_id,
                GamificationActivityDiscovery.activity_id == activity.id,
            )
        ).all()
    )
    links_by_discovery = {link.discovery_id: link for link in existing_links}
    for discovery_id, link in links_by_discovery.items():
        if discovery_id not in desired_discoveries:
            db.delete(link)
    for discovery_id in desired_discoveries:
        if discovery_id not in links_by_discovery:
            db.add(
                GamificationActivityDiscovery(
                    user_id=user_id,
                    activity_id=activity.id,
                    discovery_id=discovery_id,
                    discovered_at=activity.started_at,
                )
            )
        elif links_by_discovery[discovery_id].discovered_at != activity.started_at:
            links_by_discovery[discovery_id].discovered_at = activity.started_at
    db.flush()
    _reconcile_discovery_first_seen(db, user_id)
    return list(desired_discoveries.values())


def replace_activity_discoveries(
    db: Session,
    user_id: str,
    activity_id: str,
    discoveries: Iterable[Mapping[str, Any]] | Mapping[str, Any] | None = None,
) -> list[GamificationDiscovery]:
    """Idempotently replace cached discoveries for one owner-checked activity.

    The function never calls a geocoder and intentionally does not commit. It can
    therefore participate in the upload/reanalysis transaction of the caller.
    """

    activity = db.scalar(select(Activity).where(Activity.id == activity_id, Activity.user_id == user_id))
    if activity is None:
        raise GamificationActivityNotFoundError("Aktivität für diesen Nutzer nicht gefunden.")
    normalized = extract_activity_discoveries(activity) if discoveries is None else normalize_discoveries(discoveries)
    return _replace_discovery_links(db, user_id, activity, normalized)


def _synchronize_discoveries(db: Session, user_id: str, activities: list[Activity]) -> list[GamificationDiscovery]:
    activity_ids = {activity.id for activity in activities}
    for activity in activities:
        _replace_discovery_links(db, user_id, activity, extract_activity_discoveries(activity))
    stale_links = list(
        db.scalars(
            select(GamificationActivityDiscovery).where(GamificationActivityDiscovery.user_id == user_id)
        ).all()
    )
    for link in stale_links:
        if link.activity_id not in activity_ids:
            db.delete(link)
    db.flush()
    return _reconcile_discovery_first_seen(db, user_id)


def _threshold_reached_at(
    metric: str,
    target: float,
    activities: list[Activity],
    discoveries: list[GamificationDiscovery],
    timezone_name: str,
    starts_on: date | None,
    ends_on: date | None,
    hr_max: int,
) -> tuple[datetime, str | None] | None:
    filtered = _activities_in_bounds(activities, timezone_name, starts_on, ends_on)
    if metric in {
        "distance_m",
        "activity_count",
        "elevation_gain_m",
        "moving_time_s",
        "training_load",
        "hydration_activity_count",
        "hydration_ml",
        "weather_activity_count",
    }:
        running = 0.0
        for activity in filtered:
            if metric == "activity_count":
                running += 1
            elif metric == "hydration_activity_count":
                running += int(activity.hydration_ml is not None)
            elif metric == "hydration_ml":
                running += max(float(activity.hydration_ml or 0), 0)
            elif metric == "weather_activity_count":
                running += int(_weather_available(activity))
            else:
                running += max(_safe_number(getattr(activity, metric)), 0)
            if running >= target:
                return _aware(activity.started_at), activity.id
    elif metric == "active_weeks":
        weeks: set[date] = set()
        for activity in filtered:
            weeks.add(_week_start(_local_date(activity.started_at, timezone_name)))
            if len(weeks) >= target:
                return _aware(activity.started_at), activity.id
    elif metric == "recovery_gap_count":
        previous: Activity | None = None
        count = 0
        for activity in filtered:
            if previous and timedelta(hours=36) <= _aware(activity.started_at) - _aware(previous.started_at) <= timedelta(days=14):
                count += 1
                if count >= target:
                    return _aware(activity.started_at), activity.id
            previous = activity
    elif metric == "intensity_variety":
        buckets: set[str] = set()
        for activity in filtered:
            if bucket := _intensity_bucket(activity, hr_max):
                buckets.add(bucket)
            if len(buckets) >= target:
                return _aware(activity.started_at), activity.id
    elif metric in {"longest_ride_m", "highest_elevation_m", "best_average_speed_mps"}:
        attribute = {
            "longest_ride_m": "distance_m",
            "highest_elevation_m": "elevation_gain_m",
            "best_average_speed_mps": "avg_speed_mps",
        }[metric]
        for activity in filtered:
            if max(_safe_number(getattr(activity, attribute)), 0) >= target:
                return _aware(activity.started_at), activity.id
    elif metric in {
        "places_visited",
        "village_count",
        "city_count",
        "municipality_count",
        "state_count",
        "country_count",
    }:
        places = _discoveries_in_bounds(discoveries, timezone_name, starts_on, ends_on)
        count = 0
        for discovery in places:
            matches = (
                metric == "places_visited"
                or (metric == "village_count" and discovery.kind == "village")
                or (metric == "city_count" and discovery.kind == "city")
                or (metric == "municipality_count" and discovery.kind in {"city", "municipality"})
                or (metric == "state_count" and discovery.kind == "state")
                or (metric == "country_count" and discovery.kind == "country")
            )
            if matches:
                count += 1
                if count >= target:
                    return _aware(discovery.first_discovered_at), discovery.first_activity_id
    return None


def _sync_goals(
    db: Session,
    user: User,
    activities: list[Activity],
    discoveries: list[GamificationDiscovery],
    timezone_name: str,
    today: date,
) -> list[GamificationGoal]:
    goals = list(
        db.scalars(
            select(GamificationGoal)
            .where(GamificationGoal.user_id == user.id)
            .order_by(GamificationGoal.created_at)
        ).all()
    )
    for goal in goals:
        if goal.status in {"completed", "paused"}:
            continue
        current = metric_value(
            goal.metric,
            activities,
            discoveries,
            timezone_name,
            goal.starts_on,
            goal.deadline,
            user.hr_max,
        )
        if current >= goal.target_value:
            goal.status = "completed"
            reached = _threshold_reached_at(
                goal.metric,
                goal.target_value,
                activities,
                discoveries,
                timezone_name,
                goal.starts_on,
                goal.deadline,
                user.hr_max,
            )
            goal.completed_at = reached[0] if reached else utcnow()
        elif goal.deadline is not None and goal.deadline < today:
            goal.status = "expired"
    db.flush()
    return goals


def _personalized_challenge_templates(user: User, activities: list[Activity], timezone_name: str) -> list[dict[str, Any]]:
    weekly: dict[date, list[Activity]] = defaultdict(list)
    for activity in activities:
        weekly[_week_start(_local_date(activity.started_at, timezone_name))].append(activity)
    recent_weeks = [weekly[key] for key in sorted(weekly)[-8:]]
    if recent_weeks:
        average_count = statistics.mean(len(items) for items in recent_weeks)
        average_distance = statistics.mean(sum(max(_safe_number(item.distance_m), 0) for item in items) for items in recent_weeks)
        average_elevation = statistics.mean(
            sum(max(_safe_number(item.elevation_gain_m), 0) for item in items) for items in recent_weeks
        )
    else:
        average_count = 1
        average_distance = 10_000
        average_elevation = 100
    routine_target = max(1, min(14, math.ceil(average_count * 1.1)))
    distance_target = max(10_000, min(1_000_000, math.ceil(average_distance * 1.1 / 1000) * 1000))
    elevation_target = max(100, min(50_000, math.ceil(average_elevation * 1.15 / 50) * 50))
    templates: list[dict[str, Any]] = [
        {
            "template_key": "local_weekly_routine_v1",
            "title": "Deine Wochenroutine",
            "description": f"Sammle in sieben Tagen {routine_target} Aktivitäten.",
            "metric": "activity_count",
            "target_value": float(routine_target),
            "duration_days": 7,
            "reward_xp": 100,
            "personalization_reason": "Das Ziel orientiert sich an deinen letzten aktiven Wochen.",
        },
        {
            "template_key": "local_distance_plus_v1",
            "title": "Distanz-Plus",
            "description": f"Sammle in vierzehn Tagen {round(distance_target / 1000)} Kilometer.",
            "metric": "distance_m",
            "target_value": float(distance_target),
            "duration_days": 14,
            "reward_xp": 150,
            "personalization_reason": "Der Zielwert liegt behutsam über deiner persönlichen Wochenhistorie.",
        },
        {
            "template_key": "local_elevation_focus_v1",
            "title": "Höhenmeter-Fokus",
            "description": f"Sammle in vierzehn Tagen {round(elevation_target)} Höhenmeter.",
            "metric": "elevation_gain_m",
            "target_value": float(elevation_target),
            "duration_days": 14,
            "reward_xp": 150,
            "personalization_reason": "Der Zielwert basiert auf deinen eigenen bisherigen Höhenmetern.",
        },
        {
            "template_key": "local_recovery_rhythm_v1",
            "title": "Rhythmus mit Erholung",
            "description": "Plane drei Aktivitätsabstände von mindestens 36 Stunden ein.",
            "metric": "recovery_gap_count",
            "target_value": 3.0,
            "duration_days": 21,
            "reward_xp": 125,
            "personalization_reason": "Regelmäßigkeit und Erholung werden gemeinsam sichtbar gemacht.",
        },
        {
            "template_key": "local_hydration_v1",
            "title": "Trinkroutine dokumentieren",
            "description": "Halte bei drei Aktivitäten deine Trinkmenge fest.",
            "metric": "hydration_activity_count",
            "target_value": 3.0,
            "duration_days": 14,
            "reward_xp": 100,
            "personalization_reason": "Dokumentation macht deine eigene Gewohnheit nachvollziehbar.",
        },
        {
            "template_key": "local_intensity_variety_v1",
            "title": "Abwechslungsreiche Belastung",
            "description": "Dokumentiere Aktivitäten aus drei unterschiedlichen Belastungsbereichen.",
            "metric": "intensity_variety",
            "target_value": 3.0,
            "duration_days": 21,
            "reward_xp": 150,
            "personalization_reason": "Die Challenge betrachtet nur deine eigenen Belastungsdaten.",
        },
    ]
    if any(_weather_available(activity) for activity in activities):
        templates.append(
            {
                "template_key": "local_weather_awareness_v1",
                "title": "Wetter bewusst dokumentieren",
                "description": "Zeichne zwei sichere Aktivitäten mit gespeicherten Wetterdaten auf.",
                "metric": "weather_activity_count",
                "target_value": 2.0,
                "duration_days": 14,
                "reward_xp": 100,
                "personalization_reason": "Die Challenge nutzt ausschließlich bereits gespeicherte Wetterdaten.",
                "weather_sensitive": True,
                "safety_note": "Fahre nur bei Bedingungen, die für dich und deine Ausrüstung sicher sind.",
            }
        )
    return templates


def ensure_personalized_challenges(
    db: Session,
    user: User,
    activities: list[Activity],
    timezone_name: str,
) -> list[GamificationChallenge]:
    """Idempotently maintain deterministic private challenge suggestions."""

    existing = {
        challenge.template_key: challenge
        for challenge in db.scalars(
            select(GamificationChallenge).where(
                GamificationChallenge.user_id == user.id,
                GamificationChallenge.template_key.is_not(None),
            )
        ).all()
    }
    for template in _personalized_challenge_templates(user, activities, timezone_name):
        challenge = existing.get(template["template_key"])
        if challenge is None:
            challenge = GamificationChallenge(user_id=user.id, source="local", status="suggested", **template)
            db.add(challenge)
            existing[template["template_key"]] = challenge
        elif challenge.status == "suggested" and challenge.source == "local":
            for key, value in template.items():
                if getattr(challenge, key) != value:
                    setattr(challenge, key, value)
    db.flush()
    return list(existing.values())


def upsert_challenge_suggestions(
    db: Session,
    user_id: str,
    suggestions: Iterable[Mapping[str, Any]],
) -> list[GamificationChallenge]:
    """Store already generated AI suggestions without containing any AI logic."""

    if db.get(User, user_id) is None:
        raise GamificationUserNotFoundError("Nutzerkonto nicht gefunden.")
    stored: list[GamificationChallenge] = []
    for index, suggestion in enumerate(list(suggestions)[:10]):
        metric = str(suggestion.get("metric", ""))
        target = _safe_number(suggestion.get("target_value"))
        title = " ".join(str(suggestion.get("title", "")).split())[:120]
        if metric not in SUPPORTED_METRICS or target <= 0 or not title:
            continue
        supplied_key = str(suggestion.get("template_key") or suggestion.get("id") or f"{index}:{title}")
        template_key = f"ai:{hashlib.sha256(supplied_key.encode('utf-8')).hexdigest()[:64]}"
        challenge = db.scalar(
            select(GamificationChallenge).where(
                GamificationChallenge.user_id == user_id,
                GamificationChallenge.template_key == template_key,
            )
        )
        values = {
            "title": title,
            "description": " ".join(str(suggestion.get("description", "")).split())[:1000],
            "metric": metric,
            "target_value": min(target, 1_000_000_000_000),
            "duration_days": max(1, min(int(suggestion.get("duration_days", 7)), 366)),
            "reward_xp": max(0, min(int(suggestion.get("reward_xp", 150)), 500)),
            "personalization_reason": " ".join(str(suggestion.get("personalization_reason", "")).split())[:500] or None,
            "weather_sensitive": bool(suggestion.get("weather_sensitive", False)),
            "safety_note": " ".join(str(suggestion.get("safety_note", "")).split())[:500] or None,
        }
        if challenge is None:
            challenge = GamificationChallenge(
                user_id=user_id,
                template_key=template_key,
                source="ai",
                status="suggested",
                **values,
            )
            db.add(challenge)
        elif challenge.status == "suggested":
            for key, value in values.items():
                setattr(challenge, key, value)
        stored.append(challenge)
    db.flush()
    return stored


def _sync_challenges(
    db: Session,
    user: User,
    activities: list[Activity],
    discoveries: list[GamificationDiscovery],
    timezone_name: str,
    today: date,
) -> list[GamificationChallenge]:
    challenges = list(
        db.scalars(
            select(GamificationChallenge)
            .where(GamificationChallenge.user_id == user.id)
            .order_by(GamificationChallenge.created_at)
        ).all()
    )
    for challenge in challenges:
        if challenge.status != "accepted" or challenge.starts_on is None:
            continue
        if challenge.starts_on > today:
            continue
        current = metric_value(
            challenge.metric,
            activities,
            discoveries,
            timezone_name,
            challenge.starts_on,
            challenge.expires_on,
            user.hr_max,
        )
        if current >= challenge.target_value:
            challenge.status = "completed"
            reached = _threshold_reached_at(
                challenge.metric,
                challenge.target_value,
                activities,
                discoveries,
                timezone_name,
                challenge.starts_on,
                challenge.expires_on,
                user.hr_max,
            )
            challenge.completed_at = reached[0] if reached else utcnow()
        elif challenge.expires_on is not None and challenge.expires_on < today:
            challenge.status = "expired"
    db.flush()
    return challenges


LEVEL_NAMES = (
    "Entdecker:in",
    "Rundenfahrer:in",
    "Kilometer-Sammler:in",
    "Höhenmeter-Fan",
    "Ausdauerprofi",
    "Streckenkenner:in",
    "Radabenteurer:in",
    "Tourenmeister:in",
    "Langstreckenprofi",
    "Baseline Cycling-Legende",
)


def activity_xp(activity: Activity) -> int:
    """Return bounded, deterministic XP for one imported activity."""

    distance = min(max(_safe_number(activity.distance_m), 0.0) / 1000.0 * 2.0, 600.0)
    elevation = min(max(_safe_number(activity.elevation_gain_m), 0.0) / 50.0, 250.0)
    moving = min(max(_safe_number(activity.moving_time_s), 0.0) / 3600.0 * 10.0, 150.0)
    return int(round(min(1_000.0, 25.0 + distance + elevation + moving)))


def level_for_xp(total_xp: int, breakdown: Mapping[str, int] | None = None) -> dict[str, Any]:
    safe_xp = max(0, int(total_xp))
    # 250 XP for level 2, 1,000 XP for level 3, etc. This stays motivating
    # without allowing a single very long activity to skip the whole system.
    level = max(1, int(math.sqrt(safe_xp / 250.0)) + 1)
    current_threshold = (level - 1) ** 2 * 250
    next_threshold = level**2 * 250
    span = max(1, next_threshold - current_threshold)
    return {
        "level": level,
        "name": LEVEL_NAMES[min(level - 1, len(LEVEL_NAMES) - 1)],
        "total_xp": safe_xp,
        "current_xp": max(0, safe_xp - current_threshold),
        "next_level_xp": span,
        "progress_percent": round(min(100.0, max(0.0, (safe_xp - current_threshold) / span * 100)), 1),
        "breakdown": dict(breakdown or {}),
    }


def _criterion_value(
    criterion: str,
    activities: list[Activity],
    discoveries: list[GamificationDiscovery],
    user: User,
    streak: Mapping[str, Any],
    timezone_name: str,
) -> float:
    if criterion == "personal_speed_improvement":
        return max(0.0, _personal_speed_comparison(activities)[2])
    if criterion == "rain_activity_count":
        return float(sum(1 for activity in activities if _rain_activity(activity)))
    if criterion == "longest_streak_weeks":
        return float(streak.get("best_weeks") or 0)
    return metric_value(criterion, activities, discoveries, timezone_name, hr_max=user.hr_max)


def sync_badges(
    db: Session,
    user: User,
    activities: list[Activity],
    discoveries: list[GamificationDiscovery],
    streak: Mapping[str, Any],
    timezone_name: str,
) -> list[GamificationBadgeUnlock]:
    """Reconcile unlocks so deleting or changing source data cannot leave stale rewards."""

    existing = {
        unlock.badge_key: unlock
        for unlock in db.scalars(
            select(GamificationBadgeUnlock).where(GamificationBadgeUnlock.user_id == user.id)
        ).all()
    }
    for definition in BADGE_DEFINITIONS:
        if definition.criterion in {"personal_speed_improvement", "rain_activity_count", "longest_streak_weeks"}:
            current = _criterion_value(definition.criterion, activities, discoveries, user, streak, timezone_name)
        else:
            current = metric_value(
                definition.criterion,
                activities,
                discoveries,
                timezone_name,
                hr_max=user.hr_max,
            )
        reached = current >= definition.target
        unlock = existing.get(definition.key)
        if reached and unlock is None:
            reached_at = _threshold_reached_at(
                definition.criterion,
                definition.target,
                activities,
                discoveries,
                timezone_name,
                None,
                None,
                user.hr_max,
            )
            source_activity_id = reached_at[1] if reached_at else (activities[-1].id if activities else None)
            unlock = GamificationBadgeUnlock(
                user_id=user.id,
                badge_key=definition.key,
                unlocked_at=reached_at[0] if reached_at else utcnow(),
                source_activity_id=source_activity_id,
                reward_xp=definition.reward_xp,
            )
            db.add(unlock)
            existing[definition.key] = unlock
        elif not reached and unlock is not None:
            db.delete(unlock)
            existing.pop(definition.key, None)
    db.flush()
    return list(existing.values())


def _record_chases(activities: list[Activity]) -> list[dict[str, Any]]:
    longest = max(activities, key=lambda item: _safe_number(item.distance_m), default=None)
    longest_value = max(_safe_number(longest.distance_m), 0.0) if longest else 0.0
    longest_target = max(100_000.0, math.ceil(max(longest_value, 1.0) / 100_000.0) * 100_000.0)
    if longest_value >= longest_target:
        longest_target += 100_000.0
    speed_activity = max(activities, key=lambda item: _safe_number(item.avg_speed_mps), default=None)
    speed_value = max(_safe_number(speed_activity.avg_speed_mps), 0.0) if speed_activity else 0.0
    speed_target = max(8.0, math.ceil(max(speed_value, 1.0) / 2.0) * 2.0)
    if speed_value >= speed_target:
        speed_target += 2.0
    elevation_activity = max(activities, key=lambda item: _safe_number(item.elevation_gain_m), default=None)
    elevation_value = max(_safe_number(elevation_activity.elevation_gain_m), 0.0) if elevation_activity else 0.0
    elevation_target = max(500.0, math.ceil(max(elevation_value, 1.0) / 500.0) * 500.0)
    if elevation_value >= elevation_target:
        elevation_target += 500.0

    def item(key: str, title: str, description: str, metric: str, current: float, target: float, unit: str, activity: Activity | None) -> dict[str, Any]:
        return {
            "id": key,
            "title": title,
            "description": description,
            "metric": metric,
            "current_value": current,
            "target_value": target,
            "unit": unit,
            "progress_percent": round(min(100.0, current / target * 100) if target else 0.0, 1),
            "activity_id": activity.id if activity else None,
            "achieved": current >= target,
        }

    return [
        item("longest_ride", "Längste Tour", "Die nächste persönliche Distanzmarke.", "distance_m", longest_value, longest_target, "m", longest),
        item("fastest_average", "Höchstes Durchschnittstempo", "Dein eigener Bestwert als nächster kleiner Schritt.", "best_average_speed_mps", speed_value, speed_target, "m/s", speed_activity),
        item("elevation_peak", "Höhenmeter-Marke", "Baue deine nächste persönliche Höhenstufe auf.", "highest_elevation_m", elevation_value, elevation_target, "hm", elevation_activity),
    ]


def _annual_award_definitions(year: int, activities: list[Activity], timezone_name: str) -> list[dict[str, Any]]:
    if not activities:
        return []
    distance = sum(max(_safe_number(item.distance_m), 0) for item in activities)
    elevation = sum(max(_safe_number(item.elevation_gain_m), 0) for item in activities)
    longest = max(activities, key=lambda item: _safe_number(item.distance_m))
    return [
        {"key": "distance", "title": f"Kilometerblick {year}", "description": "Deine Jahresdistanz aus eigenen Aktivitäten.", "value": distance / 1000, "unit": "km", "tier": "personal", "icon": "route", "reward_xp": 100},
        {"key": "elevation", "title": f"Höhenjahr {year}", "description": "Die gesammelten Höhenmeter dieses Jahres.", "value": elevation, "unit": "hm", "tier": "personal", "icon": "landscape", "reward_xp": 100},
        {"key": "longest_ride", "title": f"Weitblick {year}", "description": "Deine längste einzelne Tour des Jahres.", "value": max(_safe_number(longest.distance_m), 0) / 1000, "unit": "km", "tier": "personal", "icon": "conversion_path", "reward_xp": 125},
        {"key": "consistency", "title": f"Rhythmus {year}", "description": "Die Zahl deiner aktiven Kalenderwochen.", "value": len({_week_start(_local_date(item.started_at, timezone_name)) for item in activities}), "unit": "Wochen", "tier": "personal", "icon": "calendar_month", "reward_xp": 100},
    ]


def sync_yearly_awards(db: Session, user: User, activities: list[Activity], timezone_name: str, today: date) -> list[GamificationYearlyAward]:
    grouped: dict[int, list[Activity]] = defaultdict(list)
    for activity in activities:
        grouped[_local_date(activity.started_at, timezone_name).year].append(activity)
    existing = {
        (award.year, award.award_key): award
        for award in db.scalars(select(GamificationYearlyAward).where(GamificationYearlyAward.user_id == user.id)).all()
    }
    for year, year_activities in grouped.items():
        for definition in _annual_award_definitions(year, year_activities, timezone_name):
            key = (year, definition["key"])
            award = existing.get(key)
            if award is None:
                award_values = dict(definition)
                award_values["award_key"] = award_values.pop("key")
                award = GamificationYearlyAward(
                    user_id=user.id,
                    year=year,
                    award_key=definition["key"],
                    is_final=year < today.year,
                    earned_at=utcnow(),
                    **{key: value for key, value in award_values.items() if key != "award_key"},
                )
                db.add(award)
                existing[key] = award
            else:
                for field, value in definition.items():
                    setattr(award, field, value)
                award.is_final = year < today.year
                award.earned_at = award.earned_at or utcnow()
    db.flush()
    return sorted(existing.values(), key=lambda item: (item.year, item.award_key), reverse=True)


def _sync_all(
    db: Session,
    user: User,
    activities: list[Activity],
    timezone_name: str,
    today: date,
) -> GamificationSnapshot:
    discoveries = _synchronize_discoveries(db, user.id, activities)
    ensure_personalized_challenges(db, user, activities, timezone_name)
    goals = _sync_goals(db, user, activities, discoveries, timezone_name, today)
    challenges = _sync_challenges(db, user, activities, discoveries, timezone_name, today)
    streak = weekly_streak(activities, timezone_name)
    badges = sync_badges(db, user, activities, discoveries, streak, timezone_name)
    awards = sync_yearly_awards(db, user, activities, timezone_name, today)
    return GamificationSnapshot(
        user=user,
        generated_at=utcnow(),
        timezone_name=timezone_name,
        activities=activities,
        discoveries=discoveries,
        badge_unlocks=badges,
        goals=goals,
        challenges=challenges,
        yearly_awards=awards,
        streak=streak,
    )


def build_snapshot(db: Session, user: User, timezone_name: str = "Europe/Berlin", today: date | None = None) -> GamificationSnapshot:
    activities = list(
        db.scalars(select(Activity).where(Activity.user_id == user.id).order_by(Activity.started_at)).all()
    )
    return _sync_all(db, user, activities, timezone_name, today or datetime.now(ZoneInfo(timezone_name)).date())


def badge_payloads(snapshot: GamificationSnapshot) -> list[dict[str, Any]]:
    unlocks = {item.badge_key: item for item in snapshot.badge_unlocks}
    payloads: list[dict[str, Any]] = []
    for definition in BADGE_DEFINITIONS:
        if definition.criterion in {"personal_speed_improvement", "rain_activity_count", "longest_streak_weeks"}:
            current = _criterion_value(
                definition.criterion,
                snapshot.activities,
                snapshot.discoveries,
                snapshot.user,
                snapshot.streak,
                snapshot.timezone_name,
            )
        else:
            current = metric_value(definition.criterion, snapshot.activities, snapshot.discoveries, snapshot.timezone_name, hr_max=snapshot.user.hr_max)
        unlock = unlocks.get(definition.key)
        payloads.append({
            "id": unlock.id if unlock else definition.key,
            "key": definition.key,
            "name": definition.name,
            "description": definition.description,
            "category": definition.category,
            "tier": definition.tier,
            "icon": definition.icon,
            "reward_xp": definition.reward_xp,
            "unlocked": unlock is not None,
            "unlocked_at": unlock.unlocked_at if unlock else None,
            "source_activity_id": unlock.source_activity_id if unlock else None,
            "current_value": current,
            "target_value": definition.target,
            "unit": definition.unit,
            "progress_percent": min(100.0, current / definition.target * 100) if definition.target else 0.0,
        })
    return payloads


def goal_payload(goal: GamificationGoal, snapshot: GamificationSnapshot) -> dict[str, Any]:
    current = metric_value(goal.metric, snapshot.activities, snapshot.discoveries, snapshot.timezone_name, goal.starts_on, goal.deadline, snapshot.user.hr_max)
    return {
        "id": goal.id, "title": goal.title, "description": goal.description, "metric": goal.metric,
        "current_value": current, "target_value": goal.target_value, "unit": METRIC_UNITS.get(goal.metric, ""),
        "period": goal.period, "progress_percent": min(100.0, current / goal.target_value * 100),
        "remaining_value": max(0.0, goal.target_value - current), "status": goal.status,
        "starts_at": goal.starts_on, "deadline": goal.deadline, "completed_at": goal.completed_at,
        "reward_xp": goal.reward_xp, "created_at": goal.created_at, "updated_at": goal.updated_at,
    }


def challenge_payload(challenge: GamificationChallenge, snapshot: GamificationSnapshot) -> dict[str, Any]:
    current = metric_value(challenge.metric, snapshot.activities, snapshot.discoveries, snapshot.timezone_name, challenge.starts_on, challenge.expires_on, snapshot.user.hr_max) if challenge.status in {"accepted", "completed", "expired"} else 0.0
    return {
        "id": challenge.id, "title": challenge.title, "description": challenge.description, "metric": challenge.metric,
        "current_value": current, "target_value": challenge.target_value, "unit": METRIC_UNITS.get(challenge.metric, ""),
        "progress_percent": min(100.0, current / challenge.target_value * 100), "remaining_value": max(0.0, challenge.target_value - current),
        "duration_days": challenge.duration_days, "reward_xp": challenge.reward_xp, "status": challenge.status,
        "source": challenge.source, "ai_generated": challenge.source == "ai", "personalization_reason": challenge.personalization_reason,
        "weather_sensitive": challenge.weather_sensitive, "safety_note": challenge.safety_note, "starts_at": challenge.starts_on,
        "expires_at": challenge.expires_on, "accepted_at": challenge.accepted_at, "completed_at": challenge.completed_at,
        "created_at": challenge.created_at, "updated_at": challenge.updated_at,
    }


def discovery_summary_payload(discoveries: list[GamificationDiscovery]) -> list[dict[str, Any]]:
    labels = {"village": "Dörfer", "city": "Städte", "municipality": "Kommunen", "state": "Bundesländer", "country": "Länder"}
    grouped: dict[str, list[GamificationDiscovery]] = defaultdict(list)
    for discovery in discoveries:
        grouped[discovery.kind].append(discovery)

    def unique_items(items: Iterable[GamificationDiscovery]) -> list[GamificationDiscovery]:
        """Collapse legacy/provider duplicates before exposing counts and names."""
        unique: dict[tuple[str, str, str], GamificationDiscovery] = {}
        for item in items:
            name = " ".join(item.name.split()).casefold()
            # A country is identified by its name/code, not by an incidental
            # region value returned by one geocoder response.
            context = "" if item.kind == "country" else " ".join((item.region or "").split()).casefold()
            country = "" if item.kind == "country" else (item.country_code or "").casefold()
            key = (name, context, country)
            current = unique.get(key)
            if current is None or item.first_discovered_at < current.first_discovered_at:
                unique[key] = item
        return sorted(unique.values(), key=lambda item: (_aware(item.first_discovered_at), item.name.casefold()))

    # Cities and municipalities are shown together in the UI, while the API
    # keeps both source types intact for future filtering.
    city_items = unique_items(grouped.get("city", []) + grouped.get("municipality", []))
    output: list[dict[str, Any]] = []
    for scope, items, label in (
        ("village", unique_items(grouped.get("village", [])), labels["village"]),
        ("municipality", city_items, "Städte & Kommunen"),
        ("state", unique_items(grouped.get("state", [])), labels["state"]),
        ("country", unique_items(grouped.get("country", [])), labels["country"]),
    ):
        output.append({"scope": scope, "label": label, "count": len(items), "total_available": None, "progress_percent": None, "places": [item.name for item in items]})
    return output


def annual_award_payloads(snapshot: GamificationSnapshot) -> list[dict[str, Any]]:
    return [{
        "id": award.id, "key": award.award_key, "year": award.year, "title": award.title,
        "description": award.description, "value": award.value, "unit": award.unit, "tier": award.tier,
        "earned": award.earned_at is not None, "earned_at": award.earned_at, "icon": award.icon,
        "reward_xp": award.reward_xp, "is_final": award.is_final,
    } for award in snapshot.yearly_awards]


def total_xp(snapshot: GamificationSnapshot) -> tuple[int, dict[str, int]]:
    activity = sum(activity_xp(item) for item in snapshot.activities)
    badges = sum(max(0, int(item.reward_xp)) for item in snapshot.badge_unlocks)
    goals = sum(max(0, int(item.reward_xp)) for item in snapshot.goals if item.status == "completed")
    challenges = sum(max(0, int(item.reward_xp)) for item in snapshot.challenges if item.status == "completed")
    awards = sum(max(0, int(item.reward_xp)) for item in snapshot.yearly_awards if item.earned_at is not None)
    breakdown = {"activities": activity, "badges": badges, "goals": goals, "challenges": challenges, "awards": awards}
    return sum(breakdown.values()), breakdown
