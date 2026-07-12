"""scene インポート（POST /scenes/import）バリデーション用の参照クエリ."""
from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.map import MapMeta
from app.models.sensor import Sensor

# IN 句のチャンクサイズ（asyncpg のパラメータ上限 32767 に対する余裕値）
_IN_CHUNK = 10000


class SceneImportRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_map_locations(self) -> set[str]:
        """map_meta テーブルに存在する location の集合."""
        result = await self.db.execute(select(distinct(MapMeta.location)))
        return set(result.scalars().all())

    async def get_sensor_tokens(self) -> set[str]:
        """sensors テーブルに存在する token の集合（nuScenes 固定 12 件）."""
        result = await self.db.execute(select(Sensor.token))
        return set(result.scalars().all())

    async def get_existing_tokens(self, model, tokens: list[str]) -> set[str]:
        """指定 token のうち、model のテーブルに既に存在するものを返す.

        calibrated_sensor / log の dedup 判定と、
        scene / sample / sample_data / ego_pose の重複検出に共用する。
        """
        existing: set[str] = set()
        for i in range(0, len(tokens), _IN_CHUNK):
            chunk = tokens[i : i + _IN_CHUNK]
            result = await self.db.execute(
                select(model.token).where(model.token.in_(chunk))
            )
            existing.update(result.scalars().all())
        return existing
