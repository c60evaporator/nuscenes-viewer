from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.annotation import Attribute, Category, Instance, SampleAnnotation, Visibility
from app.models.scene import Sample
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

    async def get_by_instance(self, instance_token: str) -> list[SampleAnnotation]:
        """Instance の全 Annotation を Sample.timestamp 昇順で返す。"""
        result = await self.db.execute(
            select(SampleAnnotation)
            .options(
                selectinload(SampleAnnotation.instance).selectinload(Instance.category),
                selectinload(SampleAnnotation.visibility),
                selectinload(SampleAnnotation.attributes),
                selectinload(SampleAnnotation.sample),
            )
            .join(Sample, SampleAnnotation.sample_token == Sample.token)
            .where(SampleAnnotation.instance_token == instance_token)
            .order_by(Sample.timestamp)
        )
        return list(result.scalars().all())

    async def get_by_instance_and_sample(
        self, instance_token: str, sample_token: str
    ) -> SampleAnnotation | None:
        """特定 Sample での Instance の Annotation を 1 件取得。"""
        result = await self.db.execute(
            _base_query()
            .where(
                SampleAnnotation.instance_token == instance_token,
                SampleAnnotation.sample_token == sample_token,
            )
        )
        return result.scalar_one_or_none()

    async def get_all_instances(
        self,
        limit: int,
        offset: int,
        scene_token: str | None = None,
        category_name: str | None = None,
    ) -> tuple[int, list[Instance]]:
        """Instance 一覧を category_name 昇順・token 昇順で返す。

        scene_token フィルタ:
          SampleAnnotation → Sample → Scene の JOIN で絞り込む。
          DISTINCT との ORDER BY 競合を避けるため IN subquery を使用。
        category_name フィルタ: ILIKE 部分一致。
        """
        q = (
            select(Instance)
            .join(Category, Category.token == Instance.category_token)
            .options(selectinload(Instance.category))
            .order_by(Category.name, Instance.token)
        )

        if scene_token is not None:
            # そのシーンに属するアノテーションが存在する instance_token の集合
            scene_inst_subq = (
                select(SampleAnnotation.instance_token)
                .join(Sample, Sample.token == SampleAnnotation.sample_token)
                .where(Sample.scene_token == scene_token)
                .distinct()
            )
            q = q.where(Instance.token.in_(scene_inst_subq))

        if category_name is not None:
            q = q.where(Category.name.ilike(f"%{category_name}%"))

        total = (
            await self.db.execute(select(func.count()).select_from(q.subquery()))
        ).scalar_one()
        result = await self.db.execute(q.offset(offset).limit(limit))
        return total, list(result.scalars().all())

    async def get_instance_by_token(self, token: str) -> Instance | None:
        """1件の Instance を category リレーションシップ付きで返す。"""
        result = await self.db.execute(
            select(Instance)
            .join(Category, Category.token == Instance.category_token)
            .options(selectinload(Instance.category))
            .where(Instance.token == token)
        )
        return result.scalar_one_or_none()

    async def get_all_categories(self) -> list[Category]:
        result = await self.db.execute(select(Category).order_by(Category.name))
        return list(result.scalars().all())

    async def get_all_visibilities(self) -> list[Visibility]:
        result = await self.db.execute(select(Visibility).order_by(Visibility.token))
        return list(result.scalars().all())

    async def get_all_attributes(self) -> list[Attribute]:
        result = await self.db.execute(select(Attribute).order_by(Attribute.name))
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
