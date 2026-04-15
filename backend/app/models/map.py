from uuid import uuid4
import enum

from sqlalchemy import ForeignKey, Enum, Index, UniqueConstraint
from sqlalchemy import Integer, Float, Boolean, String, Uuid, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from geoalchemy2 import Geometry

from app.db.base import Base

class MapMeta(Base):
    """マップメタ情報（ロケーション・バージョン・サイズ）"""
    __tablename__ = "map_meta"

    token:      Mapped[str]   = mapped_column(String, primary_key=True)
    location:   Mapped[str]   = mapped_column(String, nullable=False)  # 'boston-seaport' etc.
    version:    Mapped[str]   = mapped_column(String, nullable=False)  # '1.3' etc.
    canvas_edge: Mapped[list] = mapped_column(JSON, nullable=False)    # [width_m, height_m]
    # basemap image path (optional, for visualization reference)
    basemap_path: Mapped[str | None] = mapped_column(String, nullable=True)

# ── Common Geometry Entities (Polygons and Lines) ────────────────────────────────────
 
class MapPolygon(Base):
    """
    Polygon entity with geometry stored in PostGIS. Referenced by various annotations
    (e.g. drivable_area, road_segment, road_block, etc.).
    Coordinates are in SRID=3857 (Web Mercator, meters).
    """
    __tablename__ = "map_polygons"
 
    token:    Mapped[str] = mapped_column(String, primary_key=True)
    location: Mapped[str] = mapped_column(String, nullable=False) # 'boston-seaport' etc.
    # MultiPolygon geometry (allows for holes).
    geom: Mapped[object] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326), nullable=False
    )
 
class MapLine(Base):
    """
    Line entity with geometry stored in PostGIS. Referenced by various annotations
    (e.g. lane dividers, road dividers, etc.).
    Coordinates are in SRID=3857 (Web Mercator, meters).
    """
    __tablename__ = "map_lines"
 
    token:    Mapped[str] = mapped_column(String, primary_key=True)
    location: Mapped[str] = mapped_column(String, nullable=False)
    # LineString geometry.
    geom: Mapped[object] = mapped_column(
        Geometry("LINESTRING", srid=4326), nullable=False
    )

# ── Polygon Entities ───────────────────────────────

