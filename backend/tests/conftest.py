import pytest
from geoalchemy2.shape import from_shape
from httpx import AsyncClient, ASGITransport
from shapely.geometry import LineString, MultiPolygon, Polygon
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.dependencies import get_db
from app.main import app
from app.models.annotation import Category, Instance, SampleAnnotation
from app.models.map import DrivableArea, Lane, MapLine, MapMeta, MapPolygon, RoadDivider, RoadSegment
from app.models.scene import Log, Sample, Scene


# ── マップテスト用定数 ────────────────────────────────────────────────────────

# 実際の NuScenes データとの衝突を避けるため独自 location を使う
_MAP_LOCATION = "test-boston-seaport"
_MAP_META_TOKEN = "map-maptest-001"
_MAP_POLY1_TOKEN = "mpoly-maptest-001"   # Lane 用
_MAP_POLY2_TOKEN = "mpoly-maptest-002"   # RoadSegment 用
_MAP_LINE1_TOKEN = "mline-maptest-001"   # RoadDivider 用
_MAP_DA_TOKEN = "da-maptest-001"
_MAP_LANE_TOKEN = "lane-maptest-001"
_MAP_RS_TOKEN = "rs-maptest-001"
_MAP_RD_TOKEN = "rd-maptest-001"

# boston-seaport 付近の有効 WGS84 座標（lat 42.33-42.34, lon -71.01 to -71.00）
_POLY = Polygon([
    (-71.0100, 42.3350),
    (-71.0050, 42.3350),
    (-71.0050, 42.3400),
    (-71.0100, 42.3400),
    (-71.0100, 42.3350),
])
_MULTIPOLY_WKB = from_shape(MultiPolygon([_POLY]), srid=4326)
_POLY_WKB = from_shape(_POLY, srid=4326)
_LINE_WKB = from_shape(LineString([(-71.0100, 42.3360), (-71.0050, 42.3360)]), srid=4326)


# ── アノテーションテスト用定数 ────────────────────────────────────────────────

_ANN_LOG_TOKEN = "log-anntest-001"
_ANN_SCENE_TOKEN = "scene-anntest-001"
_ANN_SAMPLE_TOKEN = "sample-anntest-001"
_ANN_CAT_TOKEN = "cat-anntest-001"
_ANN_INST_TOKEN = "inst-anntest-001"
_ANN_TOKEN = "ann-anntest-001"


@pytest.fixture
async def db_session():
    """テスト用 AsyncSession。テスト終了後にロールバックして副作用を消す。

    NullPool を使うことで asyncpg の接続がイベントループに紐づく問題を回避する。
    各テストで独立した接続を作成し、テスト後にロールバックする。
    """
    engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            await conn.begin()
            session = AsyncSession(conn, expire_on_commit=False)
            try:
                yield session
            finally:
                await session.close()
                await conn.rollback()
    finally:
        await engine.dispose()


@pytest.fixture
async def client(db_session: AsyncSession):
    """dependency_override で db_session を注入した AsyncClient。"""
    async def _override():
        yield db_session

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as ac:
            yield ac
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
async def sample_annotation(db_session: AsyncSession) -> SampleAnnotation:
    """テスト用の最小限のアノテーションレコード。

    依存するレコード（Log / Scene / Sample / Category / Instance）も合わせて作成する。
    実際の NuScenes データには依存しない（ユニークなトークンを使用）。
    db_session のロールバックにより、テスト終了後に全レコードが消える。
    """
    log = Log(
        token=_ANN_LOG_TOKEN,
        logfile="anntest.log",
        vehicle="test-vehicle-ann",
        date_captured="2024-01-01",
        location="boston-seaport",
    )
    db_session.add(log)
    await db_session.flush()

    scene = Scene(
        token=_ANN_SCENE_TOKEN,
        log_token=_ANN_LOG_TOKEN,
        name="scene-anntest-alpha",
        description=None,
        nbr_samples=1,
        first_sample_token=_ANN_SAMPLE_TOKEN,
        last_sample_token=_ANN_SAMPLE_TOKEN,
    )
    db_session.add(scene)
    await db_session.flush()

    sample = Sample(
        token=_ANN_SAMPLE_TOKEN,
        scene_token=_ANN_SCENE_TOKEN,
        timestamp=1_000_000,
        prev=None,
        next=None,
    )
    db_session.add(sample)
    await db_session.flush()

    category = Category(
        token=_ANN_CAT_TOKEN,
        name="vehicle.car",
        description=None,
    )
    db_session.add(category)
    await db_session.flush()

    # Instance.first/last_annotation_token は循環FK → None のまま
    instance = Instance(
        token=_ANN_INST_TOKEN,
        category_token=_ANN_CAT_TOKEN,
        nbr_annotations=1,
        first_annotation_token=None,
        last_annotation_token=None,
    )
    db_session.add(instance)
    await db_session.flush()

    annotation = SampleAnnotation(
        token=_ANN_TOKEN,
        sample_token=_ANN_SAMPLE_TOKEN,
        instance_token=_ANN_INST_TOKEN,
        translation=[1.0, 2.0, 3.0],
        rotation=[1.0, 0.0, 0.0, 0.0],
        size=[2.0, 4.0, 1.5],
        prev=None,
        next=None,
        num_lidar_pts=10,
        num_radar_pts=0,
        visibility_token=None,
    )
    db_session.add(annotation)
    await db_session.flush()

    return annotation


