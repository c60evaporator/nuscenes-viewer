"""DB → NuScenes Map expansion JSON エクスポーター。

to_map_db.py の逆変換。DB の PostGIS ジオメトリをローカルメートル座標に変換し、
Map expansion JSON 形式（boston-seaport.json 等）として書き出す。

ラウンドトリップ制限（完全一致不可の箇所）:
  - node: ジオメトリ頂点から決定論的 UUID (uuid5) を付与するため、元のトークンとは異なる
  - polygon.exterior_node_tokens / line.node_tokens: 上記合成ノードを参照するため元と異なる
  - lane_divider_segments.node_token: DB に元の UUID が保存されているが新 node リストと対応しない
  - road_divider: インポート時に road_segment_token=null のものはスキップ済みのため復元不可
  - carpark_area / traffic_light: road_block_token=null のものはスキップ済みのため件数が減る場合あり
"""
import json
import logging
import os
from uuid import uuid5, NAMESPACE_X500

from geoalchemy2.shape import to_shape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.geometry import wgs84_to_local
from app.db.session import AsyncSessionLocal
from app.models.map import (
    CarparkArea,
    DrivableArea,
    Lane,
    LaneConnector,
    LaneDivider,
    MapLine,
    MapMeta,
    MapPolygon,
    PedCrossing,
    RoadBlock,
    RoadDivider,
    RoadSegment,
    StopLine,
    TrafficLight,
    Walkway,
)

logger = logging.getLogger(__name__)

_YIELD_PER = 1000


# ── ジオメトリ逆変換ヘルパー ──────────────────────────────────────────────────

def _node_uuid(x: float, y: float) -> str:
    """座標から決定論的 UUID を生成する。同一座標は常に同一 UUID になる。"""
    return str(uuid5(NAMESPACE_X500, f"{x:.6f},{y:.6f}"))


def _extract_multipolygon_coords(
    wkb, location: str
) -> tuple[list[tuple[float, float]], list[list[tuple[float, float]]]]:
    """WKB(MULTIPOLYGON) → (exterior_xy, [hole_xy, ...]) ローカルメートル座標。

    MapPolygon は MULTIPOLYGON で格納されているが、
    インポート時に MultiPolygon([single_polygon]) として格納されるため
    geoms[0] を使用する。
    """
    mp = to_shape(wkb)
    poly = mp.geoms[0]
    ext = [wgs84_to_local(lon, lat, location) for lon, lat in poly.exterior.coords[:-1]]
    holes = [
        [wgs84_to_local(lon, lat, location) for lon, lat in ring.coords[:-1]]
        for ring in poly.interiors
    ]
    return ext, holes


def _extract_line_coords(wkb, location: str) -> list[tuple[float, float]]:
    """WKB(LINESTRING) → [(x,y), ...] ローカルメートル座標。"""
    ls = to_shape(wkb)
    return [wgs84_to_local(lon, lat, location) for lon, lat in ls.coords]


def _coords_to_node_tokens(
    coords: list[tuple[float, float]],
    node_registry: dict[str, tuple[float, float]],
) -> list[str]:
    """座標リスト → ノードトークンリスト。node_registry に未登録の座標を追加する。"""
    tokens = []
    for x, y in coords:
        tok = _node_uuid(x, y)
        node_registry[tok] = (x, y)
        tokens.append(tok)
    return tokens


# ── エンティティ別エクスポート関数 ───────────────────────────────────────────

