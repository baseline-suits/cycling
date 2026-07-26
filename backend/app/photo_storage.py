from __future__ import annotations

import hashlib
import math
import os
import re
import uuid
import warnings
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone, tzinfo
from io import BytesIO
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageOps, UnidentifiedImageError


MAX_PHOTO_BYTES = 15 * 1024 * 1024
MAX_PHOTO_PIXELS = 40_000_000
MAX_PHOTOS_PER_ACTIVITY = 30
PHOTO_THUMBNAIL_MAX_EDGE = 640
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


class PhotoValidationError(ValueError):
    pass


@dataclass(frozen=True)
class StoredPhoto:
    path: Path
    file_hash: str
    size_bytes: int
    width: int
    height: int
    content_type: str = "image/webp"
    captured_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None


@dataclass(frozen=True)
class OriginalPhoto:
    path: Path
    file_hash: str
    size_bytes: int
    width: int
    height: int
    content_type: str
    captured_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None


@dataclass(frozen=True)
class StagedPhotoDeletion:
    original_path: Path
    staged_path: Path


def _photo_root(upload_dir: Path) -> Path:
    root = (upload_dir / "activity_photos").resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _server_generated_destination(upload_dir: Path, photo_id: str) -> Path:
    try:
        normalized_id = str(uuid.UUID(photo_id))
    except (ValueError, AttributeError) as exc:
        raise ValueError("Ungültige serverseitige Foto-ID.") from exc
    if normalized_id != photo_id.lower():
        raise ValueError("Ungültige serverseitige Foto-ID.")
    root = _photo_root(upload_dir)
    shard = normalized_id.replace("-", "")[:2]
    destination = (root / shard / f"{normalized_id}.webp").resolve()
    if not destination.is_relative_to(root):
        raise ValueError("Der Fotozielpfad liegt außerhalb des Uploadverzeichnisses.")
    return destination


def _thumbnail_destination(upload_dir: Path, photo_id: str) -> Path:
    try:
        normalized_id = str(uuid.UUID(photo_id))
    except (ValueError, AttributeError) as exc:
        raise ValueError("Ungültige serverseitige Foto-ID.") from exc
    root = _photo_root(upload_dir)
    shard = normalized_id.replace("-", "")[:2]
    destination = (root / shard / f"{normalized_id}.thumb.webp").resolve()
    if not destination.is_relative_to(root):
        raise ValueError("Der Fotozielpfad liegt außerhalb des Uploadverzeichnisses.")
    return destination


def _original_destination(upload_dir: Path, photo_id: str) -> Path:
    try:
        normalized_id = str(uuid.UUID(photo_id))
    except (ValueError, AttributeError) as exc:
        raise ValueError("Ungültige serverseitige Foto-ID.") from exc
    root = _photo_root(upload_dir)
    shard = normalized_id.replace("-", "")[:2]
    destination = (root / shard / f"{normalized_id}.original").resolve()
    if not destination.is_relative_to(root):
        raise ValueError("Der Fotozielpfad liegt außerhalb des Uploadverzeichnisses.")
    return destination


