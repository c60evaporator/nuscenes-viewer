from enum import Enum
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, BeforeValidator

# 空文字列 "" または null (None) を None に変換するカスタム型（任意FK用）
# 実データに "" と null の両方が存在するため両方を処理する
OptionalToken = Annotated[str | None, BeforeValidator(lambda v: None if v == "" else (str(v) if v else None))]

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
    token: OptionalToken  # Singapore マップで null が存在する
    exterior_node_tokens: list[UUID]
    holes: list[Hole] = []

class DrivableArea(BaseModel):
    token: UUID
    polygon_tokens: list[OptionalToken]  # Singapore マップでリスト内に null が存在する

class RoadSegment(BaseModel):
    token: UUID
    polygon_token: UUID
    is_intersection: bool
    drivable_area_token: OptionalToken  # "" が多数存在する

class RoadBlock(BaseModel):
    token: UUID
    polygon_token: OptionalToken  # Singapore マップで null が多数存在する
    from_edge_line_token: UUID
    to_edge_line_token: UUID
    road_segment_token: UUID

class PedCrossing(BaseModel):
    token: UUID
    polygon_token: UUID
    road_segment_token: OptionalToken  # Singapore マップで null が存在する

class Walkway(BaseModel):
    token: UUID
    polygon_token: UUID

class StopLine(BaseModel):
    token: UUID
    polygon_token: UUID
    stop_line_type: str
    ped_crossing_tokens: list[UUID]
    traffic_light_tokens: list[UUID]
    road_block_token: OptionalToken  # "" と null の両方が存在する

class CarparkArea(BaseModel):
    token: UUID
    polygon_token: UUID
    orientation: float
    road_block_token: OptionalToken  # Singapore マップで null が存在する

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
    road_segment_token: OptionalToken  # Singapore マップで null が存在する

class LaneDivider(BaseModel):
    token: UUID
    line_token: UUID
    lane_divider_segments: list[DividerSegment]

class Pose(BaseModel):
    tx: float
    ty: float
    tz: float
    rx: float | None  # Singapore マップで null が存在する
    ry: float | None
    rz: float | None

class TrafficLightItem(BaseModel):
    color: str
    shape: str
    rel_pos: Pose
    to_road_block_tokens: list[UUID] = []

class TrafficLight(BaseModel):
    token: UUID
    line_token: UUID
    traffic_light_type: str
    from_road_block_token: OptionalToken  # "" が存在する
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
