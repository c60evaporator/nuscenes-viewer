"""add_fk_trigger_indexes

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-07-11 00:00:00.000000

scene 削除の高速化用インデックスを追加する。

FK の ON DELETE SET NULL / RESTRICT は行単位トリガで参照列を検索するため、
インデックスが無いと 1 行削除ごとに全表走査が発生する
（v1.0-mini 1 scene の削除で計 3 億行相当の走査 ≈ 10 秒）。
scenes.log_token は GET /scenes?log_token= フィルタの高速化も兼ねる。
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column) — インデックス名は SQLAlchemy 規約の ix_<table>_<column>
_INDEXES = (
    ("scenes",      "log_token"),
    ("samples",     "prev"),
    ("samples",     "next"),
    ("sample_data", "prev"),
    ("sample_data", "next"),
    ("sample_data", "ego_pose_token"),
    ("sample_data", "calibrated_sensor_token"),
)


def upgrade() -> None:
    for table, column in _INDEXES:
        op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade() -> None:
    for table, column in reversed(_INDEXES):
        op.drop_index(f"ix_{table}_{column}", table_name=table)
