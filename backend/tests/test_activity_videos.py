from __future__ import annotations

import shutil
import subprocess
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select

from app.config import get_settings
from app.database import SessionLocal
from app.models import ActivityPhoto

from conftest import SAMPLE_TCX


pytestmark = pytest.mark.skipif(
    not shutil.which("ffmpeg") or not shutil.which("ffprobe"),
    reason="FFmpeg/FFprobe sind für Video-Integrationstests erforderlich.",
)


def _activity(client: TestClient, auth: dict[str, str]) -> str:
    response = client.post(
        "/api/v1/activities",
        headers=auth,
        files={"file": ("ride.tcx", SAMPLE_TCX, "application/xml")},
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _video_bytes(
    tmp_path: Path,
    *,
    duration: float = 1,
    creation_time: str | None = None,
) -> bytes:
    destination = tmp_path / f"sample-{duration}-{creation_time or 'plain'}.mp4"
    command = [
        "ffmpeg",
        "-nostdin",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=#145A55:s=320x180:d={duration}",
        "-an",
        "-c:v",
        "mpeg4",
    ]
    if creation_time:
        command.extend(["-metadata", f"creation_time={creation_time}"])
    command.append(str(destination))
    subprocess.run(command, check=True, capture_output=True)
    return destination.read_bytes()


def _image_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (1200, 675), "#E9A23B").save(output, format="JPEG")
    return output.getvalue()


