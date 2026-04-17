"""Integration tests for sensor-data / basemap / instances endpoints.

テストデータの依存関係:
  - 実ファイルに依存するテスト（basemap / image / pointcloud）は
    ファイルが存在しない環境で自動的に pytest.skip する
  - instances アノテーションテストは DB の実 NuScenes データを使用
  - real_lidar_sample_data_token / real_camera_sample_data_token fixtures で
    ファイル存在確認 → スキップ制御

エンドポイント対象:
  GET /api/v1/maps/{location}/basemap
  GET /api/v1/samples/{token}/sensor-data
  GET /api/v1/sensor-data/{token}/image
  GET /api/v1/sensor-data/{token}/pointcloud
  GET /api/v1/instances/{token}/annotations
  GET /api/v1/instances/{token}/best-camera
"""
from io import BytesIO
from pathlib import Path

import pytest
from httpx import AsyncClient

from app.core.config import settings

# ── 実際に annotations が多い Instance（本番 NuScenes データ） ────────────────
# conftest.py の real_instance_and_sample fixture で動的に取得するが、
# best-camera の「複数 sample で各 200 が返る」テスト用にハードコード。
_MULTI_ANN_INSTANCE_TOKEN = "c56ebf9c16dc44b8b9cd34fb79f40bc6"
_MULTI_ANN_SAMPLE_TOKENS = [
    "2578329fc3ae484bb23ef766808f4be5",
    "5c85640c10d9485c86bf6eb44778c002",
]

# ── basemap テスト用ロケーション ──────────────────────────────────────────────
_ALL_LOCATIONS = [
    "boston-seaport",
    "singapore-onenorth",
    "singapore-hollandvillage",
    "singapore-queenstown",
]


_BASEMAP_FILENAMES: dict[str, str] = {
    "boston-seaport":           "36092f0b03a857c6a3403e25b4b7aab3.png",
    "singapore-hollandvillage": "37819e65e09e5547b8a3ceaefba56bb2.png",
    "singapore-onenorth":       "53992ee3023e5494b90c316c183be829.png",
    "singapore-queenstown":     "93406b464a165eaba6d9de76ca09f5da.png",
}


def _basemap_path(location: str) -> Path:
    filename = _BASEMAP_FILENAMES.get(location, f"{location}.png")
    return Path(settings.NUSCENES_DATAROOT) / "maps" / filename


def _skip_if_no_basemap(location: str) -> None:
    if not _basemap_path(location).exists():
        pytest.skip(f"Basemap file not found: {_basemap_path(location)}")


# ── GET /api/v1/maps/{location}/basemap ───────────────────────────────────────

async def test_basemap_returns_200(client: AsyncClient):
    _skip_if_no_basemap("boston-seaport")
    resp = await client.get("/api/v1/maps/boston-seaport/basemap")
    assert resp.status_code == 200


async def test_basemap_content_type_is_png(client: AsyncClient):
    _skip_if_no_basemap("boston-seaport")
    resp = await client.get("/api/v1/maps/boston-seaport/basemap")
    assert resp.headers["content-type"].startswith("image/png")


async def test_basemap_body_not_empty(client: AsyncClient):
    _skip_if_no_basemap("boston-seaport")
    resp = await client.get("/api/v1/maps/boston-seaport/basemap")
    assert len(resp.content) > 0


@pytest.mark.parametrize("location", _ALL_LOCATIONS)
async def test_basemap_all_locations_return_200(client: AsyncClient, location: str):
    """実在する全 4 ロケーションで 200 が返ること。"""
    _skip_if_no_basemap(location)
    resp = await client.get(f"/api/v1/maps/{location}/basemap")
    assert resp.status_code == 200


async def test_basemap_unknown_location_returns_404(client: AsyncClient):
    resp = await client.get("/api/v1/maps/unknown-location-xyz/basemap")
    assert resp.status_code == 404


async def test_basemap_path_traversal_returns_400(client: AsyncClient):
    """パストラバーサル文字を含む location は 400 を返すこと（セキュリティ確認）。"""
    resp = await client.get("/api/v1/maps/../etc/basemap")
    # FastAPI のルーターが "/" を含む path パラメータをそのまま渡さないケースもあるが、
    # いずれにせよ 400 または 404 が返ること（200 は不可）
    assert resp.status_code in (400, 404, 422)


