from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
import json
from typing import Any

from openai import OpenAI

from .config import Settings
from .models import Activity


class SummaryProvider(ABC):
    name: str

    @abstractmethod
    def summarize(self, activity: Activity, coaching: dict[str, Any] | None = None) -> str:
        raise NotImplementedError


def _hours(seconds: float) -> str:
    total_minutes = round(seconds / 60)
    hours, minutes = divmod(total_minutes, 60)
    return f"{hours} h {minutes} min" if hours else f"{minutes} min"


def weather_facts(weather: dict[str, Any] | None) -> dict[str, Any] | None:
    if not weather:
        return None
    allowed = {
        "provider",
        "observed_at",
        "temperature_c",
        "apparent_temperature_c",
        "precipitation_mm",
        "weather_code",
        "wind_speed_kmh",
        "wind_direction_deg",
        "humidity_percent",
    }
    result = {
        key: round(value, 1) if isinstance(value, float) else value
        for key, value in weather.items()
        if key in allowed
    }
    route_wind = weather.get("route_wind")
    if isinstance(route_wind, dict):
        result["route_wind"] = {
            key: round(value, 1) if isinstance(value, float) else value
            for key, value in route_wind.items()
            if key != "samples"
        }
    return result


def activity_facts(activity: Activity) -> dict[str, Any]:
    weather = weather_facts(activity.weather)
    hydration_rate = (
        activity.hydration_ml / (activity.duration_s / 3600)
        if activity.hydration_ml is not None and activity.duration_s > 0
        else None
    )
    return {
        "title": activity.title,
        "type": activity.activity_type,
        "start": activity.started_at.isoformat(),
        "distance_km": round(activity.distance_m / 1000, 1),
        "duration": _hours(activity.duration_s),
        "moving_duration": _hours(activity.moving_time_s),
        "elevation_gain_m": round(activity.elevation_gain_m),
        "average_speed_kmh": round(activity.avg_speed_mps * 3.6, 1),
        "maximum_speed_kmh": round(activity.max_speed_mps * 3.6, 1),
        "average_heart_rate_bpm": round(activity.avg_hr_bpm) if activity.avg_hr_bpm is not None else None,
        "maximum_heart_rate_bpm": activity.max_hr_bpm,
        "heart_rate_zone_seconds": activity.hr_zone_seconds,
        "hydration_ml": activity.hydration_ml,
        "hydration_rate_ml_per_hour": round(hydration_rate) if hydration_rate is not None else None,
        "weather": weather,
    }


_activity_facts = activity_facts


