from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping, MutableMapping
from dataclasses import dataclass
from hashlib import sha256
import logging
from math import asin, cos, isfinite, radians, sin, sqrt
import re
from threading import Lock
import time
from typing import Any, Protocol, TypedDict
from urllib.parse import urlsplit, urlunsplit
import unicodedata

import httpx


DEFAULT_MAXIMUM_SAMPLES = 8
MAXIMUM_REVERSE_GEOCODING_SAMPLES = 12
DEFAULT_MINIMUM_SPACING_M = 1_500.0
DEFAULT_COORDINATE_PRECISION = 4
DEFAULT_TIMEOUT_SECONDS = 3.0
MAXIMUM_TIMEOUT_SECONDS = 10.0
DEFAULT_USER_AGENT = "Baseline Cycling/0.1 (route reverse geocoding)"
DEFAULT_OSM_ATTRIBUTION = "© OpenStreetMap contributors"
NORMAL_REQUEST_INTERVAL_SECONDS = 1.0
BACKFILL_REQUEST_INTERVAL_SECONDS = 15.0
LOCATIONIQ_REQUEST_INTERVAL_SECONDS = 0.5
LOCATIONIQ_DEFAULT_BASE_URL = "https://eu1.locationiq.com/v1"
LOCATIONIQ_ATTRIBUTION = "Search by LocationIQ.com"
LOCATIONIQ_ATTRIBUTION_URL = "https://locationiq.com/attribution"

_ADDRESS_FIELDS = (
    "village",
    "hamlet",
    "isolated_dwelling",
    "city",
    "town",
    "municipality",
    "state",
    "region",
    "country",
    "country_code",
)
_PLACE_TYPE_ORDER = ("village", "city", "municipality", "state", "country")
_GENERIC_USER_AGENTS = {
    "curl",
    "httpx",
    "python-httpx",
    "python-requests",
    "requests",
}


class _SensitiveQueryFilter(logging.Filter):
    _key_pattern = re.compile(r"([?&]key=)[^&\s\"']+", re.IGNORECASE)

    def filter(self, record: logging.LogRecord) -> bool:
        if record.args:
            args = record.args if isinstance(record.args, tuple) else (record.args,)
            record.args = tuple(
                self._key_pattern.sub(r"\1[redacted]", str(value)) if "key=" in str(value).casefold() else value
                for value in args
            )
        if isinstance(record.msg, str) and "key=" in record.msg.casefold():
            record.msg = self._key_pattern.sub(r"\1[redacted]", record.msg)
        return True


logging.getLogger("httpx").addFilter(_SensitiveQueryFilter())


class PlaceRecord(TypedDict):
    place_type: str
    name: str
    region: str | None
    country: str | None
    country_code: str | None
    provider: str
    attribution: str | None


class ReverseGeocodingCache(Protocol):
    """Small cache interface; implementations may persist entries externally."""

    def get(self, key: str) -> Mapping[str, Any] | None:
        ...

    def set(self, key: str, value: Mapping[str, Any]) -> None:
        ...


class ReverseGeocodingError(RuntimeError):
    """A sanitized reverse-geocoding failure safe for logs and API responses."""


class ReverseGeocodingConfigurationError(ReverseGeocodingError):
    pass


class ReverseGeocodingTemporaryError(ReverseGeocodingError):
    pass


class ReverseGeocodingRateLimitError(ReverseGeocodingTemporaryError):
    def __init__(self, retry_after_seconds: int | None = None) -> None:
        super().__init__("Das Geocoding-Kontingent ist vorübergehend ausgeschöpft.")
        self.retry_after_seconds = retry_after_seconds


