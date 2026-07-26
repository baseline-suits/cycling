from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, tzinfo
from pathlib import Path
from typing import BinaryIO

from .config import Settings


ALLOWED_VIDEO_FORMATS = {"mov", "mp4", "webm"}
ALLOWED_VIDEO_CODECS = {"h264", "hevc", "av1", "vp8", "vp9", "mpeg4"}
DIRECT_PLAY_VIDEO_CODECS = {"h264"}
DIRECT_PLAY_AUDIO_CODECS = {None, "aac", "mp3"}
COPY_CHUNK_BYTES = 1024 * 1024


class VideoValidationError(ValueError):
    pass


@dataclass(frozen=True)
class VideoProbe:
    content_type: str
    container_format: str
    duration_s: float
    width: int
    height: int
    video_codec: str
    audio_codec: str | None
    orientation_degrees: int
    captured_at: datetime | None
    latitude: float | None
    longitude: float | None


@dataclass(frozen=True)
class OriginalVideo:
    path: Path
    file_hash: str
    size_bytes: int
    probe: VideoProbe


@dataclass(frozen=True)
class ProcessedVideo:
    playback_path: Path
    poster_path: Path
    content_type: str
    size_bytes: int


def _media_root(upload_dir: Path) -> Path:
    # The historical directory name is retained so existing deployments and
    # the transactional deletion helpers remain backwards compatible.
    root = (upload_dir / "activity_photos").resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _validated_id(media_id: str) -> str:
    try:
        normalized = str(uuid.UUID(media_id))
    except (ValueError, AttributeError) as exc:
        raise ValueError("Ungültige serverseitige Medien-ID.") from exc
    if normalized != media_id.lower():
        raise ValueError("Ungültige serverseitige Medien-ID.")
    return normalized


def _destination(upload_dir: Path, media_id: str, suffix: str) -> Path:
    normalized = _validated_id(media_id)
    root = _media_root(upload_dir)
    shard = normalized.replace("-", "")[:2]
    destination = (root / shard / f"{normalized}{suffix}").resolve()
    if not destination.is_relative_to(root):
        raise ValueError("Der Medienzielpfad liegt außerhalb des Uploadverzeichnisses.")
    return destination


def _run(command: list[str], *, timeout: float, error: str) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise VideoValidationError("Die Videoverarbeitung ist auf diesem Server nicht verfügbar.") from exc
    except subprocess.TimeoutExpired as exc:
        raise VideoValidationError("Die Videoverarbeitung hat das Zeitlimit überschritten.") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip().splitlines()
        suffix = f" ({detail[-1][:240]})" if detail else ""
        raise VideoValidationError(f"{error}{suffix}") from exc


def _float(value: object) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _captured_at(tags: dict[str, object], assumed_timezone: tzinfo | None) -> datetime | None:
    raw = tags.get("creation_time") or tags.get("com.apple.quicktime.creationdate")
    if not raw:
        return None
    value = str(raw).strip()
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        if assumed_timezone is None:
            return None
        parsed = parsed.replace(tzinfo=assumed_timezone)
    return parsed.astimezone(timezone.utc)


def _location(tags: dict[str, object]) -> tuple[float | None, float | None]:
    raw = tags.get("location") or tags.get("com.apple.quicktime.location.ISO6709")
    if not raw:
        return None, None
    match = re.match(r"^([+-]\d{1,3}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)", str(raw).strip())
    if not match:
        return None, None
    latitude, longitude = _float(match.group(1)), _float(match.group(2))
    if latitude is None or longitude is None or not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
        return None, None
    return latitude, longitude


