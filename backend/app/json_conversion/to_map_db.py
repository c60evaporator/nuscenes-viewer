"""NuScenes Map expansion JSON → PostgreSQL/PostGIS インポーター。

各ロケーション（boston-seaport 等）の JSON ファイルを読み込み、
FK 制約の順序に従って DB に投入する。既存レコードはスキップ（冪等）。
"""
import json
import logging
import os
from math import cos, radians
from uuid import UUID, uuid5, NAMESPACE_URL

from geoalchemy2.shape import from_shape
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.geometry import local_to_wgs84
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.json_conversion.schemas_mapexpansion import (
    MapExpansion,
    Hole,
    Polygon as PolygonS,
)
from app.models.map import (
    MapMeta,
    MapPolygon,
    MapLine,
    DrivableArea,
    RoadSegment,
    RoadBlock,
    Lane,
    LaneConnector,
    LaneDivider,
    RoadDivider,
    PedCrossing,
    Walkway,
    StopLine,
    CarparkArea,
    TrafficLight,
)

logger = logging.getLogger(__name__)

_ASYNCPG_MAX_PARAMS = 32767


# ── ヘルパー：バルク INSERT ───────────────────────────────────────────────────

async def _upsert_ignore(db: AsyncSession, model, rows: list[dict]) -> int:
    """bulk INSERT ... ON CONFLICT (token) DO NOTHING。asyncpg 上限対応済み。"""
    if not rows:
        return 0
    n_cols = len(rows[0])
    chunk_size = max(1, _ASYNCPG_MAX_PARAMS // n_cols)
    total = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        stmt = pg_insert(model).values(chunk).on_conflict_do_nothing(index_elements=["token"])
        result = await db.execute(stmt)
        total += result.rowcount
    return total


# ── ヘルパー：ジオメトリ構築 ──────────────────────────────────────────────────

def _wkb(shape, srid: int = 4326):
    """Shapely geometry → GeoAlchemy2 WKBElement。"""
    return from_shape(shape, srid=srid)


def _coords(tokens: list, node_map: dict[str, tuple[float, float]], location: str) -> list[tuple[float, float]]:
    """ノードトークンリスト → WGS84 座標リスト [(lon, lat), ...]。"""
    result = []
    for t in tokens:
        key = str(t)
        if key in node_map:
            result.append(local_to_wgs84(*node_map[key], location))
    return result


def _build_polygon(
    exterior_tokens: list,
    holes: list[Hole],
    node_map: dict[str, tuple[float, float]],
    location: str,
) -> Polygon | None:
    """Pydantic Polygon スキーマ → Shapely Polygon（穴あり対応）。"""
    ext = _coords(exterior_tokens, node_map, location)
    if len(ext) < 3:
        return None
    inner = [_coords(h.node_tokens, node_map, location) for h in holes]
    try:
        shape = Polygon(ext, [r for r in inner if len(r) >= 3])
        if not shape.is_valid:
            shape = shape.buffer(0)  # 自己交差修正
        return shape if shape.is_valid else None
    except Exception:
        return None


def _build_multipolygon_wkb(poly_schema: PolygonS, node_map: dict, location: str):
    """Polygon スキーマ → MULTIPOLYGON WKBElement（MapPolygon 用）。"""
    shape = _build_polygon(poly_schema.exterior_node_tokens, poly_schema.holes, node_map, location)
    if shape is None:
        return None
    return _wkb(MultiPolygon([shape]))


def _build_polygon_wkb(poly_schema: PolygonS, node_map: dict, location: str):
    """Polygon スキーマ → POLYGON WKBElement（RoadSegment 等の denormalized geom 用）。"""
    shape = _build_polygon(poly_schema.exterior_node_tokens, poly_schema.holes, node_map, location)
    return _wkb(shape) if shape else None


def _build_linestring_wkb(node_tokens: list, node_map: dict, location: str):
    """ノードトークンリスト → LINESTRING WKBElement。"""
    coords = _coords(node_tokens, node_map, location)
    if len(coords) < 2:
        return None
    try:
        return _wkb(LineString(coords))
    except Exception:
        return None


def _build_point_wkb(x: float, y: float, location: str):
    """ローカル座標 (x, y) → POINT WKBElement。"""
    lon, lat = local_to_wgs84(x, y, location)
    return _wkb(Point(lon, lat))


# ── エンティティ別インポート関数 ──────────────────────────────────────────────

async def _import_map_meta(data: MapExpansion, location: str, db: AsyncSession) -> None:
    token = str(uuid5(NAMESPACE_URL, f"map-meta:{location}"))
    row = {
        "token": token,
        "location": location,
        "version": data.version,
        "canvas_edge": list(data.canvas_edge),
        "basemap_path": None,
    }
    n = await _upsert_ignore(db, MapMeta, [row])
    logger.info("[%s] map_meta: %d inserted", location, n)


async def _import_map_polygons(
    data: MapExpansion,
    location: str,
    node_map: dict[str, tuple[float, float]],
    db: AsyncSession,
) -> dict[str, Polygon | None]:
    """MapPolygon を挿入し、token → Shapely Polygon のキャッシュを返す。"""
    rows = []
    geom_cache: dict[str, Polygon | None] = {}
    skipped = 0

    for p in data.polygon:
        if p.token is None:
            skipped += 1
            continue
        token = str(p.token)
        shape = _build_polygon(p.exterior_node_tokens, p.holes, node_map, location)
        geom_cache[token] = shape
        geom_wkb = _wkb(MultiPolygon([shape])) if shape else None
        rows.append({"token": token, "location": location, "geom": geom_wkb})

    n = await _upsert_ignore(db, MapPolygon, rows)
    logger.info("[%s] map_polygons: %d inserted (skipped null-token: %d)", location, n, skipped)
    return geom_cache


async def _import_map_lines(
    data: MapExpansion,
    location: str,
    node_map: dict[str, tuple[float, float]],
    db: AsyncSession,
) -> dict[str, LineString | None]:
    """MapLine を挿入し、token → Shapely LineString のキャッシュを返す。"""
    rows = []
    geom_cache: dict[str, LineString | None] = {}

    for ln in data.line:
        token = str(ln.token)
        coords = _coords(ln.node_tokens, node_map, location)
        shape = LineString(coords) if len(coords) >= 2 else None
        geom_cache[token] = shape
        geom_wkb = _wkb(shape) if shape else None
        rows.append({"token": token, "location": location, "geom": geom_wkb})

    n = await _upsert_ignore(db, MapLine, rows)
    logger.info("[%s] map_lines: %d inserted", location, n)
    return geom_cache


async def _import_drivable_areas(
    data: MapExpansion,
    location: str,
    geom_cache: dict[str, Polygon | None],
    db: AsyncSession,
) -> None:
    rows = []
    for da in data.drivable_area:
        valid_tokens = [str(t) for t in da.polygon_tokens if t is not None]
        shapes = [geom_cache[t] for t in valid_tokens if t in geom_cache and geom_cache[t]]
        geom_wkb = _wkb(MultiPolygon(shapes)) if shapes else None
        rows.append({
            "token": str(da.token),
            "location": location,
            "polygon_tokens": valid_tokens,
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, DrivableArea, rows)
    logger.info("[%s] drivable_areas: %d inserted", location, n)


async def _import_road_segments(
    data: MapExpansion,
    location: str,
    polygon_schema_map: dict[str, PolygonS],
    geom_cache: dict[str, Polygon | None],
    node_map: dict[str, tuple[float, float]],
    db: AsyncSession,
) -> None:
    rows = []
    for rs in data.road_segment:
        pt = str(rs.polygon_token)
        poly_schema = polygon_schema_map.get(pt)
        geom_wkb = _build_polygon_wkb(poly_schema, node_map, location) if poly_schema else None
        rows.append({
            "token": str(rs.token),
            "location": location,
            "polygon_token": pt,
            "is_intersection": rs.is_intersection,
            "drivable_area_token": str(rs.drivable_area_token) if rs.drivable_area_token else None,
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, RoadSegment, rows)
    logger.info("[%s] road_segments: %d inserted", location, n)


async def _import_road_blocks(
    data: MapExpansion,
    location: str,
    polygon_schema_map: dict[str, PolygonS],
    node_map: dict[str, tuple[float, float]],
    db: AsyncSession,
) -> set[str]:
    """RoadBlock を挿入し、挿入済みトークンセットを返す。

    polygon_token が null の road_block はスキップ（Singapore の一部マップ）。
    後続の stop_lines 等がこのセットを使って存在しない FK を NULL に落とす。
    """
    rows = []
    skipped = 0
    inserted_tokens: set[str] = set()
    for rb in data.road_block:
        if rb.polygon_token is None:
            skipped += 1
            continue
        pt = str(rb.polygon_token)
        poly_schema = polygon_schema_map.get(pt)
        geom_wkb = _build_polygon_wkb(poly_schema, node_map, location) if poly_schema else None
        token = str(rb.token)
        inserted_tokens.add(token)
        rows.append({
            "token": token,
            "location": location,
            "polygon_token": pt,
            "from_edge_line_token": str(rb.from_edge_line_token) if rb.from_edge_line_token else None,
            "to_edge_line_token": str(rb.to_edge_line_token) if rb.to_edge_line_token else None,
            "road_segment_token": str(rb.road_segment_token),
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, RoadBlock, rows)
    logger.info("[%s] road_blocks: %d inserted (skipped null polygon: %d)", location, n, skipped)
    return inserted_tokens


async def _import_lanes(
    data: MapExpansion,
    location: str,
    polygon_schema_map: dict[str, PolygonS],
    node_map: dict[str, tuple[float, float]],
    db: AsyncSession,
) -> None:
    # arcline_path_3: dict[UUID, list[DubinsPath]]
    arcline_map = {str(k): [p.model_dump(mode="json") for p in paths] for k, paths in data.arcline_path_3.items()}
    # connectivity: dict[UUID, Connectivity]
    conn_map = {str(k): v for k, v in data.connectivity.items()}

    rows = []
    for ln in data.lane:
        token = str(ln.token)
        pt = str(ln.polygon_token)
        poly_schema = polygon_schema_map.get(pt)
        geom_wkb = _build_polygon_wkb(poly_schema, node_map, location) if poly_schema else None
        conn = conn_map.get(token)
        rows.append({
            "token": token,
            "location": location,
            "polygon_token": pt,
            "lane_type": ln.lane_type,
            "from_edge_line_token": str(ln.from_edge_line_token) if ln.from_edge_line_token else None,
            "to_edge_line_token": str(ln.to_edge_line_token) if ln.to_edge_line_token else None,
            "left_lane_divider_segments": [
                {"node_token": str(s.node_token), "segment_type": s.segment_type}
                for s in ln.left_lane_divider_segments
            ],
            "right_lane_divider_segments": [
                {"node_token": str(s.node_token), "segment_type": s.segment_type}
                for s in ln.right_lane_divider_segments
            ],
            "arcline_path": arcline_map.get(token, []),
            "incoming_tokens": [str(t) for t in conn.incoming] if conn else [],
            "outgoing_tokens": [str(t) for t in conn.outgoing] if conn else [],
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, Lane, rows)
    logger.info("[%s] lanes: %d inserted", location, n)


async def _import_lane_connectors(
    data: MapExpansion,
    location: str,
    polygon_schema_map: dict[str, PolygonS],
    node_map: dict[str, tuple[float, float]],
    db: AsyncSession,
) -> None:
    arcline_map = {str(k): [p.model_dump(mode="json") for p in paths] for k, paths in data.arcline_path_3.items()}
    conn_map = {str(k): v for k, v in data.connectivity.items()}

    rows = []
    for lc in data.lane_connector:
        token = str(lc.token)
        pt = str(lc.polygon_token) if lc.polygon_token else None
        poly_schema = polygon_schema_map.get(pt) if pt else None
        geom_wkb = _build_polygon_wkb(poly_schema, node_map, location) if poly_schema else None
        conn = conn_map.get(token)
        rows.append({
            "token": token,
            "location": location,
            "polygon_token": pt,
            "arcline_path": arcline_map.get(token, []),
            "incoming_tokens": [str(t) for t in conn.incoming] if conn else [],
            "outgoing_tokens": [str(t) for t in conn.outgoing] if conn else [],
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, LaneConnector, rows)
    logger.info("[%s] lane_connectors: %d inserted", location, n)


async def _import_lane_dividers(
    data: MapExpansion,
    location: str,
    line_geom_cache: dict[str, LineString | None],
    db: AsyncSession,
) -> None:
    rows = []
    for ld in data.lane_divider:
        token = str(ld.token)
        lt = str(ld.line_token)
        shape = line_geom_cache.get(lt)
        rows.append({
            "token": token,
            "location": location,
            "line_token": lt,
            "lane_divider_segments": [
                {"node_token": str(s.node_token), "segment_type": s.segment_type}
                for s in ld.lane_divider_segments
            ],
            "geom": _wkb(shape) if shape else None,
        })

    n = await _upsert_ignore(db, LaneDivider, rows)
    logger.info("[%s] lane_dividers: %d inserted", location, n)


async def _import_road_dividers(
    data: MapExpansion,
    location: str,
    line_geom_cache: dict[str, LineString | None],
    db: AsyncSession,
) -> None:
    rows = []
    skipped = 0
    for rd in data.road_divider:
        if rd.road_segment_token is None:
            skipped += 1
            continue
        lt = str(rd.line_token)
        shape = line_geom_cache.get(lt)
        rows.append({
            "token": str(rd.token),
            "location": location,
            "line_token": lt,
            "road_segment_token": str(rd.road_segment_token),
            "geom": _wkb(shape) if shape else None,
        })

    n = await _upsert_ignore(db, RoadDivider, rows)
    logger.info("[%s] road_dividers: %d inserted (skipped null road_segment: %d)", location, n, skipped)


async def _import_ped_crossings(
    data: MapExpansion,
    location: str,
    polygon_schema_map: dict[str, PolygonS],
    node_map: dict[str, tuple[float, float]],
    db: AsyncSession,
) -> None:
    rows = []
    skipped = 0
    for pc in data.ped_crossing:
        if pc.road_segment_token is None:
            skipped += 1
            continue
        pt = str(pc.polygon_token)
        poly_schema = polygon_schema_map.get(pt)
        geom_wkb = _build_polygon_wkb(poly_schema, node_map, location) if poly_schema else None
        rows.append({
            "token": str(pc.token),
            "location": location,
            "polygon_token": pt,
            "road_segment_token": str(pc.road_segment_token),
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, PedCrossing, rows)
    logger.info("[%s] ped_crossings: %d inserted (skipped null road_segment: %d)", location, n, skipped)


async def _import_walkways(
    data: MapExpansion,
    location: str,
    polygon_schema_map: dict[str, PolygonS],
    node_map: dict[str, tuple[float, float]],
    db: AsyncSession,
) -> None:
    rows = []
    for w in data.walkway:
        pt = str(w.polygon_token)
        poly_schema = polygon_schema_map.get(pt)
        geom_wkb = _build_polygon_wkb(poly_schema, node_map, location) if poly_schema else None
        rows.append({
            "token": str(w.token),
            "location": location,
            "polygon_token": pt,
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, Walkway, rows)
    logger.info("[%s] walkways: %d inserted", location, n)


async def _import_stop_lines(
    data: MapExpansion,
    location: str,
    polygon_schema_map: dict[str, PolygonS],
    node_map: dict[str, tuple[float, float]],
    valid_road_block_tokens: set[str],
    db: AsyncSession,
) -> None:
    """StopLine を挿入。road_block_token が挿入済みセットにない場合は NULL にする（nullable=True）。"""
    rows = []
    for sl in data.stop_line:
        pt = str(sl.polygon_token)
        poly_schema = polygon_schema_map.get(pt)
        geom_wkb = _build_polygon_wkb(poly_schema, node_map, location) if poly_schema else None
        rb_token = str(sl.road_block_token) if sl.road_block_token else None
        if rb_token and rb_token not in valid_road_block_tokens:
            rb_token = None
        rows.append({
            "token": str(sl.token),
            "location": location,
            "polygon_token": pt,
            "stop_line_type": sl.stop_line_type,
            "road_block_token": rb_token,
            "ped_crossing_tokens": [str(t) for t in sl.ped_crossing_tokens],
            "traffic_light_tokens": [str(t) for t in sl.traffic_light_tokens],
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, StopLine, rows)
    logger.info("[%s] stop_lines: %d inserted", location, n)


async def _import_carpark_areas(
    data: MapExpansion,
    location: str,
    polygon_schema_map: dict[str, PolygonS],
    node_map: dict[str, tuple[float, float]],
    valid_road_block_tokens: set[str],
    db: AsyncSession,
) -> None:
    """CarparkArea を挿入。road_block_token が null またはスキップ済みの場合はレコードごとスキップ（nullable=False）。"""
    rows = []
    skipped = 0
    for ca in data.carpark_area:
        rb_token = str(ca.road_block_token) if ca.road_block_token else None
        if not rb_token or rb_token not in valid_road_block_tokens:
            skipped += 1
            continue
        pt = str(ca.polygon_token)
        poly_schema = polygon_schema_map.get(pt)
        geom_wkb = _build_polygon_wkb(poly_schema, node_map, location) if poly_schema else None
        rows.append({
            "token": str(ca.token),
            "location": location,
            "polygon_token": pt,
            "orientation": ca.orientation,
            "road_block_token": rb_token,
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, CarparkArea, rows)
    logger.info("[%s] carpark_areas: %d inserted (skipped invalid road_block: %d)", location, n, skipped)


async def _import_traffic_lights(
    data: MapExpansion,
    location: str,
    valid_road_block_tokens: set[str],
    db: AsyncSession,
) -> None:
    """TrafficLight を挿入。from_road_block_token が null またはスキップ済みの場合はスキップ（nullable=False）。"""
    rows = []
    skipped = 0
    for tl in data.traffic_light:
        rb_token = str(tl.from_road_block_token) if tl.from_road_block_token else None
        if not rb_token or rb_token not in valid_road_block_tokens:
            skipped += 1
            continue
        geom_wkb = _build_point_wkb(tl.pose.tx, tl.pose.ty, location)
        rows.append({
            "token": str(tl.token),
            "location": location,
            "line_token": str(tl.line_token),
            "traffic_light_type": tl.traffic_light_type,
            "from_road_block_token": rb_token,
            "items": [item.model_dump(mode="json") for item in tl.items],
            "pose": tl.pose.model_dump(mode="json"),
            "geom": geom_wkb,
        })

    n = await _upsert_ignore(db, TrafficLight, rows)
    logger.info("[%s] traffic_lights: %d inserted (skipped null road_block: %d)", location, n, skipped)


# ── エントリーポイント ─────────────────────────────────────────────────────────

async def import_map(
    location: str,
    data_root: str = settings.NUSCENES_DATAROOT,
) -> None:
    """指定ロケーションの Map expansion JSON を DB に一括投入する（冪等）。

    Parameters
    ----------
    location:
        マップロケーション名。例: "boston-seaport", "singapore-onenorth"
    data_root:
        NuScenes データルートディレクトリ。
    """
    path = os.path.join(data_root, "maps", "expansion", f"{location}.json")
    logger.info("Loading map: %s", path)

    with open(path) as f:
        raw = json.load(f)

    data = MapExpansion.model_validate(raw)

    # ノードルックアップ: token_str → (x, y)
    node_map: dict[str, tuple[float, float]] = {
        str(n.token): (n.x, n.y) for n in data.node
    }

    # ポリゴンスキーマルックアップ: token_str → PolygonS（ジオメトリ再構築用）
    polygon_schema_map: dict[str, PolygonS] = {
        str(p.token): p for p in data.polygon if p.token is not None
    }

    async with AsyncSessionLocal() as db:
        try:
            await _import_map_meta(data, location, db)

            # map_polygons / map_lines はFK依存なし → 順次挿入（geomキャッシュ取得）
            geom_cache = await _import_map_polygons(data, location, node_map, db)
            line_geom_cache = await _import_map_lines(data, location, node_map, db)

            # FK順: drivable_areas → road_segments → road_blocks
            await _import_drivable_areas(data, location, geom_cache, db)
            await _import_road_segments(data, location, polygon_schema_map, geom_cache, node_map, db)
            valid_rb_tokens = await _import_road_blocks(data, location, polygon_schema_map, node_map, db)

            # road_blocks 以降（map_polygons / map_lines に依存するが road_blocks 間は独立）
            await _import_lanes(data, location, polygon_schema_map, node_map, db)
            await _import_lane_connectors(data, location, polygon_schema_map, node_map, db)
            await _import_lane_dividers(data, location, line_geom_cache, db)
            await _import_road_dividers(data, location, line_geom_cache, db)

            # 最終層（road_segments / road_blocks に依存）
            await _import_ped_crossings(data, location, polygon_schema_map, node_map, db)
            await _import_walkways(data, location, polygon_schema_map, node_map, db)
            await _import_stop_lines(data, location, polygon_schema_map, node_map, valid_rb_tokens, db)
            await _import_carpark_areas(data, location, polygon_schema_map, node_map, valid_rb_tokens, db)
            await _import_traffic_lights(data, location, valid_rb_tokens, db)

            await db.commit()
            logger.info("[%s] Map import complete.", location)

        except Exception:
            await db.rollback()
            logger.exception("[%s] Map import failed", location)
            raise


async def import_all_maps(data_root: str = settings.NUSCENES_DATAROOT) -> None:
    """全4ロケーションを順次インポートする。"""
    locations = [
        "boston-seaport",
        "singapore-onenorth",
        "singapore-hollandvillage",
        "singapore-queenstown",
    ]
    for loc in locations:
        await import_map(loc, data_root)
