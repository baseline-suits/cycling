from __future__ import annotations

import hashlib
import csv
import io
import json
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, attributes
from starlette.concurrency import run_in_threadpool

from ..ai import (
    LocalSummaryProvider,
    activity_summary_data_basis,
    comparison_data_basis,
    comparison_summary,
    get_summary_provider,
)
from ..analysis import (
    add_relative_scores,
    coaching_context,
    comparison_metric,
    find_similar_activities,
    normalized_profile,
    route_wind_summary,
)
from ..data_quality import assess_track_quality, provenance_for_activity
from ..route_segments import route_similarity, route_signature, segment_metrics
from ..activity_geography import refresh_activity_geography
from ..config import get_settings
from ..database import SessionLocal, get_db
from ..deps import get_current_user
from ..models import Activity, ActivityPhoto, ImportJob, SavedSegment, User, utcnow
from ..photo_storage import (
    finalize_staged_photo_deletions,
    restore_staged_photo_deletions,
    stage_photo_deletions,
)
from ..schemas import (
    ActivityListResponse,
    ActivityResponse,
    ActivityExportRequest,
    SavedSegmentCreate,
    SavedSegmentResponse,
    ActivityUpdate,
    CompareRequest,
    CompareResponse,
    StatisticsOverview,
    SummaryResponse,
    TrackResponse,
    WeatherResponse,
)
from ..statistics import build_statistics
from ..activity_formats import parse_activity
from ..tcx import ParsedActivity, TcxError
from ..weather import get_weather_provider
from ..weather_classification import classify_route_weather


router = APIRouter(tags=["Aktivitäten"])


