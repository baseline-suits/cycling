from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import jwt
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ..config import get_settings
from ..database import SessionLocal, get_db
from ..deps import get_current_user
from ..models import Activity, ActivityPhoto, User, uuid4_str
from ..photo_storage import (
    MAX_PHOTO_BYTES,
    MAX_PHOTOS_PER_ACTIVITY,
    PhotoValidationError,
    finalize_staged_photo_deletions,
    restore_staged_photo_deletions,
    safe_photo_path,
    stage_photo_deletions,
    validate_and_store_original,
    create_optimized_photo,
)
from ..schemas import (
    ActivityMediaListResponse,
    ActivityMediaResponse,
    ActivityPhotoListResponse,
    ActivityPhotoResponse,
    ActivityPhotoUpdate,
)
from ..security import create_media_playback_token, decode_media_playback_token
from ..video_storage import (
    VideoValidationError,
    create_video_derivatives,
    probe_video,
    validate_and_store_video,
)


router = APIRouter(tags=["Aktivitätsfotos"])
logger = logging.getLogger(__name__)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _activity_for_user(db: Session, user: User, activity_id: str) -> Activity:
    activity = db.scalar(select(Activity).where(Activity.id == activity_id, Activity.user_id == user.id))
    if activity is None:
        raise HTTPException(status_code=404, detail="Aktivität nicht gefunden.")
    return activity


def _photo_for_user(db: Session, user: User, activity_id: str, photo_id: str) -> ActivityPhoto:
    photo = db.scalar(
        select(ActivityPhoto).where(
            ActivityPhoto.id == photo_id,
            ActivityPhoto.activity_id == activity_id,
            ActivityPhoto.user_id == user.id,
            ActivityPhoto.media_type == "image",
        )
    )
    if photo is None:
        raise HTTPException(status_code=404, detail="Aktivitätsfoto nicht gefunden.")
    return photo


def _photo_response(photo: ActivityPhoto) -> ActivityPhotoResponse:
    return ActivityPhotoResponse(
        id=photo.id,
        activity_id=photo.activity_id,
        original_filename=photo.original_filename,
        content_type=photo.content_type,
        size_bytes=photo.size_bytes,
        original_size_bytes=photo.original_size_bytes,
        width=photo.width,
        height=photo.height,
        captured_at=_utc(photo.captured_at),
        latitude=photo.latitude,
        longitude=photo.longitude,
        caption=photo.caption,
        file_url=f"/api/v1/activities/{photo.activity_id}/photos/{photo.id}/file",
        original_file_url=f"/api/v1/activities/{photo.activity_id}/photos/{photo.id}/original",
        processing_status=photo.processing_status,
        created_at=photo.created_at,
        updated_at=photo.updated_at,
    )


def _media_response(media: ActivityPhoto) -> ActivityMediaResponse:
    base = f"/api/v1/activities/{media.activity_id}/media/{media.id}"
    return ActivityMediaResponse(
        id=media.id,
        activity_id=media.activity_id,
        media_type=media.media_type,
        original_filename=media.original_filename,
        content_type=media.content_type,
        size_bytes=media.size_bytes,
        original_size_bytes=media.original_size_bytes,
        width=media.width,
        height=media.height,
        duration_s=media.duration_s,
        container_format=media.container_format,
        video_codec=media.video_codec,
        audio_codec=media.audio_codec,
        orientation_degrees=media.orientation_degrees,
        captured_at=_utc(media.captured_at),
        latitude=media.latitude,
        longitude=media.longitude,
        caption=media.caption,
        file_url=f"{base}/file" if media.media_type == "video" else f"/api/v1/activities/{media.activity_id}/photos/{media.id}/file",
        original_file_url=f"{base}/original" if media.media_type == "video" else f"/api/v1/activities/{media.activity_id}/photos/{media.id}/original",
        poster_url=f"{base}/poster" if media.media_type == "video" and media.poster_storage_path else None,
        processing_status=media.processing_status,
        processing_error=media.processing_error,
        created_at=media.created_at,
        updated_at=media.updated_at,
    )


