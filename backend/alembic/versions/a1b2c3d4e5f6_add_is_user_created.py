"""add_is_user_created

Revision ID: a1b2c3d4e5f6
Revises: 3c504c152d98
Create Date: 2026-07-10 00:00:00.000000

scene追加・削除機能用の is_user_created 列を追加する。
初回インポートで読み込んだ既存レコードは server_default='false' により
すべて false（=初期データ）となる。ユーザ追加レコードは Create サービスで true をセットする。

instance_edits は全レコードがユーザ追加のため対象外。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '3c504c152d98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = ("logs", "scenes", "samples", "calibrated_sensors", "ego_poses", "sample_data")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("is_user_created", sa.Boolean(), server_default="false", nullable=False),
        )


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_column(table, "is_user_created")
