from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.map import (
    CarparkArea,
    DrivableArea,
    Lane,
    LaneConnector,
    LaneDivider,
    MapMeta,
    PedCrossing,
    RoadBlock,
    RoadDivider,
    RoadSegment,
    StopLine,
    TrafficLight,
    Walkway,
)
from app.schemas.map import MapLayer

_LAYER_MODEL: dict[MapLayer, Any] = {
    MapLayer.drivable_area:  DrivableArea,
    MapLayer.road_segment:   RoadSegment,
    MapLayer.road_block:     RoadBlock,
    MapLayer.lane:           Lane,
    MapLayer.lane_connector: LaneConnector,
    MapLayer.carpark_area:   CarparkArea,
    MapLayer.stop_line:      StopLine,
    MapLayer.ped_crossing:   PedCrossing,
    MapLayer.walkway:        Walkway,
    MapLayer.road_divider:   RoadDivider,
    MapLayer.lane_divider:   LaneDivider,
    MapLayer.traffic_light:  TrafficLight,
}


class MapRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── MapMeta ───────────────────────────────────────────────────────────────

    async def get_all_maps(
        self, limit: int, offset: int
    ) -> tuple[int, list[MapMeta]]:
        total = (await self.db.execute(
            select(func.count()).select_from(MapMeta)
        )).scalar_one()
        result = await self.db.execute(
            select(MapMeta).order_by(MapMeta.location).limit(limit).offset(offset)
        )
        return total, list(result.scalars().all())

    async def get_map_by_token(self, token: str) -> MapMeta | None:
        result = await self.db.execute(
            select(MapMeta).where(MapMeta.token == token)
        )
        return result.scalar_one_or_none()

    # ── Layer Features ────────────────────────────────────────────────────────

    async def get_layer_features(
        self, location: str, layer: MapLayer
    ) -> list[Any]:
        """指定ロケーションの特定レイヤーの全フィーチャーを返す。"""
        model = _LAYER_MODEL[layer]
        result = await self.db.execute(
            select(model).where(model.location == location)
        )
        return list(result.scalars().all())
