from app.models.sensor import CalibratedSensor, EgoPose, SampleData, Sensor
from app.schemas.sensor import (
    CalibratedSensorResponse,
    EgoPoseResponse,
    SampleDataResponse,
    SensorResponse,
)


class SensorConverter:
    @staticmethod
    def to_sensor_response(sensor: Sensor) -> SensorResponse:
        return SensorResponse.model_validate(sensor)

    @staticmethod
    def to_calibrated_sensor_response(cs: CalibratedSensor) -> CalibratedSensorResponse:
        # channel/modality は sensor リレーション経由で展開
        return CalibratedSensorResponse(
            token=cs.token,
            sensor_token=cs.sensor_token,
            translation=cs.translation,
            rotation=cs.rotation,
            camera_intrinsic=cs.camera_intrinsic,
            channel=cs.sensor.channel,
            modality=cs.sensor.modality,
        )

    @staticmethod
    def to_ego_pose_response(ego: EgoPose) -> EgoPoseResponse:
        return EgoPoseResponse.model_validate(ego)

    @staticmethod
    def to_sample_data_response(sd: SampleData) -> SampleDataResponse:
        return SampleDataResponse.model_validate(sd)