async def _export_polygons_and_lines(
    location: str,
    db: AsyncSession,
) -> tuple[list[dict], list[dict], dict[str, tuple[float, float]]]:
    """MapPolygon / MapLine を取得し、node_registry を構築して返す。

    Returns
    -------
    polygons: list[dict]  — "polygon" キー用
    lines: list[dict]     — "line" キー用
    node_registry: dict   — {token: (x, y)} 全ノード
    """
    node_registry: dict[str, tuple[float, float]] = {}
    polygons = []
    lines = []

    # MapPolygon
    stmt = (
        select(MapPolygon)
        .where(MapPolygon.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        if obj.geom is None:
            continue
        try:
            ext, holes = _extract_multipolygon_coords(obj.geom, location)
        except Exception:
            logger.warning("Failed to extract polygon geom for token=%s", obj.token)
            continue
        ext_tokens = _coords_to_node_tokens(ext, node_registry)
        hole_dicts = []
        for h in holes:
            h_tokens = _coords_to_node_tokens(h, node_registry)
            if h_tokens:
                hole_dicts.append({"node_tokens": h_tokens})
        polygons.append({
            "token": obj.token,
            "exterior_node_tokens": ext_tokens,
            "holes": hole_dicts,
        })

    # MapLine
    stmt = (
        select(MapLine)
        .where(MapLine.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        if obj.geom is None:
            continue
        try:
            coords = _extract_line_coords(obj.geom, location)
        except Exception:
            logger.warning("Failed to extract line geom for token=%s", obj.token)
            continue
        node_tokens = _coords_to_node_tokens(coords, node_registry)
        lines.append({
            "token": obj.token,
            "node_tokens": node_tokens,
        })

    logger.info(
        "[%s] exported %d polygons, %d lines, %d nodes",
        location, len(polygons), len(lines), len(node_registry),
    )
    return polygons, lines, node_registry


async def _export_drivable_areas(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(DrivableArea)
        .where(DrivableArea.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "polygon_tokens": obj.polygon_tokens,
        })
    logger.info("[%s] exported %d drivable_areas", location, len(rows))
    return rows


async def _export_road_segments(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(RoadSegment)
        .where(RoadSegment.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "polygon_token": obj.polygon_token,
            "is_intersection": obj.is_intersection,
            "drivable_area_token": obj.drivable_area_token or "",
        })
    logger.info("[%s] exported %d road_segments", location, len(rows))
    return rows


async def _export_road_blocks(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(RoadBlock)
        .where(RoadBlock.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "polygon_token": obj.polygon_token,
            "from_edge_line_token": obj.from_edge_line_token or "",
            "to_edge_line_token": obj.to_edge_line_token or "",
            "road_segment_token": obj.road_segment_token,
        })
    logger.info("[%s] exported %d road_blocks", location, len(rows))
    return rows


async def _export_lanes_and_connectivity(
    location: str, db: AsyncSession
) -> tuple[list[dict], list[dict], dict[str, list], dict[str, dict]]:
    """Lane / LaneConnector を取得し arcline_path_3 / connectivity も構築して返す。"""
    lanes = []
    arcline_path_3: dict[str, list] = {}
    connectivity: dict[str, dict] = {}

    stmt = (
        select(Lane)
        .where(Lane.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        lanes.append({
            "token": obj.token,
            "polygon_token": obj.polygon_token,
            "lane_type": obj.lane_type,
            "from_edge_line_token": obj.from_edge_line_token or "",
            "to_edge_line_token": obj.to_edge_line_token or "",
            "left_lane_divider_segments": obj.left_lane_divider_segments or [],
            "right_lane_divider_segments": obj.right_lane_divider_segments or [],
        })
        if obj.arcline_path:
            arcline_path_3[obj.token] = obj.arcline_path
        connectivity[obj.token] = {
            "incoming": obj.incoming_tokens or [],
            "outgoing": obj.outgoing_tokens or [],
        }

    lane_connectors = []
    stmt = (
        select(LaneConnector)
        .where(LaneConnector.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        lane_connectors.append({
            "token": obj.token,
            "polygon_token": obj.polygon_token or "",
        })
        if obj.arcline_path:
            arcline_path_3[obj.token] = obj.arcline_path
        connectivity[obj.token] = {
            "incoming": obj.incoming_tokens or [],
            "outgoing": obj.outgoing_tokens or [],
        }

    logger.info(
        "[%s] exported %d lanes, %d lane_connectors",
        location, len(lanes), len(lane_connectors),
    )
    return lanes, lane_connectors, arcline_path_3, connectivity


async def _export_ped_crossings(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(PedCrossing)
        .where(PedCrossing.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "polygon_token": obj.polygon_token,
            "road_segment_token": obj.road_segment_token or "",
        })
    logger.info("[%s] exported %d ped_crossings", location, len(rows))
    return rows


async def _export_walkways(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(Walkway)
        .where(Walkway.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "polygon_token": obj.polygon_token,
        })
    logger.info("[%s] exported %d walkways", location, len(rows))
    return rows


async def _export_stop_lines(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(StopLine)
        .where(StopLine.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "polygon_token": obj.polygon_token,
            "stop_line_type": obj.stop_line_type,
            "ped_crossing_tokens": obj.ped_crossing_tokens or [],
            "traffic_light_tokens": obj.traffic_light_tokens or [],
            "road_block_token": obj.road_block_token or "",
        })
    logger.info("[%s] exported %d stop_lines", location, len(rows))
    return rows


async def _export_carpark_areas(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(CarparkArea)
        .where(CarparkArea.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "polygon_token": obj.polygon_token,
            "orientation": obj.orientation,
            "road_block_token": obj.road_block_token or "",
        })
    logger.info("[%s] exported %d carpark_areas", location, len(rows))
    return rows


async def _export_road_dividers(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(RoadDivider)
        .where(RoadDivider.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "line_token": obj.line_token,
            "road_segment_token": obj.road_segment_token or "",
        })
    logger.info("[%s] exported %d road_dividers", location, len(rows))
    return rows


async def _export_lane_dividers(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(LaneDivider)
        .where(LaneDivider.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "line_token": obj.line_token,
            "lane_divider_segments": obj.lane_divider_segments or [],
        })
    logger.info("[%s] exported %d lane_dividers", location, len(rows))
    return rows


async def _export_traffic_lights(location: str, db: AsyncSession) -> list[dict]:
    rows = []
    stmt = (
        select(TrafficLight)
        .where(TrafficLight.location == location)
        .execution_options(yield_per=_YIELD_PER)
    )
    async for row in await db.stream(stmt):
        obj = row[0]
        rows.append({
            "token": obj.token,
            "line_token": obj.line_token,
            "traffic_light_type": obj.traffic_light_type,
            "from_road_block_token": obj.from_road_block_token or "",
            "items": obj.items or [],
            "pose": obj.pose or {},
        })
    logger.info("[%s] exported %d traffic_lights", location, len(rows))
    return rows


# ── エントリーポイント ─────────────────────────────────────────────────────────

async def export_map(output_dir: str, location: str) -> None:
    """指定ロケーションの Map expansion データを JSON ファイルとして書き出す。

    Parameters
    ----------
    output_dir:
        書き出し先ルートディレクトリ（例: "/tmp/map_export"）。
        出力先は {output_dir}/map/expansion/{location}.json になる。
    location:
        マップロケーション名（例: "boston-seaport"）。
    """
    out_path = os.path.join(output_dir, "map", "expansion", f"{location}.json")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    async with AsyncSessionLocal() as db:
        # MapMeta からバージョンと canvas_edge を取得
        stmt = select(MapMeta).where(MapMeta.location == location)
        result = await db.execute(stmt)
        meta = result.scalar_one_or_none()
        if meta is None:
            logger.warning("[%s] map_meta not found — writing empty file", location)
            with open(out_path, "w") as f:
                json.dump({}, f)
            return

        # ジオメトリ再構築（polygon / line / node）
        polygons, lines, node_registry = await _export_polygons_and_lines(location, db)

        # ノードリスト（決定論的 UUID、元の UUID とは異なる）
        nodes = [{"token": tok, "x": x, "y": y} for tok, (x, y) in node_registry.items()]

        # 各エンティティ
        drivable_areas = await _export_drivable_areas(location, db)
        road_segments = await _export_road_segments(location, db)
        road_blocks = await _export_road_blocks(location, db)
        lanes, lane_connectors, arcline_path_3, connectivity = (
            await _export_lanes_and_connectivity(location, db)
        )
        ped_crossings = await _export_ped_crossings(location, db)
        walkways = await _export_walkways(location, db)
        stop_lines = await _export_stop_lines(location, db)
        carpark_areas = await _export_carpark_areas(location, db)
        road_dividers = await _export_road_dividers(location, db)
        lane_dividers = await _export_lane_dividers(location, db)
        traffic_lights = await _export_traffic_lights(location, db)

    # schemas_mapexpansion.MapExpansion のフィールド順に合わせて出力
    output = {
        "version": meta.version,
        "polygon": polygons,
        "line": lines,
        "node": nodes,
        "drivable_area": drivable_areas,
        "road_segment": road_segments,
        "road_block": road_blocks,
        "lane": lanes,
        "ped_crossing": ped_crossings,
        "walkway": walkways,
        "stop_line": stop_lines,
        "carpark_area": carpark_areas,
        "road_divider": road_dividers,
        "lane_divider": lane_dividers,
        "traffic_light": traffic_lights,
        "canvas_edge": meta.canvas_edge,
        "arcline_path_3": arcline_path_3,
        "connectivity": connectivity,
        "lane_connector": lane_connectors,
    }

    with open(out_path, "w") as f:
        json.dump(output, f, ensure_ascii=False)

    logger.info("[%s] Map expansion export complete → %s", location, out_path)
