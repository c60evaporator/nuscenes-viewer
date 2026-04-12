from pydantic import BaseModel, ConfigDict


class SensorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    channel: str   # 'CAM_FRONT', 'LIDAR_TOP' etc.
    modality: str  # 'camera', 'lidar', 'radar'


class CalibratedSensorResponse(BaseModel):
    token: str
    sensor_token: str
    translation: list[float]                # [x, y, z]
    rotation: list[float]                   # [w, x, y, z]
    camera_intrinsic: list[list[float]] | None  # 3x3 matrix、カメラのみ
    # sensor リレーション経由で展開
    channel: str
    modality: str


class EgoPoseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    timestamp: int
    translation: list[float]  # [x, y, z]
    rotation: list[float]     # [w, x, y, z]


class SampleDataResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    sample_token: str
    calibrated_sensor_token: str
    ego_pose_token: str
    filename: str
    fileformat: str
    timestamp: int
    is_key_frame: bool
    width: int | None
    height: int | None
    prev: str | None
    next: str | None
