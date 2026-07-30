from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any

from openai import OpenAI

from .config import Settings
from .gamification import SUPPORTED_METRICS
from .models import Activity, User


MAX_SUGGESTIONS = 6
FORBIDDEN_SAFETY_TERMS = ("gewitter", "sturm", "orkan", "glätte", "eis", "vereisung", "blitz")


def ai_challenges_available(settings: Settings) -> bool:
    return bool(settings.openai_api_key)


def _compact_activity(activity: Activity) -> dict[str, Any]:
    return {
        "date": activity.started_at.isoformat(),
        "distance_km": round(max(float(activity.distance_m or 0), 0) / 1000, 1),
        "moving_minutes": round(max(float(activity.moving_time_s or 0), 0) / 60),
        "elevation_m": round(max(float(activity.elevation_gain_m or 0), 0)),
        "average_speed_kmh": round(max(float(activity.avg_speed_mps or 0), 0) * 3.6, 1),
        "weather": activity.weather or {},
    }


def _safe_text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _validated_suggestions(payload: Any) -> list[dict[str, Any]]:
    candidates = payload.get("suggestions") if isinstance(payload, dict) else payload
    if not isinstance(candidates, list):
        return []
    validated: list[dict[str, Any]] = []
    for item in candidates[:MAX_SUGGESTIONS]:
        if not isinstance(item, dict):
            continue
        metric = _safe_text(item.get("metric"), 40)
        title = _safe_text(item.get("title"), 120)
        description = _safe_text(item.get("description"), 1000)
        if metric not in SUPPORTED_METRICS or not title:
            continue
        try:
            target = float(item.get("target_value"))
            duration = int(item.get("duration_days", 7))
            reward = int(item.get("reward_xp", 150))
        except (TypeError, ValueError):
            continue
        if not (target > 0 and target <= 1_000_000_000_000):
            continue
        if not (1 <= duration <= 366):
            continue
        if not (0 <= reward <= 500):
            continue
        lower = f"{title} {description}".casefold()
        if any(term in lower for term in FORBIDDEN_SAFETY_TERMS):
            continue
        weather_sensitive = bool(item.get("weather_sensitive", False))
        safety_note = _safe_text(item.get("safety_note"), 500) or None
        if weather_sensitive and not safety_note:
            safety_note = "Nur bei für dich und deine Ausrüstung sicheren Bedingungen fahren; Wetter und Streckenzustand gehen vor."
        validated.append(
            {
                "template_key": _safe_text(item.get("template_key"), 120) or f"ai_{len(validated) + 1}",
                "title": title,
                "description": description,
                "metric": metric,
                "target_value": target,
                "duration_days": duration,
                "reward_xp": reward,
                "personalization_reason": _safe_text(item.get("personalization_reason"), 500) or None,
                "weather_sensitive": weather_sensitive,
                "safety_note": safety_note,
            }
        )
    return validated


def generate_challenge_suggestions(
    settings: Settings,
    user: User,
    activities: Iterable[Activity],
) -> list[dict[str, Any]]:
    """Generate optional AI challenges; without a key this returns no suggestions."""

    if not settings.openai_api_key:
        return []
    history = list(activities)[-30:]
    client = OpenAI(
        api_key=settings.openai_api_key,
        base_url=settings.openai_base_url,
        timeout=settings.ai_timeout_seconds,
        max_retries=1,
    )
    response = client.responses.create(
        model=settings.openai_model,
        instructions=(
            "Du bist Baseline Cycling Insights. Erzeuge höchstens sechs realistische, optionale und deutschsprachige "
            "Radfahr-Challenges ausschließlich aus den bereitgestellten Trainingsdaten. Nutze nur die erlaubten "
            "Metriken. Steigere Ziele höchstens vorsichtig. Wetter-Challenges dürfen leichte, mäßige oder starke "
            "Niederschlagsbeobachtung thematisieren, dürfen aber niemals zu Gewitter, Sturm, Glätte, Eis oder "
            "riskantem Fahren auffordern. Gib ausschließlich JSON im Format "
            "{\"suggestions\":[{\"template_key\":\"...\",\"title\":\"...\",\"description\":\"...\","
            "\"metric\":\"...\",\"target_value\":1,\"duration_days\":7,\"reward_xp\":100,"
            "\"personalization_reason\":\"...\",\"weather_sensitive\":false,\"safety_note\":null}]} ab."
        ),
        input=json.dumps(
            {
                "profile": {"training_goals": user.training_goals or [], "hr_max": user.hr_max},
                "allowed_metrics": sorted(SUPPORTED_METRICS),
                "activities": [_compact_activity(activity) for activity in history],
            },
            ensure_ascii=False,
        ),
        max_output_tokens=1_200,
        store=False,
    )
    raw = response.output_text.strip()
    if not raw:
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return _validated_suggestions(payload)
