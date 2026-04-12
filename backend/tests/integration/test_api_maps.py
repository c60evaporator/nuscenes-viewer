"""Integration tests for map API endpoints.

テストデータは conftest.py の map_meta fixture 経由でその都度投入し、
テスト終了後にロールバックする。
location="test-boston-seaport" を使うことで実際の NuScenes データと隔離している。

エンドポイント対象:
  GET /api/v1/maps
  GET /api/v1/maps/{token}/geojson

未実装エンドポイント（スキップ）:
  GET /api/v1/maps/{token}/layers — エンドポイント未実装のため全テストをスキップ
"""
import pytest
from httpx import AsyncClient

from app.models.map import MapMeta


_MAP_META_TOKEN = "map-maptest-001"
_MAP_LOCATION = "test-boston-seaport"

_VALID_GEOMETRY_TYPES = {"Point", "LineString", "Polygon", "MultiPolygon",
                          "MultiPoint", "MultiLineString", "GeometryCollection"}


# ── GeoJSON 検証ヘルパー ─────────────────────────────────────────────────────

def assert_valid_geojson_feature(feature: dict) -> None:
    """feature が有効な GeoJSON Feature 形式かを検証する。"""
    assert feature.get("type") == "Feature", f"type must be 'Feature', got: {feature.get('type')}"
    assert "geometry" in feature, "feature must have 'geometry' key"
    assert "properties" in feature, "feature must have 'properties' key"
    geom = feature["geometry"]
    if geom is not None:
        assert "type" in geom, "geometry must have 'type' key"
        assert "coordinates" in geom, "geometry must have 'coordinates' key"


def assert_valid_coordinates(geometry: dict) -> None:
    """全座標が有効な WGS84 範囲内かを再帰的に検証する。
    Point / LineString / Polygon / MultiPolygon に対応する。
    """
    if geometry is None:
        return
    geom_type = geometry["type"]
    coords = geometry["coordinates"]

    def _check_point(pt):
        assert len(pt) >= 2, f"Point must have at least 2 coordinates: {pt}"
        lon, lat = pt[0], pt[1]
        assert -180.0 <= lon <= 180.0, f"longitude out of range: {lon}"
        assert -90.0 <= lat <= 90.0, f"latitude out of range: {lat}"

    def _check_ring(ring):
        for pt in ring:
            _check_point(pt)

    if geom_type == "Point":
        _check_point(coords)
    elif geom_type == "LineString":
        for pt in coords:
            _check_point(pt)
    elif geom_type == "Polygon":
        for ring in coords:
            _check_ring(ring)
    elif geom_type == "MultiPolygon":
        for polygon in coords:
            for ring in polygon:
                _check_ring(ring)


def assert_valid_feature_collection(fc: dict) -> None:
    """FeatureCollection として有効な形式かを検証する。"""
    assert fc.get("type") == "FeatureCollection", \
        f"type must be 'FeatureCollection', got: {fc.get('type')}"
    assert "features" in fc, "FeatureCollection must have 'features' key"
    assert isinstance(fc["features"], list), "'features' must be a list"


# ── GET /api/v1/maps ──────────────────────────────────────────────────────────

async def test_list_maps_returns_200(client: AsyncClient, map_meta: MapMeta):
    """マップ一覧が 200 を返すこと。"""
    resp = await client.get("/api/v1/maps")
    assert resp.status_code == 200


async def test_list_maps_has_pagination_shape(client: AsyncClient, map_meta: MapMeta):
    """レスポンスに total / limit / offset / items キーが含まれること。"""
    resp = await client.get("/api/v1/maps")
    body = resp.json()
    assert set(body.keys()) >= {"total", "limit", "offset", "items"}


async def test_list_maps_items_have_required_fields(client: AsyncClient, map_meta: MapMeta):
    """各 item に token / location / version / canvas_edge が含まれること。"""
    resp = await client.get("/api/v1/maps?limit=500")
    items = resp.json()["items"]
    assert len(items) > 0
    for item in items:
        assert "token" in item
        assert "location" in item
        assert "version" in item
        assert "canvas_edge" in item


async def test_list_maps_contains_fixture_map(client: AsyncClient, map_meta: MapMeta):
    """fixture で投入した MapMeta が一覧に含まれること。"""
    resp = await client.get("/api/v1/maps?limit=500")
    tokens = {item["token"] for item in resp.json()["items"]}
    assert _MAP_META_TOKEN in tokens