class RequestRateLimiter:
    """Serialize requests and enforce a minimum interval between their starts."""

    def __init__(
        self,
        minimum_interval_seconds: float = NORMAL_REQUEST_INTERVAL_SECONDS,
        *,
        clock: Callable[[], float] | None = None,
        sleeper: Callable[[float], None] | None = None,
    ) -> None:
        self.minimum_interval_seconds = max(0.0, float(minimum_interval_seconds))
        self._clock = clock or time.monotonic
        self._sleeper = sleeper or time.sleep
        self._lock = Lock()
        self._last_started_at: float | None = None

    def run(
        self,
        request: Callable[[], Any],
        *,
        minimum_interval_seconds: float | None = None,
    ) -> Any:
        interval = max(
            self.minimum_interval_seconds,
            float(minimum_interval_seconds or self.minimum_interval_seconds),
        )
        with self._lock:
            now = self._clock()
            if self._last_started_at is not None:
                remaining = interval - (now - self._last_started_at)
                if remaining > 0:
                    self._sleeper(remaining)
            self._last_started_at = self._clock()
            return request()


_RATE_LIMITERS: dict[str, RequestRateLimiter] = {}
_RATE_LIMITERS_LOCK = Lock()


def _shared_rate_limiter(base_url: str, minimum_interval_seconds: float = NORMAL_REQUEST_INTERVAL_SECONDS) -> RequestRateLimiter:
    with _RATE_LIMITERS_LOCK:
        return _RATE_LIMITERS.setdefault(base_url, RequestRateLimiter(minimum_interval_seconds))


def _finite_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) else None


def _normalize_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = unicodedata.normalize("NFC", " ".join(value.split())).strip(" ,;\t\r\n")
    return normalized or None


def _normalize_country_code(value: Any) -> str | None:
    normalized = _normalize_text(value)
    if normalized is None:
        return None
    code = normalized.upper()
    return code if len(code) == 2 and code.isalpha() else None


def _haversine_m(latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float) -> float:
    earth_radius_m = 6_371_000.0
    latitude_delta = radians(latitude_b - latitude_a)
    longitude_delta = radians(longitude_b - longitude_a)
    start_latitude = radians(latitude_a)
    end_latitude = radians(latitude_b)
    haversine = (
        sin(latitude_delta / 2) ** 2
        + cos(start_latitude) * cos(end_latitude) * sin(longitude_delta / 2) ** 2
    )
    return earth_radius_m * 2 * asin(min(1.0, sqrt(haversine)))


@dataclass(frozen=True)
class _TrackCoordinate:
    point_index: int
    latitude: float
    longitude: float
    distance_m: float | None


def _valid_track_coordinates(track_points: Iterable[Mapping[str, Any]]) -> list[_TrackCoordinate]:
    coordinates: list[_TrackCoordinate] = []
    for point_index, point in enumerate(track_points):
        if not isinstance(point, Mapping):
            continue
        latitude = _finite_number(point.get("latitude"))
        longitude = _finite_number(point.get("longitude"))
        if latitude is None or longitude is None or not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            continue
        coordinates.append(
            _TrackCoordinate(
                point_index=point_index,
                latitude=latitude,
                longitude=longitude,
                distance_m=_finite_number(point.get("distance_m")),
            )
        )
    return coordinates


def _route_axis(coordinates: list[_TrackCoordinate]) -> list[float]:
    recorded = [coordinate.distance_m for coordinate in coordinates]
    if (
        recorded
        and all(value is not None for value in recorded)
        and all(float(current) >= float(previous) for previous, current in zip(recorded, recorded[1:]))
        and float(recorded[-1] or 0) > float(recorded[0] or 0)
    ):
        start = float(recorded[0] or 0)
        return [float(value or 0) - start for value in recorded]

    axis = [0.0]
    for previous, current in zip(coordinates, coordinates[1:]):
        axis.append(
            axis[-1]
            + _haversine_m(
                previous.latitude,
                previous.longitude,
                current.latitude,
                current.longitude,
            )
        )
    return axis


