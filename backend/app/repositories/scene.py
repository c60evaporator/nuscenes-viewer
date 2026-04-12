from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.scene import Log, Sample, Scene


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

    async def get_samples_by_scene(self, scene_token: str) -> list[Sample]:
        result = await self.db.execute(
            select(Sample)
            .where(Sample.scene_token == scene_token)
            .order_by(Sample.timestamp)
        )
        return list(result.scalars().all())
