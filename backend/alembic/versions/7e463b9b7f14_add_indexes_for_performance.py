"""add_indexes_for_performance

Revision ID: 7e463b9b7f14
Revises: 963888f6e306
Create Date: 2026-04-24 00:00:00.000000

FK列へのインデックス追加（PostgreSQLはFK制約を自動インデックス化しない）:
  - samples.scene_token
  - sample_annotations.sample_token
  - sample_annotations.instance_token
  - sample_data(sample_token, is_key_frame) 複合インデックス
"""
from typing import Sequence, Union
from alembic import op

revision: str = '7e463b9b7f14'
down_revision: Union[str, None] = '963888f6e306'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_samples_scene_token',
                    'samples', ['scene_token'])
    op.create_index('ix_sample_annotations_sample_token',
                    'sample_annotations', ['sample_token'])
    op.create_index('ix_sample_annotations_instance_token',
                    'sample_annotations', ['instance_token'])
    op.create_index('ix_sample_data_sample_key_frame',
                    'sample_data', ['sample_token', 'is_key_frame'])


def downgrade() -> None:
    op.drop_index('ix_sample_data_sample_key_frame',  table_name='sample_data')
    op.drop_index('ix_sample_annotations_instance_token', table_name='sample_annotations')
    op.drop_index('ix_sample_annotations_sample_token',   table_name='sample_annotations')
    op.drop_index('ix_samples_scene_token',           table_name='samples')
