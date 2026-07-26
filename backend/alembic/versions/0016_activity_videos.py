"""Extend activity photos into backwards-compatible activity media.

Revision ID: 0016_activity_videos
Revises: 0015_saved_segments
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0016_activity_videos"
down_revision = "0015_saved_segments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activity_photos", sa.Column("media_type", sa.String(length=20), nullable=False, server_default="image"))
    op.add_column("activity_photos", sa.Column("poster_storage_path", sa.String(length=1024), nullable=True))
    op.add_column("activity_photos", sa.Column("duration_s", sa.Float(), nullable=True))
    op.add_column("activity_photos", sa.Column("container_format", sa.String(length=100), nullable=True))
    op.add_column("activity_photos", sa.Column("video_codec", sa.String(length=100), nullable=True))
    op.add_column("activity_photos", sa.Column("audio_codec", sa.String(length=100), nullable=True))
    op.add_column("activity_photos", sa.Column("orientation_degrees", sa.Integer(), nullable=True))
    op.add_column("activity_photos", sa.Column("processing_error", sa.Text(), nullable=True))
    op.create_index("ix_activity_photos_media_type", "activity_photos", ["media_type"], unique=False)
    with op.batch_alter_table("activity_photos") as batch:
        batch.create_unique_constraint(
            "uq_activity_photo_poster_storage_path",
            ["poster_storage_path"],
        )


def downgrade() -> None:
    with op.batch_alter_table("activity_photos") as batch:
        batch.drop_constraint("uq_activity_photo_poster_storage_path", type_="unique")
    op.drop_index("ix_activity_photos_media_type", table_name="activity_photos")
    op.drop_column("activity_photos", "processing_error")
    op.drop_column("activity_photos", "orientation_degrees")
    op.drop_column("activity_photos", "audio_codec")
    op.drop_column("activity_photos", "video_codec")
    op.drop_column("activity_photos", "container_format")
    op.drop_column("activity_photos", "duration_s")
    op.drop_column("activity_photos", "poster_storage_path")
    op.drop_column("activity_photos", "media_type")