def _sample_positions(
    coordinates: list[_TrackCoordinate],
    axis: list[float],
    count: int,
    coordinate_precision: int,
) -> list[int]:
    if count <= 0:
        return []
    if count == 1:
        targets = [axis[-1] / 2]
    else:
        targets = [axis[-1] * sample_index / (count - 1) for sample_index in range(count)]

    selected: list[int] = []
    selected_coordinates: set[tuple[float, float]] = set()
    for target in targets:
        ranked = sorted(range(len(axis)), key=lambda index: (abs(axis[index] - target), index))
        for position in ranked:
            coordinate = coordinates[position]
            key = (
                round(coordinate.latitude, coordinate_precision),
                round(coordinate.longitude, coordinate_precision),
            )
            if position in selected or key in selected_coordinates:
                continue
            selected.append(position)
            selected_coordinates.add(key)
            break
    return sorted(selected)


def sample_track_points(
    track_points: Iterable[Mapping[str, Any]],
    *,
    maximum_samples: int = DEFAULT_MAXIMUM_SAMPLES,
    minimum_spacing_m: float = DEFAULT_MINIMUM_SPACING_M,
    coordinate_precision: int = DEFAULT_COORDINATE_PRECISION,
) -> list[dict[str, int | float]]:
    """Select bounded, route-distributed coordinates without exposing sensor data."""

    try:
        sample_limit = min(MAXIMUM_REVERSE_GEOCODING_SAMPLES, max(0, int(maximum_samples)))
    except (TypeError, ValueError, OverflowError):
        sample_limit = DEFAULT_MAXIMUM_SAMPLES
    if sample_limit == 0:
        return []

    coordinates = _valid_track_coordinates(track_points)
    if not coordinates:
        return []
    precision = min(6, max(3, int(coordinate_precision)))
    axis = _route_axis(coordinates)
    total_distance_m = axis[-1]
    spacing = _finite_number(minimum_spacing_m)
    spacing = max(0.0, spacing if spacing is not None else DEFAULT_MINIMUM_SPACING_M)
    if total_distance_m <= 0:
        count = 1
    elif spacing > 0:
        count = min(sample_limit, len(coordinates), max(1, int(total_distance_m // spacing) + 1))
    else:
        count = min(sample_limit, len(coordinates))

    positions = _sample_positions(coordinates, axis, count, precision)
    return [
        {
            "point_index": coordinates[position].point_index,
            "latitude": round(coordinates[position].latitude, precision),
            "longitude": round(coordinates[position].longitude, precision),
        }
        for position in positions
    ]


def _reverse_url(base_url: str) -> str:
    parsed = urlsplit(base_url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Reverse-Geocoding benötigt eine absolute HTTP(S)-Basis-URL.")
    path = parsed.path.rstrip("/")
    if not path.endswith("/reverse") and path != "reverse":
        path = f"{path}/reverse" if path else "/reverse"
    return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))


def _valid_user_agent(value: Any) -> str | None:
    user_agent = _normalize_text(value)
    if user_agent is None or len(user_agent) < 8:
        return None
    lowered = user_agent.casefold()
    if lowered in _GENERIC_USER_AGENTS or any(lowered.startswith(f"{generic}/") for generic in _GENERIC_USER_AGENTS):
        return None
    return user_agent


def _sanitized_response(payload: Mapping[str, Any]) -> dict[str, Any]:
    raw_address = payload.get("address")
    address = raw_address if isinstance(raw_address, Mapping) else {}
    sanitized_address = {
        field: value
        for field in _ADDRESS_FIELDS
        if (value := _normalize_text(address.get(field))) is not None
    }
    result: dict[str, Any] = {"address": sanitized_address}
    for field in ("name", "type", "addresstype"):
        if (value := _normalize_text(payload.get(field))) is not None:
            result[field] = value
    return result


def _cache_get(cache: Any, key: str) -> Mapping[str, Any] | None:
    if cache is None:
        return None
    try:
        value = cache.get(key)
    except Exception:
        return None
    return value if isinstance(value, Mapping) else None


def _cache_set(cache: Any, key: str, value: Mapping[str, Any]) -> None:
    if cache is None:
        return
    try:
        setter = getattr(cache, "set", None)
        if callable(setter):
            setter(key, value)
        elif isinstance(cache, MutableMapping):
            cache[key] = dict(value)
    except Exception:
        # A cache outage must never make an activity import fail.
        return


class NominatimReverseGeocoder:
    """Configurable Nominatim-compatible client; no public endpoint is built in."""

    provider = "nominatim"

    def __init__(
        self,
        base_url: str,
        *,
        user_agent: str = DEFAULT_USER_AGENT,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        language: str = "de",
        attribution: str = DEFAULT_OSM_ATTRIBUTION,
        cache: ReverseGeocodingCache | MutableMapping[str, Any] | None = None,
        rate_limiter: RequestRateLimiter | None = None,
        minimum_request_interval_seconds: float = NORMAL_REQUEST_INTERVAL_SECONDS,
        requester: Callable[..., httpx.Response] | None = None,
    ) -> None:
        self.base_url = base_url.strip().rstrip("/")
        self.reverse_url = _reverse_url(base_url)
        valid_user_agent = _valid_user_agent(user_agent)
        if valid_user_agent is None:
            raise ValueError("Reverse-Geocoding benötigt einen stabilen, anwendungsspezifischen User-Agent.")
        self.user_agent = valid_user_agent
        timeout = _finite_number(timeout_seconds)
        self.timeout_seconds = min(
            MAXIMUM_TIMEOUT_SECONDS,
            max(0.1, timeout if timeout is not None else DEFAULT_TIMEOUT_SECONDS),
        )
        self.language = _normalize_text(language) or "de"
        self.attribution = _normalize_text(attribution)
        self.cache = cache
        self.rate_limiter = rate_limiter or _shared_rate_limiter(self.base_url)
        interval = _finite_number(minimum_request_interval_seconds)
        self.minimum_request_interval_seconds = max(
            NORMAL_REQUEST_INTERVAL_SECONDS,
            interval if interval is not None else NORMAL_REQUEST_INTERVAL_SECONDS,
        )
        self._requester = requester or httpx.get

    def _cache_key(self, latitude: float, longitude: float) -> str:
        endpoint = sha256(self.base_url.encode("utf-8")).hexdigest()[:16]
        return f"nominatim:{endpoint}:{latitude:.4f}:{longitude:.4f}:{self.language.casefold()}"

    def reverse(self, latitude: float, longitude: float) -> Mapping[str, Any] | None:
        cache_key = self._cache_key(latitude, longitude)
        if (cached := _cache_get(self.cache, cache_key)) is not None:
            return cached

        def request() -> httpx.Response:
            return self._requester(
                self.reverse_url,
                params={
                    "format": "jsonv2",
                    "lat": f"{latitude:.4f}",
                    "lon": f"{longitude:.4f}",
                    "addressdetails": 1,
                    "accept-language": self.language,
                },
                headers={
                    "Accept": "application/json",
                    "User-Agent": self.user_agent,
                },
                timeout=self.timeout_seconds,
                follow_redirects=False,
            )

        response = self.rate_limiter.run(
            request,
            minimum_interval_seconds=self.minimum_request_interval_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, Mapping):
            return None
        sanitized = _sanitized_response(payload)
        _cache_set(self.cache, cache_key, sanitized)
        return sanitized


class LocationIQReverseGeocoder:
    """LocationIQ v1 reverse client with sanitized errors and responses."""

    provider = "locationiq"
    attribution = LOCATIONIQ_ATTRIBUTION
    attribution_url = LOCATIONIQ_ATTRIBUTION_URL

    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
        language: str = "de",
        cache: ReverseGeocodingCache | MutableMapping[str, Any] | None = None,
        rate_limiter: RequestRateLimiter | None = None,
        minimum_request_interval_seconds: float = LOCATIONIQ_REQUEST_INTERVAL_SECONDS,
        requester: Callable[..., httpx.Response] | None = None,
    ) -> None:
        self.base_url = base_url.strip().rstrip("/")
        self.reverse_url = _reverse_url(base_url)
        self.api_key = api_key.strip()
        if not self.api_key:
            raise ValueError("LocationIQ benötigt einen API-Key.")
        timeout = _finite_number(timeout_seconds)
        self.timeout_seconds = min(MAXIMUM_TIMEOUT_SECONDS, max(0.1, timeout or DEFAULT_TIMEOUT_SECONDS))
        self.language = _normalize_text(language) or "de"
        self.cache = cache
        self.minimum_request_interval_seconds = max(
            LOCATIONIQ_REQUEST_INTERVAL_SECONDS,
            float(minimum_request_interval_seconds),
        )
        self.rate_limiter = rate_limiter or _shared_rate_limiter(
            f"locationiq:{self.base_url}",
            self.minimum_request_interval_seconds,
        )
        self._requester = requester or httpx.get

    def _cache_key(self, latitude: float, longitude: float) -> str:
        endpoint = sha256(self.base_url.encode("utf-8")).hexdigest()[:16]
        return f"locationiq:{endpoint}:{latitude:.4f}:{longitude:.4f}:{self.language.casefold()}"

    @staticmethod
    def _retry_after(response: httpx.Response) -> int | None:
        value = response.headers.get("Retry-After")
        try:
            return max(1, int(float(value))) if value else None
        except (TypeError, ValueError):
            return None

    def reverse(self, latitude: float, longitude: float) -> Mapping[str, Any] | None:
        cache_key = self._cache_key(latitude, longitude)
        if (cached := _cache_get(self.cache, cache_key)) is not None:
            return cached

        def request() -> httpx.Response:
            return self._requester(
                self.reverse_url,
                params={
                    "key": self.api_key,
                    "lat": f"{latitude:.4f}",
                    "lon": f"{longitude:.4f}",
                    "format": "json",
                    "addressdetails": 1,
                    "accept-language": self.language,
                    "normalizeaddress": 0,
                },
                headers={"Accept": "application/json"},
                timeout=self.timeout_seconds,
                follow_redirects=False,
            )

        try:
            response = self.rate_limiter.run(
                request,
                minimum_interval_seconds=self.minimum_request_interval_seconds,
            )
        except Exception:
            raise ReverseGeocodingTemporaryError("LocationIQ ist vorübergehend nicht erreichbar.") from None

        if response.status_code in {401, 403}:
            raise ReverseGeocodingConfigurationError("LocationIQ hat die Zugangsdaten abgelehnt.")
        if response.status_code == 404:
            return None
        if response.status_code == 429:
            raise ReverseGeocodingRateLimitError(self._retry_after(response))
        if response.status_code >= 500:
            raise ReverseGeocodingTemporaryError("LocationIQ ist vorübergehend nicht verfügbar.")
        if response.status_code >= 400:
            raise ReverseGeocodingConfigurationError("LocationIQ hat die Anfrage abgelehnt.")
        try:
            payload = response.json()
        except Exception:
            raise ReverseGeocodingTemporaryError("LocationIQ hat keine gültige Antwort geliefert.") from None
        if not isinstance(payload, Mapping):
            return None
        sanitized = _sanitized_response(payload)
        _cache_set(self.cache, cache_key, sanitized)
        return sanitized


def _setting(settings: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if isinstance(settings, Mapping) and name in settings:
            return settings[name]
        try:
            value = getattr(settings, name)
        except (AttributeError, TypeError):
            continue
        if value is not None:
            return value
    return default


def _enabled(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().casefold() in {"1", "true", "yes", "on"}
    return bool(value)


def _secret_value(value: Any) -> str | None:
    if value is None:
        return None
    getter = getattr(value, "get_secret_value", None)
    raw = getter() if callable(getter) else value
    return _normalize_text(raw)


def reverse_geocoding_configuration_status(settings: Any) -> dict[str, str | None]:
    provider = (_normalize_text(_setting(settings, "reverse_geocoding_provider", default="disabled")) or "disabled").casefold()
    if provider == "disabled":
        return {"status": "disabled", "provider": None, "attribution_label": None, "attribution_url": None}
    base_url = _normalize_text(_setting(settings, "reverse_geocoding_base_url"))
    if provider == "locationiq":
        ready = bool(base_url and _secret_value(_setting(settings, "locationiq_api_key")))
        return {
            "status": "ready" if ready else "misconfigured",
            "provider": "locationiq",
            "attribution_label": LOCATIONIQ_ATTRIBUTION,
            "attribution_url": LOCATIONIQ_ATTRIBUTION_URL,
        }
    if provider == "nominatim":
        return {
            "status": "ready" if base_url else "misconfigured",
            "provider": "nominatim",
            "attribution_label": DEFAULT_OSM_ATTRIBUTION,
            "attribution_url": "https://www.openstreetmap.org/copyright",
        }
    return {"status": "misconfigured", "provider": provider, "attribution_label": None, "attribution_url": None}


def _bounded_setting(
    settings: Any,
    names: tuple[str, ...],
    default: float,
    minimum: float,
    maximum: float,
) -> float:
    number = _finite_number(_setting(settings, *names, default=default))
    return min(maximum, max(minimum, number if number is not None else default))


def _configured_geocoder(settings: Any) -> Any | None:
    injected = _setting(settings, "reverse_geocoder", "reverse_geocoding_client")
    if injected is not None:
        return injected

    provider = _normalize_text(
        _setting(settings, "reverse_geocoding_provider", "geocoding_provider", default="disabled")
    )
    if provider is None:
        return None
    provider = provider.casefold()
    if provider == "disabled":
        return None
    base_url = _normalize_text(
        _setting(
            settings,
            "reverse_geocoding_base_url",
            "reverse_geocoding_url",
            "geocoding_base_url",
        )
    )
    if provider == "locationiq" and base_url is None:
        base_url = LOCATIONIQ_DEFAULT_BASE_URL
    if base_url is None:
        return None

    backfill = _enabled(_setting(settings, "reverse_geocoding_backfill_mode", default=False))
    required_interval = (
        LOCATIONIQ_REQUEST_INTERVAL_SECONDS
        if provider == "locationiq"
        else BACKFILL_REQUEST_INTERVAL_SECONDS if backfill else NORMAL_REQUEST_INTERVAL_SECONDS
    )
    interval = _bounded_setting(
        settings,
        ("reverse_geocoding_minimum_interval_seconds",),
        required_interval,
        required_interval,
        300.0,
    )
    timeout = _bounded_setting(
        settings,
        ("reverse_geocoding_timeout_seconds", "geocoding_timeout_seconds"),
        DEFAULT_TIMEOUT_SECONDS,
        0.1,
        MAXIMUM_TIMEOUT_SECONDS,
    )
    try:
        if provider == "locationiq":
            api_key = _secret_value(_setting(settings, "locationiq_api_key"))
            if api_key is None:
                return None
            return LocationIQReverseGeocoder(
                base_url,
                api_key,
                timeout_seconds=timeout,
                language=_setting(settings, "reverse_geocoding_language", default="de"),
                cache=_setting(settings, "reverse_geocoding_cache"),
                rate_limiter=_setting(settings, "reverse_geocoding_rate_limiter"),
                minimum_request_interval_seconds=interval,
                requester=_setting(settings, "reverse_geocoding_requester"),
            )
        if provider != "nominatim":
            return None
        return NominatimReverseGeocoder(
            base_url,
            user_agent=_setting(settings, "reverse_geocoding_user_agent", default=DEFAULT_USER_AGENT),
            timeout_seconds=timeout,
            language=_setting(settings, "reverse_geocoding_language", default="de"),
            attribution=_setting(
                settings,
                "reverse_geocoding_attribution",
                default=DEFAULT_OSM_ATTRIBUTION,
            ),
            cache=_setting(settings, "reverse_geocoding_cache"),
            rate_limiter=_setting(settings, "reverse_geocoding_rate_limiter"),
            minimum_request_interval_seconds=interval,
            requester=_setting(settings, "reverse_geocoding_requester"),
        )
    except (TypeError, ValueError):
        return None


def _place_record(
    place_type: str,
    name: Any,
    *,
    region: Any,
    country: Any,
    country_code: Any,
    provider: Any,
    attribution: Any,
) -> PlaceRecord | None:
    normalized_name = _normalize_text(name)
    normalized_provider = _normalize_text(provider)
    if normalized_name is None or normalized_provider is None:
        return None
    return {
        "place_type": place_type,
        "name": normalized_name,
        "region": _normalize_text(region),
        "country": _normalize_text(country),
        "country_code": _normalize_country_code(country_code),
        "provider": normalized_provider,
        "attribution": _normalize_text(attribution),
    }


def _places_from_response(
    response: Mapping[str, Any],
    *,
    default_provider: str,
    default_attribution: str | None,
) -> list[PlaceRecord]:
    provider = response.get("provider") or default_provider
    attribution = response.get("attribution") or default_attribution
    if response.get("place_type") and response.get("name"):
        place_type_aliases = {
            "hamlet": "village",
            "isolated_dwelling": "village",
            "town": "city",
            "region": "state",
        }
        raw_type = str(response["place_type"]).strip().casefold()
        place_type = place_type_aliases.get(raw_type, raw_type)
        if place_type not in _PLACE_TYPE_ORDER:
            return []
        record = _place_record(
            place_type,
            response.get("name"),
            region=response.get("region"),
            country=response.get("country"),
            country_code=response.get("country_code"),
            provider=provider,
            attribution=attribution,
        )
        return [record] if record else []

    raw_address = response.get("address")
    address = raw_address if isinstance(raw_address, Mapping) else {}
    region = address.get("state") or address.get("region")
    country = address.get("country")
    country_code = address.get("country_code")
    candidates: list[tuple[str, Any, Any]] = []
    for field in ("village", "hamlet", "isolated_dwelling"):
        candidates.append(("village", address.get(field), region))
    for field in ("city", "town"):
        candidates.append(("city", address.get(field), region))
    candidates.append(("municipality", address.get("municipality"), region))
    candidates.append(("state", region, region))
    candidates.append(("country", country, None))

    addresstype = str(response.get("addresstype") or response.get("type") or "").casefold()
    if response.get("name") and addresstype in {
        "village",
        "hamlet",
        "isolated_dwelling",
        "city",
        "town",
        "municipality",
        "state",
        "country",
    }:
        normalized_type = {
            "hamlet": "village",
            "isolated_dwelling": "village",
            "town": "city",
        }.get(addresstype, addresstype)
        record_region = None if normalized_type == "country" else region
        candidates.insert(0, (normalized_type, response.get("name"), record_region))

    records: list[PlaceRecord] = []
    for place_type, name, record_region in candidates:
        record = _place_record(
            place_type,
            name,
            region=record_region,
            country=country,
            country_code=country_code,
            provider=provider,
            attribution=attribution,
        )
        if record:
            records.append(record)
    return records


def normalize_place_records(
    responses: Iterable[Mapping[str, Any]],
    *,
    provider: str,
    attribution: str | None,
) -> list[PlaceRecord]:
    """Normalize and stably deduplicate provider responses by administrative level."""

    buckets: dict[str, list[PlaceRecord]] = {place_type: [] for place_type in _PLACE_TYPE_ORDER}
    seen: set[tuple[str, str, str, str]] = set()
    for response in responses:
        if not isinstance(response, Mapping):
            continue
        for record in _places_from_response(
            response,
            default_provider=provider,
            default_attribution=attribution,
        ):
            place_group = (
                "locality"
                if record["place_type"] in {"village", "city", "municipality"}
                else record["place_type"]
            )
            context = record["country_code"] or record["country"] or ""
            identity = (
                place_group,
                record["name"].casefold(),
                (record["region"] or "").casefold(),
                context.casefold(),
            )
            if identity in seen:
                continue
            seen.add(identity)
            buckets[record["place_type"]].append(record)
    return [record for place_type in _PLACE_TYPE_ORDER for record in buckets[place_type]]


def reverse_geocode_track(
    track_points: Iterable[Mapping[str, Any]],
    settings: Any,
    *,
    raise_errors: bool = False,
) -> list[PlaceRecord]:
    """Reverse-geocode sparse route samples; unavailable providers yield an empty list.

    Canonical settings are ``reverse_geocoding_provider`` (``locationiq`` or
    ``nominatim``), ``reverse_geocoding_base_url``, timeout, sample, language,
    cache and rate-limit options with the same prefix. No endpoint is used by
    default. Set ``reverse_geocoding_backfill_mode`` for the 4/minute limit.
    """

    try:
        geocoder = _configured_geocoder(settings)
    except Exception:
        if raise_errors:
            raise ReverseGeocodingConfigurationError("Die Ortserkennung ist nicht gültig konfiguriert.") from None
        return []
    if geocoder is None or getattr(geocoder, "available", True) is False:
        if raise_errors and reverse_geocoding_configuration_status(settings)["status"] == "ready":
            raise ReverseGeocodingConfigurationError("Die Ortserkennung ist nicht gültig konfiguriert.")
        return []

    maximum_samples = int(
        _bounded_setting(
            settings,
            ("reverse_geocoding_max_samples", "geocoding_max_samples"),
            DEFAULT_MAXIMUM_SAMPLES,
            0,
            MAXIMUM_REVERSE_GEOCODING_SAMPLES,
        )
    )
    minimum_spacing_m = _bounded_setting(
        settings,
        ("reverse_geocoding_minimum_spacing_m", "geocoding_minimum_spacing_m"),
        DEFAULT_MINIMUM_SPACING_M,
        0,
        1_000_000,
    )
    coordinate_precision = int(
        _bounded_setting(
            settings,
            ("reverse_geocoding_coordinate_precision",),
            DEFAULT_COORDINATE_PRECISION,
            3,
            6,
        )
    )
    samples = sample_track_points(
        track_points,
        maximum_samples=maximum_samples,
        minimum_spacing_m=minimum_spacing_m,
        coordinate_precision=coordinate_precision,
    )
    if not samples:
        return []

    provider = _normalize_text(getattr(geocoder, "provider", None)) or "configured"
    attribution = _normalize_text(getattr(geocoder, "attribution", None))
    maximum_failures = int(
        _bounded_setting(
            settings,
            ("reverse_geocoding_maximum_failures",),
            2,
            1,
            3,
        )
    )
    responses: list[Mapping[str, Any]] = []
    failures = 0
    for sample in samples:
        try:
            reverse = getattr(geocoder, "reverse", None)
            if callable(reverse):
                response = reverse(float(sample["latitude"]), float(sample["longitude"]))
            elif callable(geocoder):
                response = geocoder(float(sample["latitude"]), float(sample["longitude"]))
            else:
                return []
            if isinstance(response, Mapping):
                responses.append(response)
            elif isinstance(response, (list, tuple)):
                responses.extend(item for item in response if isinstance(item, Mapping))
        except (ReverseGeocodingConfigurationError, ReverseGeocodingRateLimitError):
            if raise_errors:
                raise
            failures += 1
            break
        except Exception:
            failures += 1
            if failures >= maximum_failures:
                if raise_errors:
                    raise ReverseGeocodingTemporaryError("Die Ortserkennung ist vorübergehend fehlgeschlagen.") from None
                break

    return normalize_place_records(responses, provider=provider, attribution=attribution)
