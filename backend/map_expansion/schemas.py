from typing import List, Union

from pydantic import BaseModel
from uuid import UUID
from enum import Enum

# GeoJSON format Point
class Point(BaseModel):
    type: str = 'Point'
    coordinates: tuple[float, float]
# GeoJSON format LineString
class LineString(BaseModel):
    type: str = 'LineString'
    coordinates: list[tuple[float, float]]
# GeoJSON format Polygon
class Polygon(BaseModel):
    type: str = 'Polygon'
    coordinates: list[list[tuple[float, float]]]

# Expansion geometry schema models
class PolygonCreate(BaseModel):
    polygon: Polygon
class ExpansionPolygon(PolygonCreate):
    token: UUID
    class Config:
        orm_mode = True

class LineCreate(BaseModel):
    line: LineString
class ExpansionLine(LineCreate):
    token: UUID
    class Config:
        orm_mode = True

class NodeCreate(BaseModel):
    x: float
    y: float
class ExpansionNode(NodeCreate):
    token: UUID
    class Config:
        orm_mode = True


# Expansion sub-field models
class DividerSegment(BaseModel):
    segment_type: str
    node_token: UUID

class Pose(BaseModel):
    tx: float
    ty: float
    tz: float
    rx: float
    ry: float
    rz: float

class TrafficLightItem(BaseModel):
    color: str
    shape: str
    rel_pos: Pose
    to_road_block_tokens: list[UUID] = []

class DubinsPathEnum(str, Enum):
    LRL = 'LRL'
    RLR = 'RLR'
    LSL = 'LSL'
    LSR = 'LSR'
    RSL = 'RSL'
    RSR = 'RSR'

class DubinsPath(BaseModel):
    start_pose: tuple[float, float, float]
    end_pose: tuple[float, float, float]
    shape: DubinsPathEnum
    radius: float
    segment_length: tuple[float, float, float]  # lengths of arc-line-arc segments

# Expansion table models
class DrivableAreaCreate(BaseModel):
    polygon_tokens: list[UUID]
class DrivableArea(DrivableAreaCreate):
    token: UUID
    class Config:
        orm_mode = True

class RoadSegmentCreate(BaseModel):
    is_intersection: bool
    polygon_token: UUID
    drivable_area_token: Union[UUID, None] = None
class RoadSegment(RoadSegmentCreate):
    token: UUID
    class Config:
        orm_mode = True

class RoadBlockCreate(BaseModel):
    polygon_token: UUID
    from_edge_line_token: UUID
    to_edge_line_token: UUID
class RoadBlock(RoadBlockCreate):
    token: UUID
    road_segment_token: UUID
    class Config:
        orm_mode = True

class PedCrossingCreate(BaseModel):
    polygon_token: UUID
class PedCrossing(PedCrossingCreate):
    token: UUID
    road_segment_token: UUID
    class Config:
        orm_mode = True

class WalkwayCreate(BaseModel):
    polygon_token: UUID
class Walkway(WalkwayCreate):
    token: UUID
    class Config:
        orm_mode = True

class StopLineCreate(BaseModel):
    polygon_token: UUID
    stop_line_type: str
    ped_crossing_tokens: list[UUID]
    traffic_light_tokens: list[UUID]
    road_block_token: UUID
class StopLine(StopLineCreate):
    token: UUID
    class Config:
        orm_mode = True

class CarparkAreaCreate(BaseModel):
    polygon_token: UUID
    orientation: float
class CarparkArea(CarparkAreaCreate):
    token: UUID
    road_block_token: UUID
    class Config:
        orm_mode = True

class RoadDividerCreate(BaseModel):
    line_token: UUID
class RoadDivider(RoadDividerCreate):
    token: UUID
    road_segment_token: UUID
    class Config:
        orm_mode = True

class LaneDividerCreate(BaseModel):
    line_token: UUID
    lane_divider_segments: list[DividerSegment]
class LaneDivider(LaneDividerCreate):
    token: UUID
    class Config:
        orm_mode = True

class TrafficLightCreate(BaseModel):
    line_token: UUID
    traffic_light_type: str
    items: list[TrafficLightItem]
    pose: Pose
class TrafficLight(TrafficLightCreate):
    token: UUID
    from_road_block_token: UUID
    class Config:
        orm_mode = True

class LaneCreate(BaseModel):
    polygon_token: UUID
    lane_type: str
    from_edge_line_token: UUID
    to_edge_line_token: UUID
    left_lane_divider_segments: list[DividerSegment]
    right_lane_divider_segments: list[DividerSegment]
    dubins_paths: list[DubinsPath]
    connectivity_incoming: list[UUID]
    connectivity_outgoing: list[UUID]
class Lane(LaneCreate):
    token: UUID
    class Config:
        orm_mode = True

class LaneConnectorCreate(BaseModel):
    polygon_token: UUID
    dubins_paths: list[DubinsPath]
    connectivity_incoming: list[UUID]
    connectivity_outgoing: list[UUID]
class LaneConnector(LaneConnectorCreate):
    token: UUID
    class Config:
        orm_mode = True