@router.post(
    "/activities/{activity_id}/photos",
    response_model=ActivityPhotoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_activity_photo(
    activity_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    captured_at: datetime | None = Form(default=None),
    latitude: float | None = Form(default=None, ge=-90, le=90),
    longitude: float | None = Form(default=None, ge=-180, le=180),
    client_timezone: str | None = Form(default=None, max_length=100),
    caption: str | None = Form(default=None, max_length=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityPhotoResponse:
    _activity_for_user(db, current_user, activity_id)
    if captured_at is not None and (captured_at.tzinfo is None or captured_at.utcoffset() is None):
        raise HTTPException(status_code=422, detail="captured_at muss eine Zeitzone enthalten.")
    if (latitude is None) != (longitude is None):
        raise HTTPException(status_code=422, detail="Breiten- und Längengrad müssen gemeinsam angegeben werden.")
    assumed_timezone = None
    if client_timezone:
        try:
            assumed_timezone = ZoneInfo(client_timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(status_code=422, detail="client_timezone ist keine gültige IANA-Zeitzone.") from None
    photo_count = db.scalar(
        select(func.count()).select_from(ActivityPhoto).where(
            ActivityPhoto.activity_id == activity_id,
            ActivityPhoto.user_id == current_user.id,
        )
    ) or 0
    if photo_count >= MAX_PHOTOS_PER_ACTIVITY:
        raise HTTPException(
            status_code=409,
            detail=f"Pro Aktivität sind höchstens {MAX_PHOTOS_PER_ACTIVITY} Fotos erlaubt.",
        )

    data = await file.read(MAX_PHOTO_BYTES + 1)
    original_filename = (Path(file.filename or "photo").name or "photo")[:255]
    await file.close()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="Das Aktivitätsfoto ist zu groß.")
    digest = hashlib.sha256(data).hexdigest()
    duplicate = db.scalar(
        select(ActivityPhoto.id).where(
            ActivityPhoto.activity_id == activity_id,
            ActivityPhoto.user_id == current_user.id,
            ActivityPhoto.file_hash == digest,
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Dieses Foto ist für die Aktivität bereits vorhanden.")

    settings = get_settings()
    photo_id = uuid4_str()
    try:
        original = await run_in_threadpool(
            validate_and_store_original,
            data,
            photo_id,
            settings.upload_dir,
            assumed_timezone,
        )
    except PhotoValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    normalized_caption = caption.strip() if caption and caption.strip() else None
    photo = ActivityPhoto(
        id=photo_id,
        activity_id=activity_id,
        user_id=current_user.id,
        media_type="image",
        original_storage_path=str(original.path),
        original_content_type=original.content_type,
        original_size_bytes=original.size_bytes,
        storage_path=None,
        original_filename=original_filename,
        content_type="image/webp",
        file_hash=original.file_hash,
        size_bytes=original.size_bytes,
        width=original.width,
        height=original.height,
        captured_at=(captured_at or original.captured_at).astimezone(timezone.utc)
        if (captured_at or original.captured_at)
        else None,
        latitude=latitude if latitude is not None else original.latitude,
        longitude=longitude if longitude is not None else original.longitude,
        caption=normalized_caption,
        processing_status="pending",
    )
    db.add(photo)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        staged = stage_photo_deletions([original.path], settings.upload_dir)
        finalize_staged_photo_deletions(staged)
        raise HTTPException(status_code=409, detail="Dieses Foto ist für die Aktivität bereits vorhanden.") from None
    except Exception:
        db.rollback()
        staged = stage_photo_deletions([original.path], settings.upload_dir)
        finalize_staged_photo_deletions(staged)
        raise
    db.refresh(photo)
    background_tasks.add_task(_optimize_photo_in_background, photo.id)
    return _photo_response(photo)


def _optimize_photo_in_background(photo_id: str) -> None:
    db = SessionLocal()
    try:
        photo = db.get(ActivityPhoto, photo_id)
        if photo is None:
            return
        photo.processing_status = "processing"
        db.commit()
        settings = get_settings()
        original_path = safe_photo_path(photo.original_storage_path, settings.upload_dir, must_exist=True)
        optimized = create_optimized_photo(original_path, photo.id, settings.upload_dir)
        photo.storage_path = str(optimized.path)
        photo.content_type = optimized.content_type
        photo.size_bytes = optimized.size_bytes
        photo.width = optimized.width
        photo.height = optimized.height
        photo.processing_status = "ready"
        db.commit()
    except Exception:
        db.rollback()
        photo = db.get(ActivityPhoto, photo_id)
        if photo is not None:
            photo.processing_status = "failed"
            db.commit()
        logger.exception("Optimierung des Aktivitätsfotos %s fehlgeschlagen", photo_id)
    finally:
        db.close()


@router.get("/activities/{activity_id}/photos", response_model=ActivityPhotoListResponse)
def list_activity_photos(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityPhotoListResponse:
    _activity_for_user(db, current_user, activity_id)
    photos = db.scalars(
        select(ActivityPhoto)
        .where(
            ActivityPhoto.activity_id == activity_id,
            ActivityPhoto.user_id == current_user.id,
            ActivityPhoto.media_type == "image",
        )
        .order_by(ActivityPhoto.captured_at.desc(), ActivityPhoto.created_at.desc())
    ).all()
    return ActivityPhotoListResponse(items=[_photo_response(photo) for photo in photos], total=len(photos))


@router.patch(
    "/activities/{activity_id}/photos/{photo_id}",
    response_model=ActivityPhotoResponse,
)
def update_activity_photo(
    activity_id: str,
    photo_id: str,
    payload: ActivityPhotoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityPhotoResponse:
    _activity_for_user(db, current_user, activity_id)
    photo = _photo_for_user(db, current_user, activity_id, photo_id)
    values = payload.model_dump(exclude_unset=True)
    resulting_latitude = values.get("latitude", photo.latitude)
    resulting_longitude = values.get("longitude", photo.longitude)
    if (resulting_latitude is None) != (resulting_longitude is None):
        raise HTTPException(status_code=422, detail="Breiten- und Längengrad müssen gemeinsam angegeben werden.")
    if "captured_at" in values:
        photo.captured_at = values["captured_at"].astimezone(timezone.utc) if values["captured_at"] else None
    if "latitude" in values:
        photo.latitude = values["latitude"]
    if "longitude" in values:
        photo.longitude = values["longitude"]
    if "caption" in values:
        photo.caption = values["caption"].strip() if values["caption"] and values["caption"].strip() else None
    db.commit()
    db.refresh(photo)
    return _photo_response(photo)


@router.get("/activities/{activity_id}/photos/{photo_id}/file", response_class=FileResponse)
def get_activity_photo_file(
    activity_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    _activity_for_user(db, current_user, activity_id)
    photo = _photo_for_user(db, current_user, activity_id, photo_id)
    settings = get_settings()
    optimized = bool(photo.storage_path)
    try:
        path = safe_photo_path(photo.storage_path, settings.upload_dir, must_exist=True) if optimized else safe_photo_path(photo.original_storage_path, settings.upload_dir, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Die Fotodatei ist nicht verfügbar.") from exc
    return FileResponse(
        path,
        media_type=photo.content_type if optimized else photo.original_content_type,
        filename=f"{photo.id}.webp" if optimized else photo.original_filename,
        content_disposition_type="inline",
        headers={
            "Cache-Control": "private, max-age=3600",
            "ETag": f'"{photo.file_hash}-{photo.processing_status}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/activities/{activity_id}/photos/{photo_id}/original", response_class=FileResponse)
def get_activity_photo_original(
    activity_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    _activity_for_user(db, current_user, activity_id)
    photo = _photo_for_user(db, current_user, activity_id, photo_id)
    try:
        path = safe_photo_path(photo.original_storage_path, get_settings().upload_dir, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Die Originaldatei ist nicht verfügbar.") from exc
    return FileResponse(
        path,
        media_type=photo.original_content_type,
        filename=photo.original_filename,
        content_disposition_type="inline",
        headers={"Cache-Control": "private, max-age=3600", "ETag": f'"{photo.file_hash}-original"', "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/activities/{activity_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity_photo(
    activity_id: str,
    photo_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _activity_for_user(db, current_user, activity_id)
    photo = _photo_for_user(db, current_user, activity_id, photo_id)
    settings = get_settings()
    try:
        staged = stage_photo_deletions(
            [path for path in (photo.storage_path, photo.original_storage_path) if path], settings.upload_dir
        )
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=409, detail="Die Fotodatei konnte nicht sicher entfernt werden.") from exc
    db.delete(photo)
    try:
        db.commit()
    except Exception:
        db.rollback()
        restore_staged_photo_deletions(staged)
        raise
    finalize_staged_photo_deletions(staged)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _media_for_user(db: Session, user: User, activity_id: str, media_id: str) -> ActivityPhoto:
    media = db.scalar(
        select(ActivityPhoto).where(
            ActivityPhoto.id == media_id,
            ActivityPhoto.activity_id == activity_id,
            ActivityPhoto.user_id == user.id,
        )
    )
    if media is None:
        raise HTTPException(status_code=404, detail="Aktivitätsmedium nicht gefunden.")
    return media


@router.get("/media/config")
def activity_media_config(current_user: User = Depends(get_current_user)) -> dict[str, object]:
    settings = get_settings()
    return {
        "image_formats": ["JPEG", "PNG", "WebP"],
        "video_formats": ["MP4", "MOV", "WebM"],
        "max_image_bytes": MAX_PHOTO_BYTES,
        "max_video_bytes": settings.max_video_upload_bytes,
        "max_video_duration_seconds": settings.max_video_duration_seconds,
    }


@router.get("/activities/{activity_id}/media", response_model=ActivityMediaListResponse)
def list_activity_media(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityMediaListResponse:
    _activity_for_user(db, current_user, activity_id)
    media = db.scalars(
        select(ActivityPhoto)
        .where(ActivityPhoto.activity_id == activity_id, ActivityPhoto.user_id == current_user.id)
        .order_by(ActivityPhoto.captured_at.desc(), ActivityPhoto.created_at.desc())
    ).all()
    return ActivityMediaListResponse(items=[_media_response(item) for item in media], total=len(media))


@router.post(
    "/activities/{activity_id}/media",
    response_model=ActivityMediaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_activity_video(
    activity_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    captured_at: datetime | None = Form(default=None),
    latitude: float | None = Form(default=None, ge=-90, le=90),
    longitude: float | None = Form(default=None, ge=-180, le=180),
    client_timezone: str | None = Form(default=None, max_length=100),
    caption: str | None = Form(default=None, max_length=1000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityMediaResponse:
    _activity_for_user(db, current_user, activity_id)
    if captured_at is not None and (captured_at.tzinfo is None or captured_at.utcoffset() is None):
        raise HTTPException(status_code=422, detail="captured_at muss eine Zeitzone enthalten.")
    if (latitude is None) != (longitude is None):
        raise HTTPException(status_code=422, detail="Breiten- und Längengrad müssen gemeinsam angegeben werden.")
    assumed_timezone = None
    if client_timezone:
        try:
            assumed_timezone = ZoneInfo(client_timezone)
        except (ZoneInfoNotFoundError, ValueError):
            raise HTTPException(status_code=422, detail="client_timezone ist keine gültige IANA-Zeitzone.") from None
    media_count = db.scalar(
        select(func.count()).select_from(ActivityPhoto).where(
            ActivityPhoto.activity_id == activity_id,
            ActivityPhoto.user_id == current_user.id,
        )
    ) or 0
    if media_count >= MAX_PHOTOS_PER_ACTIVITY:
        raise HTTPException(
            status_code=409,
            detail=f"Pro Aktivität sind höchstens {MAX_PHOTOS_PER_ACTIVITY} Medien erlaubt.",
        )

    settings = get_settings()
    media_id = uuid4_str()
    original_filename = (Path(file.filename or "video").name or "video")[:255]
    try:
        original = await run_in_threadpool(
            validate_and_store_video,
            file.file,
            media_id,
            settings,
            assumed_timezone,
        )
    except VideoValidationError as exc:
        raise HTTPException(status_code=422, detail=f"{original_filename}: {exc}") from exc
    finally:
        await file.close()

    duplicate = db.scalar(
        select(ActivityPhoto).where(
            ActivityPhoto.activity_id == activity_id,
            ActivityPhoto.user_id == current_user.id,
            ActivityPhoto.file_hash == original.file_hash,
        )
    )
    if duplicate is not None:
        staged = stage_photo_deletions([original.path], settings.upload_dir)
        finalize_staged_photo_deletions(staged)
        return _media_response(duplicate)

    probe = original.probe
    normalized_caption = caption.strip() if caption and caption.strip() else None
    media = ActivityPhoto(
        id=media_id,
        activity_id=activity_id,
        user_id=current_user.id,
        media_type="video",
        original_storage_path=str(original.path),
        original_content_type=probe.content_type,
        original_size_bytes=original.size_bytes,
        storage_path=None,
        poster_storage_path=None,
        original_filename=original_filename,
        content_type="video/mp4",
        file_hash=original.file_hash,
        size_bytes=original.size_bytes,
        width=probe.width,
        height=probe.height,
        duration_s=probe.duration_s,
        container_format=probe.container_format,
        video_codec=probe.video_codec,
        audio_codec=probe.audio_codec,
        orientation_degrees=probe.orientation_degrees,
        captured_at=(captured_at or probe.captured_at).astimezone(timezone.utc)
        if (captured_at or probe.captured_at)
        else None,
        latitude=latitude if latitude is not None else probe.latitude,
        longitude=longitude if longitude is not None else probe.longitude,
        caption=normalized_caption,
        processing_status="pending",
        processing_error=None,
    )
    db.add(media)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        staged = stage_photo_deletions([original.path], settings.upload_dir)
        finalize_staged_photo_deletions(staged)
        duplicate = db.scalar(
            select(ActivityPhoto).where(
                ActivityPhoto.activity_id == activity_id,
                ActivityPhoto.user_id == current_user.id,
                ActivityPhoto.file_hash == original.file_hash,
            )
        )
        if duplicate is not None:
            return _media_response(duplicate)
        raise HTTPException(status_code=409, detail="Dieses Medium ist bereits vorhanden.") from None
    except Exception:
        db.rollback()
        staged = stage_photo_deletions([original.path], settings.upload_dir)
        finalize_staged_photo_deletions(staged)
        raise
    db.refresh(media)
    background_tasks.add_task(_process_video_in_background, media.id)
    return _media_response(media)


def _process_video_in_background(media_id: str) -> None:
    db = SessionLocal()
    processed = None
    try:
        media = db.get(ActivityPhoto, media_id)
        if media is None or media.media_type != "video":
            return
        media.processing_status = "processing"
        media.processing_error = None
        db.commit()
        settings = get_settings()
        original_path = safe_photo_path(media.original_storage_path, settings.upload_dir, must_exist=True)
        probe = probe_video(original_path, settings)
        processed = create_video_derivatives(original_path, media.id, settings, probe)
        media.storage_path = str(processed.playback_path)
        media.poster_storage_path = str(processed.poster_path)
        media.content_type = processed.content_type
        media.size_bytes = processed.size_bytes
        media.width = probe.width
        media.height = probe.height
        media.duration_s = probe.duration_s
        media.container_format = probe.container_format
        media.video_codec = probe.video_codec
        media.audio_codec = probe.audio_codec
        media.orientation_degrees = probe.orientation_degrees
        media.processing_status = "ready"
        media.processing_error = None
        db.commit()
    except Exception as exc:
        db.rollback()
        if processed is not None:
            try:
                staged = stage_photo_deletions(
                    [processed.playback_path, processed.poster_path],
                    get_settings().upload_dir,
                )
                finalize_staged_photo_deletions(staged)
            except Exception:
                logger.exception("Bereinigung fehlgeschlagener Videoderivate %s fehlgeschlagen", media_id)
        media = db.get(ActivityPhoto, media_id)
        if media is not None:
            media.processing_status = "failed"
            media.processing_error = (
                str(exc)[:1000]
                if isinstance(exc, VideoValidationError)
                else "Die Videoverarbeitung ist fehlgeschlagen. Bitte versuche sie erneut."
            )
            db.commit()
        logger.exception("Verarbeitung des Aktivitätsvideos %s fehlgeschlagen", media_id)
    finally:
        db.close()


@router.patch(
    "/activities/{activity_id}/media/{media_id}",
    response_model=ActivityMediaResponse,
)
def update_activity_media(
    activity_id: str,
    media_id: str,
    payload: ActivityPhotoUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityMediaResponse:
    _activity_for_user(db, current_user, activity_id)
    media = _media_for_user(db, current_user, activity_id, media_id)
    values = payload.model_dump(exclude_unset=True)
    resulting_latitude = values.get("latitude", media.latitude)
    resulting_longitude = values.get("longitude", media.longitude)
    if (resulting_latitude is None) != (resulting_longitude is None):
        raise HTTPException(status_code=422, detail="Breiten- und Längengrad müssen gemeinsam angegeben werden.")
    if "captured_at" in values:
        media.captured_at = values["captured_at"].astimezone(timezone.utc) if values["captured_at"] else None
    if "latitude" in values:
        media.latitude = values["latitude"]
    if "longitude" in values:
        media.longitude = values["longitude"]
    if "caption" in values:
        media.caption = values["caption"].strip() if values["caption"] and values["caption"].strip() else None
    db.commit()
    db.refresh(media)
    return _media_response(media)


@router.post(
    "/activities/{activity_id}/media/{media_id}/retry",
    response_model=ActivityMediaResponse,
)
def retry_activity_video(
    activity_id: str,
    media_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityMediaResponse:
    _activity_for_user(db, current_user, activity_id)
    media = _media_for_user(db, current_user, activity_id, media_id)
    if media.media_type != "video":
        raise HTTPException(status_code=409, detail="Nur Videos können erneut verarbeitet werden.")
    if media.processing_status in {"pending", "processing", "ready"}:
        return _media_response(media)
    media.processing_status = "pending"
    media.processing_error = None
    db.commit()
    db.refresh(media)
    background_tasks.add_task(_process_video_in_background, media.id)
    return _media_response(media)


@router.get("/activities/{activity_id}/media/{media_id}/file", response_class=FileResponse)
def get_activity_media_file(
    activity_id: str,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    _activity_for_user(db, current_user, activity_id)
    media = _media_for_user(db, current_user, activity_id, media_id)
    if media.media_type != "video" or media.processing_status != "ready" or not media.storage_path:
        raise HTTPException(status_code=409, detail="Das Video ist noch nicht zur Wiedergabe bereit.")
    try:
        path = safe_photo_path(media.storage_path, get_settings().upload_dir, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Die Wiedergabevariante ist nicht verfügbar.") from exc
    return FileResponse(
        path,
        media_type=media.content_type,
        filename=f"{media.id}.mp4",
        content_disposition_type="inline",
        headers={
            "Cache-Control": "private, max-age=3600",
            "ETag": f'"{media.file_hash}-{media.processing_status}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/activities/{activity_id}/media/{media_id}/playback-token")
def create_activity_media_playback_token(
    activity_id: str,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _activity_for_user(db, current_user, activity_id)
    media = _media_for_user(db, current_user, activity_id, media_id)
    if media.media_type != "video" or media.processing_status != "ready" or not media.storage_path:
        raise HTTPException(status_code=409, detail="Das Video ist noch nicht zur Wiedergabe bereit.")
    token, expires_in = create_media_playback_token(current_user.id, activity_id, media_id)
    return {
        "url": f"/api/v1/activities/{activity_id}/media/{media_id}/stream?token={token}",
        "expires_in": expires_in,
    }


@router.get("/activities/{activity_id}/media/{media_id}/stream", response_class=FileResponse)
def stream_activity_media(
    activity_id: str,
    media_id: str,
    token: str = Query(min_length=20, max_length=2048),
    db: Session = Depends(get_db),
) -> FileResponse:
    error = HTTPException(status_code=401, detail="Ungültiger oder abgelaufener Wiedergabezugriff.")
    try:
        user_id = decode_media_playback_token(token, activity_id, media_id)
    except jwt.PyJWTError:
        raise error from None
    media = db.scalar(
        select(ActivityPhoto).where(
            ActivityPhoto.id == media_id,
            ActivityPhoto.activity_id == activity_id,
            ActivityPhoto.user_id == user_id,
            ActivityPhoto.media_type == "video",
            ActivityPhoto.processing_status == "ready",
        )
    )
    if media is None or not media.storage_path:
        raise error
    try:
        path = safe_photo_path(media.storage_path, get_settings().upload_dir, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Die Wiedergabevariante ist nicht verfügbar.") from exc
    return FileResponse(
        path,
        media_type=media.content_type,
        filename=f"{media.id}.mp4",
        content_disposition_type="inline",
        headers={
            "Cache-Control": "private, no-store",
            "ETag": f'"{media.file_hash}-{media.processing_status}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/activities/{activity_id}/media/{media_id}/poster", response_class=FileResponse)
def get_activity_media_poster(
    activity_id: str,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    _activity_for_user(db, current_user, activity_id)
    media = _media_for_user(db, current_user, activity_id, media_id)
    if media.media_type != "video" or not media.poster_storage_path:
        raise HTTPException(status_code=404, detail="Das Video-Poster ist nicht verfügbar.")
    try:
        path = safe_photo_path(media.poster_storage_path, get_settings().upload_dir, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Das Video-Poster ist nicht verfügbar.") from exc
    return FileResponse(
        path,
        media_type="image/webp",
        filename=f"{media.id}-poster.webp",
        content_disposition_type="inline",
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/activities/{activity_id}/media/{media_id}/original", response_class=FileResponse)
def get_activity_media_original(
    activity_id: str,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    _activity_for_user(db, current_user, activity_id)
    media = _media_for_user(db, current_user, activity_id, media_id)
    try:
        path = safe_photo_path(media.original_storage_path, get_settings().upload_dir, must_exist=True)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail="Die Originaldatei ist nicht verfügbar.") from exc
    return FileResponse(
        path,
        media_type=media.original_content_type,
        filename=media.original_filename,
        content_disposition_type="inline",
        headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"},
    )


@router.delete("/activities/{activity_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity_media(
    activity_id: str,
    media_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    _activity_for_user(db, current_user, activity_id)
    media = _media_for_user(db, current_user, activity_id, media_id)
    settings = get_settings()
    try:
        staged = stage_photo_deletions(
            [
                path
                for path in (media.storage_path, media.poster_storage_path, media.original_storage_path)
                if path
            ],
            settings.upload_dir,
        )
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=409, detail="Die Mediendateien konnten nicht sicher entfernt werden.") from exc
    db.delete(media)
    try:
        db.commit()
    except Exception:
        db.rollback()
        restore_staged_photo_deletions(staged)
        raise
    finalize_staged_photo_deletions(staged)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
