from __future__ import annotations

import importlib
import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from time import perf_counter
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.analysis import fastest_distance_effort
from app.config import get_settings
from app.database import SessionLocal
from app.models import Activity, ActivityPhoto
from conftest import SAMPLE_TCX


def _upload_activity(
    client: TestClient,
    auth: dict[str, str],
    *,
    hydration_ml: int | None = None,
) -> dict:
    data = {"title": "Insight-Runde", "type": "training"}
    if hydration_ml is not None:
        data["hydration_ml"] = str(hydration_ml)
    response = client.post(
        "/api/v1/activities",
        headers=auth,
        files={"file": ("ride.tcx", SAMPLE_TCX, "application/xml")},
        data=data,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _image_bytes(color: str, *, image_format: str = "JPEG") -> bytes:
    image = Image.new("RGB", (320, 180), color)
    output = BytesIO()
    image.save(output, format=image_format)
    return output.getvalue()


def _image_with_exif_bytes(
    color: str,
    *,
    captured_at: str,
    offset: str | None = None,
    latitude: tuple[str, tuple[float, float, float]] | None = None,
    longitude: tuple[str, tuple[float, float, float]] | None = None,
) -> bytes:
    image = Image.new("RGB", (320, 180), color)
    exif = Image.Exif()
    exif[36867] = captured_at
    if offset:
        exif[36881] = offset
    if latitude and longitude:
        exif[34853] = {
            1: latitude[0],
            2: latitude[1],
            3: longitude[0],
            4: longitude[1],
        }
    output = BytesIO()
    image.save(output, format="JPEG", exif=exif)
    return output.getvalue()


def test_activity_photo_uses_exif_metadata_with_manual_values_taking_precedence(
    client: TestClient,
    auth: dict[str, str],
):
    activity_id = _upload_activity(client, auth)["id"]
    image = _image_with_exif_bytes(
        "#315F74",
        captured_at="2026:06:01 10:15:30",
        latitude=("N", (52.0, 30.0, 0.0)),
        longitude=("E", (13.0, 24.0, 0.0)),
    )
    uploaded = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("exif.jpg", image, "image/jpeg")},
        data={"client_timezone": "Europe/Berlin"},
    )
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["captured_at"] == "2026-06-01T08:15:30Z"
    assert uploaded.json()["latitude"] == 52.5
    assert uploaded.json()["longitude"] == 13.4

    fetched = client.get(uploaded.json()["file_url"], headers=auth)
    with Image.open(BytesIO(fetched.content)) as normalized:
        assert not normalized.getexif()

    offset_image = _image_with_exif_bytes(
        "#544A72",
        captured_at="2026:06:02 09:00:00",
        offset="-04:00",
        latitude=("S", (33.0, 52.0, 0.0)),
        longitude=("W", (151.0, 12.0, 0.0)),
    )
    offset_uploaded = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("offset.jpg", offset_image, "image/jpeg")},
    )
    assert offset_uploaded.status_code == 201, offset_uploaded.text
    assert offset_uploaded.json()["captured_at"] == "2026-06-02T13:00:00Z"
    assert offset_uploaded.json()["latitude"] == pytest.approx(-33.8666667)
    assert offset_uploaded.json()["longitude"] == pytest.approx(-151.2)

    override_image = _image_with_exif_bytes(
        "#684551",
        captured_at="2026:06:02 09:00:00",
        offset="-04:00",
        latitude=("S", (33.0, 52.0, 0.0)),
        longitude=("E", (151.0, 12.0, 0.0)),
    )
    overridden = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("override.jpg", override_image, "image/jpeg")},
        data={
            "captured_at": "2026-06-02T14:00:00+02:00",
            "latitude": "48.137",
            "longitude": "11.575",
            "client_timezone": "Invalid/Timezone",
        },
    )
    assert overridden.status_code == 422

    overridden = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("override.jpg", override_image, "image/jpeg")},
        data={
            "captured_at": "2026-06-02T14:00:00+02:00",
            "latitude": "48.137",
            "longitude": "11.575",
        },
    )
    assert overridden.status_code == 201, overridden.text
    assert overridden.json()["captured_at"] == "2026-06-02T12:00:00Z"
    assert overridden.json()["latitude"] == 48.137
    assert overridden.json()["longitude"] == 11.575


