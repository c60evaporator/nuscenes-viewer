import math
from typing import Any

from geoalchemy2.shape import to_shape
from sqlalchemy import inspect as sa_inspect

from app.core.app_config import get_map_origins
from app.schemas.map import GeoJSONFeature, GeoJSONFeatureCollection, GeoJSONGeometry

# ── Local → WGS84 ────────────────────────────────────────────────────────────


def local_to_wgs84(x: float, y: float, location: str) -> tuple[float, float]:
    """NuScenes マップローカル座標 (x, y) [meters] → WGS84 (lon, lat)。

    各ロケーションの GPS 原点を基準に線形近似で変換する。
    原点は backend/config/settings.yml の map_origins セクションで管理する。
    Returns (longitude, latitude) — GeoJSON の座標順。
    """
    origins = get_map_origins()
    if location not in origins:
        raise KeyError(
            f"Unknown map location: '{location}'. "
            "backend/config/settings.yml の map_origins セクションに追加してください。"
        )
    lat0, lon0 = origins[location]
    lat = lat0 + y / 111320.0
    lon = lon0 + x / (111320.0 * math.cos(math.radians(lat0)))
    return lon, lat


def wgs84_to_local(lon: float, lat: float, location: str) -> tuple[float, float]:
    """WGS84 (lon, lat) → NuScenes マップローカル座標 (x, y) [meters]。

    local_to_wgs84 の逆変換（線形近似）。
    Returns (x, y) — NuScenes ローカル座標順。
    """
    origins = get_map_origins()
    if location not in origins:
        raise KeyError(
            f"Unknown map location: '{location}'. "
            "backend/config/settings.yml の map_origins セクションに追加してください。"
        )
    lat0, lon0 = origins[location]
    y = (lat - lat0) * 111320.0
    x = (lon - lon0) * 111320.0 * math.cos(math.radians(lat0))
    return x, y


# ── WKB → GeoJSON ────────────────────────────────────────────────────────────


def wkb_to_geojson(wkb) -> dict | None:
    """WKBElement → GeoJSON geometry dict. Returns None if wkb is None."""
    if wkb is None:
        return None
    return to_shape(wkb).__geo_interface__


def to_geojson_feature(obj: Any, layer_name: str | None = None) -> GeoJSONFeature:
    """ORM オブジェクト → GeoJSONFeature。geom 以外の全カラムを properties に含める。

    layer_name を渡した場合は properties に "layer" キーとして追加する。
    """
    geom_dict = wkb_to_geojson(getattr(obj, "geom", None))
    geometry = GeoJSONGeometry(**geom_dict) if geom_dict else None

    mapper = sa_inspect(type(obj))
    properties: dict[str, Any] = {}
    for attr in mapper.column_attrs:
        key = attr.key
        if key == "geom":
            continue
        properties[key] = getattr(obj, key)

    if layer_name is not None:
        properties["layer"] = layer_name

    return GeoJSONFeature(geometry=geometry, properties=properties)


def to_geojson_feature_collection(
    objects: list[Any], layer_name: str | None = None
) -> GeoJSONFeatureCollection:
    """ORM オブジェクトのリスト → GeoJSONFeatureCollection。

    layer_name を渡した場合は各 feature の properties に "layer" キーとして追加する。
    """
    return GeoJSONFeatureCollection(
        features=[to_geojson_feature(obj, layer_name=layer_name) for obj in objects]
    )
