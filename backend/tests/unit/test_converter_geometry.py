"""Unit tests for app/converters/geometry.py.

PostGIS への接続は不要。
- local_to_wgs84: 純粋な Python/math 計算のみ
- wkb_to_geojson: geoalchemy2.shape.from_shape + Shapely でインメモリ WKBElement を生成して検証
"""
import math

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import shape

from app.converters.geometry import local_to_wgs84, wkb_to_geojson


# ── MAP_ORIGINS（テストで参照するため再定義）────────────────────────────────
# geometry.py の _MAP_ORIGINS はプライベートなので、期待値をここで保持する。

_ORIGINS = {
    "boston-seaport":           (42.336849169438615,  -71.05785369873047),
    "singapore-onenorth":       (1.2882100888758645,  103.78475189208984),
    "singapore-hollandvillage": (1.2993652317780957,  103.78252056121826),
    "singapore-queenstown":     (1.2782562240223188,  103.76741409301758),
}


# ── ヘルパー ──────────────────────────────────────────────────────────────────

def _make_wkb(geojson_dict: dict):
    """GeoJSON dict → WKBElement（SRID=4326）。DB不要。"""
    return from_shape(shape(geojson_dict), srid=4326)


def _coords_close(a, b, rel_tol: float = 1e-6) -> bool:
    """2つの座標値（float）が相対誤差 rel_tol 以内で一致するか判定。"""
    return math.isclose(a, b, rel_tol=rel_tol)


def _list_close(lst_a: list, lst_b: list, rel_tol: float = 1e-6) -> bool:
    """1次元 float リストがすべて rel_tol 以内で一致するか判定。"""
    return len(lst_a) == len(lst_b) and all(
        _coords_close(a, b, rel_tol) for a, b in zip(lst_a, lst_b)
    )


# ── 1. local_to_wgs84 のテスト ────────────────────────────────────────────────

@pytest.mark.parametrize("location,expected_lat,expected_lon", [
    ("boston-seaport",           42.336849169438615,  -71.05785369873047),
    ("singapore-onenorth",        1.2882100888758645,  103.78475189208984),
    ("singapore-hollandvillage",  1.2993652317780957,  103.78252056121826),
    ("singapore-queenstown",      1.2782562240223188,  103.76741409301758),
])
def test_origin_returns_map_origin_coords(location, expected_lat, expected_lon):
    """各マップの原点 (0,0) を変換したとき、MAP_ORIGINS の lat/lon と一致すること。"""
    lon, lat = local_to_wgs84(0.0, 0.0, location)
    assert _coords_close(lat, expected_lat), f"lat mismatch for {location}"
    assert _coords_close(lon, expected_lon), f"lon mismatch for {location}"


def test_x_increase_increases_lon():
    """x座標が増加したとき lon が増加すること（東方向 = 経度増加）。"""
    lon0, _ = local_to_wgs84(0.0, 0.0, "boston-seaport")
    lon1, _ = local_to_wgs84(100.0, 0.0, "boston-seaport")
    assert lon1 > lon0


def test_y_increase_increases_lat():
    """y座標が増加したとき lat が増加すること（北方向 = 緯度増加）。"""
    _, lat0 = local_to_wgs84(0.0, 0.0, "boston-seaport")
    _, lat1 = local_to_wgs84(0.0, 100.0, "boston-seaport")
    assert lat1 > lat0


def test_invalid_location_raises():
    """存在しない location を渡したとき KeyError が発生すること。"""
    with pytest.raises(KeyError):
        local_to_wgs84(0.0, 0.0, "unknown-location")


# ── 2. wkb_to_geojson ラウンドトリップのテスト ───────────────────────────────

def test_roundtrip_point():
    """Point: GeoJSON → WKB → GeoJSON と変換したとき座標が一致すること。"""
    geojson = {"type": "Point", "coordinates": [103.7848, 1.2882]}
    result = wkb_to_geojson(_make_wkb(geojson))
    assert result is not None
    assert _list_close(list(result["coordinates"]), geojson["coordinates"])