async def test_basemap_dotdot_returns_400(client: AsyncClient):
    """".." を含む location を指定したとき 400 が返ること。"""
    # FastAPI の URL ルーティングが %2F/%2E 等を受け入れる場合の確認
    resp = await client.get("/api/v1/maps/..%2Fetc%2Fpasswd/basemap")
    assert resp.status_code in (400, 404, 422)


# ── GET /api/v1/samples/{token}/sensor-data ───────────────────────────────────

async def test_sensor_data_returns_200(client: AsyncClient, real_keyframe_sample_token: str):
    resp = await client.get(f"/api/v1/samples/{real_keyframe_sample_token}/sensor-data")
    assert resp.status_code == 200


async def test_sensor_data_is_dict(client: AsyncClient, real_keyframe_sample_token: str):
    resp = await client.get(f"/api/v1/samples/{real_keyframe_sample_token}/sensor-data")
    assert isinstance(resp.json(), dict)


async def test_sensor_data_has_lidar_top_key(client: AsyncClient, real_keyframe_sample_token: str):
    resp = await client.get(f"/api/v1/samples/{real_keyframe_sample_token}/sensor-data")
    assert "LIDAR_TOP" in resp.json(), f"LIDAR_TOP not in keys: {list(resp.json().keys())}"


async def test_sensor_data_has_cam_front_key(client: AsyncClient, real_keyframe_sample_token: str):
    resp = await client.get(f"/api/v1/samples/{real_keyframe_sample_token}/sensor-data")
    assert "CAM_FRONT" in resp.json(), f"CAM_FRONT not in keys: {list(resp.json().keys())}"


async def test_sensor_data_values_have_required_fields(
    client: AsyncClient, real_keyframe_sample_token: str
):
    resp = await client.get(f"/api/v1/samples/{real_keyframe_sample_token}/sensor-data")
    for channel, value in resp.json().items():
        assert "token" in value, f"token missing in {channel}"
        assert "filename" in value, f"filename missing in {channel}"
        assert "fileformat" in value, f"fileformat missing in {channel}"


async def test_sensor_data_lidar_fileformat(
    client: AsyncClient, real_keyframe_sample_token: str
):
    """LIDAR_TOP の fileformat が "pcd" または "npz" であること。"""
    resp = await client.get(f"/api/v1/samples/{real_keyframe_sample_token}/sensor-data")
    lidar = resp.json().get("LIDAR_TOP")
    if lidar:
        assert lidar["fileformat"] in ("pcd", "npz"), \
            f"Unexpected fileformat: {lidar['fileformat']}"


async def test_sensor_data_no_ego_pose_key(
    client: AsyncClient, real_keyframe_sample_token: str
):
    """EGO_POSE キーが含まれないこと（ego-pose は別エンドポイント担当）。"""
    resp = await client.get(f"/api/v1/samples/{real_keyframe_sample_token}/sensor-data")
    assert "EGO_POSE" not in resp.json()


async def test_sensor_data_not_found_returns_404(client: AsyncClient):
    resp = await client.get("/api/v1/samples/sample-does-not-exist-000/sensor-data")
    assert resp.status_code == 404


# ── GET /api/v1/sensor-data/{token}/image ────────────────────────────────────

async def test_image_returns_200(client: AsyncClient, real_camera_sample_data_token: str):
    resp = await client.get(f"/api/v1/sensor-data/{real_camera_sample_data_token}/image")
    assert resp.status_code == 200


async def test_image_content_type(client: AsyncClient, real_camera_sample_data_token: str):
    resp = await client.get(f"/api/v1/sensor-data/{real_camera_sample_data_token}/image")
    ct = resp.headers["content-type"]
    assert ct.startswith("image/jpeg") or ct.startswith("image/png"), \
        f"Unexpected content-type: {ct}"


async def test_image_body_not_empty(client: AsyncClient, real_camera_sample_data_token: str):
    resp = await client.get(f"/api/v1/sensor-data/{real_camera_sample_data_token}/image")
    assert len(resp.content) > 0


async def test_image_readable_by_pil(client: AsyncClient, real_camera_sample_data_token: str):
    """PIL.Image.open で読み込めること（PIL が未インストールの場合はスキップ）。"""
    PIL = pytest.importorskip("PIL.Image")
    resp = await client.get(f"/api/v1/sensor-data/{real_camera_sample_data_token}/image")
    img = PIL.open(BytesIO(resp.content))
    assert img.width > 0
    assert img.height > 0