class LocalSummaryProvider(SummaryProvider):
    name = "local"

    def summarize(self, activity: Activity, coaching: dict[str, Any] | None = None) -> str:
        facts = activity_facts(activity)
        opening = (
            f"{facts['title']}: {facts['distance_km']:.1f} km in {facts['duration']} "
            f"mit durchschnittlich {facts['average_speed_kmh']:.1f} km/h und "
            f"{facts['elevation_gain_m']} Höhenmetern."
        )
        details: list[str] = []
        if activity.avg_hr_bpm is not None:
            details.append(
                f"Die Herzfrequenz lag im Mittel bei {round(activity.avg_hr_bpm)} bpm"
                + (f" und maximal bei {activity.max_hr_bpm} bpm." if activity.max_hr_bpm else ".")
            )
        if activity.pause_time_s >= 60:
            details.append(f"Die erfasste Pausenzeit betrug {_hours(activity.pause_time_s)}.")
        if activity.hydration_ml is not None:
            hydration_rate = facts["hydration_rate_ml_per_hour"]
            details.append(
                f"Als Trinkmenge sind {activity.hydration_ml} ml dokumentiert"
                + (f", entsprechend etwa {hydration_rate} ml pro Stunde." if hydration_rate is not None else ".")
            )
        if activity.weather and activity.weather.get("temperature_c") is not None:
            details.append(f"Zum Start wurden {activity.weather['temperature_c']} °C gemessen.")
        route_wind = (activity.weather or {}).get("route_wind") or {}
        net_headwind = route_wind.get("net_headwind_kmh")
        if isinstance(net_headwind, (int, float)):
            if net_headwind >= 1.5:
                details.append(f"Im Streckenverlauf wirkten im Mittel etwa {net_headwind:.1f} km/h Gegenwindkomponente.")
            elif net_headwind <= -1.5:
                details.append(f"Die Strecke profitierte im Mittel von etwa {abs(net_headwind):.1f} km/h Rückenwindkomponente.")
        development = (coaching or {}).get("development") or {}
        comparison_count = int(development.get("comparison_count") or 0)
        comparison_quality = development.get("comparison_quality")
        speed_difference = development.get("speed_difference_kmh")
        heart_rate_difference = development.get("heart_rate_difference_bpm")
        if comparison_count and isinstance(speed_difference, (int, float)):
            direction = "höher" if speed_difference >= 0 else "niedriger"
            basis = (
                f"{comparison_count} ähnlichen früheren Fahrten"
                if comparison_quality == "similar"
                else f"{comparison_count} früheren Fahrten mit eingeschränkter Vergleichbarkeit"
            )
            comparison = (
                f"Gegenüber {basis} war dein Durchschnittstempo "
                f"um {abs(speed_difference):.1f} km/h {direction}"
            )
            if isinstance(heart_rate_difference, (int, float)):
                pulse_direction = "höher" if heart_rate_difference >= 0 else "niedriger"
                comparison += f", bei einer um {abs(heart_rate_difference):.0f} bpm {pulse_direction}en Herzfrequenz."
            else:
                comparison += "."
            details.append(comparison)
            if comparison_quality == "similar" and speed_difference > 0.4 and (not isinstance(heart_rate_difference, (int, float)) or heart_rate_difference <= 2):
                details.append("Das ist ein starkes Zeichen für verbesserte Ausdauer und Effizienz – weiter so!")
            elif comparison_quality == "similar" and speed_difference >= 0:
                details.append("Solide Entwicklung: Die Einheit passt gut zu einem kontrollierten Ausdaueraufbau.")
            elif comparison_quality != "similar":
                details.append("Für eine belastbare Entwicklungsbewertung braucht es noch mehr wirklich vergleichbare Fahrten.")
            else:
                details.append("Ein ruhigerer Tag ist kein Rückschritt; nutze die Einheit als belastbaren Trainingsbaustein.")
        if not details:
            details.append("Für eine genauere Belastungseinordnung fehlen Herzfrequenz- oder Wetterdaten.")
        return " ".join([opening, *details])


class OpenAISummaryProvider(SummaryProvider):
    name = "openai"

    def __init__(self, settings: Settings) -> None:
        self.model = settings.openai_model
        self.client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            timeout=settings.ai_timeout_seconds,
            max_retries=1,
        )

    def summarize(self, activity: Activity, coaching: dict[str, Any] | None = None) -> str:
        response = self.client.responses.create(
            model=self.model,
            instructions=(
                "Du bist ein aufmerksamer, motivierender deutschsprachiger Radsport-Coach. Analysiere die "
                "Aktivität in 4 bis 7 kurzen Sätzen. Vergleiche sie mit den bereitgestellten ähnlichen früheren "
                "Fahrten, erkenne Ausdauer- und Effizienzfortschritte, lobe konkrete gute Leistungen und gib "
                "höchstens einen realistischen Trainingshinweis. Interpretiere Temperatur, Niederschlag sowie "
                "dokumentierte Trinkmenge und Trinkrate nur als Aufzeichnungswerte, ohne einen individuellen "
                "Flüssigkeitsbedarf zu behaupten. Interpretiere "
                "Gegen-, Rücken- und Seitenwind nur, wenn Daten vorliegen. Nenne nur Werte aus den Daten, "
                "vermeide medizinische Aussagen und "
                "kennzeichne fehlende Sensorwerte nicht als null. Runde Herzfrequenz und Höhenmeter auf ganze "
                "Zahlen und alle anderen Dezimalwerte auf höchstens eine Nachkommastelle. Erwähne keine "
                "Trainingsbelastung, da dieser Wert ohne persönliche Kalibrierung nicht aussagekräftig ist. "
                "Formuliere Unterschiede immer mit Vergleichsbasis und stelle Vermutungen klar als solche dar. "
                "Wenn comparison_quality 'broad' ist, bezeichne die Fahrten nicht als ähnlich und leite daraus "
                "keinen Fitnessfortschritt ab."
            ),
            input=f"Aktivitätsdaten: {activity_facts(activity)}\nCoaching-Kontext: {coaching or {}}",
            max_output_tokens=650,
            store=False,
        )
        text = response.output_text.strip()
        if not text:
            raise RuntimeError("Der KI-Provider hat keinen Text geliefert.")
        return text