def _second_user(client: TestClient, auth: dict[str, str]) -> dict[str, str]:
    invitation = client.post("/api/v1/auth/invitations", headers=auth, json={}).json()
    registration = client.post(
        "/api/v1/auth/register",
        json={
            "email": "photos-second@example.com",
            "password": "second-secure-password",
            "display_name": "Second",
            "invite_token": invitation["token"],
        },
    )
    assert registration.status_code == 201, registration.text
    return {"Authorization": f"Bearer {registration.json()['access_token']}"}


def test_hydration_is_editable_and_transparent_in_summary(
    client: TestClient,
    auth: dict[str, str],
):
    activity = _upload_activity(client, auth, hydration_ml=750)
    activity_id = activity["id"]
    assert activity["hydration_ml"] == 750

    patched = client.patch(
        f"/api/v1/activities/{activity_id}",
        headers=auth,
        json={"hydration_ml": 1000},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["hydration_ml"] == 1000

    summary = client.post(f"/api/v1/activities/{activity_id}/summary", headers=auth)
    assert summary.status_code == 200, summary.text
    payload = summary.json()
    assert payload["provider"] == "local"
    assert "1000 ml" in payload["summary"]
    basis = payload["data_basis"]
    assert basis["period"]["started_at"] == "2026-06-01T08:00:00Z"
    hydration = next(metric for metric in basis["metrics"] if metric["name"] == "hydration")
    assert hydration == {
        "name": "hydration",
        "value": 1000,
        "unit": "ml",
        "activity_id": activity_id,
        "source": "Nutzereingabe",
        "method": "pro Aktivität dokumentierte Trinkmenge",
    }
    assert next(method for method in basis["methods"] if method["name"] == "similarity_selection")[
        "parameters"
    ]["maximum_candidates"] == 30

    earlier = client.post(
        "/api/v1/activities",
        headers=auth,
        files={
            "file": (
                "earlier.tcx",
                SAMPLE_TCX.replace(b"2026-06-01", b"2026-05-01"),
                "application/xml",
            )
        },
        data={"title": "Frühere Runde", "hydration_ml": "500"},
    )
    assert earlier.status_code == 201, earlier.text
    comparison = client.post(
        "/api/v1/activities/compare",
        headers=auth,
        json={"activity_ids": [earlier.json()["id"], activity_id]},
    )
    assert comparison.status_code == 200, comparison.text
    assert comparison.json()["ai_data_basis"]["methods"][0]["parameters"]["speed_weight"] == 0.45
    assert any(
        metric["name"] == "hydration_ml" and metric["activity_id"] == activity_id and metric["value"] == 1000
        for metric in comparison.json()["ai_data_basis"]["metrics"]
    )
    statistics = client.get("/api/v1/statistics/overview", headers=auth)
    assert statistics.status_code == 200
    assert statistics.json()["hydration_ml"] == 1500
    assert statistics.json()["hydration_activity_count"] == 2

    cleared = client.patch(
        f"/api/v1/activities/{activity_id}",
        headers=auth,
        json={"hydration_ml": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["hydration_ml"] is None
    assert cleared.json()["ai_summary"] is None
    assert cleared.json()["ai_data_basis"] is None


def test_activity_photo_gallery_validation_ownership_and_activity_cleanup(
    client: TestClient,
    auth: dict[str, str],
    tmp_path: Path,
    monkeypatch,
):
    activity = _upload_activity(client, auth)
    activity_id = activity["id"]
    image = _image_bytes("#145A55")
    uploaded = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("../../traversal.jpg", image, "image/jpeg")},
        data={
            "captured_at": "2026-06-01T10:15:00+02:00",
            "latitude": "52.5",
            "longitude": "13.4",
            "caption": "  Am See  ",
        },
    )
    assert uploaded.status_code == 201, uploaded.text
    photo = uploaded.json()
    photo_id = photo["id"]
    assert photo["content_type"] == "image/webp"
    assert photo["caption"] == "Am See"
    assert photo["captured_at"] == "2026-06-01T08:15:00Z"

    with SessionLocal() as db:
        stored = db.scalar(select(ActivityPhoto).where(ActivityPhoto.id == photo_id))
        storage_path = Path(stored.storage_path)
        assert storage_path.name == f"{photo_id}.webp"
        assert "traversal" not in str(storage_path)
        assert storage_path.is_file()

    duplicate = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("copy.jpg", image, "image/jpeg")},
    )
    assert duplicate.status_code == 409
    malformed = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("fake.png", b"not-an-image", "image/png")},
    )
    assert malformed.status_code == 422
    photo_storage = importlib.import_module("app.photo_storage")
    monkeypatch.setattr(photo_storage, "MAX_PHOTO_PIXELS", 100)
    too_many_pixels = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("pixels.jpg", _image_bytes("#334455"), "image/jpeg")},
    )
    assert too_many_pixels.status_code == 422
    monkeypatch.setattr(photo_storage, "MAX_PHOTO_PIXELS", 40_000_000)
    naive_time = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("second.jpg", _image_bytes("#723D46"), "image/jpeg")},
        data={"captured_at": "2026-06-01T10:15:00"},
    )
    assert naive_time.status_code == 422
    incomplete_location = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("location.jpg", _image_bytes("#7C5A44"), "image/jpeg")},
        data={"latitude": "52.5"},
    )
    assert incomplete_location.status_code == 422

    gallery = client.get(f"/api/v1/activities/{activity_id}/photos", headers=auth)
    assert gallery.status_code == 200
    assert gallery.json()["total"] == 1
    fetched = client.get(photo["file_url"], headers=auth)
    assert fetched.status_code == 200
    assert fetched.headers["content-type"] == "image/webp"
    assert fetched.headers["x-content-type-options"] == "nosniff"
    with Image.open(BytesIO(fetched.content)) as normalized:
        assert normalized.size == (320, 180)
        assert normalized.format == "WEBP"

    updated = client.patch(
        f"/api/v1/activities/{activity_id}/photos/{photo_id}",
        headers=auth,
        json={"caption": "Neue Bildunterschrift", "latitude": None, "longitude": None},
    )
    assert updated.status_code == 200
    assert updated.json()["caption"] == "Neue Bildunterschrift"
    assert updated.json()["latitude"] is None

    second = _second_user(client, auth)
    assert client.get(f"/api/v1/activities/{activity_id}/photos", headers=second).status_code == 404
    assert client.get(photo["file_url"], headers=second).status_code == 404
    assert client.delete(
        f"/api/v1/activities/{activity_id}/photos/{photo_id}", headers=second
    ).status_code == 404

    removed = client.delete(
        f"/api/v1/activities/{activity_id}/photos/{photo_id}",
        headers=auth,
    )
    assert removed.status_code == 204
    assert not storage_path.exists()

    second_photo = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("cleanup.png", _image_bytes("#2B4865", image_format="PNG"), "image/png")},
    )
    assert second_photo.status_code == 201, second_photo.text
    with SessionLocal() as db:
        stored = db.scalar(select(ActivityPhoto).where(ActivityPhoto.id == second_photo.json()["id"]))
        cleanup_path = Path(stored.storage_path)
        assert cleanup_path.exists()

        outside_path = tmp_path / "must-not-be-deleted.webp"
        outside_path.write_bytes(b"outside")
        stored.storage_path = str(outside_path)
        db.commit()

    unsafe_delete = client.delete(f"/api/v1/activities/{activity_id}", headers=auth)
    assert unsafe_delete.status_code == 409
    assert outside_path.exists()
    assert cleanup_path.exists()
    assert client.get(f"/api/v1/activities/{activity_id}", headers=auth).status_code == 200

    with SessionLocal() as db:
        stored = db.scalar(select(ActivityPhoto).where(ActivityPhoto.id == second_photo.json()["id"]))
        stored.storage_path = str(cleanup_path)
        db.commit()

    deleted_activity = client.delete(f"/api/v1/activities/{activity_id}", headers=auth)
    assert deleted_activity.status_code == 204
    assert not cleanup_path.exists()
    with SessionLocal() as db:
        assert db.scalar(select(ActivityPhoto).where(ActivityPhoto.id == second_photo.json()["id"])) is None


