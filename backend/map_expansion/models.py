from uuid import uuid4
import enum

from sqlalchemy import Column, ForeignKey, Enum, Index, UniqueConstraint
from sqlalchemy import Integer, Float, Boolean, String, Uuid, JSON
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry

from map.database_map import BaseMap

class PolygonOwnerTypesEnum(str, enum.Enum):
    drivable_area = "drivable_area"
    road_segment = "road_segment"
    road_block = "road_block"
    carpark_area = "carpark_area"
    stop_line = "stop_line"
    ped_crossing = "ped_crossing"
    walkway = "walkway"
    lane = "lane"
    lane_connector = "lane_connector"

class LineOwnerTypesEnum(str, enum.Enum):
    road_divider = "road_divider"
    lane_divider = "lane_divider"
    traffic_light = "traffic_light"
    road_block_from = "road_block_from"
    road_block_to = "road_block_to"
    lane_from = "lane_from"
    lane_to = "lane_to"

class DrivableArea(BaseMap):
    __tablename__ = "drivable_areas"
    token = Column(Uuid, primary_key=True, default=uuid4)
    # Relationships
    road_segments = relationship("RoadSegment", back_populates="drivable_area") # Nullable FK

class RoadSegment(BaseMap):
    """
    Represents a contiguous segment of a drivable road.

    Notes
    -----
    - A RoadSegment may optionally belong to a DrivableArea.
    - RoadSegments are not deleted when a DrivableArea is deleted;
      the association is cleared instead (ondelete=SET NULL).
    """
    __tablename__ = "road_segments"
    token = Column(Uuid, primary_key=True, default=uuid4)
    is_intersection = Column(Boolean, nullable=False)
    drivable_area_token = Column(Uuid, ForeignKey("drivable_areas.token", ondelete="SET NULL"), nullable=True)
    # Relationships
    drivable_area = relationship("DrivableArea", back_populates="road_segments")
    road_blocks = relationship("RoadBlock", back_populates="road_segment")
    ped_crossings = relationship("PedCrossing", back_populates="road_segment")
    road_dividers = relationship("RoadDivider", back_populates="road_segment")

class RoadBlock(BaseMap):
    __tablename__ = "road_blocks"
    token = Column(Uuid, primary_key=True, default=uuid4)
    road_segment_token = Column(Uuid, ForeignKey("road_segments.token", ondelete="CASCADE"), nullable=False)
    # Relationships
    road_segment = relationship("RoadSegment", back_populates="road_blocks")
    carpark_areas = relationship("CarparkArea", back_populates="road_block")

class CarparkArea(BaseMap):
    __tablename__ = "carpark_areas"
    token = Column(Uuid, primary_key=True, default=uuid4)
    orientation = Column(Float, nullable=False)
    road_block_token = Column(Uuid, ForeignKey("road_blocks.token", ondelete="CASCADE"), nullable=False)
    # Relationships
    road_block = relationship("RoadBlock", back_populates="carpark_areas")

class StopLine(BaseMap):
    __tablename__ = "stop_lines"
    token = Column(Uuid, primary_key=True, default=uuid4)
    stop_line_type = Column(String, nullable=False)
    ped_crossing_tokens = Column(JSON, nullable=True)  # List of associated PedCrossing tokens
    traffic_light_tokens = Column(JSON, nullable=True)  # List of associated TrafficLight tokens
    road_block_token = Column(Uuid, ForeignKey("road_blocks.token", ondelete="SET NULL"), nullable=True)
    # Relationships
    road_block = relationship("RoadBlock", back_populates="stop_lines")

class PedCrossing(BaseMap):
    __tablename__ = "ped_crossings"
    token = Column(Uuid, primary_key=True, default=uuid4)
    road_segment_token = Column(Uuid, ForeignKey("road_segments.token", ondelete="CASCADE"), nullable=False)
    # Relationships
    road_segment = relationship("RoadSegment", back_populates="ped_crossings")

class Walkway(BaseMap):
    __tablename__ = "walkways"
    token = Column(Uuid, primary_key=True, default=uuid4)

class Lane(BaseMap):
    __tablename__ = "lanes"
    token = Column(Uuid, primary_key=True, default=uuid4)
    lane_type = Column(String, nullable=False)
    left_lane_divider_segments = Column(JSON, nullable=True)  # List of associated LaneDivider nodes on the left side
    right_lane_divider_segments = Column(JSON, nullable=True)  # List of associated LaneDivider nodes on the right side
    arklines = Column(JSON, nullable=False)  # Dubins path style arklines

class LaneConnector(BaseMap):
    __tablename__ = "lane_connectors"
    token = Column(Uuid, primary_key=True, default=uuid4)
    arklines = Column(JSON, nullable=False)  # Dubins path style arklines

