"""Integration tests for logs, categories, ego-poses, and sample-instances endpoints.

テストデータ:
  - log_and_scene fixture: Log / Scene / Sample×3 / EgoPose×3 / SampleData×3 を
    ロールバック保証付きで投入（location="boston-seaport", tokens は lgcat- prefix）
  - sample_annotation fixture: 既存 conftest.py の annotation fixture を使用
  - NuScenes 本体データ（categories）は DB に常に存在することを前提とする

エンドポイント対象:
  GET /api/v1/logs
  GET /api/v1/categories
  GET /api/v1/scenes/{token}/ego-poses
  GET /api/v1/samples/{token}/instances
"""
import pytest
from httpx import AsyncClient

from app.models.scene import Scene
from app.models.annotation import SampleAnnotation

# ── fixture 定数（conftest.py の _LGCAT_* と一致させる） ──────────────────────
_LGCAT_SCENE_TOKEN   = "scene-lgcat-001"
_LGCAT_SAMPLE_TOKENS = ["sample-lgcat-001", "sample-lgcat-002", "sample-lgcat-003"]
_LGCAT_TIMESTAMPS    = [1_100_000, 2_200_000, 3_300_000]

# sample_annotation fixture のサンプルトークン（conftest.py と一致）
_ANN_SAMPLE_TOKEN = "sample-anntest-001"


# ── GET /api/v1/logs ──────────────────────────────────────────────────────────

