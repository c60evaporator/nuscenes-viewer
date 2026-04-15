from app.models.annotation import Instance, SampleAnnotation
from app.schemas.annotation import (
    AnnotationResponse,
    AttributeResponse,
    InstanceResponse,
    VisibilityResponse,
)


class AnnotationConverter:
    @staticmethod
    def to_instance_response(inst: Instance) -> InstanceResponse:
        """Instance ORM モデル → InstanceResponse スキーマに変換する。
        inst.category リレーションシップが selectinload 済みであることを前提とする。
        """
        return InstanceResponse(
            token=inst.token,
            category_token=inst.category_token,
            category_name=inst.category.name,
            nbr_annotations=inst.nbr_annotations,
            first_annotation_token=inst.first_annotation_token,
            last_annotation_token=inst.last_annotation_token,
        )

    @staticmethod
    def to_response(ann: SampleAnnotation) -> AnnotationResponse:
        return AnnotationResponse(
            token=ann.token,
            sample_token=ann.sample_token,
            instance_token=ann.instance_token,
            translation=ann.translation,
            rotation=ann.rotation,
            size=ann.size,
            prev=ann.prev,
            next=ann.next,
            num_lidar_pts=ann.num_lidar_pts,
            num_radar_pts=ann.num_radar_pts,
            visibility_token=ann.visibility_token,
            # instance 経由で category_token を展開
            category_token=ann.instance.category_token,
            attributes=[AttributeResponse.model_validate(a) for a in ann.attributes],
            visibility=(
                VisibilityResponse.model_validate(ann.visibility)
                if ann.visibility
                else None
            ),
        )