def validate_and_store_original(
    data: bytes,
    photo_id: str,
    upload_dir: Path,
    assumed_timezone: tzinfo | None = None,
) -> OriginalPhoto:
    """Validate and persist the immutable source bytes without transcoding them."""
    if not data:
        raise PhotoValidationError("Die Bilddatei ist leer.")
    if len(data) > MAX_PHOTO_BYTES:
        raise PhotoValidationError("Das Aktivitätsfoto ist zu groß.")

    digest = hashlib.sha256(data).hexdigest()
    destination = _original_destination(upload_dir, photo_id)
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as probe:
                image_format = (probe.format or "").upper()
                width, height = probe.size
                if image_format not in ALLOWED_IMAGE_FORMATS:
                    raise PhotoValidationError("Unterstützt werden JPEG-, PNG- und WebP-Bilder.")
                if width <= 0 or height <= 0 or width * height > MAX_PHOTO_PIXELS:
                    raise PhotoValidationError("Das Aktivitätsfoto hat unzulässige Abmessungen.")
                if getattr(probe, "n_frames", 1) != 1:
                    raise PhotoValidationError("Animierte Aktivitätsfotos werden nicht unterstützt.")
                probe.verify()
            with Image.open(BytesIO(data)) as source:
                source.load()
                captured_at, latitude, longitude = _exif_metadata(source, assumed_timezone)
                content_type = Image.MIME.get((source.format or "").upper(), "application/octet-stream")
        temporary = destination.parent / f".{uuid.uuid4()}.original.tmp"
        temporary.write_bytes(data)
        os.replace(temporary, destination)
    except PhotoValidationError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError) as exc:
        raise PhotoValidationError("Die Datei ist kein gültiges, sicher lesbares Bild.") from exc

    return OriginalPhoto(
        path=destination,
        file_hash=digest,
        size_bytes=len(data),
        width=width,
        height=height,
        content_type=content_type,
        captured_at=captured_at,
        latitude=latitude,
        longitude=longitude,
    )


def create_optimized_photo(original_path: Path, photo_id: str, upload_dir: Path) -> StoredPhoto:
    """Create the derived WebP while keeping the original untouched."""
    data = original_path.read_bytes()
    destination = _server_generated_destination(upload_dir, photo_id)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.parent / f".{uuid.uuid4()}.tmp"
    try:
        with Image.open(BytesIO(data)) as source:
            source.load()
            normalized = ImageOps.exif_transpose(source)
            has_alpha = normalized.mode in {"RGBA", "LA"} or (
                normalized.mode == "P" and "transparency" in normalized.info
            )
            output = normalized.convert("RGBA" if has_alpha else "RGB")
            try:
                width, height = output.size
                output.save(temporary, format="WEBP", quality=86, method=4)
            finally:
                output.close()
        os.replace(temporary, destination)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError) as exc:
        temporary.unlink(missing_ok=True)
        raise PhotoValidationError("Die optimierte Bildvariante konnte nicht erstellt werden.") from exc
    return StoredPhoto(
        path=destination,
        file_hash=hashlib.sha256(data).hexdigest(),
        size_bytes=destination.stat().st_size,
        width=width,
        height=height,
    )


def create_photo_thumbnail(source_path: Path, photo_id: str, upload_dir: Path) -> StoredPhoto:
    """Create a small gallery preview without replacing the display variant."""
    destination = _thumbnail_destination(upload_dir, photo_id)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.parent / f".{uuid.uuid4()}.thumb.tmp"
    try:
        with Image.open(source_path) as source:
            source.load()
            normalized = ImageOps.exif_transpose(source)
            has_alpha = normalized.mode in {"RGBA", "LA"} or (
                normalized.mode == "P" and "transparency" in normalized.info
            )
            output = normalized.convert("RGBA" if has_alpha else "RGB")
            try:
                output.thumbnail(
                    (PHOTO_THUMBNAIL_MAX_EDGE, PHOTO_THUMBNAIL_MAX_EDGE),
                    Image.Resampling.LANCZOS,
                )
                width, height = output.size
                output.save(temporary, format="WEBP", quality=78, method=4)
            finally:
                output.close()
        os.replace(temporary, destination)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError) as exc:
        temporary.unlink(missing_ok=True)
        raise PhotoValidationError("Die Fotovorschau konnte nicht erstellt werden.") from exc
    return StoredPhoto(
        path=destination,
        file_hash=hashlib.sha256(source_path.read_bytes()).hexdigest(),
        size_bytes=destination.stat().st_size,
        width=width,
        height=height,
    )


def safe_photo_path(stored_path: str | Path, upload_dir: Path, *, must_exist: bool = False) -> Path:
    root = _photo_root(upload_dir)
    candidate = Path(stored_path).resolve(strict=False)
    if not candidate.is_relative_to(root) or candidate == root:
        raise ValueError("Unsicherer Fotopfad.")
    if must_exist and (not candidate.is_file() or candidate.is_symlink()):
        raise FileNotFoundError(candidate)
    return candidate