def _stored_activity(
    user_id: str,
    title: str,
    started_at: datetime,
    *,
    distance_m: float,
    duration_s: float,
    speed_mps: float,
    avg_hr_bpm: float | None = None,
    hydration_ml: int | None = None,
    weather: dict | None = None,
    track_points: list[dict] | None = None,
    elevation_gain_m: float = 100,
) -> Activity:
    return Activity(
        user_id=user_id,
        file_hash=uuid.uuid4().hex,
        original_filename=f"{title}.tcx",
        original_file_path=f"/tmp/{uuid.uuid4()}.tcx",
        title=title,
        activity_type="cycling",
        started_at=started_at,
        ended_at=started_at + timedelta(seconds=duration_s),
        distance_m=distance_m,
        duration_s=duration_s,
        moving_time_s=duration_s,
        pause_time_s=0,
        avg_speed_mps=speed_mps,
        max_speed_mps=speed_mps,
        elevation_gain_m=elevation_gain_m,
        avg_hr_bpm=avg_hr_bpm,
        max_hr_bpm=round(avg_hr_bpm + 20) if avg_hr_bpm else None,
        training_load=50,
        hr_zone_seconds={},
        track_points=track_points or [],
        hydration_ml=hydration_ml,
        weather=weather,
        weather_status="available" if weather else "unavailable",
    )


