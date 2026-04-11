# Import all models here so Alembic can detect them for autogenerate.
from app.models.scene import Log, Scene, Sample
from app.models.annotation import (
    Category,
    Attribute,
    Instance,
    Visibility,
    SampleAnnotation,
    annotation_attribute,
)
from app.models.sensor import Sensor, CalibratedSensor, EgoPose, SampleData
from app.models.map import (
    MapMeta,
    MapPolygon,
    MapLine,
    DrivableArea,
    RoadSegment,
    RoadBlock,
    Lane,
    LaneConnector,
    CarparkArea,
    StopLine,
    PedCrossing,
    Walkway,
    RoadDivider,
    LaneDivider,
    TrafficLight,
)