def get_summary_provider(settings: Settings) -> SummaryProvider:
    if settings.openai_api_key:
        return OpenAISummaryProvider(settings)
    return LocalSummaryProvider()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _basis_metric(
    name: str,
    value: Any,
    unit: str | None,
    *,
    source: str,
    method: str,
    activity_id: str | None = None,
) -> dict[str, Any]:
    return {
        "name": name,
        "value": value,
        "unit": unit,
        "activity_id": activity_id,
        "source": source,
        "method": method,
    }


def activity_summary_data_basis(
    activity: Activity,
    coaching: dict[str, Any],
    timezone_name: str,
    provider_name: str,
) -> dict[str, Any]:
    facts = activity_facts(activity)
    comparisons = coaching.get("similar_activities") or []
    activity_ids = [activity.id, *[item["id"] for item in comparisons if item.get("id")]]
    period_starts = [_aware(activity.started_at)]
    period_ends = [_aware(activity.ended_at)]
    for item in comparisons:
        try:
            period_starts.append(_aware(datetime.fromisoformat(str(item["started_at"]))))
            period_ends.append(_aware(datetime.fromisoformat(str(item["ended_at"]))))
        except (KeyError, TypeError, ValueError):
            continue
    metrics = [
        _basis_metric("distance", activity.distance_m, "m", source="TCX", method="kumulierte Trackdistanz", activity_id=activity.id),
        _basis_metric("duration", activity.duration_s, "s", source="TCX", method="Differenz aus erstem und letztem Zeitstempel", activity_id=activity.id),
        _basis_metric("moving_time", activity.moving_time_s, "s", source="TCX", method="Intervalle mit mindestens 0,5 m/s", activity_id=activity.id),
        _basis_metric("average_speed", activity.avg_speed_mps, "m/s", source="TCX", method="Distanz geteilt durch Aktivzeit", activity_id=activity.id),
        _basis_metric("elevation_gain", activity.elevation_gain_m, "m", source="TCX", method="gefilterte positive Höhenänderungen", activity_id=activity.id),
        _basis_metric("average_heart_rate", activity.avg_hr_bpm, "bpm", source="TCX-Sensor", method="Mittel der vorhandenen Messpunkte", activity_id=activity.id),
        _basis_metric("hydration", activity.hydration_ml, "ml", source="Nutzereingabe", method="pro Aktivität dokumentierte Trinkmenge", activity_id=activity.id),
        _basis_metric(
            "hydration_rate",
            facts["hydration_rate_ml_per_hour"],
            "ml/h",
            source="Nutzereingabe und TCX",
            method="Trinkmenge geteilt durch Gesamtdauer",
            activity_id=activity.id,
        ),
    ]
    weather = facts.get("weather") or {}
    if weather.get("temperature_c") is not None:
        metrics.append(
            _basis_metric(
                "temperature",
                weather["temperature_c"],
                "°C",
                source=str(weather.get("provider") or "Wetteranbieter"),
                method="historischer Wetterwert zum Aktivitätszeitpunkt",
                activity_id=activity.id,
            )
        )
    route_wind = weather.get("route_wind") or {}
    if route_wind.get("net_headwind_kmh") is not None:
        metrics.append(
            _basis_metric(
                "net_headwind_component",
                route_wind["net_headwind_kmh"],
                "km/h",
                source=str(weather.get("provider") or "Wetteranbieter"),
                method="distanzgewichtete Windkomponente relativ zur Fahrtrichtung",
                activity_id=activity.id,
            )
        )
    development = coaching.get("development") or {}
    for name, unit in (
        ("speed_difference_kmh", "km/h"),
        ("heart_rate_difference_bpm", "bpm"),
        ("hydration_rate_difference_ml_per_hour", "ml/h"),
    ):
        if development.get(name) is not None:
            metrics.append(
                _basis_metric(
                    name,
                    development[name],
                    unit,
                    source="Vergleichsaktivitäten",
                    method=f"Differenz zum Mittel von {development.get('comparison_count', 0)} Vergleichsfahrten",
                )
            )
    limitations = []
    for flag in activity.data_quality_flags or []:
        if flag.get("severity") in {"warning", "error"}:
            limitations.append(f"Datenqualität: {flag.get('message')}")
    if activity.avg_hr_bpm is None:
        limitations.append("Für die Fokusaktivität liegt keine durchschnittliche Herzfrequenz vor.")
    if activity.hydration_ml is None:
        limitations.append("Für die Fokusaktivität wurde keine Trinkmenge dokumentiert.")
    if not weather:
        limitations.append("Für die Fokusaktivität liegen keine Wetterdaten vor.")
    if development.get("comparison_quality") == "broad":
        limitations.append("Die früheren Fahrten sind nur eingeschränkt vergleichbar; daraus wird kein Fitnessfortschritt abgeleitet.")
    if not comparisons:
        limitations.append("Es standen keine früheren Vergleichsaktivitäten zur Verfügung.")
    return {
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {
            "started_at": min(period_starts).isoformat(),
            "ended_at": max(period_ends).isoformat(),
            "timezone": timezone_name,
            "label": "Fokusaktivität und verwendete frühere Vergleichsfahrten",
        },
        "activity_ids": list(dict.fromkeys(activity_ids)),
        "metrics": metrics,
        "methods": [
            {
                "name": "activity_summary",
                "description": "Erzeugung der Aktivitätszusammenfassung aus den ausgewiesenen Fakten.",
                "parameters": {"provider": provider_name, "language": "de"},
            },
            {
                "name": "similarity_selection",
                "description": "Auswahl früherer Fahrten nach Distanz, Aktivzeit, Höhenmetern, Typ und Startnähe.",
                "parameters": {"maximum_candidates": 30, "maximum_selected": 7, "similarity_quality_threshold": 1.5},
            },
        ],
        "limitations": limitations,
        "facts": {"activity": facts, "coaching_context": coaching},
    }