def _exif_text(value: object) -> str:
    if isinstance(value, bytes):
        return value.decode("ascii", errors="ignore").strip("\x00 ")
    return str(value).strip("\x00 ")


def _exif_value(exif: Image.Exif, *tags: int) -> object | None:
    for tag in tags:
        value = exif.get(tag)
        if value:
            return value
    # DateTimeOriginal, OffsetTimeOriginal and their related fields normally
    # live in the nested Exif IFD, while some encoders expose them at the root.
    try:
        nested = exif.get_ifd(34665)
    except (KeyError, TypeError, ValueError):
        return None
    for tag in tags:
        value = nested.get(tag)
        if value:
            return value
    return None


def _exif_datetime(exif: Image.Exif, assumed_timezone: tzinfo | None) -> datetime | None:
    # DateTimeOriginal, falling back to DateTimeDigitized and DateTime.
    raw_date = _exif_value(exif, 36867, 36868, 306)
    if not raw_date:
        return None
    value = _exif_text(raw_date)
    captured_at = None
    for pattern in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            captured_at = datetime.strptime(value, pattern)
            break
        except ValueError:
            continue
    if captured_at is None:
        return None

    raw_subseconds = _exif_value(exif, 37521, 37522, 37520)
    if raw_subseconds:
        digits = "".join(character for character in _exif_text(raw_subseconds) if character.isdigit())
        if digits:
            captured_at = captured_at.replace(microsecond=int((digits + "000000")[:6]))

    raw_offset = _exif_value(exif, 36881, 36882, 36880)
    if raw_offset:
        match = re.fullmatch(r"([+-])(\d{2}):?(\d{2})", _exif_text(raw_offset))
        if match:
            minutes = int(match.group(2)) * 60 + int(match.group(3))
            if minutes <= 23 * 60 + 59:
                if match.group(1) == "-":
                    minutes = -minutes
                return captured_at.replace(tzinfo=timezone(timedelta(minutes=minutes)))
    return captured_at.replace(tzinfo=assumed_timezone) if assumed_timezone is not None else None


def _gps_coordinate(
    value: object,
    reference: object,
    *,
    limit: float,
    positive_reference: str,
    negative_reference: str,
) -> float | None:
    if not isinstance(value, (tuple, list)) or len(value) != 3:
        return None
    try:
        degrees, minutes, seconds = (float(part) for part in value)
        if degrees < 0 or minutes < 0 or minutes >= 60 or seconds < 0 or seconds >= 60:
            return None
        coordinate = degrees + minutes / 60 + seconds / 3600
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    ref = _exif_text(reference).upper()
    if ref == negative_reference:
        coordinate = -coordinate
    elif ref != positive_reference:
        return None
    return coordinate if math.isfinite(coordinate) and -limit <= coordinate <= limit else None


def _exif_metadata(image: Image.Image, assumed_timezone: tzinfo | None) -> tuple[datetime | None, float | None, float | None]:
    try:
        exif = image.getexif()
    except (AttributeError, TypeError, ValueError):
        return None, None, None
    try:
        captured_at = _exif_datetime(exif, assumed_timezone)
    except (TypeError, ValueError, OverflowError):
        captured_at = None
    try:
        gps = exif.get_ifd(34853)
        latitude = (
            _gps_coordinate(
                gps.get(2), gps.get(1), limit=90, positive_reference="N", negative_reference="S"
            )
            if gps
            else None
        )
        longitude = (
            _gps_coordinate(
                gps.get(4), gps.get(3), limit=180, positive_reference="E", negative_reference="W"
            )
            if gps
            else None
        )
        if (latitude is None) != (longitude is None):
            latitude = longitude = None
    except (AttributeError, KeyError, TypeError, ValueError, ZeroDivisionError):
        # Broken optional GPS metadata must not discard a valid capture time.
        latitude = longitude = None
    return captured_at, latitude, longitude