def _export_points(activity: Activity, redact: bool) -> list[dict[str, Any]]:
    points = [dict(point) for point in (activity.track_points or [])]
    if redact and points:
        # Hide the start/end area in portable exports while retaining the
        # middle of the route for analysis and interoperability.
        edge = min(5, max(1, len(points) // 10))
        for point in points[:edge] + points[-edge:]:
            point["latitude"] = None
            point["longitude"] = None
    return points


def _activity_export_archive(activities: list[Activity], *, include_original: bool, redact: bool) -> bytes:
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
        manifest = []
        for activity in activities:
            points = _export_points(activity, redact)
            stem = "-".join(part for part in activity.title.lower().split() if part.isalnum())[:48] or activity.id[:8]
            prefix = f"{stem}-{activity.id[:8]}"
            rows = io.StringIO()
            writer = csv.writer(rows)
            writer.writerow(["time", "latitude", "longitude", "altitude_m", "distance_m", "speed_mps", "heart_rate_bpm", "cadence_rpm", "power_w"])
            for point in points:
                writer.writerow([point.get(key) for key in ("time", "latitude", "longitude", "altitude_m", "distance_m", "speed_mps", "heart_rate_bpm", "cadence_rpm", "power_w")])
            output.writestr(f"{prefix}.csv", rows.getvalue())
            output.writestr(f"{prefix}.json", json.dumps({"activity": _activity_response(activity).model_dump(mode="json"), "points": points}, ensure_ascii=False, indent=2))
            gpx = ET.Element("gpx", {"version": "1.1", "creator": "Baseline Cycling", "xmlns": "http://www.topografix.com/GPX/1/1"})
            track = ET.SubElement(ET.SubElement(gpx, "trk"), "trkseg")
            for point in points:
                if point.get("latitude") is None or point.get("longitude") is None:
                    continue
                node = ET.SubElement(track, "trkpt", lat=str(point["latitude"]), lon=str(point["longitude"]))
                if point.get("altitude_m") is not None: ET.SubElement(node, "ele").text = str(point["altitude_m"])
                if point.get("time"): ET.SubElement(node, "time").text = str(point["time"])
            output.writestr(f"{prefix}.gpx", ET.tostring(gpx, encoding="unicode", xml_declaration=True))
            if include_original and not redact:
                original = Path(activity.original_file_path)
                if original.is_file(): output.writestr(f"original/{prefix}{original.suffix.lower()}", original.read_bytes())
            manifest.append({"id": activity.id, "title": activity.title, "redacted": redact, "quality_flags": activity.data_quality_flags or []})
        output.writestr("manifest.json", json.dumps({"schema_version": "1.0", "generated_by": "Baseline Cycling", "activities": manifest}, ensure_ascii=False, indent=2))
    return archive.getvalue()


def _saved_segment_response(segment: SavedSegment) -> SavedSegmentResponse:
    return SavedSegmentResponse(id=segment.id, activity_id=segment.activity_id, name=segment.name, start_m=segment.start_m, end_m=segment.end_m, route_signature=segment.route_signature or [], metrics=segment.metrics or {}, created_at=segment.created_at, updated_at=segment.updated_at)


def _local_midnight(value: date, timezone_name: str) -> datetime:
    return datetime.combine(value, time.min, tzinfo=ZoneInfo(timezone_name)).astimezone(timezone.utc)


def _local_date(value: datetime, timezone_name: str) -> date:
    aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(ZoneInfo(timezone_name)).date()


def _activity_for_user(db: Session, user: User, activity_id: str) -> Activity:
    activity = db.scalar(select(Activity).where(Activity.id == activity_id, Activity.user_id == user.id))
    if activity is None:
        raise HTTPException(status_code=404, detail="Aktivität nicht gefunden.")
    return activity


def _activity_response(activity: Activity) -> ActivityResponse:
    return ActivityResponse(
        id=activity.id,
        title=activity.title,
        type=activity.activity_type,
        notes=activity.notes,
        hydration_ml=activity.hydration_ml,
        original_filename=activity.original_filename,
        started_at=activity.started_at,
        ended_at=activity.ended_at,
        distance_m=activity.distance_m,
        duration_s=activity.duration_s,
        moving_time_s=activity.moving_time_s,
        pause_time_s=activity.pause_time_s,
        avg_speed_mps=activity.avg_speed_mps,
        max_speed_mps=activity.max_speed_mps,
        elevation_gain_m=activity.elevation_gain_m,
        avg_hr_bpm=activity.avg_hr_bpm,
        max_hr_bpm=activity.max_hr_bpm,
        avg_cadence_rpm=activity.avg_cadence_rpm,
        max_cadence_rpm=activity.max_cadence_rpm,
        avg_power_w=activity.avg_power_w,
        max_power_w=activity.max_power_w,
        training_load=activity.training_load,
        hr_zone_seconds=activity.hr_zone_seconds or {},
        weather=activity.weather,
        weather_status=activity.weather_status,
        ai_summary=activity.ai_summary,
        ai_provider=activity.ai_provider,
        ai_data_basis=activity.ai_data_basis if activity.ai_summary else None,
        data_quality_flags=activity.data_quality_flags or [],
        metric_provenance=activity.metric_provenance or {},
        include_in_statistics=activity.include_in_statistics,
        created_at=activity.created_at,
        updated_at=activity.updated_at,
    )


def _invalidate_summary(activity: Activity) -> None:
    activity.ai_summary = None
    activity.ai_provider = None
    activity.ai_data_basis = None
    activity.ai_updated_at = None


def _invalidate_later_summaries(db: Session, activity: Activity) -> None:
    db.execute(
        update(Activity)
        .where(
            Activity.user_id == activity.user_id,
            Activity.id != activity.id,
            Activity.started_at > activity.started_at,
        )
        .values(ai_summary=None, ai_provider=None, ai_data_basis=None, ai_updated_at=None)
    )


def _first_coordinate(activity: Activity) -> tuple[float, float] | None:
    for point in activity.track_points or []:
        if point.get("latitude") is not None and point.get("longitude") is not None:
            return float(point["latitude"]), float(point["longitude"])
    return None


def _refresh_weather(activity: Activity) -> None:
    _invalidate_summary(activity)
    settings = get_settings()
    coordinate = _first_coordinate(activity)
    if coordinate is None:
        activity.weather = None
        activity.weather_status = "unavailable"
        activity.weather_updated_at = utcnow()
        return
    provider = get_weather_provider(settings)
    try:
        route_samples = provider.weather_along_route(
            activity.track_points or [],
            maximum_samples=settings.weather_route_samples,
        )
        if route_samples:
            metadata = {"point_index", "track_time", "latitude", "longitude"}
            activity.weather = {key: value for key, value in route_samples[0].items() if key not in metadata}
        else:
            activity.weather = provider.weather_at(*coordinate, activity.started_at)
        wind = route_wind_summary(activity.track_points or [], route_samples)
        if activity.weather and route_samples:
            components = {
                int(component["point_index"]): component
                for component in (wind or {}).get("samples", [])
            }
            activity.weather["route_weather_samples"] = [
                {**sample, **components.get(int(sample["point_index"]), {})}
                for sample in route_samples
            ]
        if activity.weather and wind:
            activity.weather["route_wind"] = wind
        if activity.weather:
            weather_samples = (activity.weather or {}).get("route_weather_samples") or route_samples or [activity.weather]
            try:
                activity.weather["route_weather_classification"] = classify_route_weather(weather_samples)
            except Exception:
                pass
        activity.weather_status = "available" if activity.weather else "unavailable"
    except Exception:
        activity.weather = None
        activity.weather_status = "unavailable"
    activity.weather_updated_at = utcnow()


def _apply_analysis(activity: Activity, parsed: ParsedActivity) -> None:
    activity.started_at = parsed.started_at
    activity.ended_at = parsed.ended_at
    activity.distance_m = parsed.distance_m
    activity.duration_s = parsed.duration_s
    activity.moving_time_s = parsed.moving_time_s
    activity.pause_time_s = parsed.pause_time_s
    activity.avg_speed_mps = parsed.avg_speed_mps
    activity.max_speed_mps = parsed.max_speed_mps
    activity.elevation_gain_m = parsed.elevation_gain_m
    activity.avg_hr_bpm = parsed.avg_hr_bpm
    activity.max_hr_bpm = parsed.max_hr_bpm
    activity.avg_cadence_rpm = parsed.avg_cadence_rpm
    activity.max_cadence_rpm = parsed.max_cadence_rpm
    activity.avg_power_w = parsed.avg_power_w
    activity.max_power_w = parsed.max_power_w
    activity.training_load = parsed.training_load
    activity.hr_zone_seconds = parsed.hr_zone_seconds
    activity.track_points = parsed.track_points
    activity.data_quality_flags = assess_track_quality(activity.track_points or [], distance_m=activity.distance_m, duration_s=activity.duration_s)
    activity.metric_provenance = provenance_for_activity(activity.track_points or [], activity.data_quality_flags)
    _invalidate_summary(activity)


def _job_response(job: ImportJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "filename": job.original_filename,
        "hash": job.file_hash,
        "status": job.status,
        "preview": (job.steps or {}).get("preview"),
        "steps": job.steps or {},
        "warnings": job.warnings or [],
        "error": job.error,
        "activity_id": job.activity_id,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
    }


def _process_import_job(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(ImportJob, job_id)
        if job is None:
            return
        user = db.get(User, job.user_id)
        if user is None:
            return
        job.status = "processing"
        job.steps = {"upload": "completed", "parsing": "running", "weather": "queued", "geography": "queued", "gamification": "queued"}
        db.commit()
        try:
            data = Path(job.file_path).read_bytes()
            parsed = parse_activity(data, job.original_filename, user.hr_zones or [], user.hr_max)
            job.steps["parsing"] = "completed"
            attributes.flag_modified(job, "steps")
            activity = Activity(
                user_id=user.id, file_hash=job.file_hash, original_filename=job.original_filename,
                original_file_path=job.file_path, title=f"Radfahrt am {parsed.started_at:%d.%m.%Y}",
                activity_type=parsed.activity_type, started_at=parsed.started_at, ended_at=parsed.ended_at,
            )
            _apply_analysis(activity, parsed)
            db.add(activity)
            db.flush()
            job.activity_id = activity.id
            job.steps["weather"] = "running"
            attributes.flag_modified(job, "steps")
            db.commit()
            try:
                _refresh_weather(activity)
                job.steps["weather"] = "completed" if activity.weather else "unavailable"
                attributes.flag_modified(job, "steps")
            except Exception as exc:
                job.warnings.append(f"Wetter: {exc}")
                job.steps["weather"] = "warning"
                attributes.flag_modified(job, "warnings")
                attributes.flag_modified(job, "steps")
            job.steps["geography"] = "running"
            attributes.flag_modified(job, "steps")
            db.commit()
            try:
                refresh_activity_geography(db, activity, get_settings())
                job.steps["geography"] = "completed"
            except Exception as exc:
                job.warnings.append(f"Geocoding: {exc}")
                job.steps["geography"] = "warning"
                attributes.flag_modified(job, "warnings")
                attributes.flag_modified(job, "steps")
            job.steps["gamification"] = "completed"
            attributes.flag_modified(job, "steps")
            _invalidate_later_summaries(db, activity)
            job.status = "completed_with_warnings" if job.warnings else "completed"
            db.commit()
        except (TcxError, OSError, IntegrityError) as exc:
            db.rollback()
            job = db.get(ImportJob, job_id)
            if job:
                job.status = "failed"
                job.error = str(exc) or "Die Datei konnte nicht verarbeitet werden."
                job.steps = {**(job.steps or {}), "parsing": "failed"}
                db.commit()


@router.post("/activities/imports", status_code=status.HTTP_202_ACCEPTED)
async def import_activities(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Queue a batch and return a preview immediately; every file is idempotent."""
    settings = get_settings()
    if not files:
        raise HTTPException(status_code=422, detail="Mindestens eine Datei ist erforderlich.")
    jobs: list[ImportJob] = []
    seen_hashes: set[str] = set()
    for file in files:
        data = await file.read(settings.max_upload_bytes + 1)
        await file.close()
        filename = (Path(file.filename or "activity.tcx").name or "activity.tcx")[:255]
        if len(data) > settings.max_upload_bytes:
            jobs.append(ImportJob(user_id=current_user.id, file_hash=hashlib.sha256(data).hexdigest(), original_filename=filename, file_path="", status="failed", error="Die Aktivitätsdatei ist zu groß."))
            continue
        digest = hashlib.sha256(data).hexdigest()
        if digest in seen_hashes:
            jobs.append(ImportJob(user_id=current_user.id, file_hash=digest, original_filename=filename, file_path="", status="duplicate", error="Diese Datei ist im Batch doppelt enthalten."))
            continue
        seen_hashes.add(digest)
        existing_job = db.scalar(select(ImportJob).where(ImportJob.user_id == current_user.id, ImportJob.file_hash == digest))
        if existing_job:
            jobs.append(existing_job)
            continue
        existing = db.scalar(select(Activity).where(Activity.user_id == current_user.id, Activity.file_hash == digest))
        if existing:
            jobs.append(ImportJob(user_id=current_user.id, file_hash=digest, original_filename=filename, file_path="", status="duplicate", activity_id=existing.id, error="Diese Datei wurde bereits importiert."))
            continue
        directory = settings.upload_dir / current_user.id
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{digest}{Path(filename).suffix.lower() or '.tcx'}"
        path.write_bytes(data)
        preview: dict[str, Any] | None = None
        try:
            parsed = parse_activity(data, filename, current_user.hr_zones or [], current_user.hr_max)
            preview = {"time": parsed.started_at.isoformat(), "distance_m": parsed.distance_m, "duplicate": False}
        except TcxError as exc:
            preview = {"error": str(exc), "duplicate": False}
        job = ImportJob(user_id=current_user.id, file_hash=digest, original_filename=filename, file_path=str(path), steps={"upload": "completed", "preview": preview})
        db.add(job)
        db.flush()
        jobs.append(job)
        background_tasks.add_task(_process_import_job, job.id)
    db.commit()
    return {"jobs": [_job_response(job) for job in jobs], "total": len(jobs)}


@router.get("/activities/imports/{job_id}")
def import_status(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    job = db.scalar(select(ImportJob).where(ImportJob.id == job_id, ImportJob.user_id == current_user.id))
    if job is None:
        raise HTTPException(status_code=404, detail="Importauftrag nicht gefunden.")
    return _job_response(job)


@router.post("/activities", response_model=ActivityResponse, status_code=status.HTTP_201_CREATED)
async def upload_activity(
    file: UploadFile = File(...),
    title: str | None = Form(default=None, max_length=200),
    type: str | None = Form(default=None, max_length=50),
    notes: str | None = Form(default=None, max_length=10000),
    hydration_ml: int | None = Form(default=None, ge=0, le=20_000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityResponse:
    settings = get_settings()
    data = await file.read(settings.max_upload_bytes + 1)
    await file.close()
    if not data:
        raise HTTPException(status_code=400, detail="Die hochgeladene Datei ist leer.")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="Die Aktivitätsdatei ist zu groß.")
    digest = hashlib.sha256(data).hexdigest()
    duplicate = db.scalar(select(Activity).where(Activity.user_id == current_user.id, Activity.file_hash == digest))
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail={"message": "Diese TCX-Datei wurde bereits importiert.", "activity_id": duplicate.id},
        )
    try:
        parsed = parse_activity(data, file.filename or "activity.tcx", current_user.hr_zones or [], current_user.hr_max)
    except TcxError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    original_filename = (Path(file.filename or "activity.tcx").name or "activity.tcx")[:255]
    upload_directory = settings.upload_dir / current_user.id
    upload_directory.mkdir(parents=True, exist_ok=True)
    suffix = Path(original_filename).suffix.lower() or ".tcx"
    destination = upload_directory / f"{digest}{suffix}"
    destination.write_bytes(data)
    activity = Activity(
        user_id=current_user.id,
        file_hash=digest,
        original_filename=original_filename,
        original_file_path=str(destination),
        title=(title.strip() if title and title.strip() else f"Radfahrt am {parsed.started_at:%d.%m.%Y}"),
        activity_type=(type.strip().lower() if type and type.strip() else parsed.activity_type),
        notes=notes.strip() if notes and notes.strip() else None,
        hydration_ml=hydration_ml,
        started_at=parsed.started_at,
        ended_at=parsed.ended_at,
    )
    _apply_analysis(activity, parsed)
    db.add(activity)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail="Diese Datei wurde bereits importiert.") from None
    await run_in_threadpool(_refresh_weather, activity)
    await run_in_threadpool(refresh_activity_geography, db, activity, settings)
    _invalidate_later_summaries(db, activity)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=409, detail="Diese Datei wurde bereits importiert.") from None
    db.refresh(activity)
    return _activity_response(activity)


@router.get("/activities", response_model=ActivityListResponse)
def list_activities(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None, max_length=200),
    type: str | None = Query(default=None, max_length=50),
    date_from: date | None = None,
    date_to: date | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityListResponse:
    timezone_name = get_settings().timezone
    if date_from and date_from < date(1900, 1, 1):
        raise HTTPException(status_code=422, detail="Zeiträume vor 1900 werden nicht unterstützt.")
    if date_from and date_to and date_to < date_from:
        raise HTTPException(status_code=422, detail="Das Enddatum muss am oder nach dem Startdatum liegen.")
    conditions: list[Any] = [Activity.user_id == current_user.id]
    if q:
        pattern = f"%{q.strip()}%"
        conditions.append(or_(Activity.title.ilike(pattern), Activity.notes.ilike(pattern)))
    if type:
        conditions.append(Activity.activity_type == type.strip().lower())
    if date_from:
        conditions.append(Activity.started_at >= _local_midnight(date_from, timezone_name))
    if date_to:
        if date_to.year >= 9999:
            raise HTTPException(status_code=422, detail="Das Enddatum liegt außerhalb des unterstützten Bereichs.")
        conditions.append(Activity.started_at < _local_midnight(date_to + timedelta(days=1), timezone_name))
    total = db.scalar(select(func.count()).select_from(Activity).where(*conditions)) or 0
    activities = db.scalars(
        select(Activity).where(*conditions).order_by(Activity.started_at.desc()).offset(offset).limit(limit)
    ).all()
    return ActivityListResponse(
        items=[_activity_response(activity) for activity in activities], total=total, limit=limit, offset=offset
    )


@router.post("/activities/export")
def export_activities(
    payload: ActivityExportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    if payload.date_from and payload.date_to and payload.date_to < payload.date_from:
        raise HTTPException(status_code=422, detail="Das Enddatum muss am oder nach dem Startdatum liegen.")
    conditions: list[Any] = [Activity.user_id == current_user.id]
    if payload.activity_ids:
        conditions.append(Activity.id.in_(list(dict.fromkeys(payload.activity_ids))))
    timezone_name = get_settings().timezone
    if payload.date_from:
        conditions.append(Activity.started_at >= _local_midnight(payload.date_from, timezone_name))
    if payload.date_to:
        conditions.append(Activity.started_at < _local_midnight(payload.date_to + timedelta(days=1), timezone_name))
    activities = db.scalars(select(Activity).where(*conditions).order_by(Activity.started_at)).all()
    if not activities:
        raise HTTPException(status_code=404, detail="Keine Aktivitäten für den Export gefunden.")
    if len(activities) > 200:
        raise HTTPException(status_code=413, detail="Für einen Export sind höchstens 200 Aktivitäten gleichzeitig möglich.")
    content = _activity_export_archive(activities, include_original=payload.include_original, redact=payload.redact_private_data)
    return Response(content=content, media_type="application/zip", headers={"Content-Disposition": "attachment; filename=baseline-cycling-export.zip"})


@router.get("/segments", response_model=list[SavedSegmentResponse])
def list_saved_segments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[SavedSegmentResponse]:
    segments = db.scalars(select(SavedSegment).where(SavedSegment.user_id == current_user.id).order_by(SavedSegment.updated_at.desc())).all()
    return [_saved_segment_response(segment) for segment in segments]


@router.post("/segments", response_model=SavedSegmentResponse, status_code=status.HTTP_201_CREATED)
def create_saved_segment(payload: SavedSegmentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> SavedSegmentResponse:
    activity = _activity_for_user(db, current_user, payload.activity_id)
    if payload.end_m > activity.distance_m:
        raise HTTPException(status_code=422, detail="Das Segment liegt außerhalb der Aktivität.")
    segment_points = [point for point in (activity.track_points or []) if payload.start_m <= float(point.get("distance_m") or 0) <= payload.end_m]
    segment = SavedSegment(user_id=current_user.id, activity_id=activity.id, name=payload.name.strip(), start_m=payload.start_m, end_m=payload.end_m, route_signature=route_signature(segment_points), metrics=segment_metrics(activity.track_points or [], payload.start_m, payload.end_m))
    db.add(segment)
    db.commit()
    db.refresh(segment)
    return _saved_segment_response(segment)


@router.delete("/segments/{segment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_segment(segment_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    segment = db.scalar(select(SavedSegment).where(SavedSegment.id == segment_id, SavedSegment.user_id == current_user.id))
    if segment is None: raise HTTPException(status_code=404, detail="Segment nicht gefunden.")
    db.delete(segment)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/activities/{activity_id}/route-matches")
def route_matches(activity_id: str, limit: int = Query(default=5, ge=1, le=20), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict[str, Any]:
    activity = _activity_for_user(db, current_user, activity_id)
    candidates = db.scalars(select(Activity).where(Activity.user_id == current_user.id, Activity.id != activity.id, Activity.include_in_statistics.is_(True)).order_by(Activity.started_at.desc()).limit(100)).all()
    matches = []
    for candidate in candidates:
        similarity = route_similarity(activity.track_points or [], candidate.track_points or [])
        if similarity < 0.35: continue
        conditions: list[str] = []
        if abs(candidate.distance_m - activity.distance_m) / max(activity.distance_m, 1) > .15: conditions.append("andere Distanz")
        if abs(candidate.elevation_gain_m - activity.elevation_gain_m) > 150: conditions.append("andere Höhenmeter")
        if activity.avg_hr_bpm is None or candidate.avg_hr_bpm is None: conditions.append("Herzfrequenz fehlt")
        left_wind = ((activity.weather or {}).get("route_wind") or {}).get("net_headwind_kmh")
        right_wind = ((candidate.weather or {}).get("route_wind") or {}).get("net_headwind_kmh")
        if isinstance(left_wind, (int, float)) and isinstance(right_wind, (int, float)) and abs(left_wind - right_wind) > 8: conditions.append("deutlich anderer Wind")
        matches.append({"activity": _activity_response(candidate).model_dump(mode="json"), "similarity": similarity, "comparable": not conditions, "conditions": conditions})
    matches.sort(key=lambda item: (item["comparable"], item["similarity"]), reverse=True)
    return {"activity_id": activity.id, "matches": matches[:limit]}


@router.post("/activities/compare", response_model=CompareResponse)
def compare_activities(
    payload: CompareRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CompareResponse:
    requested = list(dict.fromkeys(payload.activity_ids))
    if len(requested) < 2:
        raise HTTPException(status_code=422, detail="Mindestens zwei unterschiedliche Aktivitäten sind erforderlich.")
    found = db.scalars(select(Activity).where(Activity.user_id == current_user.id, Activity.id.in_(requested))).all()
    by_id = {activity.id: activity for activity in found}
    if len(by_id) != len(requested):
        raise HTTPException(status_code=404, detail="Mindestens eine Aktivität wurde nicht gefunden.")
    ordered = [by_id[activity_id] for activity_id in requested]
    metrics = [comparison_metric(activity) for activity in ordered]
    add_relative_scores(metrics)
    profiles = [normalized_profile(activity) for activity in ordered]
    ai_profiles = [
        {**profile, "points": profile["points"][::4]}
        for profile in profiles
    ]
    ai_summary, ai_provider = comparison_summary(get_settings(), ordered, metrics, ai_profiles)
    ai_data_basis = comparison_data_basis(
        ordered,
        metrics,
        get_settings().timezone,
        ai_provider,
    )
    return CompareResponse(
        activities=[_activity_response(activity) for activity in ordered],
        metrics=metrics,
        profiles=profiles,
        ai_summary=ai_summary,
        ai_provider=ai_provider,
        ai_data_basis=ai_data_basis,
    )


@router.get("/activities/{activity_id}", response_model=ActivityResponse)
def get_activity(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityResponse:
    return _activity_response(_activity_for_user(db, current_user, activity_id))


@router.patch("/activities/{activity_id}", response_model=ActivityResponse)
def update_activity(
    activity_id: str,
    payload: ActivityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityResponse:
    activity = _activity_for_user(db, current_user, activity_id)
    values = payload.model_dump(exclude_unset=True)
    if values.get("title") is not None:
        activity.title = values["title"].strip()
    if values.get("type") is not None:
        activity.activity_type = values["type"].strip().lower()
    if "notes" in values:
        activity.notes = values["notes"].strip() if values["notes"] and values["notes"].strip() else None
    if "hydration_ml" in values:
        activity.hydration_ml = values["hydration_ml"]
    if "include_in_statistics" in values:
        activity.include_in_statistics = values["include_in_statistics"]
    if values:
        _invalidate_summary(activity)
        _invalidate_later_summaries(db, activity)
    db.commit()
    db.refresh(activity)
    return _activity_response(activity)


@router.post("/activities/{activity_id}/reanalyze", response_model=ActivityResponse)
def reanalyze_activity(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ActivityResponse:
    activity = _activity_for_user(db, current_user, activity_id)
    try:
        data = Path(activity.original_file_path).read_bytes()
    except OSError as exc:
        raise HTTPException(status_code=409, detail="Die ursprüngliche TCX-Datei ist nicht mehr verfügbar.") from exc
    try:
        parsed = parse_activity(data, activity.original_filename, current_user.hr_zones or [], current_user.hr_max)
    except TcxError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    _apply_analysis(activity, parsed)
    _refresh_weather(activity)
    refresh_activity_geography(db, activity, get_settings(), force=True)
    db.commit()
    db.refresh(activity)
    return _activity_response(activity)


@router.delete("/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    activity = _activity_for_user(db, current_user, activity_id)
    file_path = Path(activity.original_file_path)
    media_paths = db.execute(
        select(
            ActivityPhoto.storage_path,
            ActivityPhoto.poster_storage_path,
            ActivityPhoto.original_storage_path,
        ).where(ActivityPhoto.activity_id == activity.id)
    ).all()
    photo_paths = [
        path
        for row in media_paths
        for path in row
        if path
    ]
    try:
        staged_photos = stage_photo_deletions(photo_paths, get_settings().upload_dir)
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=409, detail="Zugehörige Fotodateien konnten nicht sicher entfernt werden.") from exc
    _invalidate_later_summaries(db, activity)
    db.delete(activity)
    try:
        db.commit()
    except Exception:
        db.rollback()
        restore_staged_photo_deletions(staged_photos)
        raise
    finalize_staged_photo_deletions(staged_photos)
    file_path.unlink(missing_ok=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/activities/{activity_id}/track", response_model=TrackResponse)
def get_track(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TrackResponse:
    activity = _activity_for_user(db, current_user, activity_id)
    return TrackResponse(activity_id=activity.id, points=activity.track_points or [])


@router.get("/activities/{activity_id}/weather", response_model=WeatherResponse)
def get_weather(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WeatherResponse:
    activity = _activity_for_user(db, current_user, activity_id)
    return WeatherResponse(status=activity.weather_status, data=activity.weather, updated_at=activity.weather_updated_at)


@router.post("/activities/{activity_id}/weather/refresh", response_model=WeatherResponse)
def refresh_weather(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WeatherResponse:
    activity = _activity_for_user(db, current_user, activity_id)
    _refresh_weather(activity)
    db.commit()
    db.refresh(activity)
    return WeatherResponse(status=activity.weather_status, data=activity.weather, updated_at=activity.weather_updated_at)


def _generate_summary(activity: Activity, db: Session, user: User) -> None:
    settings = get_settings()
    provider = get_summary_provider(settings)
    candidates = db.scalars(
        select(Activity)
        .where(
            Activity.user_id == user.id,
            Activity.id != activity.id,
            Activity.started_at < activity.started_at,
        )
        .order_by(Activity.started_at.desc())
        .limit(30)
    ).all()
    similar = find_similar_activities(activity, candidates, limit=7)
    context = coaching_context(activity, similar, user.training_goals or [])
    context["profile"] = {"hr_max": user.hr_max, "hr_rest": user.hr_rest}
    try:
        summary = provider.summarize(activity, context)
        provider_name = provider.name
    except Exception:
        summary = LocalSummaryProvider().summarize(activity, context)
        provider_name = "local_fallback"
    activity.ai_summary = summary
    activity.ai_provider = provider_name
    activity.ai_data_basis = activity_summary_data_basis(
        activity,
        context,
        settings.timezone,
        provider_name,
    )
    activity.ai_updated_at = utcnow()


@router.get("/activities/{activity_id}/summary", response_model=SummaryResponse)
def get_summary(
    activity_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SummaryResponse:
    activity = _activity_for_user(db, current_user, activity_id)
    if not activity.ai_summary or not activity.ai_provider or not activity.ai_updated_at or not activity.ai_data_basis:
        _generate_summary(activity, db, current_user)
        db.commit()
        db.refresh(activity)
    return SummaryResponse(
        summary=activity.ai_summary,
        provider=activity.ai_provider,
        updated_at=activity.ai_updated_at,
        data_basis=activity.ai_data_basis,
    )


@router.post("/activities/{activity_id}/summary", response_model=SummaryResponse)
def create_summary(
    activity_id: str,
    force: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SummaryResponse:
    activity = _activity_for_user(db, current_user, activity_id)
    if force or not activity.ai_summary or not activity.ai_data_basis:
        _generate_summary(activity, db, current_user)
        db.commit()
        db.refresh(activity)
    return SummaryResponse(
        summary=activity.ai_summary,
        provider=activity.ai_provider,
        updated_at=activity.ai_updated_at,
        data_basis=activity.ai_data_basis,
    )


@router.get("/statistics/overview", response_model=StatisticsOverview)
def statistics_overview(
    date_from: date | None = None,
    date_to: date | None = None,
    granularity: str = Query(default="auto", pattern=r"^(auto|day|week|month)$"),
    type: str | None = Query(default=None, max_length=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StatisticsOverview:
    settings = get_settings()
    timezone_name = settings.timezone
    end = date_to or datetime.now(ZoneInfo(timezone_name)).date()
    if end.year >= 9999:
        raise HTTPException(status_code=422, detail="Das Enddatum liegt außerhalb des unterstützten Bereichs.")
    start = date_from
    activity_type = type.strip().lower() if type else None
    if start is None:
        earliest_conditions = [
            Activity.user_id == current_user.id,
            Activity.include_in_statistics.is_(True),
            Activity.started_at < _local_midnight(end + timedelta(days=1), timezone_name),
        ]
        if activity_type:
            earliest_conditions.append(Activity.activity_type == activity_type)
        earliest = db.scalar(
            select(func.min(Activity.started_at)).where(*earliest_conditions)
        )
        start = _local_date(earliest, timezone_name) if earliest else end
    if end < start:
        raise HTTPException(status_code=422, detail="Das Enddatum muss am oder nach dem Startdatum liegen.")
    if start < date(1900, 1, 1):
        raise HTTPException(status_code=422, detail="Statistikzeiträume vor 1900 werden nicht unterstützt.")
    current_conditions = [
        Activity.user_id == current_user.id,
        Activity.include_in_statistics.is_(True),
        Activity.started_at >= _local_midnight(start, timezone_name),
        Activity.started_at < _local_midnight(end + timedelta(days=1), timezone_name),
    ]
    if activity_type:
        current_conditions.append(Activity.activity_type == activity_type)
    span = (end - start).days + 1
    if span > 36_525:
        raise HTTPException(status_code=422, detail="Der Statistikzeitraum darf höchstens 100 Jahre umfassen.")
    if granularity == "day" and span > 730:
        raise HTTPException(status_code=422, detail="Tägliche Gruppierung ist auf zwei Jahre begrenzt.")
    if granularity == "week" and span > 7_305:
        raise HTTPException(status_code=422, detail="Wöchentliche Gruppierung ist auf zwanzig Jahre begrenzt.")
    previous_to = start - timedelta(days=1)
    previous_from = previous_to - timedelta(days=span - 1)
    previous_conditions = [
        Activity.user_id == current_user.id,
        Activity.include_in_statistics.is_(True),
        Activity.started_at >= _local_midnight(previous_from, timezone_name),
        Activity.started_at < _local_midnight(previous_to + timedelta(days=1), timezone_name),
    ]
    if activity_type:
        previous_conditions.append(Activity.activity_type == activity_type)
    activities = db.scalars(select(Activity).where(*current_conditions).order_by(Activity.started_at)).all()
    previous = db.scalars(select(Activity).where(*previous_conditions).order_by(Activity.started_at)).all()
    return StatisticsOverview.model_validate(
        build_statistics(
            activities,
            previous,
            start,
            end,
            previous_from,
            previous_to,
            granularity,
            timezone_name,
        )
    )