def _track(started_at: datetime, distances_and_seconds: list[tuple[float, float]]) -> list[dict]:
    return [
        {
            "time": (started_at + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z"),
            "distance_m": distance,
        }
        for distance, seconds in distances_and_seconds
    ]


def test_distance_record_scales_to_large_tracks():
    started_at = datetime(2025, 5, 1, 8, tzinfo=timezone.utc)
    point_count = 30_001
    activity = SimpleNamespace(
        distance_m=float(point_count - 1),
        avg_speed_mps=10.0,
        track_points=_track(
            started_at,
            [(float(index), index / 10) for index in range(point_count)],
        ),
    )

    started = perf_counter()
    effort = fastest_distance_effort(activity, 10_000)
    elapsed = perf_counter() - started

    assert effort is not None
    assert effort["duration_s"] == 1_000
    assert effort["estimated"] is False
    assert elapsed < 2


def test_personal_records_prefer_interpolated_track_points(client: TestClient, auth: dict[str, str]):
    user_id = client.get("/api/v1/profile", headers=auth).json()["id"]
    first_start = datetime(2025, 5, 1, 8, tzinfo=timezone.utc)
    long_ride = _stored_activity(
        user_id,
        "Lange Tour",
        first_start,
        distance_m=60_000,
        duration_s=10_800,
        speed_mps=60_000 / 10_800,
        track_points=_track(first_start, [(index * 10_000, index * 1_800) for index in range(7)]),
    )
    fast_start = datetime(2025, 6, 1, 8, tzinfo=timezone.utc)
    fast_ride = _stored_activity(
        user_id,
        "Schnelle Zwanzig",
        fast_start,
        distance_m=20_000,
        duration_s=1_800,
        speed_mps=20_000 / 1_800,
        track_points=_track(fast_start, [(0, 0), (5_000, 600), (15_000, 1_200), (20_000, 1_800)]),
    )
    climbing_start = datetime(2025, 7, 1, 8, tzinfo=timezone.utc)
    climbing_ride = _stored_activity(
        user_id,
        "Bergtag",
        climbing_start,
        distance_m=15_000,
        duration_s=3_600,
        speed_mps=15_000 / 3_600,
        elevation_gain_m=1_450,
    )
    with SessionLocal() as db:
        db.add_all([long_ride, fast_ride, climbing_ride])
        db.commit()

    response = client.get("/api/v1/statistics/records", headers=auth)
    assert response.status_code == 200, response.text
    records = response.json()
    by_distance = {record["target_distance_m"]: record for record in records["distance_records"]}
    assert set(by_distance) == {10_000, 20_000, 30_000, 40_000, 50_000}
    assert by_distance[10_000]["activity_id"] == fast_ride.id
    assert by_distance[10_000]["duration_s"] == 600
    assert by_distance[10_000]["source"] == "track_points_interpolated"
    assert by_distance[10_000]["estimated"] is False
    assert records["longest_ride"]["activity_id"] == long_ride.id
    assert records["highest_average_speed"]["activity_id"] == fast_ride.id
    assert records["highest_elevation_gain"]["activity_id"] == climbing_ride.id
    assert records["highest_elevation_gain"]["elevation_gain_m"] == 1_450
    assert records["methods"][0]["parameters"]["time_basis"] == "elapsed"


def _add_insight_history(user_id: str) -> list[Activity]:
    activities: list[Activity] = []
    started = datetime(2025, 1, 1, 8, tzinfo=timezone.utc)
    for index in range(18):
        if index:
            gap_hours = 24 if index % 2 else 72
            started = activities[-1].ended_at + timedelta(hours=gap_hours)
        long_gap_bonus = 0.8 if index and index % 2 == 0 else 0
        speed = 4.8 + index * 0.09 + long_gap_bonus
        heart_rate = 158 - index * 0.8
        temperature = 4 + index * 1.2 + long_gap_bonus * 5
        activities.append(
            _stored_activity(
                user_id,
                f"Entwicklung {index + 1}",
                started,
                distance_m=speed * 3_600,
                duration_s=3_600,
                speed_mps=speed,
                avg_hr_bpm=heart_rate,
                hydration_ml=400 + index * 20,
                weather={
                    "provider": "test",
                    "temperature_c": temperature,
                    "route_wind": {"net_headwind_kmh": index - 9},
                },
            )
        )
    with SessionLocal() as db:
        db.add_all(activities)
        db.commit()
    return activities


def test_long_term_insights_and_local_year_review(client: TestClient, auth: dict[str, str]):
    user_id = client.get("/api/v1/profile", headers=auth).json()["id"]
    activities = _add_insight_history(user_id)
    response = client.get(
        "/api/v1/statistics/insights?date_from=2025-01-01&date_to=2025-12-31",
        headers=auth,
    )
    assert response.status_code == 200, response.text
    insights = response.json()
    assert insights["current"]["activity_count"] == 18
    assert insights["current"]["hydration_ml"] == sum(activity.hydration_ml for activity in activities)
    assert len(insights["monthly"]) == 12
    assert len(insights["yearly"]) == 1
    assert insights["fitness_trend"]["status"] == "positive"
    kinds = {pattern["kind"] for pattern in insights["patterns"]}
    assert "weather_temperature_pace" in kinds
    assert "heart_rate_pace_development" in kinds
    assert "recovery_spacing" in kinds
    assert insights["methods"][1]["parameters"]["minimum_absolute_spearman"] == 0.35
    assert "keine Ursache" in insights["disclaimer"]

    review = client.get(
        "/api/v1/statistics/reviews/2025?season=year&use_openai=false",
        headers=auth,
    )
    assert review.status_code == 200, review.text
    payload = review.json()
    assert payload["provider"] == "local"
    assert "18 Fahrten" in payload["summary"]
    assert payload["data_basis"]["period"]["timezone"] == "Europe/Berlin"
    assert payload["data_basis"]["activity_ids"] == [activity.id for activity in activities]
    assert next(metric for metric in payload["data_basis"]["metrics"] if metric["name"] == "hydration")[
        "value"
    ] == sum(activity.hydration_ml for activity in activities)
    pattern_method = next(
        method for method in payload["data_basis"]["methods"] if method["name"] == "robust_pattern_detection"
    )
    assert pattern_method["parameters"]["minimum_effect_percent"] == 4


def test_year_review_can_use_openai_without_changing_contract(
    client: TestClient,
    auth: dict[str, str],
    monkeypatch,
):
    user_id = client.get("/api/v1/profile", headers=auth).json()["id"]
    _add_insight_history(user_id)
    calls: list[dict] = []

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(output_text="Ein transparenter KI-Jahresrückblick.")

    class FakeOpenAI:
        def __init__(self, **kwargs):
            self.responses = FakeResponses()

    ai_module = importlib.import_module("app.ai")
    monkeypatch.setattr(ai_module, "OpenAI", FakeOpenAI)
    settings = get_settings()
    settings.openai_api_key = "test-key"
    try:
        response = client.get(
            "/api/v1/statistics/reviews/2025?use_openai=true",
            headers=auth,
        )
    finally:
        settings.openai_api_key = None
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["provider"] == "openai"
    assert payload["summary"] == "Ein transparenter KI-Jahresrückblick."
    assert payload["data_basis"]["methods"][-1]["parameters"]["provider"] == "openai"
    assert calls[0]["store"] is False
    assert "totals" in calls[0]["input"]
