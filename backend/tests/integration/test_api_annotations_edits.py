"""Integration tests for annotation_edits-related API.

POST /annotations (新規 BBox 追加) と DELETE /annotations/{token} (論理削除) を扱う.
GET 系のマージ動作も併せて検証.
"""
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

# ── 削除時の chain 整合性 ────────────────────────────────────────────────

async def test_delete_last_annotation_clears_prev_next_link(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """末尾の annotation を削除すると, 直前の annotation の next が null になること.
    
    シナリオ:
      1. 既存 annotation A (sample_annotation fixture) を末尾とする instance
      2. A の前に新しい annotation B を追加 (Add BBox to prev)
         - B.next = A.token になる
         - A.prev = B.token に書き換えられる
      3. A を削除
         - B.next が null に書き換えられているはず
    """
    # 1. A の前に B を追加
    post_resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   "sample-anntest-001",  # conftest fixture と一致
            "instance_token": sample_annotation.instance_token,
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "next":           _ANN_TOKEN,  # A の token
            "attribute_tokens": [],
        },
    )
    assert post_resp.status_code == 201
    b_token = post_resp.json()["token"]

    # 2. A を削除
    delete_resp = await client.delete(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert delete_resp.status_code == 204

    # 3. B の next が null になっていることを確認
    get_b_resp = await client.get(f"/api/v1/annotations/{b_token}")
    assert get_b_resp.status_code == 200
    assert get_b_resp.json()["next"] is None


async def test_delete_first_annotation_clears_next_prev_link(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """先頭の annotation を削除すると, 直後の annotation の prev が null になること."""
    # 1. A の後に B を追加 (Add BBox to next 相当)
    post_resp = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   "sample-anntest-001",
            "instance_token": sample_annotation.instance_token,
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "prev":           _ANN_TOKEN,
            "attribute_tokens": [],
        },
    )
    assert post_resp.status_code == 201
    b_token = post_resp.json()["token"]

    # 2. A を削除
    delete_resp = await client.delete(f"/api/v1/annotations/{_ANN_TOKEN}")
    assert delete_resp.status_code == 204

    # 3. B の prev が null になっていることを確認
    get_b_resp = await client.get(f"/api/v1/annotations/{b_token}")
    assert get_b_resp.status_code == 200
    assert get_b_resp.json()["prev"] is None


async def test_delete_middle_annotation_links_adjacent(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """中間の annotation を削除すると, 前後の annotation が直接リンクされること.

    シナリオ: A → B → C のチェーンで B を削除
      期待: A.next = C, C.prev = A
    """
    # 注: conftest.py の sample_annotation fixture が複数 sample を作成しているか
    #     確認が必要. 単一なら追加で sample を作るか, このテストはスキップ.

    # 1. A の後に B, B の後に C を追加
    post_b = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   "sample-anntest-001",
            "instance_token": sample_annotation.instance_token,
            "translation":    [10.0, 20.0, 30.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "prev":           _ANN_TOKEN,
            "attribute_tokens": [],
        },
    )
    b_token = post_b.json()["token"]

    post_c = await client.post(
        "/api/v1/annotations",
        json={
            "sample_token":   "sample-anntest-001",
            "instance_token": sample_annotation.instance_token,
            "translation":    [11.0, 21.0, 31.0],
            "rotation":       [1.0, 0.0, 0.0, 0.0],
            "size":           [2.0, 4.0, 1.5],
            "prev":           b_token,
            "attribute_tokens": [],
        },
    )
    c_token = post_c.json()["token"]

    # 2. B を削除
    delete_resp = await client.delete(f"/api/v1/annotations/{b_token}")
    assert delete_resp.status_code == 204

    # 3. A.next = C, C.prev = A になっていることを確認
    get_a = await client.get(f"/api/v1/annotations/{_ANN_TOKEN}")
    get_c = await client.get(f"/api/v1/annotations/{c_token}")
    assert get_a.json()["next"] == c_token
    assert get_c.json()["prev"] == _ANN_TOKEN
