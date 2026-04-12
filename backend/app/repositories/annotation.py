from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.annotation import Attribute, Instance, SampleAnnotation
from app.schemas.annotation import AnnotationUpdate


def _base_query():
    """SampleAnnotation の標準 eager-load オプション付きクエリを返す。"""
    return select(SampleAnnotation).options(
        selectinload(SampleAnnotation.instance).selectinload(Instance.category),
        selectinload(SampleAnnotation.visibility),
        selectinload(SampleAnnotation.attributes),
    )


class AnnotationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_all(
        self, limit: int, offset: int
    ) -> tuple[int, list[SampleAnnotation]]:
        total_result = await self.db.execute(
            select(func.count()).select_from(SampleAnnotation)
        )
        total = total_result.scalar_one()

        result = await self.db.execute(
            _base_query()
            .order_by(SampleAnnotation.token)
            .limit(limit)
            .offset(offset)
        )
        return total, list(result.scalars().all())

    async def get_by_token(self, token: str) -> SampleAnnotation | None:
        result = await self.db.execute(
            _base_query().where(SampleAnnotation.token == token)
        )
        return result.scalar_one_or_none()

    async def get_by_sample(self, sample_token: str) -> list[SampleAnnotation]:
        """samples.py エンドポイントでも使用する。"""
        result = await self.db.execute(
            _base_query().where(SampleAnnotation.sample_token == sample_token)
        )
        return list(result.scalars().all())

    async def update(
        self, token: str, data: AnnotationUpdate
    ) -> SampleAnnotation | None:
        ann = await self.get_by_token(token)
        if ann is None:
            return None

        if data.translation is not None:
            ann.translation = data.translation
        if data.rotation is not None:
            ann.rotation = data.rotation
        if data.size is not None:
            ann.size = data.size
        if data.visibility_token is not None:
            ann.visibility_token = data.visibility_token

        if data.attribute_tokens is not None:
            attr_result = await self.db.execute(
                select(Attribute).where(Attribute.token.in_(data.attribute_tokens))
            )
            ann.attributes = list(attr_result.scalars().all())

        await self.db.flush()
        await self.db.refresh(ann, ["attributes", "visibility"])
        return ann
