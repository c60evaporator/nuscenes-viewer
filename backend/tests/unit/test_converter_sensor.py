"""Unit tests for SensorConverter.

DB 接続不要。ORM モデルを直接インスタンス化してコンバーターロジックのみを検証する。
CalibratedSensor は sensor リレーションにアクセスするため、
Sensor インスタンスを直接代入して疑似的にロード済み状態を再現する。
"""
import pytest

from app.converters.sensor import SensorConverter
from app.models.sensor import CalibratedSensor, EgoPose, SampleData, Sensor
from app.schemas.sensor import (
    CalibratedSensorResponse,
    EgoPoseResponse,
    SampleDataResponse,
)


# ── ファクトリ ─────────────────────────────────────────────────────────────────

def _make_sensor(
    token: str = "sensor-unit-001",
    channel: str = "CAM_FRONT",
    modality: str = "camera",
) -> Sensor:
    return Sensor(token=token, channel=channel, modality=modality)


def _make_calibrated_sensor(
    token: str = "cs-unit-001",
    sensor_token: str = "sensor-unit-001",
    translation: list[float] | None = None,
    rotation: list[float] | None = None,
    camera_intrinsic: list[list[float]] | None = None,
    sensor: Sensor | None = None,
) -> CalibratedSensor:
    cs = CalibratedSensor(
        token=token,
        sensor_token=sensor_token,
        translation=translation if translation is not None else [1.0, 2.0, 3.0],
        rotation=rotation if rotation is not None else [1.0, 0.0, 0.0, 0.0],
        camera_intrinsic=camera_intrinsic,
    )
    # リレーションを直接代入してセッションなしで使用可能にする
    cs.sensor = sensor if sensor is not None else _make_sensor(token=sensor_token)
    return cs


def _make_ego_pose(
    token: str = "ego-unit-001",
    timestamp: int = 1_000_000,
    translation: list[float] | None = None,
    rotation: list[float] | None = None,
) -> EgoPose:
    return EgoPose(
        token=token,
        timestamp=timestamp,
        translation=translation if translation is not None else [10.0, 20.0, 0.0],
        rotation=rotation if rotation is not None else [1.0, 0.0, 0.0, 0.0],
    )


def _make_sample_data(
    token: str = "sd-unit-001",
    sample_token: str = "sample-unit-001",
    calibrated_sensor_token: str = "cs-unit-001",
    ego_pose_token: str = "ego-unit-001",
    filename: str = "samples/CAM_FRONT/test.jpg",
    fileformat: str = "jpg",
    timestamp: int = 1_000_000,
    is_key_frame: bool = True,
    width: int | None = 1600,
    height: int | None = 900,
    prev: str | None = None,
    next_: str | None = None,
) -> SampleData:
    return SampleData(
        token=token,
        sample_token=sample_token,
        calibrated_sensor_token=calibrated_sensor_token,
        ego_pose_token=ego_pose_token,
        filename=filename,
        fileformat=fileformat,
        timestamp=timestamp,
        is_key_frame=is_key_frame,
        width=width,
        height=height,
        prev=prev,
        next=next_,
    )


# ── CalibratedSensorConverter のテスト ───────────────────────────────────────

def test_calibrated_sensor_translation():
    """translation [x, y, z] が CalibratedSensorResponse に正しくマップされること。"""
    coords = [3.5, -1.2, 0.8]
    cs = _make_calibrated_sensor(translation=coords)
    result = SensorConverter.to_calibrated_sensor_response(cs)
    assert isinstance(result, CalibratedSensorResponse)
    assert result.translation == coords


def test_calibrated_sensor_rotation():
    """rotation [w, x, y, z] が CalibratedSensorResponse に正しくマップされること。"""
    quat = [0.9999, 0.0, 0.0, 0.01]
    cs = _make_calibrated_sensor(rotation=quat)
    result = SensorConverter.to_calibrated_sensor_response(cs)
    assert result.rotation == quat


@pytest.mark.parametrize("intrinsic,expected", [
    (None, None),
    (
        [[1266.4, 0.0, 816.3], [0.0, 1266.4, 491.5], [0.0, 0.0, 1.0]],
        [[1266.4, 0.0, 816.3], [0.0, 1266.4, 491.5], [0.0, 0.0, 1.0]],
    ),
])
def test_calibrated_sensor_intrinsic_parametrize(intrinsic, expected):
    """camera_intrinsic が None（LiDAR）のとき None、3x3行列のときそのまま保持されること。"""
    cs = _make_calibrated_sensor(camera_intrinsic=intrinsic)
    result = SensorConverter.to_calibrated_sensor_response(cs)
    assert result.camera_intrinsic == expected


def test_calibrated_sensor_channel_from_sensor():
    """channel / modality は sensor リレーション経由で取得されること。"""
    sensor = _make_sensor(channel="LIDAR_TOP", modality="lidar")
    cs = _make_calibrated_sensor(sensor=sensor)
    result = SensorConverter.to_calibrated_sensor_response(cs)
    assert result.channel == "LIDAR_TOP"
    assert result.modality == "lidar"


# ── EgoPoseConverter のテスト ─────────────────────────────────────────────────

def test_ego_pose_all_fields_mapped():
    """EgoPose の全フィールドが EgoPoseResponse に正しくマップされること。"""
    ego = _make_ego_pose(
        token="ego-x",
        timestamp=5_000_000,
        translation=[100.0, 200.0, 0.5],
        rotation=[0.9998, 0.0, 0.0, 0.02],
    )
    result = SensorConverter.to_ego_pose_response(ego)
    assert isinstance(result, EgoPoseResponse)
    assert result.token == "ego-x"
    assert result.timestamp == 5_000_000
    assert result.translation == [100.0, 200.0, 0.5]
    assert result.rotation == [0.9998, 0.0, 0.0, 0.02]


def test_ego_pose_timestamp_preserved():
    """timestamp が変換されずそのまま保持されること。"""
    ts = 1_714_000_000_000_000
    ego = _make_ego_pose(timestamp=ts)
    result = SensorConverter.to_ego_pose_response(ego)
    assert result.timestamp == ts


# ── SampleDataConverter のテスト ──────────────────────────────────────────────

@pytest.mark.parametrize("is_key_frame", [True, False])
def test_sample_data_is_key_frame_parametrize(is_key_frame):
    """is_key_frame が True / False それぞれ正しく変換されること。"""
    sd = _make_sample_data(is_key_frame=is_key_frame)
    result = SensorConverter.to_sample_data_response(sd)
    assert isinstance(result, SampleDataResponse)
    assert result.is_key_frame == is_key_frame


@pytest.mark.parametrize("fileformat", ["jpg", "pcd", "bin", "npz"])
def test_sample_data_fileformat_parametrize(fileformat):
    """fileformat が jpg / pcd / bin / npz すべてのケースで正しく保持されること。"""
    sd = _make_sample_data(fileformat=fileformat)
    result = SensorConverter.to_sample_data_response(sd)
    assert result.fileformat == fileformat


def test_sample_data_width_height_none():
    """LiDAR 用（width=height=None）が正しく扱われること。"""
    sd = _make_sample_data(width=None, height=None)
    result = SensorConverter.to_sample_data_response(sd)
    assert result.width is None
    assert result.height is None


def test_sample_data_prev_next_none():
    """先頭かつ末尾フレーム（prev=None, next=None）が正しく扱われること。"""
    sd = _make_sample_data(prev=None, next_=None)
    result = SensorConverter.to_sample_data_response(sd)
    assert result.prev is None
    assert result.next is None