def comparison_data_basis(
    activities: list[Activity],
    metrics: list[dict[str, Any]],
    timezone_name: str,
    provider_name: str,
) -> dict[str, Any]:
    basis_metrics: list[dict[str, Any]] = []
    units = {
        "distance_m": "m",
        "duration_s": "s",
        "moving_time_s": "s",
        "elevation_gain_m": "m",
        "avg_speed_mps": "m/s",
        "avg_hr_bpm": "bpm",
        "efficiency_kmh_per_bpm": "km/h pro bpm",
        "headwind_kmh": "km/h",
        "hydration_ml": "ml",
        "hydration_rate_ml_per_hour": "ml/h",
        "relative_score": "%",
    }
    for item in metrics:
        for name, unit in units.items():
            basis_metrics.append(
                _basis_metric(
                    name,
                    item.get(name),
                    unit,
                    source="Aktivitätsanalyse",
                    method="direkter Messwert oder ausgewiesene abgeleitete Kennzahl",
                    activity_id=item.get("activity_id"),
                )
            )
    return {
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {
            "started_at": min(_aware(activity.started_at) for activity in activities).isoformat(),
            "ended_at": max(_aware(activity.ended_at) for activity in activities).isoformat(),
            "timezone": timezone_name,
            "label": "Ausgewählte Vergleichsaktivitäten",
        },
        "activity_ids": [activity.id for activity in activities],
        "metrics": basis_metrics,
        "methods": [
            {
                "name": "relative_score",
                "description": "Min-Max-Vergleich ausschließlich innerhalb der ausgewählten Aktivitäten.",
                "parameters": {"speed_weight": 0.45, "heart_rate_efficiency_weight": 0.4, "elevation_weight": 0.15},
            },
            {
                "name": "comparison_summary",
                "description": "Zusammenfassung der ausgewiesenen Vergleichskennzahlen.",
                "parameters": {"provider": provider_name},
            },
        ],
        "limitations": [
            "Der relative Score gilt nur innerhalb dieser Auswahl und ist kein allgemeiner Fitnesswert.",
            "Unterschiedliche Strecken, Wetterbedingungen und Sensorabdeckung begrenzen direkte Vergleiche.",
        ],
        "facts": {"metrics": metrics},
    }