class DrivableArea(Base):
    """Drivable area polygon, which may consist of multiple disjoint areas and holes."""
    __tablename__ = "drivable_areas"
    token:    Mapped[str] = mapped_column(String, primary_key=True)
    location: Mapped[str] = mapped_column(String, nullable=False)
    # Connected polygons
    geom: Mapped[object] = mapped_column(
        Geometry("MULTIPOLYGON", srid=4326), nullable=True
    )
    # Original polygon tokens that make up this drivable area (for reference, not used for geometry)
    polygon_tokens: Mapped[list] = mapped_column(JSON, nullable=False)
    # Relationships
    road_segments: Mapped[list["RoadSegment"]] = relationship(
        back_populates="drivable_area",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

class RoadSegment(Base):
    """
    Represents a contiguous segment of a drivable road.

    Notes
    -----
    - A RoadSegment may optionally belong to a DrivableArea.
    - RoadSegments are not deleted when a DrivableArea is deleted;
      the association is cleared instead (ondelete=SET NULL).
    """
    __tablename__ = "road_segments"
    # Columns
    token:               Mapped[str]  = mapped_column(String, primary_key=True)
    location:            Mapped[str]  = mapped_column(String, nullable=False)
    polygon_token:       Mapped[str]  = mapped_column(
        ForeignKey("map_polygons.token", ondelete="RESTRICT"), nullable=False
    )
    is_intersection:     Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    drivable_area_token: Mapped[str | None] = mapped_column(
        ForeignKey("drivable_areas.token", ondelete="SET NULL"), nullable=True
    )
    # Polygon geometry (same as the referenced MapPolygon, denormalized for easier querying)
    geom: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    # Relationships
    polygon:       Mapped["MapPolygon"]      = relationship()
    drivable_area: Mapped["DrivableArea | None"] = relationship(back_populates="road_segments")
    road_blocks:   Mapped[list["RoadBlock"]] = relationship(
        back_populates="road_segment",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    road_dividers: Mapped[list["RoadDivider"]] = relationship(
        back_populates="road_segment",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    ped_crossings: Mapped[list["PedCrossing"]] = relationship(
        back_populates="road_segment",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

class RoadBlock(Base):
    """Represents a contiguous block of road, which may contain lanes, stop lines, traffic lights, etc."""
    __tablename__ = "road_blocks"
    # Columns
    token:                Mapped[str]      = mapped_column(String, primary_key=True)
    location:             Mapped[str]      = mapped_column(String, nullable=False)
    polygon_token:        Mapped[str]      = mapped_column(
        ForeignKey("map_polygons.token", ondelete="RESTRICT"), nullable=False
    )
    from_edge_line_token: Mapped[str | None] = mapped_column(
        ForeignKey("map_lines.token", ondelete="SET NULL"), nullable=True
    )
    to_edge_line_token:   Mapped[str | None] = mapped_column(
        ForeignKey("map_lines.token", ondelete="SET NULL"), nullable=True
    )
    road_segment_token:   Mapped[str]      = mapped_column(
        ForeignKey("road_segments.token", ondelete="CASCADE"), nullable=False
    )
    # Polygon geometry
    geom: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    # Relationships
    polygon:      Mapped["MapPolygon"]  = relationship()
    road_segment: Mapped["RoadSegment"] = relationship(back_populates="road_blocks")
    stop_lines:    Mapped[list["StopLine"]]    = relationship(
        back_populates="road_block",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    carpark_areas: Mapped[list["CarparkArea"]] = relationship(
        back_populates="road_block",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    traffic_lights: Mapped[list["TrafficLight"]] = relationship(
        back_populates="from_road_block",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

class Lane(Base):
    """Each lane is a drivable path segment that may have lane dividers, arclines, and connectivity information."""
    __tablename__ = "lanes"
    # Columns
    token:                Mapped[str]      = mapped_column(String, primary_key=True)
    location:             Mapped[str]      = mapped_column(String, nullable=False)
    polygon_token:        Mapped[str]      = mapped_column(
        ForeignKey("map_polygons.token", ondelete="RESTRICT"), nullable=False
    )
    lane_type:            Mapped[str]      = mapped_column(String, nullable=False)  # 'CAR'
    from_edge_line_token: Mapped[str | None] = mapped_column(
        ForeignKey("map_lines.token", ondelete="SET NULL"), nullable=True
    )
    to_edge_line_token:   Mapped[str | None] = mapped_column(
        ForeignKey("map_lines.token", ondelete="SET NULL"), nullable=True
    )
    # Lane divider segments (each segment is a reference to a LaneDivider node, stored as JSON list of tokens)
    left_lane_divider_segments:  Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    right_lane_divider_segments: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    # arcline information (Dubins path, stored as JSON for multiple segments)
    arcline_path: Mapped[list | None] = mapped_column(JSON, nullable=False, default=list)  # List of {"center": [y, x], "radius": r, "start_angle": a1, "end_angle": a2}
    # Connection information (incoming/outgoing lane/lane_connector tokens. Originally stored in Connectivity entity in NuScenes JSON)
    incoming_tokens: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    outgoing_tokens: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    # Polygon geometry
    geom: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    # Relationships
    polygon:    Mapped["MapPolygon"]     = relationship()

class LaneConnector(Base):
    """Lane connector path within an intersection"""
    __tablename__ = "lane_connectors"
    # Columns
    token:         Mapped[str]      = mapped_column(String, primary_key=True)
    location:      Mapped[str]      = mapped_column(String, nullable=False)
    polygon_token: Mapped[str | None] = mapped_column(
        ForeignKey("map_polygons.token", ondelete="SET NULL"), nullable=True
    )
    # arcline information (Dubins path, stored as JSON for multiple segments)
    arcline_path:    Mapped[list | None] = mapped_column(JSON, nullable=False, default=list)
    # Connection information (incoming/outgoing lane/lane_connector tokens. Originally stored in Connectivity entity in NuScenes JSON)
    incoming_tokens: Mapped[list]        = mapped_column(JSON, nullable=True, default=list)
    outgoing_tokens: Mapped[list]        = mapped_column(JSON, nullable=True, default=list)
    # Polygon geometry
    geom: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )

class CarparkArea(Base):
    """Parking area polygon, which may consist of multiple disjoint areas and holes. Each CarparkArea belongs to a RoadBlock."""
    __tablename__ = "carpark_areas"
    # Columns
    token:            Mapped[str]   = mapped_column(String, primary_key=True)
    location:         Mapped[str]   = mapped_column(String, nullable=False)
    polygon_token:    Mapped[str]   = mapped_column(
        ForeignKey("map_polygons.token", ondelete="RESTRICT"), nullable=False
    )
    orientation:      Mapped[float] = mapped_column(Float, nullable=False)
    road_block_token: Mapped[str | None] = mapped_column(
        ForeignKey("road_blocks.token", ondelete="CASCADE"), nullable=False
    )
    # Polygon geometry
    geom: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    # Relationships
    polygon:    Mapped["MapPolygon"]     = relationship()
    road_block: Mapped["RoadBlock | None"] = relationship(back_populates="carpark_areas")

class StopLine(Base):
    """Stop line polygon, which may consist of multiple disjoint areas and holes. Each StopLine belongs to a RoadBlock and may have associated PedCrossings and TrafficLights."""
    __tablename__ = "stop_lines"
    # Columns
    token:            Mapped[str] = mapped_column(String, primary_key=True)
    location:         Mapped[str] = mapped_column(String, nullable=False)
    polygon_token:    Mapped[str] = mapped_column(
        ForeignKey("map_polygons.token", ondelete="RESTRICT"), nullable=False
    )
    stop_line_type:   Mapped[str] = mapped_column(String, nullable=False)  # 'TRAFFIC_LIGHT' etc.
    road_block_token: Mapped[str | None] = mapped_column(
        ForeignKey("road_blocks.token", ondelete="CASCADE"), nullable=True
    )
    # Many-to-many references are stored as JSON (no need to create intermediate tables for queries)
    ped_crossing_tokens:  Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    traffic_light_tokens: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Polygon geometry
    geom: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    # Relationships
    polygon:    Mapped["MapPolygon"]     = relationship()
    road_block: Mapped["RoadBlock | None"] = relationship(back_populates="stop_lines")

class PedCrossing(Base):
    """Pedestrian crossing polygon, which may consist of multiple disjoint areas and holes. Each PedCrossing belongs to a RoadSegment."""
    __tablename__ = "ped_crossings"
    # Columns
    token:              Mapped[str]      = mapped_column(String, primary_key=True)
    location:           Mapped[str]      = mapped_column(String, nullable=False)
    polygon_token:      Mapped[str]      = mapped_column(
        ForeignKey("map_polygons.token", ondelete="RESTRICT"), nullable=False
    )
    road_segment_token: Mapped[str | None] = mapped_column(
        ForeignKey("road_segments.token", ondelete="CASCADE"), nullable=False
    )
    # Polygon geometry
    geom: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    # Relationships
    polygon:      Mapped["MapPolygon"]       = relationship()
    road_segment: Mapped["RoadSegment | None"] = relationship(back_populates="ped_crossings")

class Walkway(Base):
    """Sidewalk polygon, which may consist of multiple disjoint areas and holes. Each Walkway belongs to a RoadSegment."""
    __tablename__ = "walkways"
    # Columns
    token:         Mapped[str] = mapped_column(String, primary_key=True)
    location:      Mapped[str] = mapped_column(String, nullable=False)
    polygon_token: Mapped[str] = mapped_column(
        ForeignKey("map_polygons.token", ondelete="RESTRICT"), nullable=False
    )
    # Polygon geometry
    geom: Mapped[object] = mapped_column(
        Geometry("POLYGON", srid=4326), nullable=True
    )
    # Relationships
    polygon: Mapped["MapPolygon"] = relationship()

# ── Line Entities ───────────────────────────────

class RoadDivider(Base):
    """Road divider line (white lines only, excluding central reservations)"""
    __tablename__ = "road_dividers"
    # Columns
    token:              Mapped[str]      = mapped_column(String, primary_key=True)
    location:           Mapped[str]      = mapped_column(String, nullable=False)
    line_token:         Mapped[str]      = mapped_column(
        ForeignKey("map_lines.token", ondelete="RESTRICT"), nullable=False
    )
    road_segment_token: Mapped[str | None] = mapped_column(
        ForeignKey("road_segments.token", ondelete="CASCADE"), nullable=False
    )
    # Line geometry
    geom: Mapped[object] = mapped_column(
        Geometry("LINESTRING", srid=4326), nullable=True
    )
    # Relationships
    line:         Mapped["MapLine"]          = relationship()
    road_segment: Mapped["RoadSegment | None"] = relationship(back_populates="road_dividers")

class LaneDivider(Base):
    """Lane divider line (white lines only, excluding central reservations)"""
    __tablename__ = "lane_dividers"
    # Columns
    token:      Mapped[str] = mapped_column(String, primary_key=True)
    location:   Mapped[str] = mapped_column(String, nullable=False)
    line_token: Mapped[str] = mapped_column(
        ForeignKey("map_lines.token", ondelete="RESTRICT"), nullable=False
    )
    # Complex structure including the type of white line for each segment (e.g. DOUBLE_DASHED_WHITE)
    lane_divider_segments: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Line geometry
    geom: Mapped[object] = mapped_column(
        Geometry("LINESTRING", srid=4326), nullable=True
    )
    # Relationships
    line: Mapped["MapLine"] = relationship()

# ── Point Entities ───────────────────────────────

class TrafficLight(Base):
    """Traffic light with position, type, and associated items (e.g. traffic_light_type: 'VERTICAL', items: [{'color': 'RED', 'shape': 'CIRCLE', 'rel_pos': [x, y], 'to_road_block_tokens': [...]}, ...])"""
    __tablename__ = "traffic_lights"
    # Columns
    token:                 Mapped[str]      = mapped_column(String, primary_key=True)
    location:              Mapped[str]      = mapped_column(String, nullable=False)
    line_token:            Mapped[str]      = mapped_column(
        ForeignKey("map_lines.token", ondelete="RESTRICT"), nullable=False
    )
    traffic_light_type:    Mapped[str]      = mapped_column(String, nullable=False)  # 'VERTICAL', 'HORIZONTAL'
    from_road_block_token: Mapped[str | None] = mapped_column(
        ForeignKey("road_blocks.token", ondelete="CASCADE"), nullable=False
    )
    # Items details. e.g. [{"color": "RED", "shape": "CIRCLE", "rel_pos": {"tx": 0.0, "ty": 0.0, "tz": 0.632, "rx": 0.0, "ry": 0.0, "rz": 0.0}, "to_road_block_tokens": []}]
    items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Pose (tx, ty, tz, rx, ry, rz). e.g. {"tx": 369.2207339994191, "ty": 1129.3945093980494, "tz": 2.4, "rx": 0.0, "ry": 0.0, "rz": -0.6004778487509836}
    pose:  Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # Point for spatial queries generated from pose
    geom: Mapped[object] = mapped_column(
        Geometry("POINT", srid=4326), nullable=True
    )
    # Relationships
    line:            Mapped["MapLine"]           = relationship()
    from_road_block: Mapped["RoadBlock | None"]  = relationship(back_populates="traffic_lights")
