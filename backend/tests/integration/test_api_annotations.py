"""Integration tests for annotation API endpoints.

テストデータは conftest.py の sample_annotation fixture 経由でその都度投入し、
テスト終了後にロールバックする。実際の NuScenes インポートデータには依存しない。
"""
import pytest
from httpx import AsyncClient

from app.models.annotation import SampleAnnotation


_ANN_TOKEN = "ann-anntest-001"


# ── GET /api/v1/annotations/ ──────────────────────────────────────────────────

async def test_list_annotations_returns_200(client: AsyncClient, sample_annotation: SampleAnnotation):
    """アノテーション一覧が 200 を返すこと。"""
    resp = await client.get("/api/v1/annotations/")
    assert resp.status_code == 200


async def test_list_annotations_has_pagination_shape(client: AsyncClient, sample_annotation: SampleAnnotation):
    """レスポンスに total / limit / offset / items キーが含まれること。"""
    resp = await client.get("/api/v1/annotations/")
    body = resp.json()
    assert set(body.keys()) >= {"total", "limit", "offset", "items"}


async def test_list_annotations_limit_restricts_count(client: AsyncClient, sample_annotation: SampleAnnotation):
    """limit=1 のとき items は 1件のみ返ること。"""
    resp = await client.get("/api/v1/annotations/?limit=1")
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["limit"] == 1


async def test_list_annotations_offset_shifts_results(client: AsyncClient, sample_annotation: SampleAnnotation):
    """offset を変えると返るアノテーションが変わること。"""
    resp_0 = await client.get("/api/v1/annotations/?limit=1&offset=0")
    resp_1 = await client.get("/api/v1/annotations/?limit=1&offset=1")
    token_0 = resp_0.json()["items"][0]["token"]
    token_1 = resp_1.json()["items"][0]["token"]
    assert token_0 != token_1


async def test_list_annotations_limit_negative_returns_422(client: AsyncClient, sample_annotation: SampleAnnotation):
    """limit=-1（範囲外）のとき 422 が返ること。"""
    resp = await client.get("/api/v1/annotations/?limit=-1")
    assert resp.status_code == 422


async def test_list_annotations_offset_negative_returns_422(client: AsyncClient, sample_annotation: SampleAnnotation):
    """offset=-1（範囲外）のとき 422 が返ること。"""
    resp = await client.get("/api/v1/annotations/?offset=-1")
    assert resp.status_code == 422


# ── GET /api/v1/annotations/{token} ──────────────────────────────────────────

async def test_get_annotation_returns_200(client: AsyncClient, sample_annotation: SampleAnnotation):
    """存在するトークンで 200 が返ること。"""
    resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert resp.status_code == 200


async def test_get_annotation_has_required_fields(client: AsyncClient, sample_annotation: SampleAnnotation):
    """レスポンスに必須フィールドが含まれること。"""
    resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    body = resp.json()
    required = {"token", "translation", "rotation", "size", "category_token", "attributes"}
    assert required <= set(body.keys())


async def test_get_annotation_translation_is_list(client: AsyncClient, sample_annotation: SampleAnnotation):
    """translation がリスト（長さ3）であること。"""
    resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    translation = resp.json()["translation"]
    assert isinstance(translation, list)
    assert len(translation) == 3


async def test_get_annotation_size_is_list(client: AsyncClient, sample_annotation: SampleAnnotation):
    """size がリスト（長さ3）であること。"""
    resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    size = resp.json()["size"]
    assert isinstance(size, list)
    assert len(size) == 3


async def test_get_annotation_rotation_is_list(client: AsyncClient, sample_annotation: SampleAnnotation):
    """rotation がリスト（長さ4）であること。"""
    resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    rotation = resp.json()["rotation"]
    assert isinstance(rotation, list)
    assert len(rotation) == 4


async def test_get_annotation_attributes_is_list(client: AsyncClient, sample_annotation: SampleAnnotation):
    """attributes がリスト形式であること。"""
    resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    attributes = resp.json()["attributes"]
    assert isinstance(attributes, list)


async def test_get_annotation_not_found_returns_404(client: AsyncClient, sample_annotation: SampleAnnotation):
    """存在しないトークンで 404 が返ること。"""
    resp = await client.get("/api/v1/annotations/ann-does-not-exist-000")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Annotation not found"


# ── PATCH /api/v1/annotations/{token} ────────────────────────────────────────

async def test_patch_annotation_translation_returns_200(client: AsyncClient, sample_annotation: SampleAnnotation):
    """translation のみ更新したとき 200 が返ること。"""
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    assert resp.status_code == 200


async def test_patch_annotation_translation_reflected(client: AsyncClient, sample_annotation: SampleAnnotation):
    """更新後のレスポンスに translation の変更が反映されること。"""
    new_translation = [10.0, 20.0, 30.0]
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": new_translation},
    )
    assert resp.json()["translation"] == new_translation


async def test_patch_annotation_unchanged_fields_preserved(client: AsyncClient, sample_annotation: SampleAnnotation):
    """translation のみ更新したとき、size は変わらないこと。"""
    original_size = sample_annotation.size  # [2.0, 4.0, 1.5]
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    assert resp.json()["size"] == original_size


async def test_patch_annotation_not_found_returns_404(client: AsyncClient, sample_annotation: SampleAnnotation):
    """存在しないトークンで PATCH すると 404 が返ること。"""
    resp = await client.patch(
        "/api/v1/annotations/ann-does-not-exist-000",
        json={"translation": [1.0, 2.0, 3.0]},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Annotation not found"


async def test_patch_annotation_no_body_returns_422(client: AsyncClient, sample_annotation: SampleAnnotation):
    """ボディなし（空バイト列）で PATCH すると 422 が返ること。"""
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        content=b"",
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 422