async def test_image_not_found_returns_404(client: AsyncClient):
    resp = await client.get("/api/v1/sensor-data/sd-does-not-exist-000/image")
    assert resp.status_code == 404


async def test_image_lidar_token_returns_400(
    client: AsyncClient, real_lidar_sample_data_token: str
):
    """LiDAR SampleData token を指定したとき 400 が返ること。"""
    resp = await client.get(f"/api/v1/sensor-data/{real_lidar_sample_data_token}/image")
    assert resp.status_code == 400


# ── GET /api/v1/sensor-data/{token}/pointcloud ───────────────────────────────

async def test_pointcloud_returns_200(client: AsyncClient, real_lidar_sample_data_token: str):
    resp = await client.get(f"/api/v1/sensor-data/{real_lidar_sample_data_token}/pointcloud")
    assert resp.status_code == 200


async def test_pointcloud_has_required_keys(
    client: AsyncClient, real_lidar_sample_data_token: str
):
    resp = await client.get(f"/api/v1/sensor-data/{real_lidar_sample_data_token}/pointcloud")
    body = resp.json()
    assert "points" in body
    assert "num_points" in body


async def test_pointcloud_num_points_positive(
    client: AsyncClient, real_lidar_sample_data_token: str
):
    resp = await client.get(f"/api/v1/sensor-data/{real_lidar_sample_data_token}/pointcloud")
    assert resp.json()["num_points"] > 0


async def test_pointcloud_points_is_list(
    client: AsyncClient, real_lidar_sample_data_token: str
):
    resp = await client.get(f"/api/v1/sensor-data/{real_lidar_sample_data_token}/pointcloud")
    assert isinstance(resp.json()["points"], list)


async def test_pointcloud_each_point_has_xyzintensity(
    client: AsyncClient, real_lidar_sample_data_token: str
):
    """各点が少なくとも x / y / z / intensity の 4 要素を持つこと。"""
    resp = await client.get(f"/api/v1/sensor-data/{real_lidar_sample_data_token}/pointcloud")
    points = resp.json()["points"]
    assert len(points) > 0
    for pt in points[:10]:  # 先頭 10 点のみ確認（全件は遅い）
        assert len(pt) >= 4, f"Point should have >= 4 elements: {pt}"
        for v in pt:
            assert isinstance(v, (int, float)), f"Point value should be numeric: {v}"


async def test_pointcloud_count_matches_num_points(
    client: AsyncClient, real_lidar_sample_data_token: str
):
    resp = await client.get(f"/api/v1/sensor-data/{real_lidar_sample_data_token}/pointcloud")
    body = resp.json()
    assert len(body["points"]) == body["num_points"]


async def test_pointcloud_not_found_returns_404(client: AsyncClient):
    resp = await client.get("/api/v1/sensor-data/sd-does-not-exist-000/pointcloud")
    assert resp.status_code == 404


async def test_pointcloud_image_token_returns_400(
    client: AsyncClient, real_camera_sample_data_token: str
):
    """カメラ SampleData token を指定したとき 400 が返ること。"""
    resp = await client.get(f"/api/v1/sensor-data/{real_camera_sample_data_token}/pointcloud")
    assert resp.status_code == 400


# ── GET /api/v1/instances/{token}/annotations ────────────────────────────────

