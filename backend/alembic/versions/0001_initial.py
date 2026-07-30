"""Initial Baseline Cycling schema.

Revision ID: 0001
Revises:
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=512), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("is_admin", sa.Boolean(), nullable=False),
        sa.Column("hr_max", sa.Integer(), nullable=False),
        sa.Column("hr_rest", sa.Integer(), nullable=False),
        sa.Column("hr_zones", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "invitations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("created_by_id", sa.String(length=36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invitations_token_hash", "invitations", ["token_hash"], unique=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)

    op.create_table(
        "activities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("original_file_path", sa.String(length=1024), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("activity_type", sa.String(length=50), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("distance_m", sa.Float(), nullable=False),
        sa.Column("duration_s", sa.Float(), nullable=False),
        sa.Column("moving_time_s", sa.Float(), nullable=False),
        sa.Column("pause_time_s", sa.Float(), nullable=False),
        sa.Column("avg_speed_mps", sa.Float(), nullable=False),
        sa.Column("max_speed_mps", sa.Float(), nullable=False),
        sa.Column("elevation_gain_m", sa.Float(), nullable=False),
        sa.Column("avg_hr_bpm", sa.Float(), nullable=True),
        sa.Column("max_hr_bpm", sa.Integer(), nullable=True),
        sa.Column("avg_cadence_rpm", sa.Float(), nullable=True),
        sa.Column("max_cadence_rpm", sa.Integer(), nullable=True),
        sa.Column("avg_power_w", sa.Float(), nullable=True),
        sa.Column("max_power_w", sa.Integer(), nullable=True),
        sa.Column("training_load", sa.Float(), nullable=False),
        sa.Column("hr_zone_seconds", sa.JSON(), nullable=False),
        sa.Column("track_points", sa.JSON(), nullable=False),
        sa.Column("weather", sa.JSON(), nullable=True),
        sa.Column("weather_status", sa.String(length=30), nullable=False),
        sa.Column("weather_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ai_summary", sa.Text(), nullable=True),
        sa.Column("ai_provider", sa.String(length=80), nullable=True),
        sa.Column("ai_updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "file_hash", name="uq_activity_user_hash"),
    )
    op.create_index("ix_activities_file_hash", "activities", ["file_hash"], unique=False)
    op.create_index("ix_activities_started_at", "activities", ["started_at"], unique=False)
    op.create_index("ix_activities_user_id", "activities", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_activities_user_id", table_name="activities")
    op.drop_index("ix_activities_started_at", table_name="activities")
    op.drop_index("ix_activities_file_hash", table_name="activities")
    op.drop_table("activities")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("ix_invitations_token_hash", table_name="invitations")
    op.drop_table("invitations")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