async def test_list_maps_limit_negative_returns_422(client: AsyncClient, map_meta: MapMeta):
    """limit=-1（範囲外）のとき 422 が返ること。"""
    resp = await client.get("/api/v1/maps?limit=-1")
    assert resp.status_code == 422


# ── GET /api/v1/maps/{token}/geojson ─────────────────────────────────────────

async def test_get_map_geojson_returns_200(client: AsyncClient, map_meta: MapMeta):
    """存在する token と有効な layer で 200 が返ること。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=lane")
    assert resp.status_code == 200


async def test_get_map_geojson_type_is_feature_collection(client: AsyncClient, map_meta: MapMeta):
    """レスポンスの type が "FeatureCollection" であること。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=lane")
    assert resp.json()["type"] == "FeatureCollection"


async def test_get_map_geojson_features_is_list(client: AsyncClient, map_meta: MapMeta):
    """features キーがリスト形式であること。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=lane")
    assert isinstance(resp.json()["features"], list)


async def test_get_map_geojson_features_have_valid_structure(client: AsyncClient, map_meta: MapMeta):
    """各 feature が GeoJSONFeature 形式（type/geometry/properties）であること。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=lane")
    fc = resp.json()
    assert_valid_feature_collection(fc)
    for feature in fc["features"]:
        assert_valid_geojson_feature(feature)


async def test_get_map_geojson_geometry_type_is_valid(client: AsyncClient, map_meta: MapMeta):
    """geometry.type が有効な GeoJSON ジオメトリ型のいずれかであること。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=lane")
    for feature in resp.json()["features"]:
        geom = feature["geometry"]
        if geom is not None:
            assert geom["type"] in _VALID_GEOMETRY_TYPES


async def test_get_map_geojson_coordinates_not_empty(client: AsyncClient, map_meta: MapMeta):
    """coordinates が空リストでないこと（fixture の Lane は geom あり）。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=lane")
    features = resp.json()["features"]
    assert len(features) >= 1
    for feature in features:
        geom = feature["geometry"]
        if geom is not None:
            assert geom["coordinates"] is not None
            assert len(geom["coordinates"]) > 0


async def test_get_map_geojson_coordinates_in_valid_range(client: AsyncClient, map_meta: MapMeta):
    """全座標の経度が -180〜180、緯度が -90〜90 の範囲内であること。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=lane")
    for feature in resp.json()["features"]:
        geom = feature["geometry"]
        if geom is not None:
            assert_valid_coordinates(geom)


async def test_get_map_geojson_lane_filter_returns_lane_layer(client: AsyncClient, map_meta: MapMeta):
    """layer=lane を指定したとき properties.layer が全て "lane" であること。

    app/converters/geometry.py の to_geojson_feature_collection に layer_name を追加
    することで properties["layer"] が設定されるようになっている。
    """
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=lane")
    features = resp.json()["features"]
    assert len(features) >= 1
    for feature in features:
        assert feature["properties"].get("layer") == "lane", \
            f"Expected layer='lane' in properties, got: {feature['properties']}"


async def test_get_map_geojson_drivable_area_filter(client: AsyncClient, map_meta: MapMeta):
    """layer=drivable_area で features が返ること（fixture に DrivableArea あり）。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=drivable_area")
    assert resp.status_code == 200
    fc = resp.json()
    assert_valid_feature_collection(fc)
    assert len(fc["features"]) >= 1
    for feature in fc["features"]:
        assert feature["properties"].get("layer") == "drivable_area"


async def test_get_map_geojson_unknown_layer_returns_422(client: AsyncClient, map_meta: MapMeta):
    """存在しない layer 名を指定したとき 422 が返ること（FastAPI enum バリデーション）。"""
    resp = await client.get(f"/api/v1/maps/{_MAP_META_TOKEN}/geojson?layer=nonexistent_layer")
    assert resp.status_code == 422


async def test_get_map_geojson_not_found_returns_404(client: AsyncClient, map_meta: MapMeta):
    """存在しない token で 404 が返ること。"""
    resp = await client.get("/api/v1/maps/map-does-not-exist-000/geojson?layer=lane")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Map not found"


# ── GET /api/v1/maps/{token}/layers ──────────────────────────────────────────
# このエンドポイントは現在未実装のためテストをスキップする。
# 実装された場合は以下のテストを追加する：
#   - 200 が返ること
#   - レスポンスがリスト形式であること
#   - lane / road_segment / drivable_area 等が含まれること