def comparison_summary(
    settings: Settings,
    activities: list[Activity],
    metrics: list[dict[str, Any]],
    profiles: list[dict[str, Any]] | None = None,
) -> tuple[str, str]:
    if not activities:
        return "Keine Aktivitäten ausgewählt.", "local"
    fastest = max(metrics, key=lambda item: float(item.get("avg_speed_mps") or 0))
    efficient = [item for item in metrics if item.get("efficiency_kmh_per_bpm") is not None]
    best_efficiency = max(efficient, key=lambda item: float(item["efficiency_kmh_per_bpm"])) if efficient else None
    local = f"{fastest['title']} war mit {float(fastest['avg_speed_mps']) * 3.6:.1f} km/h die schnellste Auswahl."
    if best_efficiency:
        local += f" {best_efficiency['title']} zeigte das beste Verhältnis aus Tempo und durchschnittlicher Herzfrequenz."
    headwinds = [item for item in metrics if isinstance(item.get("headwind_kmh"), (int, float))]
    if headwinds:
        toughest_wind = max(headwinds, key=lambda item: float(item["headwind_kmh"]))
        if float(toughest_wind["headwind_kmh"]) > 1:
            local += f" Besonders einzuordnen ist {toughest_wind['title']} wegen der stärksten Gegenwindkomponente."
    documented_hydration = [item for item in metrics if item.get("hydration_ml") is not None]
    if documented_hydration:
        local += f" Für {len(documented_hydration)} der ausgewählten Fahrten ist eine Trinkmenge dokumentiert."
    local += " Vergleiche für die Trainingssteuerung vor allem ähnliche Distanzen und Höhenprofile."
    if not settings.openai_api_key:
        return local, "local"
    try:
        client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            timeout=settings.ai_timeout_seconds,
            max_retries=1,
        )
        response = client.responses.create(
            model=settings.openai_model,
            instructions=(
                "Du bist ein deutschsprachiger Radsport-Coach. Vergleiche die ausgewählten Fahrten in 4 bis 6 "
                "prägnanten Sätzen. Verwende ausschließlich die gelieferten Zahlen und rechne Einheiten korrekt um. "
                "Bei der Herzfrequenzeffizienz gilt: höheres km/h je bpm ist besser. Bei der Geschwindigkeit gilt: "
                "höheres km/h ist schneller. Prüfe jede Rangfolge vor dem Schreiben und nenne niemals gleichzeitig "
                "zwei verschiedene Gewinner für dasselbe Kriterium. Wenn Werte nahe beieinanderliegen, formuliere "
                "vorsichtig. Berücksichtige Tempo, Herzfrequenzeffizienz, Höhenmeter, Wind und dokumentierte "
                "Trinkmengen, ohne daraus einen individuellen Flüssigkeitsbedarf abzuleiten. Benenne klar, welche "
                "Einheit in welchem Aspekt überzeugt, ohne medizinische Aussagen oder erfundene Werte."
            ),
            input=(
                "Gesamtmetriken als JSON:\n"
                f"{json.dumps(metrics, ensure_ascii=False, indent=2)}\n"
                "Normalisierte Streckenverläufe als JSON:\n"
                f"{json.dumps(profiles or [], ensure_ascii=False)}"
            ),
            max_output_tokens=500,
            store=False,
        )
        text = response.output_text.strip()
        return (text, "openai") if text else (local, "local_fallback")
    except Exception:
        return local, "local_fallback"


def local_period_review(facts: dict[str, Any]) -> str:
    totals = facts.get("totals") or {}
    activity_count = int(totals.get("activity_count") or 0)
    label = facts.get("label") or "Im gewählten Zeitraum"
    if activity_count == 0:
        return f"{label} wurden keine Radfahrten aufgezeichnet. Für einen datenbasierten Rückblick fehlen Aktivitäten."
    distance_km = float(totals.get("distance_m") or 0) / 1000
    moving_hours = float(totals.get("moving_time_s") or 0) / 3600
    elevation = round(float(totals.get("elevation_gain_m") or 0))
    summary = (
        f"{label} hast du {activity_count} Fahrten mit insgesamt {distance_km:.1f} km, "
        f"{moving_hours:.1f} Stunden Aktivzeit und {elevation} Höhenmetern aufgezeichnet."
    )
    records = facts.get("records") or {}
    longest = records.get("longest_ride")
    fastest = records.get("highest_average_speed")
    if longest:
        summary += f" Die längste Tour war „{longest['title']}“ mit {float(longest['distance_m']) / 1000:.1f} km."
    if fastest:
        summary += (
            f" Das höchste Durchschnittstempo erreichte „{fastest['title']}“ mit "
            f"{float(fastest['avg_speed_mps']) * 3.6:.1f} km/h."
        )
    monthly = facts.get("monthly") or []
    active_months = [item for item in monthly if item.get("activity_count")]
    if active_months:
        strongest = max(active_months, key=lambda item: float(item.get("distance_m") or 0))
        summary += f" Der distanzstärkste Monat war {strongest['period']} mit {float(strongest['distance_m']) / 1000:.1f} km."
    hydration_ml = int(totals.get("hydration_ml") or 0)
    hydration_count = int(totals.get("hydration_activity_count") or 0)
    if hydration_count:
        summary += f" Bei {hydration_count} Fahrten wurden zusammen {hydration_ml} ml Trinkmenge dokumentiert."
    trend = facts.get("fitness_trend") or {}
    if trend.get("statement"):
        summary += f" {trend['statement']}"
    summary += " Der Rückblick beschreibt Trainingsdaten und enthält keine medizinische Bewertung."
    return summary


