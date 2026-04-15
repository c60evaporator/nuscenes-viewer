"""Integration tests for GET /api/v1/samples/{token} and GET /api/v1/instances endpoints.

テストデータの依存関係:
  - samples テストは log_and_scene fixture で作成したテスト専用データを使用
  - instances テストは DB の実 NuScenes データ（real_instance_data fixture）を使用
  - real_instance_data が取得できない環境では自動的に pytest.skip する

エンドポイント対象:
  GET /api/v1/samples/{token}
  GET /api/v1/instances
  GET /api/v1/instances/{token}
"""
import pytest
from httpx import AsyncClient

from tests.conftest import _LGCAT_SAMPLE_TOKENS


# ═══════════════════════════════════════════════════════════════════════════════
# GET /api/v1/samples/{token}
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetSample:
    async def test_get_sample_returns_200(
        self, client: AsyncClient, log_and_scene
    ):
        resp = await client.get(f"/api/v1/samples/{_LGCAT_SAMPLE_TOKENS[0]}")
        assert resp.status_code == 200

    async def test_get_sample_has_required_fields(
        self, client: AsyncClient, log_and_scene
    ):
        resp = await client.get(f"/api/v1/samples/{_LGCAT_SAMPLE_TOKENS[0]}")
        body = resp.json()
        for field in ("token", "scene_token", "timestamp", "prev", "next"):
            assert field in body, f"Missing field: {field}"

    async def test_get_sample_correct_token(
        self, client: AsyncClient, log_and_scene
    ):
        token = _LGCAT_SAMPLE_TOKENS[0]
        resp = await client.get(f"/api/v1/samples/{token}")
        assert resp.json()["token"] == token

    async def test_get_sample_not_found_returns_404(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/v1/samples/nonexistent-token-xyz")
        assert resp.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# GET /api/v1/instances
# ═══════════════════════════════════════════════════════════════════════════════

class TestListInstances:
    async def test_list_instances_returns_200(self, client: AsyncClient):
        resp = await client.get("/api/v1/instances/")
        assert resp.status_code == 200

    async def test_list_instances_pagination_shape(self, client: AsyncClient):
        resp = await client.get("/api/v1/instances/")
        body = resp.json()
        for field in ("total", "limit", "offset", "items"):
            assert field in body, f"Missing field: {field}"
        assert isinstance(body["items"], list)

    async def test_list_instances_items_have_required_fields(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/v1/instances/?limit=1")
        body = resp.json()
        if not body["items"]:
            pytest.skip("No instances in DB")
        item = body["items"][0]
        for field in ("token", "category_token", "category_name", "nbr_annotations"):
            assert field in item, f"Missing field: {field}"

    async def test_list_instances_category_name_not_empty(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/v1/instances/?limit=1")
        body = resp.json()
        if not body["items"]:
            pytest.skip("No instances in DB")
        assert body["items"][0]["category_name"] != ""

    async def test_list_instances_limit_is_respected(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/v1/instances/?limit=1")
        body = resp.json()
        assert len(body["items"]) <= 1

    async def test_list_instances_scene_token_filter(
        self, client: AsyncClient, real_instance_data: tuple[str, str]
    ):
        _, scene_token = real_instance_data
        resp = await client.get(f"/api/v1/instances/?scene_token={scene_token}")
        body = resp.json()
        assert resp.status_code == 200
        assert body["total"] >= 1

    async def test_list_instances_category_name_filter(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/v1/instances/?category_name=car")
        body = resp.json()
        assert resp.status_code == 200
        # すべてのアイテムが "car" を含む category_name を持つ
        for item in body["items"]:
            assert "car" in item["category_name"].lower()

    async def test_list_instances_sorted_by_category_name(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/v1/instances/?limit=50")
        body = resp.json()
        if len(body["items"]) < 2:
            pytest.skip("Need at least 2 instances to check sort order")
        names = [item["category_name"] for item in body["items"]]
        assert names == sorted(names)

    async def test_list_instances_limit_negative_returns_422(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/v1/instances/?limit=-1")
        assert resp.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# GET /api/v1/instances/{token}
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetInstance:
    async def test_get_instance_returns_200(
        self, client: AsyncClient, real_instance_data: tuple[str, str]
    ):
        instance_token, _ = real_instance_data
        resp = await client.get(f"/api/v1/instances/{instance_token}")
        assert resp.status_code == 200

    async def test_get_instance_has_required_fields(
        self, client: AsyncClient, real_instance_data: tuple[str, str]
    ):
        instance_token, _ = real_instance_data
        resp = await client.get(f"/api/v1/instances/{instance_token}")
        body = resp.json()
        for field in ("token", "category_name", "nbr_annotations"):
            assert field in body, f"Missing field: {field}"

    async def test_get_instance_correct_token(
        self, client: AsyncClient, real_instance_data: tuple[str, str]
    ):
        instance_token, _ = real_instance_data
        resp = await client.get(f"/api/v1/instances/{instance_token}")
        assert resp.json()["token"] == instance_token

    async def test_get_instance_not_found_returns_404(
        self, client: AsyncClient
    ):
        resp = await client.get("/api/v1/instances/nonexistent-token-xyz")
        assert resp.status_code == 404
