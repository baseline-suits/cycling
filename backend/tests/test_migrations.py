from pathlib import Path
import sqlite3

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from app.config import get_settings


BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_alembic_revision_graph_is_connected() -> None:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    revisions = ScriptDirectory.from_config(config)

    assert revisions.get_heads() == ["0016_activity_videos"]
    assert revisions.get_revision("0010").down_revision == "0009_google_health"
    assert [revision.revision for revision in revisions.walk_revisions()]


def test_alembic_upgrade_head_on_fresh_sqlite(tmp_path: Path, monkeypatch) -> None:
    database = tmp_path / "fresh.db"
    monkeypatch.setenv("AVENTO_DATABASE_URL", f"sqlite:///{database}")
    get_settings.cache_clear()
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    try:
        command.upgrade(config, "head")
    finally:
        get_settings.cache_clear()

    with sqlite3.connect(database) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(activities)")}
        media_columns = {row[1] for row in connection.execute("PRAGMA table_info(activity_photos)")}
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    assert {"geography_data", "geography_status", "geography_updated_at"} <= columns
    assert {
        "media_type",
        "poster_storage_path",
        "duration_s",
        "container_format",
        "video_codec",
        "processing_error",
    } <= media_columns
    assert revision == ("0016_activity_videos",)