def test_roundtrip_linestring():
    """LineString: GeoJSON → WKB → GeoJSON と変換したとき全頂点の座標が一致すること。"""
    geojson = {
        "type": "LineString",
        "coordinates": [
            [103.7848, 1.2882],
            [103.7860, 1.2895],
            [103.7875, 1.2910],
        ],
    }
    result = wkb_to_geojson(_make_wkb(geojson))
    assert result is not None
    for orig, got in zip(geojson["coordinates"], result["coordinates"]):
        assert _list_close(list(got), orig)


def test_roundtrip_polygon_no_hole():
    """Polygon（穴なし）: GeoJSON → WKB → GeoJSON と変換したとき外周座標が一致すること。"""
    geojson = {
        "type": "Polygon",
        "coordinates": [[
            [103.7840, 1.2880],
            [103.7860, 1.2880],
            [103.7860, 1.2900],
            [103.7840, 1.2900],
            [103.7840, 1.2880],   # 閉環
        ]],
    }
    result = wkb_to_geojson(_make_wkb(geojson))
    assert result is not None
    orig_exterior = geojson["coordinates"][0]
    got_exterior = result["coordinates"][0]
    for orig, got in zip(orig_exterior, got_exterior):
        assert _list_close(list(got), orig)


def test_roundtrip_polygon_with_hole():
    """Polygon（穴あり）: exterior + interior リング両方の座標が一致すること。"""
    geojson = {
        "type": "Polygon",
        "coordinates": [
            # exterior
            [
                [103.7830, 1.2870],
                [103.7870, 1.2870],
                [103.7870, 1.2910],
                [103.7830, 1.2910],
                [103.7830, 1.2870],
            ],
            # interior (hole)
            [
                [103.7840, 1.2880],
                [103.7860, 1.2880],
                [103.7860, 1.2900],
                [103.7840, 1.2900],
                [103.7840, 1.2880],
            ],
        ],
    }
    result = wkb_to_geojson(_make_wkb(geojson))
    assert result is not None
    assert len(result["coordinates"]) == 2, "exterior + 1 hole"
    for ring_orig, ring_got in zip(geojson["coordinates"], result["coordinates"]):
        for orig, got in zip(ring_orig, ring_got):
            assert _list_close(list(got), orig)


def test_wkb_srid_is_4326():
    """from_shape で生成した WKBElement の SRID が 4326 であること。"""
    geojson = {"type": "Point", "coordinates": [103.7848, 1.2882]}
    wkb = _make_wkb(geojson)
    assert wkb.srid == 4326


def test_invalid_geojson_raises():
    """無効な GeoJSON dict（type/coordinates欠如）を shape() に渡したとき例外が発生すること。"""
    with pytest.raises(Exception):
        shape({})


# ── 3. wkb_to_geojson 出力形式のテスト ───────────────────────────────────────

def _point_wkb():
    return _make_wkb({"type": "Point", "coordinates": [103.7848, 1.2882]})


def test_output_has_type_key():
    """wkb_to_geojson の返り値 dict に 'type' キーが存在すること。"""
    result = wkb_to_geojson(_point_wkb())
    assert "type" in result


def test_output_has_coordinates_key():
    """wkb_to_geojson の返り値 dict に 'coordinates' キーが存在すること。"""
    result = wkb_to_geojson(_point_wkb())
    assert "coordinates" in result


def test_point_coordinates_is_two_element_list():
    """Point の coordinates が [lon, lat] の2要素リストであること。"""
    result = wkb_to_geojson(_point_wkb())
    coords = result["coordinates"]
    assert isinstance(coords, (list, tuple))
    assert len(coords) == 2


def test_wkb_none_returns_none():
    """wkb_to_geojson(None) が None を返すこと。"""
    assert wkb_to_geojson(None) is None
