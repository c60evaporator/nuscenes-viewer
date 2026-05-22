"""add_prev_cleared_next_cleared_to_annotation_edits

Revision ID: 3c504c152d98
Revises: 2708bbd83100
Create Date: 2026-05-22 03:38:43.996841

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import geoalchemy2


# revision identifiers, used by Alembic.
revision: str = '3c504c152d98'
down_revision: Union[str, None] = '2708bbd83100'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('annotation_edits', sa.Column('prev_cleared', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('annotation_edits', sa.Column('next_cleared', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('annotation_edits', 'next_cleared')
    op.drop_column('annotation_edits', 'prev_cleared')
