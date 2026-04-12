from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class MapMetaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    location: str
    version: str
    canvas_edge: list  # [width_m, height_m]


class GeoJSONGeometry(BaseModel):
    type: str
    coordinates: Any


class GeoJSONFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: GeoJSONGeometry | None
    properties: dict[str, Any]


class GeoJSONFeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJSONFeature]


class MapLayer(str, Enum):
    drivable_area = "drivable_area"
    road_segment = "road_segment"
    road_block = "road_block"
    lane = "lane"
    lane_connector = "lane_connector"
    carpark_area = "carpark_area"
    stop_line = "stop_line"
    ped_crossing = "ped_crossing"
    walkway = "walkway"
    road_divider = "road_divider"
    lane_divider = "lane_divider"
    traffic_light = "traffic_light"
