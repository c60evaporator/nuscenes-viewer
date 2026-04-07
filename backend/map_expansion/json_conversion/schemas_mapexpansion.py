from pydantic import BaseModel
from uuid import UUID
from enum import Enum

class Node(BaseModel):
    token: UUID
    x: float
    y: float

class Line(BaseModel):
    token: UUID
    node_tokens: list[UUID]

class Hole(BaseModel):
    node_tokens: list[UUID]

class Polygon(BaseModel):
    token: UUID
    exterior_node_tokens: list[UUID]
    holes: list[Hole] = []

class DrivableArea(BaseModel):
    token: UUID
    polygon_tokens: list[UUID]

class RoadSegment(BaseModel):
    token: UUID
    polygon_token: UUID
    is_intersection: bool
    drivable_area_token: UUID

class RoadBlock(BaseModel):
    token: UUID
    polygon_token: UUID
    from_edge_line_token: UUID
    to_edge_line_token: UUID
    road_segment_token: UUID

class PedCrossing(BaseModel):
    token: UUID
    polygon_token: UUID
    road_segment_token: UUID

class Walkway(BaseModel):
    token: UUID
    polygon_token: UUID

class StopLine(BaseModel):
    token: UUID
    polygon_token: UUID
    stop_line_type: str
    ped_crossing_tokens: list[UUID]
    traffic_light_tokens: list[UUID]
    road_block_token: UUID

class CarparkArea(BaseModel):
    token: UUID
    polygon_token: UUID
    orientation: float
    road_block_token: UUID

class DividerSegment(BaseModel):
    node_token: UUID
    segment_type: str

class Lane(BaseModel):
    token: UUID
    polygon_token: UUID
    lane_type: str
    from_edge_line_token: UUID
    to_edge_line_token: UUID
    left_lane_divider_segments: list[DividerSegment]
    right_lane_divider_segments: list[DividerSegment]

class RoadDivider(BaseModel):
    token: UUID
    line_token: UUID
    road_segment_token: UUID

class LaneDivider(BaseModel):
    token: UUID
    line_token: UUID
    lane_divider_segments: list[DividerSegment]

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

class TrafficLight(BaseModel):
    token: UUID
    line_token: UUID
    traffic_light_type: str
    from_road_block_token: UUID
    items: list[TrafficLightItem]
    pose: Pose

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
class Connectivity(BaseModel):
    incoming: list[UUID]
    outgoing: list[UUID]

class LaneConnector(BaseModel):
    token: UUID
    polygon_token: UUID

class MapExpansion(BaseModel):
    version: str
    polygon: list[Polygon]
    line: list[Line]
    node: list[Node]
    drivable_area: list[DrivableArea]
    road_segment: list[RoadSegment]
    road_block: list[RoadBlock]
    ped_crossing: list[PedCrossing]
    walkway: list[Walkway]
    stop_line: list[StopLine]
    carpark_area: list[CarparkArea]
    lane: list[Lane]
    road_divider: list[RoadDivider]
    lane_divider: list[LaneDivider]
    traffic_light: list[TrafficLight]
    canvas_edge: tuple[float, float]
    arcline_path_3: dict[UUID, list[DubinsPath]] = {}
    connectivity: dict[UUID, Connectivity]
    lane_connector: list[LaneConnector]