def test_video_upload_processing_playback_poster_isolation_and_cleanup(
    client: TestClient,
    auth: dict[str, str],
    tmp_path: Path,
):
    activity_id = _activity(client, auth)
    video = _video_bytes(tmp_path, creation_time="2026-06-01T08:15:30Z")
    response = client.post(
        f"/api/v1/activities/{activity_id}/media",
        headers=auth,
        files={"file": ("../../runde.mp4", video, "application/octet-stream")},
        data={"caption": "  Abfahrt  "},
    )
    assert response.status_code == 201, response.text
    media = response.json()
    assert media["media_type"] == "video"
    assert media["processing_status"] == "pending"
    media = client.get(f"/api/v1/activities/{activity_id}/media", headers=auth).json()["items"][0]
    assert media["processing_status"] == "ready"
    assert media["caption"] == "Abfahrt"
    assert media["captured_at"] == "2026-06-01T08:15:30Z"
    assert media["duration_s"] == pytest.approx(1, abs=0.1)
    assert media["width"] == 320
    assert media["height"] == 180
    assert media["poster_url"]
    assert media["original_filename"] == "runde.mp4"

    playback = client.get(media["file_url"], headers=auth)
    assert playback.status_code == 200
    assert playback.headers["content-type"] == "video/mp4"
    assert playback.content
    playback_access = client.post(
        f"/api/v1/activities/{activity_id}/media/{media['id']}/playback-token",
        headers=auth,
    )
    assert playback_access.status_code == 200
    ranged = client.get(playback_access.json()["url"], headers={"Range": "bytes=0-31"})
    assert ranged.status_code == 206
    assert ranged.headers["content-range"].startswith("bytes 0-31/")
    assert len(ranged.content) == 32
    assert client.get(
        f"/api/v1/activities/{activity_id}/media/{media['id']}/stream?token=invalid-token-value-that-is-long"
    ).status_code == 401
    poster = client.get(media["poster_url"], headers=auth)
    assert poster.status_code == 200
    assert poster.headers["content-type"] == "image/webp"
    original = client.get(media["original_file_url"], headers=auth)
    assert original.status_code == 200
    assert original.content == video

    gallery = client.get(f"/api/v1/activities/{activity_id}/media", headers=auth)
    assert gallery.status_code == 200
    assert gallery.json()["items"][0]["id"] == media["id"]
    # Legacy photo clients do not receive videos they cannot decode.
    photos = client.get(f"/api/v1/activities/{activity_id}/photos", headers=auth)
    assert photos.json() == {"items": [], "total": 0}
    image = client.post(
        f"/api/v1/activities/{activity_id}/photos",
        headers=auth,
        files={"file": ("pause.jpg", _image_bytes(), "image/jpeg")},
    )
    assert image.status_code == 201
    mixed = client.get(f"/api/v1/activities/{activity_id}/media", headers=auth).json()
    assert mixed["total"] == 2
    assert {item["media_type"] for item in mixed["items"]} == {"image", "video"}
    image_media = next(item for item in mixed["items"] if item["media_type"] == "image")
    assert image_media["poster_url"]
    # Existing photos from before the migration receive their small preview
    # lazily on first access.
    with SessionLocal() as db:
        stored_image = db.get(ActivityPhoto, image_media["id"])
        Path(stored_image.poster_storage_path).unlink()
        stored_image.poster_storage_path = None
        db.commit()
    image_preview = client.get(image_media["poster_url"], headers=auth)
    assert image_preview.status_code == 200
    with Image.open(BytesIO(image_preview.content)) as preview:
        assert max(preview.size) == 640

    duplicate = client.post(
        f"/api/v1/activities/{activity_id}/media",
        headers=auth,
        files={"file": ("copy.mov", video, "video/quicktime")},
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["id"] == media["id"]
    assert client.get(f"/api/v1/activities/{activity_id}/media", headers=auth).json()["total"] == 2

    second_auth = client.post(
        "/api/v1/auth/invitations",
        headers=auth,
        json={"email": "video-second@example.com"},
    )
    assert second_auth.status_code == 201
    registered = client.post(
        "/api/v1/auth/register",
        json={
            "email": "video-second@example.com",
            "password": "second-user-password",
            "display_name": "Second",
            "invite_token": second_auth.json()["token"],
        },
    )
    other = {"Authorization": f"Bearer {registered.json()['access_token']}"}
    assert client.get(media["file_url"], headers=other).status_code == 404
    assert client.get(media["poster_url"], headers=other).status_code == 404
    assert client.post(
        f"/api/v1/activities/{activity_id}/media/{media['id']}/playback-token",
        headers=other,
    ).status_code == 404

    with SessionLocal() as db:
        stored = db.scalar(select(ActivityPhoto).where(ActivityPhoto.id == media["id"]))
        paths = [
            Path(stored.original_storage_path),
            Path(stored.storage_path),
            Path(stored.poster_storage_path),
        ]
        assert all(path.is_file() for path in paths)
    assert client.delete(
        f"/api/v1/activities/{activity_id}/media/{media['id']}",
        headers=auth,
    ).status_code == 204
    assert all(not path.exists() for path in paths)


def test_video_validation_limits_failed_state_and_retry(
    client: TestClient,
    auth: dict[str, str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    activity_id = _activity(client, auth)
    malformed = client.post(
        f"/api/v1/activities/{activity_id}/media",
        headers=auth,
        files={"file": ("defekt.mp4", b"not-a-video", "video/mp4")},
    )
    assert malformed.status_code == 422
    assert "defekt.mp4" in malformed.json()["detail"]

    settings = get_settings()
    original_duration_limit = settings.max_video_duration_seconds
    original_size_limit = settings.max_video_upload_bytes
    try:
        settings.max_video_duration_seconds = 0.25
        too_long = client.post(
            f"/api/v1/activities/{activity_id}/media",
            headers=auth,
            files={"file": ("lang.mp4", _video_bytes(tmp_path), "video/mp4")},
        )
        assert too_long.status_code == 422
        assert "länger" in too_long.json()["detail"]

        settings.max_video_duration_seconds = original_duration_limit
        settings.max_video_upload_bytes = 10
        too_large = client.post(
            f"/api/v1/activities/{activity_id}/media",
            headers=auth,
            files={"file": ("groß.mp4", _video_bytes(tmp_path), "video/mp4")},
        )
        assert too_large.status_code == 422
        assert "höchstens" in too_large.json()["detail"]
    finally:
        settings.max_video_duration_seconds = original_duration_limit
        settings.max_video_upload_bytes = original_size_limit

    from app.routers import activity_photos

    real_processor = activity_photos.create_video_derivatives

    def fail_processing(*args, **kwargs):
        raise RuntimeError("Testfehler bei der Transkodierung")

    monkeypatch.setattr(activity_photos, "create_video_derivatives", fail_processing)
    failed = client.post(
        f"/api/v1/activities/{activity_id}/media",
        headers=auth,
        files={"file": ("retry.mp4", _video_bytes(tmp_path, duration=1.2), "video/mp4")},
    )
    assert failed.status_code == 201
    failed_media = client.get(f"/api/v1/activities/{activity_id}/media", headers=auth).json()["items"][0]
    assert failed_media["processing_status"] == "failed"
    assert failed_media["processing_error"] == "Die Videoverarbeitung ist fehlgeschlagen. Bitte versuche sie erneut."
    assert client.get(failed_media["original_file_url"], headers=auth).status_code == 200

    monkeypatch.setattr(activity_photos, "create_video_derivatives", real_processor)
    retried = client.post(
        f"/api/v1/activities/{activity_id}/media/{failed_media['id']}/retry",
        headers=auth,
    )
    assert retried.status_code == 200
    assert retried.json()["processing_status"] == "pending"
    retried_media = client.get(f"/api/v1/activities/{activity_id}/media", headers=auth).json()["items"][0]
    assert retried_media["processing_status"] == "ready"
    assert retried_media["processing_error"] is None
    repeated_retry = client.post(
        f"/api/v1/activities/{activity_id}/media/{failed_media['id']}/retry",
        headers=auth,
    )
    assert repeated_retry.status_code == 200
    assert repeated_retry.json()["processing_status"] == "ready"