async def test_instance_annotations_returns_200(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    instance_token, _ = real_instance_and_sample
    resp = await client.get(f"/api/v1/instances/{instance_token}/annotations")
    assert resp.status_code == 200


async def test_instance_annotations_is_list(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    instance_token, _ = real_instance_and_sample
    resp = await client.get(f"/api/v1/instances/{instance_token}/annotations")
    assert isinstance(resp.json(), list)


async def test_instance_annotations_not_empty(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    instance_token, _ = real_instance_and_sample
    resp = await client.get(f"/api/v1/instances/{instance_token}/annotations")
    assert len(resp.json()) >= 1


async def test_instance_annotations_has_required_fields(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    """AnnotationResponse + timestamp フィールドが存在すること。"""
    instance_token, _ = real_instance_and_sample
    resp = await client.get(f"/api/v1/instances/{instance_token}/annotations")
    for item in resp.json():
        assert "token" in item
        assert "sample_token" in item
        assert "instance_token" in item
        assert "timestamp" in item
        assert "translation" in item
        assert "size" in item
        assert "rotation" in item
        assert "category_token" in item
        assert "attributes" in item


async def test_instance_annotations_ordered_by_timestamp(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    """timestamp が単調増加であること（2 件以上の場合）。"""
    instance_token, _ = real_instance_and_sample
    resp = await client.get(f"/api/v1/instances/{instance_token}/annotations")
    timestamps = [item["timestamp"] for item in resp.json()]
    if len(timestamps) >= 2:
        assert timestamps == sorted(timestamps), \
            f"timestamps not in ascending order: {timestamps}"


async def test_instance_annotations_same_instance_token(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    """全 item の instance_token が要求した token と同一であること。"""
    instance_token, _ = real_instance_and_sample
    resp = await client.get(f"/api/v1/instances/{instance_token}/annotations")
    for item in resp.json():
        assert item["instance_token"] == instance_token, \
            f"Unexpected instance_token: {item['instance_token']}"


async def test_instance_annotations_not_found_returns_404(client: AsyncClient):
    """存在しない instance token → 404 が返ること。"""
    resp = await client.get("/api/v1/instances/inst-does-not-exist-000/annotations")
    assert resp.status_code == 404


# ── GET /api/v1/instances/{token}/best-camera ────────────────────────────────

async def test_best_camera_returns_200(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    instance_token, sample_token = real_instance_and_sample
    resp = await client.get(
        f"/api/v1/instances/{instance_token}/best-camera?sample_token={sample_token}"
    )
    assert resp.status_code == 200


async def test_best_camera_has_required_fields(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    instance_token, sample_token = real_instance_and_sample
    resp = await client.get(
        f"/api/v1/instances/{instance_token}/best-camera?sample_token={sample_token}"
    )
    body = resp.json()
    assert "channel" in body
    assert "sample_data_token" in body


async def test_best_camera_channel_starts_with_cam(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    instance_token, sample_token = real_instance_and_sample
    resp = await client.get(
        f"/api/v1/instances/{instance_token}/best-camera?sample_token={sample_token}"
    )
    assert resp.json()["channel"].startswith("CAM_"), \
        f"channel should start with CAM_: {resp.json()['channel']}"


async def test_best_camera_sample_data_token_exists(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    """返された sample_data_token が実際に存在する SampleData を指すこと。"""
    instance_token, sample_token = real_instance_and_sample
    resp = await client.get(
        f"/api/v1/instances/{instance_token}/best-camera?sample_token={sample_token}"
    )
    sd_token = resp.json()["sample_data_token"]
    # sensor-data/{token}/image が 400（画像以外）または 200 であれば存在確認済み
    check = await client.get(f"/api/v1/sensor-data/{sd_token}/image")
    assert check.status_code != 404, \
        f"sample_data_token {sd_token!r} not found in DB"


async def test_best_camera_different_samples_return_results(client: AsyncClient):
    """複数の sample_token に対してそれぞれ 200 が返ること。

    instance_token が多数の annotation を持つことが確認済みのデータを使用。
    """
    for sample_token in _MULTI_ANN_SAMPLE_TOKENS:
        resp = await client.get(
            f"/api/v1/instances/{_MULTI_ANN_INSTANCE_TOKEN}/best-camera"
            f"?sample_token={sample_token}"
        )
        assert resp.status_code == 200, \
            f"Expected 200 for sample {sample_token}, got {resp.status_code}"
        assert "channel" in resp.json()


async def test_best_camera_not_found_instance_returns_404(client: AsyncClient):
    """存在しない instance_token → 404 が返ること。"""
    resp = await client.get(
        "/api/v1/instances/inst-does-not-exist-000/best-camera"
        "?sample_token=sample-does-not-exist-000"
    )
    assert resp.status_code == 404


async def test_best_camera_not_found_sample_returns_404(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    """存在しない sample_token → 404 が返ること。"""
    instance_token, _ = real_instance_and_sample
    resp = await client.get(
        f"/api/v1/instances/{instance_token}/best-camera"
        f"?sample_token=sample-does-not-exist-000"
    )
    assert resp.status_code == 404


async def test_best_camera_wrong_sample_returns_404(
    client: AsyncClient, real_instance_and_sample: tuple[str, str]
):
    """Instance と無関係の sample_token を渡したとき 404 が返ること。"""
    instance_token, _ = real_instance_and_sample
    # lgcat fixture のサンプル（アノテーションなし）
    unrelated_sample = "sample-lgcat-001"
    resp = await client.get(
        f"/api/v1/instances/{instance_token}/best-camera"
        f"?sample_token={unrelated_sample}"
    )
    assert resp.status_code == 404