def validate_and_store_photo(
    data: bytes,
    photo_id: str,
    upload_dir: Path,
    assumed_timezone: tzinfo | None = None,
) -> StoredPhoto:
    if not data:
        raise PhotoValidationError("Die Bilddatei ist leer.")
    if len(data) > MAX_PHOTO_BYTES:
        raise PhotoValidationError("Das Aktivitätsfoto ist zu groß.")

    digest = hashlib.sha256(data).hexdigest()
    destination = _server_generated_destination(upload_dir, photo_id)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.parent / f".{uuid.uuid4()}.tmp"
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as probe:
                image_format = (probe.format or "").upper()
                width, height = probe.size
                if image_format not in ALLOWED_IMAGE_FORMATS:
                    raise PhotoValidationError("Unterstützt werden JPEG-, PNG- und WebP-Bilder.")
                if width <= 0 or height <= 0 or width * height > MAX_PHOTO_PIXELS:
                    raise PhotoValidationError("Das Aktivitätsfoto hat unzulässige Abmessungen.")
                if getattr(probe, "n_frames", 1) != 1:
                    raise PhotoValidationError("Animierte Aktivitätsfotos werden nicht unterstützt.")
                probe.verify()

            with Image.open(BytesIO(data)) as source:
                source.load()
                captured_at, latitude, longitude = _exif_metadata(source, assumed_timezone)
                normalized = ImageOps.exif_transpose(source)
                has_alpha = normalized.mode in {"RGBA", "LA"} or (
                    normalized.mode == "P" and "transparency" in normalized.info
                )
                output = normalized.convert("RGBA" if has_alpha else "RGB")
                try:
                    width, height = output.size
                    output.save(temporary, format="WEBP", quality=90, method=6)
                finally:
                    output.close()
        os.replace(temporary, destination)
    except PhotoValidationError:
        temporary.unlink(missing_ok=True)
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError, ValueError) as exc:
        temporary.unlink(missing_ok=True)
        raise PhotoValidationError("Die Datei ist kein gültiges, sicher lesbares Bild.") from exc

    return StoredPhoto(
        path=destination,
        file_hash=digest,
        size_bytes=destination.stat().st_size,
        width=width,
        height=height,
        captured_at=captured_at,
        latitude=latitude,
        longitude=longitude,
    )


def stage_photo_deletions(paths: Iterable[str | Path], upload_dir: Path) -> list[StagedPhotoDeletion]:
    root = _photo_root(upload_dir)
    trash = root / ".trash"
    staged: list[StagedPhotoDeletion] = []
    try:
        for raw_path in paths:
            path = safe_photo_path(raw_path, upload_dir)
            if not path.exists():
                continue
            if not path.is_file() or path.is_symlink():
                raise ValueError("Der gespeicherte Fotopfad verweist nicht auf eine reguläre Datei.")
            trash.mkdir(parents=True, exist_ok=True)
            staged_path = trash / f"{uuid.uuid4()}.deleted"
            os.replace(path, staged_path)
            staged.append(StagedPhotoDeletion(original_path=path, staged_path=staged_path))
    except Exception:
        restore_staged_photo_deletions(staged)
        raise
    return staged


def restore_staged_photo_deletions(staged: Iterable[StagedPhotoDeletion]) -> None:
    for item in reversed(list(staged)):
        if not item.staged_path.exists():
            continue
        item.original_path.parent.mkdir(parents=True, exist_ok=True)
        os.replace(item.staged_path, item.original_path)


def finalize_staged_photo_deletions(staged: Iterable[StagedPhotoDeletion]) -> None:
    errors: list[OSError] = []
    for item in staged:
        try:
            item.staged_path.unlink(missing_ok=True)
        except OSError as exc:
            errors.append(exc)
    if errors:
        raise OSError(f"{len(errors)} Fotodatei(en) konnten nicht endgültig entfernt werden.") from errors[0]