class Connectivity(BaseMap):
    __tablename__ = "connectivities"
    token = Column(Uuid, primary_key=True, default=uuid4)
    incoming = Column(JSON, nullable=True)  # List of tokens of incoming entities (e.g. lanes or lane connectors)
    outgoing = Column(JSON, nullable=True)  # List of tokens of outgoing entities (e.g. lanes or lane connectors)

class RoadDivider(BaseMap):
    __tablename__ = "road_dividers"
    token = Column(Uuid, primary_key=True, default=uuid4)
    road_segment_token = Column(Uuid, ForeignKey("road_segments.token", ondelete="CASCADE"), nullable=False)
    # Relationships
    road_segment = relationship("RoadSegment", back_populates="road_dividers")

class LaneDivider(BaseMap):
    __tablename__ = "lane_dividers"
    token = Column(Uuid, primary_key=True, default=uuid4)

class TrafficLight(BaseMap):
    __tablename__ = "traffic_lights"
    token = Column(Uuid, primary_key=True, default=uuid4)
    traffic_light_type = Column(String, nullable=False)
    from_road_block_token = Column(Uuid, ForeignKey("road_blocks.token", ondelete="CASCADE"), nullable=False)
    items = Column(JSON, nullable=True)  # List of each item. Exapmle: {"color": "RED", "shape": "CIRCLE", "rel_pos": {"tx": 0.0, "ty": 0.0, "tz": 0.632, "rx": 0.0, "ry": 0.0, "rz": 0.0}, "to_road_block_tokens": []}
    pose = Column(JSON, nullable=True)  # {"tx": 369.2207339994191, "ty": 1129.3945093980494, "tz": 2.4, "rx": 0.0, "ry": 0.0, "rz": -0.6004778487509836}
    # Relationships
    road_block = relationship("RoadBlock", back_populates="traffic_lights")

class PolygonRef(BaseMap):
    """Association table to link polygons to their owning entities."""
    __tablename__ = "polygon_refs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    polygon_token = Column(Uuid, ForeignKey("polygons.token", ondelete="CASCADE"), nullable=False)
    owner_type = Column(Enum(PolygonOwnerTypesEnum), nullable=False)
    owner_token = Column(Uuid, nullable=False)
    # Relationships
    __table_args__ = (
        UniqueConstraint("owner_type", "owner_token", "polygon_token", name="uq_polygon_ref_owner_polygon"),
        Index("ix_polygon_refs_owner", "owner_type", "owner_token"),
        Index("ix_polygon_refs_polygon", "polygon_token"),
    )
    polygon = relationship("Polygon", back_populates="polygon_refs")

class Polygon(BaseMap):
    __tablename__ = "polygons"
    token = Column(Uuid, primary_key=True, default=uuid4)
    geom = Column(Geometry("POLYGON", srid=4326), nullable=False)
    # Relationships
    polygon_refs = relationship("PolygonRef", back_populates="polygon")

class LineRef(BaseMap):
    """Association table to link lines to their owning entities."""
    __tablename__ = "line_refs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    line_token = Column(Uuid, ForeignKey("lines.token", ondelete="CASCADE"), nullable=False)
    owner_type = Column(Enum(PolygonOwnerTypesEnum), nullable=False)
    owner_token = Column(Uuid, nullable=False)
    # Relationships
    __table_args__ = (
        UniqueConstraint("owner_type", "owner_token", "line_token", name="uq_line_ref_owner_line"),
        Index("ix_line_refs_owner", "owner_type", "owner_token"),
        Index("ix_line_refs_line", "line_token"),
    )
    line = relationship("Line", back_populates="line_refs")

class Line(BaseMap):
    __tablename__ = "lines"
    token = Column(Uuid, primary_key=True, default=uuid4)
    geom = Column(Geometry("LINESTRING", srid=4326), nullable=False)
    # Relationships
    line_refs = relationship("LineRef", back_populates="line")

class LineRef(BaseMap):
    """Association table to link lines to their owning entities."""
    __tablename__ = "line_refs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    line_token = Column(Uuid, ForeignKey("lines.token", ondelete="CASCADE"), nullable=False)
    owner_type = Column(Enum(PolygonOwnerTypesEnum), nullable=False)
    owner_token = Column(Uuid, nullable=False)
    # Relationships
    __table_args__ = (
        UniqueConstraint("owner_type", "owner_token", "line_token", name="uq_line_ref_owner_line"),
        Index("ix_line_refs_owner", "owner_type", "owner_token"),
        Index("ix_line_refs_line", "line_token"),
    )
    line = relationship("Line", back_populates="line_refs")