async def test_list_logs_returns_200(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get("/api/v1/logs")
    assert resp.status_code == 200


async def test_list_logs_has_pagination_shape(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get("/api/v1/logs")
    body = resp.json()
    assert set(body.keys()) >= {"total", "limit", "offset", "items"}


async def test_list_logs_items_have_required_fields(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get("/api/v1/logs?limit=500")
    items = resp.json()["items"]
    assert len(items) > 0
    for item in items:
        assert "token" in item
        assert "logfile" in item
        assert "vehicle" in item
        assert "date_captured" in item
        assert "location" in item


async def test_list_logs_limit_is_respected(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get("/api/v1/logs?limit=1")
    body = resp.json()
    assert len(body["items"]) <= 1
    assert body["limit"] == 1


async def test_list_logs_offset_shifts_results(client: AsyncClient, log_and_scene: Scene):
    resp0 = await client.get("/api/v1/logs?limit=1&offset=0")
    resp1 = await client.get("/api/v1/logs?limit=1&offset=1")
    items0 = resp0.json()["items"]
    items1 = resp1.json()["items"]
    # total が 2 件以上ある場合のみ確認
    total = resp0.json()["total"]
    if total >= 2:
        assert items0[0]["token"] != items1[0]["token"]


async def test_list_logs_limit_negative_returns_422(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get("/api/v1/logs?limit=-1")
    assert resp.status_code == 422


# ── GET /api/v1/categories ────────────────────────────────────────────────────

async def test_list_categories_returns_200(client: AsyncClient):
    resp = await client.get("/api/v1/categories")
    assert resp.status_code == 200


async def test_list_categories_is_list(client: AsyncClient):
    """ページネーションなしのリスト形式であること。"""
    resp = await client.get("/api/v1/categories")
    body = resp.json()
    assert isinstance(body, list), f"Expected list, got: {type(body)}"


async def test_list_categories_has_required_fields(client: AsyncClient):
    resp = await client.get("/api/v1/categories")
    items = resp.json()
    assert len(items) > 0
    for item in items:
        assert "token" in item
        assert "name" in item


async def test_list_categories_not_empty(client: AsyncClient):
    """NuScenes データが存在すればカテゴリは必ず 1 件以上あること。"""
    resp = await client.get("/api/v1/categories")
    assert len(resp.json()) >= 1


async def test_list_categories_name_not_empty(client: AsyncClient):
    resp = await client.get("/api/v1/categories")
    for item in resp.json():
        assert item["name"] != "", f"category name is empty: {item}"


# ── GET /api/v1/scenes/{token}/ego-poses ─────────────────────────────────────

async def test_get_ego_poses_returns_200(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get(f"/api/v1/scenes/{_LGCAT_SCENE_TOKEN}/ego-poses")
    assert resp.status_code == 200


async def test_get_ego_poses_is_list(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get(f"/api/v1/scenes/{_LGCAT_SCENE_TOKEN}/ego-poses")
    assert isinstance(resp.json(), list)


async def test_get_ego_poses_not_empty(client: AsyncClient, log_and_scene: Scene):
    """fixture で 3 件作成しているので 3 件返ること。"""
    resp = await client.get(f"/api/v1/scenes/{_LGCAT_SCENE_TOKEN}/ego-poses")
    assert len(resp.json()) == 3


async def test_get_ego_poses_has_required_fields(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get(f"/api/v1/scenes/{_LGCAT_SCENE_TOKEN}/ego-poses")
    for item in resp.json():
        assert "sample_token" in item
        assert "timestamp" in item
        assert "translation" in item
        assert "rotation" in item


async def test_get_ego_poses_translation_is_3_elements(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get(f"/api/v1/scenes/{_LGCAT_SCENE_TOKEN}/ego-poses")
    for item in resp.json():
        assert len(item["translation"]) == 3, \
            f"translation should have 3 elements: {item['translation']}"


async def test_get_ego_poses_rotation_is_4_elements(client: AsyncClient, log_and_scene: Scene):
    resp = await client.get(f"/api/v1/scenes/{_LGCAT_SCENE_TOKEN}/ego-poses")
    for item in resp.json():
        assert len(item["rotation"]) == 4, \
            f"rotation should have 4 elements: {item['rotation']}"


async def test_get_ego_poses_ordered_by_timestamp(client: AsyncClient, log_and_scene: Scene):
    """timestamp が単調増加であること。"""
    resp = await client.get(f"/api/v1/scenes/{_LGCAT_SCENE_TOKEN}/ego-poses")
    timestamps = [item["timestamp"] for item in resp.json()]
    assert timestamps == sorted(timestamps), \
        f"timestamps not in ascending order: {timestamps}"


async def test_get_ego_poses_not_found_returns_404(client: AsyncClient):
    resp = await client.get("/api/v1/scenes/scene-does-not-exist-000/ego-poses")
    assert resp.status_code == 404


# ── GET /api/v1/samples/{token}/instances ────────────────────────────────────

async def test_get_sample_instances_returns_200(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    resp = await client.get(f"/api/v1/samples/{_ANN_SAMPLE_TOKEN}/instances")
    assert resp.status_code == 200


async def test_get_sample_instances_is_list(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    resp = await client.get(f"/api/v1/samples/{_ANN_SAMPLE_TOKEN}/instances")
    assert isinstance(resp.json(), list)


async def test_get_sample_instances_has_required_fields(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    resp = await client.get(f"/api/v1/samples/{_ANN_SAMPLE_TOKEN}/instances")
    items = resp.json()
    assert len(items) > 0
    for item in items:
        assert "instance_token" in item
        assert "category_name" in item
        assert "nbr_annotations" in item


async def test_get_sample_instances_category_name_not_empty(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    resp = await client.get(f"/api/v1/samples/{_ANN_SAMPLE_TOKEN}/instances")
    for item in resp.json():
        assert item["category_name"] != "", f"category_name is empty: {item}"


async def test_get_sample_instances_nbr_annotations_positive(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    resp = await client.get(f"/api/v1/samples/{_ANN_SAMPLE_TOKEN}/instances")
    for item in resp.json():
        assert item["nbr_annotations"] > 0, \
            f"nbr_annotations should be > 0: {item}"


async def test_get_sample_instances_empty_sample_returns_200(
    client: AsyncClient, log_and_scene: Scene
):
    """アノテーションなしの Sample を指定したとき空リスト + 200 が返ること。"""
    resp = await client.get(f"/api/v1/samples/{_LGCAT_SAMPLE_TOKENS[0]}/instances")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_sample_instances_not_found_returns_404(client: AsyncClient):
    resp = await client.get("/api/v1/samples/sample-does-not-exist-000/instances")
    assert resp.status_code == 404