@pytest.fixture
async def map_meta(db_session: AsyncSession) -> MapMeta:
    """テスト用の最小限のマップレコード群。

    location="test-boston-seaport"（独自値）を使い実際の NuScenes データと隔離する。
    座標は boston-seaport 付近の有効 WGS84 範囲。
    依存チェーン:
        MapPolygon_1 ← Lane.polygon_token
        MapPolygon_2 ← RoadSegment.polygon_token
        MapLine_1    ← RoadDivider.line_token
        RoadSegment  ← RoadDivider.road_segment_token
        MapMeta / DrivableArea / Lane / RoadDivider はすべて同 location
    db_session のロールバックにより、テスト終了後に全レコードが消える。
    """
    # MapPolygon × 2（Lane / RoadSegment が参照する）
    poly1 = MapPolygon(token=_MAP_POLY1_TOKEN, location=_MAP_LOCATION, geom=_MULTIPOLY_WKB)
    poly2 = MapPolygon(token=_MAP_POLY2_TOKEN, location=_MAP_LOCATION, geom=_MULTIPOLY_WKB)
    db_session.add_all([poly1, poly2])
    await db_session.flush()

    # MapLine × 1（RoadDivider が参照する）
    line1 = MapLine(token=_MAP_LINE1_TOKEN, location=_MAP_LOCATION, geom=_LINE_WKB)
    db_session.add(line1)
    await db_session.flush()

    # MapMeta × 1
    meta = MapMeta(
        token=_MAP_META_TOKEN,
        location=_MAP_LOCATION,
        version="1.3",
        canvas_edge=[2000.0, 2000.0],
    )
    db_session.add(meta)
    await db_session.flush()

    # DrivableArea × 1（MULTIPOLYGON geom）
    da = DrivableArea(
        token=_MAP_DA_TOKEN,
        location=_MAP_LOCATION,
        geom=_MULTIPOLY_WKB,
        polygon_tokens=[_MAP_POLY1_TOKEN],
    )
    db_session.add(da)
    await db_session.flush()

    # Lane × 1（POLYGON geom, polygon_token FK）
    lane = Lane(
        token=_MAP_LANE_TOKEN,
        location=_MAP_LOCATION,
        polygon_token=_MAP_POLY1_TOKEN,
        lane_type="CAR",
        from_edge_line_token=None,
        to_edge_line_token=None,
        left_lane_divider_segments=[],
        right_lane_divider_segments=[],
        arcline_path=[],
        incoming_tokens=[],
        outgoing_tokens=[],
        geom=_POLY_WKB,
    )
    db_session.add(lane)
    await db_session.flush()

    # RoadSegment × 1（POLYGON geom、RoadDivider が参照する）
    rs = RoadSegment(
        token=_MAP_RS_TOKEN,
        location=_MAP_LOCATION,
        polygon_token=_MAP_POLY2_TOKEN,
        is_intersection=False,
        drivable_area_token=None,
        geom=_POLY_WKB,
    )
    db_session.add(rs)
    await db_session.flush()

    # RoadDivider × 1（LINESTRING geom）
    rd = RoadDivider(
        token=_MAP_RD_TOKEN,
        location=_MAP_LOCATION,
        line_token=_MAP_LINE1_TOKEN,
        road_segment_token=_MAP_RS_TOKEN,
        geom=_LINE_WKB,
    )
    db_session.add(rd)
    await db_session.flush()

    return meta