def period_review_summary(
    settings: Settings,
    facts: dict[str, Any],
    *,
    use_openai: bool,
) -> tuple[str, str]:
    local = local_period_review(facts)
    if not use_openai or not settings.openai_api_key:
        return local, "local"
    try:
        client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
            timeout=settings.ai_timeout_seconds,
            max_retries=1,
        )
        response = client.responses.create(
            model=settings.openai_model,
            instructions=(
                "Erstelle einen motivierenden deutschsprachigen Saison- oder Jahresrückblick in 5 bis 8 kurzen "
                "Sätzen. Verwende ausschließlich die bereitgestellten Fakten. Nenne den Umfang, konkrete Höhepunkte, "
                "einen vorsichtig formulierten Entwicklungstrend und dokumentierte Trinkmengen, sofern vorhanden. "
                "Unterschiedliche Strecken und Sensorlücken sind Einschränkungen. Stelle keine medizinischen "
                "Behauptungen auf und erfinde keine Werte."
            ),
            input=f"Strukturierte Rückblickdaten: {facts}",
            max_output_tokens=700,
            store=False,
        )
        text = response.output_text.strip()
        return (text, "openai") if text else (local, "local_fallback")
    except Exception:
        return local, "local_fallback"


def period_review_data_basis(
    facts: dict[str, Any],
    activity_ids: list[str],
    period_start: datetime,
    period_end: datetime,
    timezone_name: str,
    provider_name: str,
) -> dict[str, Any]:
    totals = facts.get("totals") or {}
    metrics = [
        _basis_metric("activity_count", totals.get("activity_count"), "Aktivitäten", source="Aktivitätsdatenbank", method="Anzahl im Zeitraum"),
        _basis_metric("distance", totals.get("distance_m"), "m", source="TCX", method="Summe der Aktivitätsdistanzen"),
        _basis_metric("moving_time", totals.get("moving_time_s"), "s", source="TCX", method="Summe der erkannten Aktivzeiten"),
        _basis_metric("elevation_gain", totals.get("elevation_gain_m"), "m", source="TCX", method="Summe der gefilterten Höhengewinne"),
        _basis_metric("average_speed", totals.get("avg_speed_mps"), "m/s", source="TCX", method="Gesamtdistanz geteilt durch gesamte Aktivzeit"),
        _basis_metric("average_heart_rate", totals.get("avg_hr_bpm"), "bpm", source="TCX-Sensor", method="nach Aktivzeit gewichtetes Mittel"),
        _basis_metric("hydration", totals.get("hydration_ml"), "ml", source="Nutzereingabe", method="Summe dokumentierter Trinkmengen"),
    ]
    return {
        "schema_version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "period": {
            "started_at": _aware(period_start).isoformat(),
            "ended_at": _aware(period_end).isoformat(),
            "timezone": timezone_name,
            "label": str(facts.get("label") or "Rückblickzeitraum"),
        },
        "activity_ids": activity_ids,
        "metrics": metrics,
        "methods": [
            {
                "name": "calendar_aggregation",
                "description": "Aggregation nach lokalem Kalenderdatum sowie Monats- und Jahresgruppen.",
                "parameters": {"timezone": timezone_name, "period_inclusive": True},
            },
            {
                "name": "robust_pattern_detection",
                "description": "Konservative Mustererkennung mit Mindeststichproben, Medianen und Rangkorrelation.",
                "parameters": {"minimum_association_sample": 8, "minimum_absolute_spearman": 0.35, "minimum_effect_percent": 4},
            },
            {
                "name": "period_review",
                "description": "Zusammenfassung ausschließlich der ausgewiesenen Rückblickfakten.",
                "parameters": {"provider": provider_name},
            },
        ],
        "limitations": [
            "Nicht aufgezeichnete Fahrten, fehlende Sensorwerte und unterschiedliche Strecken können den Vergleich beeinflussen.",
            "Erkannte Muster sind beobachtete Zusammenhänge und keine Kausal- oder medizinischen Aussagen.",
        ],
        "facts": facts,
    }
