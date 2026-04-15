from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.scene import Log, Sample, Scene
from app.models.sensor import CalibratedSensor, SampleData


class SceneRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_all(self, limit: int, offset: int) -> tuple[int, list[Scene]]:
        total_result = await self.db.execute(select(func.count()).select_from(Scene))
        total = total_result.scalar_one()

        result = await self.db.execute(
            select(Scene)
            .options(selectinload(Scene.log))
            .order_by(Scene.name)
            .limit(limit)
            .offset(offset)
        )
        scenes = list(result.scalars().all())
        return total, scenes

    async def get_by_token(self, token: str) -> Scene | None:
        result = await self.db.execute(
            select(Scene)
            .options(selectinload(Scene.log))
            .where(Scene.token == token)
        )
        return result.scalar_one_or_none()

    async def get_sample_by_token(self, token: str) -> Sample | None:
        result = await self.db.execute(
            select(Sample).where(Sample.token == token)
        )
        return result.scalar_one_or_none()

    async def get_samples_by_scene(self, scene_token: str) -> list[Sample]:
        result = await self.db.execute(
            select(Sample)
            .where(Sample.scene_token == scene_token)
            .order_by(Sample.timestamp)
        )
        return list(result.scalars().all())

    async def get_all_logs(self, limit: int, offset: int) -> tuple[int, list[Log]]:
        total = (await self.db.execute(
            select(func.count()).select_from(Log)
        )).scalar_one()
        result = await self.db.execute(
            select(Log).order_by(Log.date_captured).limit(limit).offset(offset)
        )
        return total, list(result.scalars().all())

    async def get_ego_poses_by_scene(self, scene_token: str) -> list[SampleData]:
        """scene 内の各 sample につき 1 件の SampleData（is_key_frame=True）を返す。
        DISTINCT ON (sample_token) を使い sample ごとに最も古いキーフレームを選ぶ。
        """
        sample_tokens_subq = (
            select(Sample.token)
            .where(Sample.scene_token == scene_token)
            .scalar_subquery()
        )
        result = await self.db.execute(
            select(SampleData)
            .options(selectinload(SampleData.ego_pose))
            .where(
                SampleData.sample_token.in_(sample_tokens_subq),
                SampleData.is_key_frame.is_(True),
            )
            .order_by(SampleData.sample_token, SampleData.timestamp)
            .distinct(SampleData.sample_token)
        )
        return list(result.scalars().all())
