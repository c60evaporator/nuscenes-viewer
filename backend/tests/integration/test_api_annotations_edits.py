"""Integration tests for annotation_edits-related API.

POST /annotations (新規 BBox 追加) と DELETE /annotations/{token} (論理削除) を扱う.
GET 系のマージ動作も併せて検証.
"""
import pytest
from httpx import AsyncClient

from app.models.annotation import SampleAnnotation


_ANN_TOKEN = "ann-anntest-001"


# ── POST /api/v1/annotations (既存 instance 経由) ─────────────────────────────

async def test_post_annotation_with_existing_instance_returns_201(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """既存 Instance に紐づけて新規 BBox を追加すると 201 が返ること."""
    resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   sample_annotation.sample_token,
            "instance_token": sample_annotation.instance_token,
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "attribute_tokens": [],
        },
    )
    assert resp.status_code == 201


async def test_post_annotation_returns_translation_in_response(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """レスポンスに送信した translation が含まれること."""
    resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   sample_annotation.sample_token,
            "instance_token": sample_annotation.instance_token,
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "attribute_tokens": [],
        },
    )
    assert resp.json()["translation"] == [10.0, 20.0, 30.0]


async def test_post_annotation_response_has_new_token(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """レスポンスに新しい token が含まれ, 既存とは異なること."""
    resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   sample_annotation.sample_token,
            "instance_token": sample_annotation.instance_token,
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "attribute_tokens": [],
        },
    )
    body = resp.json()
    assert "token" in body
    assert body["token"] != _ANN_TOKEN
    assert len(body["token"]) == 32  # nuScenes 互換 hex


# ── POST /api/v1/annotations (新規 instance 経由) ─────────────────────────────

async def test_post_annotation_with_new_instance_returns_201(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """新規 Instance を作成して BBox を追加すると 201 が返ること."""
    resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   sample_annotation.sample_token,
            "new_instance":   {"category_token": "cat-anntest-001"},
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "attribute_tokens": [],
        },
    )
    assert resp.status_code == 201


async def test_post_annotation_with_new_instance_has_unique_instance_token(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """新規 Instance の token は元のとは異なること."""
    resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   sample_annotation.sample_token,
            "new_instance":   {"category_token": "cat-anntest-001"},
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "attribute_tokens": [],
        },
    )
    body = resp.json()
    assert body["instance_token"] != sample_annotation.instance_token


# ── POST 入力検証 ───────────────────────────────────────────────────────────

async def test_post_annotation_both_instance_specified_returns_400(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """instance_token と new_instance を両方指定すると 400."""
    resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   sample_annotation.sample_token,
            "instance_token": sample_annotation.instance_token,
            "new_instance":   {"category_token": "cat-anntest-001"},
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "attribute_tokens": [],
        },
    )
    assert resp.status_code == 400


async def test_post_annotation_no_instance_returns_400(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """instance_token / new_instance どちらも指定がないと 400."""
    resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   sample_annotation.sample_token,
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "attribute_tokens": [],
        },
    )
    assert resp.status_code == 400


# ── DELETE /api/v1/annotations/{token} ────────────────────────────────────────

async def test_delete_existing_annotation_returns_204(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """既存 SampleAnnotation を削除すると 204."""
    resp = await client.delete(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert resp.status_code == 204


async def test_delete_makes_get_return_404(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """削除後に GET すると 404."""
    await client.delete(f"/api/v1/annotations/{_ANN_TOKEN}")
    get_resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert get_resp.status_code == 404


async def test_delete_nonexistent_returns_404(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """存在しない token を削除しようとすると 404."""
    resp = await client.delete("/api/v1/annotations/ann-does-not-exist-000")
    assert resp.status_code == 404


async def test_delete_idempotent(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """同じ token を 2 回削除しても 2 回目も 204 (冪等)."""
    resp1 = await client.delete(f"/api/v1/annotations/{_ANN_TOKEN}")
    resp2 = await client.delete(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert resp1.status_code == 204
    assert resp2.status_code == 204


# ── マージ動作の確認 ───────────────────────────────────────────────────────

async def test_patch_then_get_returns_merged(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """PATCH 後に GET すると, 編集が反映されたデータが返ること."""
    await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [99.0, 99.0, 99.0]},
    )
    get_resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert get_resp.json()["translation"] == [99.0, 99.0, 99.0]


async def test_post_then_get_includes_new_annotation(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """POST で追加した BBox が GET /annotations の結果に含まれること."""
    post_resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   sample_annotation.sample_token,
            "instance_token": sample_annotation.instance_token,
            "translation":    [50.0, 50.0, 50.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [1.0, 1.0, 1.0],
            "attribute_tokens": [],
        },
    )
    new_token = post_resp.json()["token"]
    list_resp = await client.get("/api/v1/annotations")
    tokens = [item["token"] for item in list_resp.json()["items"]]
    assert new_token in tokens

# ── 楽観的ロック ───────────────────────────────────────────────────────────

async def test_patch_first_time_no_version_succeeds(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """初回 PATCH は version 指定なしでも成功すること."""
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    assert resp.status_code == 200


async def test_patch_returns_edit_version(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """PATCH レスポンスに edit_version が含まれること."""
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    body = resp.json()
    assert "edit_version" in body
    assert body["edit_version"] == 1


async def test_patch_second_time_with_correct_version_succeeds(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """既存 modify edit がある状態で正しい version を送ると成功し, version がインクリメントされること."""
    # 1回目
    resp1 = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    v1 = resp1.json()["edit_version"]
    # 2回目: 正しい version を指定
    resp2 = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [11.0, 22.0, 33.0], "version": v1},
    )
    assert resp2.status_code == 200
    assert resp2.json()["edit_version"] == v1 + 1


async def test_patch_with_wrong_version_returns_409(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """既存 modify edit がある状態で間違った version を送ると 409."""
    # 1回目で modify edit を作る
    await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    # 2回目: 間違った version
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [99.0, 99.0, 99.0], "version": 999},
    )
    assert resp.status_code == 409


async def test_patch_409_response_contains_current_version(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """409 レスポンスに current_version が含まれること."""
    await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [99.0, 99.0, 99.0], "version": 999},
    )
    detail = resp.json()["detail"]
    assert "current_version" in detail
    assert detail["current_version"] == 1


async def test_patch_second_time_without_version_returns_409(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """既存 modify edit がある状態で version 指定なしで PATCH すると 409.

    これは, フロントエンドが古い annotation を使って編集を試みている可能性があるため.
    """
    # 1回目で modify edit を作る
    await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    # 2回目: version 指定なし
    resp = await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [11.0, 22.0, 33.0]},
    )
    assert resp.status_code == 409


async def test_get_returns_edit_version(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """編集後の GET レスポンスに edit_version が含まれること."""
    await client.patch(
        f"/api/v1/annotations/{_ANN_TOKEN}",
        json={"translation": [10.0, 20.0, 30.0]},
    )
    resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert resp.json()["edit_version"] == 1


async def test_get_unedited_returns_null_edit_version(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """編集されていない annotation の GET レスポンスでは edit_version が null になること."""
    resp = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert resp.json()["edit_version"] is None
