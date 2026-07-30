from __future__ import annotations

import base64
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.analysis import route_wind_summary, segment_metrics
from app.database import SessionLocal
from app.config import get_settings
from app.models import Activity
from conftest import SAMPLE_TCX


def _upload(client: TestClient, auth: dict[str, str], data: bytes, title: str) -> dict:
    response = client.post(
        "/api/v1/activities",
        headers=auth,
        files={"file": (f"{title}.tcx", data, "application/xml")},
        data={"title": title, "type": "training"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_profile_training_goals_and_avatar(client: TestClient, auth: dict[str, str]):
    updated = client.patch(
        "/api/v1/profile",
        headers=auth,
        json={"training_goals": ["Grundlagenausdauer", "Langstrecke", "Grundlagenausdauer"]},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["training_goals"] == ["Grundlagenausdauer", "Langstrecke"]

    image = Image.new("RGB", (1600, 900), "#0E6562")
    payload = BytesIO()
    image.save(payload, format="PNG")
    avatar = client.post(
        "/api/v1/profile/avatar",
        headers=auth,
        files={"file": ("portrait.png", payload.getvalue(), "image/png")},
    )
    assert avatar.status_code == 200, avatar.text
    data_url = avatar.json()["avatar_data_url"]
    assert data_url.startswith("data:image/webp;base64,")
    decoded = base64.b64decode(data_url.split(",", 1)[1])
    with Image.open(BytesIO(decoded)) as stored:
        assert stored.size == (512, 512)

    removed = client.delete("/api/v1/profile/avatar", headers=auth)
    assert removed.status_code == 200
    assert removed.json()["avatar_data_url"] is None

    settings = get_settings()
    previous_limit = settings.max_avatar_pixels
    settings.max_avatar_pixels = 100
    try:
        too_many_pixels = client.post(
            "/api/v1/profile/avatar",
            headers=auth,
            files={"file": ("large.png", payload.getvalue(), "image/png")},
        )
        assert too_many_pixels.status_code == 422
    finally:
        settings.max_avatar_pixels = previous_limit


def test_professional_comparison_and_statistics(client: TestClient, auth: dict[str, str]):
    first = _upload(client, auth, SAMPLE_TCX.replace(b"2026-06-01", b"2026-05-20"), "Frühere Runde")
    second = _upload(client, auth, SAMPLE_TCX, "Aktuelle Runde")

    comparison = client.post(
        "/api/v1/activities/compare",
        headers=auth,
        json={"activity_ids": [first["id"], second["id"]]},
    )
    assert comparison.status_code == 200, comparison.text
    result = comparison.json()
    assert len(result["metrics"]) == len(result["profiles"]) == 2
    assert result["ai_summary"]
    assert result["ai_provider"] == "local"
    assert result["profiles"][0]["points"][-1]["progress_percent"] == 100

    statistics = client.get(
        "/api/v1/statistics/overview?date_from=2026-06-01&date_to=2026-06-30&granularity=auto",
        headers=auth,
    )
    assert statistics.status_code == 200, statistics.text
    stats = statistics.json()
    assert stats["granularity"] == "day"
    assert len(stats["series"]) == 30
    assert next(point for point in stats["series"] if point["activity_count"] == 0)["avg_speed_mps"] is None
    assert stats["comparison"]["activity_count"] == 1
    assert stats["avg_hr_bpm"] is not None

    summary = client.post(f"/api/v1/activities/{second['id']}/summary?force=true", headers=auth)
    assert summary.status_code == 200
    assert "eingeschränkter Vergleichbarkeit" in summary.json()["summary"]
    with SessionLocal() as db:
        stored = db.scalar(select(Activity).where(Activity.id == second["id"]))
        section = segment_metrics(stored, 0, .6)
        assert section["moving_time_s"] == 120
        assert section["avg_speed_kmh"] == 18

    goals = client.patch("/api/v1/profile", headers=auth, json={"training_goals": ["Langstrecke"]})
    assert goals.status_code == 200
    assert client.get(f"/api/v1/activities/{second['id']}", headers=auth).json()["ai_summary"] is None


def test_statistics_limits(client: TestClient, auth: dict[str, str]):
    _upload(client, auth, SAMPLE_TCX, "Fokusfahrt")
    assert client.get(
        "/api/v1/statistics/overview?date_from=0001-01-01&date_to=2026-01-01",
        headers=auth,
    ).status_code == 422
    assert client.get(
        "/api/v1/statistics/overview?date_from=2020-01-01&date_to=2026-01-01&granularity=day",
        headers=auth,
    ).status_code == 422

def test_route_wind_uses_course_direction():
    points = [
        {"latitude": 52.0, "longitude": 13.0},
        {"latitude": 52.01, "longitude": 13.0},
        {"latitude": 52.02, "longitude": 13.0},
    ]
    headwind = route_wind_summary(
        points,
        [
            {"point_index": 0, "wind_speed_kmh": 20, "wind_direction_deg": 0},
            {"point_index": 1, "wind_speed_kmh": 20, "wind_direction_deg": 0},
        ],
    )
    assert headwind is not None
    assert headwind["dominant"] == "headwind"
    assert headwind["net_headwind_kmh"] > 19

    last_point = route_wind_summary(
        points,
        [{"point_index": 2, "wind_speed_kmh": 20, "wind_direction_deg": 0}],
    )
    assert last_point is not None
    assert last_point["dominant"] == "headwind"

    tailwind = route_wind_summary(
        points,
        [{"point_index": 0, "wind_speed_kmh": 20, "wind_direction_deg": 180}],
    )
    assert tailwind is not None
    assert tailwind["dominant"] == "tailwind"
    assert tailwind["net_headwind_kmh"] < -19
