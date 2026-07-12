"""scene 削除（DELETE /scenes/{token}）用の DB アクセス.

削除本体は scenes 1 行の DELETE で、samples / sample_data / sample_annotations /
annotation_edits は FK の ON DELETE CASCADE で連鎖削除される。
CASCADE は削除件数を返さないため、件数は削除前に COUNT で集計する。
"""
from sqlalchemy import delete, distinct, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import SampleAnnotation
from app.models.annotation_edit import AnnotationEdit, InstanceEdit
from app.models.scene import Log, Sample, Scene
from app.models.sensor import CalibratedSensor, EgoPose, SampleData

# IN 句のチャンクサイズ（asyncpg のパラメータ上限 32767 に対する余裕値）
_IN_CHUNK = 10000


class SceneDeleteRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_scene(self, token: str) -> Scene | None:
        result = await self.db.execute(select(Scene).where(Scene.token == token))
        return result.scalar_one_or_none()

    def _sample_tokens_subq(self, scene_token: str):
        return select(Sample.token).where(Sample.scene_token == scene_token).scalar_subquery()

    async def count_children(self, scene_token: str) -> dict[str, int]:
        """CASCADE で削除される子テーブルの件数を削除前に集計する."""
        subq = self._sample_tokens_subq(scene_token)

        async def _count(stmt) -> int:
            return (await self.db.execute(stmt)).scalar_one()

        return {
            "samples": await _count(
                select(func.count()).select_from(Sample).where(Sample.scene_token == scene_token)
            ),
            "sample_data": await _count(
                select(func.count()).select_from(SampleData).where(SampleData.sample_token.in_(subq))
            ),
            "sample_annotations": await _count(
                select(func.count()).select_from(SampleAnnotation)
                .where(SampleAnnotation.sample_token.in_(subq))
            ),
            "annotation_edits": await _count(
                select(func.count()).select_from(AnnotationEdit)
                .where(AnnotationEdit.sample_token.in_(subq))
            ),
        }

    async def get_referenced_tokens(self, scene_token: str) -> tuple[list[str], list[str]]:
        """当該 scene の sample_data が参照する ego_pose / calibrated_sensor の token 一覧."""
        subq = self._sample_tokens_subq(scene_token)
        ep = await self.db.execute(
            select(distinct(SampleData.ego_pose_token)).where(SampleData.sample_token.in_(subq))
        )
        cs = await self.db.execute(
            select(distinct(SampleData.calibrated_sensor_token))
            .where(SampleData.sample_token.in_(subq))
        )
        return list(ep.scalars().all()), list(cs.scalars().all())

    async def delete_scene(self, token: str) -> int:
        """scenes 1 行を削除（samples 以下は CASCADE で連鎖削除）."""
        result = await self.db.execute(delete(Scene).where(Scene.token == token))
        return result.rowcount

    async def _delete_orphans(self, model, ref_condition, tokens: list[str]) -> int:
        """候補 token のうち、参照が残っておらず is_user_created=true のものを削除する."""
        deleted = 0
        for i in range(0, len(tokens), _IN_CHUNK):
            chunk = tokens[i : i + _IN_CHUNK]
            result = await self.db.execute(
                delete(model)
                .where(model.token.in_(chunk))
                .where(model.is_user_created)
                .where(~exists(ref_condition))
            )
            deleted += result.rowcount
        return deleted

    async def delete_orphan_ego_poses(self, tokens: list[str]) -> int:
        return await self._delete_orphans(
            EgoPose,
            select(SampleData.token).where(SampleData.ego_pose_token == EgoPose.token),
            tokens,
        )

    async def delete_orphan_calibrated_sensors(self, tokens: list[str]) -> int:
        return await self._delete_orphans(
            CalibratedSensor,
            select(SampleData.token)
            .where(SampleData.calibrated_sensor_token == CalibratedSensor.token),
            tokens,
        )

    async def delete_orphan_logs(self, tokens: list[str]) -> int:
        return await self._delete_orphans(
            Log,
            select(Scene.token).where(Scene.log_token == Log.token),
            tokens,
        )

    async def delete_orphan_instance_edits(self) -> int:
        """残った annotation_edits から参照されていない instance_edits を削除する.

        instance_edits は全レコードがユーザ作成のため is_user_created 条件なし。
        """
        result = await self.db.execute(
            delete(InstanceEdit).where(
                ~exists(
                    select(AnnotationEdit.token)
                    .where(AnnotationEdit.instance_token == InstanceEdit.token)
                )
            )
        )
        return result.rowcount
