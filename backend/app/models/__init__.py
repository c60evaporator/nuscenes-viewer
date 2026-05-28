# Import all models here so Alembic can detect them for autogenerate.
from app.db.base import Base  # noqa: F401 — re-export for Alembic
from app.models.scene import Log as Log, Scene as Scene, Sample as Sample
from app.models.annotation import (
    Category as Category,
    Attribute as Attribute,
    Instance as Instance,
    Visibility as Visibility,
    SampleAnnotation as SampleAnnotation,
    annotation_attribute as annotation_attribute,
)
from app.models.sensor import (
    Sensor as Sensor,
    CalibratedSensor as CalibratedSensor,
    EgoPose as EgoPose,
    SampleData as SampleData
)
from app.models.map import (
    MapMeta as MapMeta,
    MapPolygon as MapPolygon,
    MapLine as MapLine,
    DrivableArea as DrivableArea,
    RoadSegment as RoadSegment,
    RoadBlock as RoadBlock,
    Lane as Lane,
    LaneConnector as LaneConnector,
    CarparkArea as CarparkArea,
    StopLine as StopLine,
    PedCrossing as PedCrossing,
    Walkway as Walkway,
    RoadDivider as RoadDivider,
    LaneDivider as LaneDivider,
    TrafficLight as TrafficLight,
)
from app.models.annotation_edit import AnnotationEdit as AnnotationEdit