def probe_video(path: Path, settings: Settings, assumed_timezone: tzinfo | None = None) -> VideoProbe:
    result = _run(
        [
            settings.ffprobe_path,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        timeout=30,
        error="Die Videodatei ist beschädigt oder nicht lesbar.",
    )
    try:
        payload = json.loads(result.stdout)
        streams = payload.get("streams") or []
        video = next(stream for stream in streams if stream.get("codec_type") == "video")
        audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
        format_data = payload.get("format") or {}
    except (json.JSONDecodeError, KeyError, StopIteration, TypeError) as exc:
        raise VideoValidationError("Die Datei enthält keine gültige Videospur.") from exc

    format_names = {part.strip().lower() for part in str(format_data.get("format_name") or "").split(",")}
    recognized = format_names & ALLOWED_VIDEO_FORMATS
    if not recognized:
        raise VideoValidationError("Unterstützt werden MP4-, MOV- und WebM-Videos.")
    video_codec = str(video.get("codec_name") or "").lower()
    if video_codec not in ALLOWED_VIDEO_CODECS:
        raise VideoValidationError(f"Der Video-Codec „{video_codec or 'unbekannt'}“ wird nicht unterstützt.")
    duration = _float(format_data.get("duration")) or _float(video.get("duration"))
    if duration is None or duration <= 0:
        raise VideoValidationError("Die Videodauer konnte nicht zuverlässig bestimmt werden.")
    if duration > settings.max_video_duration_seconds:
        maximum_minutes = settings.max_video_duration_seconds / 60
        raise VideoValidationError(f"Das Video ist länger als die erlaubten {maximum_minutes:g} Minuten.")
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    if width <= 0 or height <= 0 or width * height > settings.max_video_pixels:
        raise VideoValidationError("Das Video hat unzulässige Abmessungen.")

    tags = {**(format_data.get("tags") or {}), **(video.get("tags") or {})}
    latitude, longitude = _location(tags)
    rotation = _float(tags.get("rotate")) or 0
    for side_data in video.get("side_data_list") or []:
        if _float(side_data.get("rotation")) is not None:
            rotation = _float(side_data.get("rotation")) or 0
            break
    container = "webm" if "webm" in recognized else ("mov" if format_names == {"mov"} else "mp4")
    content_type = {"webm": "video/webm", "mov": "video/quicktime", "mp4": "video/mp4"}[container]
    return VideoProbe(
        content_type=content_type,
        container_format=container,
        duration_s=duration,
        width=width,
        height=height,
        video_codec=video_codec,
        audio_codec=str(audio.get("codec_name") or "").lower() if audio else None,
        orientation_degrees=int(rotation) % 360,
        captured_at=_captured_at(tags, assumed_timezone),
        latitude=latitude,
        longitude=longitude,
    )


def validate_and_store_video(
    source: BinaryIO,
    media_id: str,
    settings: Settings,
    assumed_timezone: tzinfo | None = None,
) -> OriginalVideo:
    destination = _destination(settings.upload_dir, media_id, ".video.original")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.parent / f".{uuid.uuid4()}.video-upload.tmp"
    digest = hashlib.sha256()
    size = 0
    try:
        with temporary.open("wb") as output:
            while chunk := source.read(COPY_CHUNK_BYTES):
                size += len(chunk)
                if size > settings.max_video_upload_bytes:
                    maximum_mb = settings.max_video_upload_bytes // (1024 * 1024)
                    raise VideoValidationError(f"Das Video darf höchstens {maximum_mb} MB groß sein.")
                digest.update(chunk)
                output.write(chunk)
        if size == 0:
            raise VideoValidationError("Die Videodatei ist leer.")
        probe = probe_video(temporary, settings, assumed_timezone)
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return OriginalVideo(path=destination, file_hash=digest.hexdigest(), size_bytes=size, probe=probe)


def _h264_encoder(ffmpeg_path: str) -> str:
    try:
        result = subprocess.run(
            [ffmpeg_path, "-hide_banner", "-encoders"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return "libx264"
    return "libx264" if "libx264" in result.stdout else "libopenh264"


def create_video_derivatives(
    original_path: Path,
    media_id: str,
    settings: Settings,
    probe: VideoProbe,
) -> ProcessedVideo:
    playback = _destination(settings.upload_dir, media_id, ".mp4")
    poster = _destination(settings.upload_dir, media_id, ".poster.webp")
    playback.parent.mkdir(parents=True, exist_ok=True)
    temporary_playback = playback.parent / f".{uuid.uuid4()}.mp4.tmp"
    temporary_poster = poster.parent / f".{uuid.uuid4()}.webp.tmp"
    compatible = (
        probe.container_format == "mp4"
        and probe.video_codec in DIRECT_PLAY_VIDEO_CODECS
        and probe.audio_codec in DIRECT_PLAY_AUDIO_CODECS
    )
    try:
        if compatible:
            _run(
                [
                    settings.ffmpeg_path,
                    "-nostdin",
                    "-y",
                    "-i",
                    str(original_path),
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a:0?",
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                    "-f",
                    "mp4",
                    str(temporary_playback),
                ],
                timeout=max(120, probe.duration_s * 2),
                error="Die browserkompatible Videovariante konnte nicht erstellt werden.",
            )
        else:
            _run(
                [
                    settings.ffmpeg_path,
                    "-nostdin",
                    "-y",
                    "-i",
                    str(original_path),
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a:0?",
                    "-c:v",
                    _h264_encoder(settings.ffmpeg_path),
                    "-pix_fmt",
                    "yuv420p",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "128k",
                    "-movflags",
                    "+faststart",
                    "-f",
                    "mp4",
                    str(temporary_playback),
                ],
                timeout=max(180, probe.duration_s * 8),
                error="Das Video konnte nicht in ein unterstütztes Wiedergabeformat umgewandelt werden.",
            )
        seek = min(1.0, max(0.0, probe.duration_s * 0.1))
        _run(
            [
                settings.ffmpeg_path,
                "-nostdin",
                "-y",
                "-ss",
                f"{seek:.3f}",
                "-i",
                str(original_path),
                "-frames:v",
                "1",
                "-vf",
                "scale='min(1280,iw)':-2",
                "-c:v",
                "libwebp",
                "-quality",
                "82",
                "-f",
                "webp",
                str(temporary_poster),
            ],
            timeout=120,
            error="Das Video-Poster konnte nicht erstellt werden.",
        )
        os.replace(temporary_playback, playback)
        os.replace(temporary_poster, poster)
    except Exception:
        temporary_playback.unlink(missing_ok=True)
        temporary_poster.unlink(missing_ok=True)
        raise
    return ProcessedVideo(
        playback_path=playback,
        poster_path=poster,
        content_type="video/mp4",
        size_bytes=playback.stat().st_size,
    )


def ffmpeg_available(settings: Settings) -> bool:
    return bool(shutil.which(settings.ffmpeg_path) and shutil.which(settings.ffprobe_path))
