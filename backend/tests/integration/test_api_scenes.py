"""Integration tests for GET /api/v1/scenes endpoints.

テストデータは db_session fixture 経由でその都度投入し、テスト終了後にロールバックする。
実際の NuScenes インポートデータには依存しない（ユニークなトークンを使用）。
"""
import pytest
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scene import Log, Sample, Scene


# ── テスト用データ定数 ─────────────────────────────────────────────────────────

_LOG_TOKEN = "log-inttest-001"
_SCENE1_TOKEN = "scene-inttest-001"
_SCENE2_TOKEN = "scene-inttest-002"
_SAMPLE1_TOKEN = "sample-inttest-001"
_SAMPLE2_TOKEN = "sample-inttest-002"


# ── fixture ───────────────────────────────────────────────────────────────────

@pytest.fixture
async def scene_data(db_session: AsyncSession):
    """最小限のテストデータを DB に投入する。

    - Log 1件（Scene の FK 親）
    - Scene 2件（scene1: Sample あり, scene2: Sample なし）
    - Sample 2件（scene1 に属する prev/next チェーン）

    db_session のロールバックにより、テスト終了後に全レコードが消える。
    """
    log = Log(
        token=_LOG_TOKEN,
        logfile="inttest.log",
        vehicle="test-vehicle-x",
        date_captured="2024-01-01",
        location="boston-seaport",
    )
    db_session.add(log)
    await db_session.flush()

    scene1 = Scene(
        token=_SCENE1_TOKEN,
        log_token=_LOG_TOKEN,
        name="scene-inttest-alpha",     # 名前順ソートで先頭になるよう "alpha"
        description="Integration test scene with samples",
        nbr_samples=2,
        first_sample_token=_SAMPLE1_TOKEN,
        last_sample_token=_SAMPLE2_TOKEN,
    )
    scene2 = Scene(
        token=_SCENE2_TOKEN,
        log_token=_LOG_TOKEN,
        name="scene-inttest-beta",
        description=None,              # description が None のケース
        nbr_samples=0,
        first_sample_token="",
        last_sample_token="",
    )
    db_session.add_all([scene1, scene2])
    await db_session.flush()

    # samples の prev/next は自己参照FK なので2パスで挿入する
    # (to_nusc_db.py と同じパターン)
    sample1 = Sample(
        token=_SAMPLE1_TOKEN,
        scene_token=_SCENE1_TOKEN,
        timestamp=1_000_000,
        prev=None,
        next=None,  # 後で UPDATE
    )
    sample2 = Sample(
        token=_SAMPLE2_TOKEN,
        scene_token=_SCENE1_TOKEN,
        timestamp=2_000_000,
        prev=None,  # 後で UPDATE
        next=None,
    )
    db_session.add_all([sample1, sample2])
    await db_session.flush()

    await db_session.execute(
        update(Sample).where(Sample.token == _SAMPLE1_TOKEN).values(next=_SAMPLE2_TOKEN)
    )
    await db_session.execute(
        update(Sample).where(Sample.token == _SAMPLE2_TOKEN).values(prev=_SAMPLE1_TOKEN)
    )
    await db_session.flush()

    return {
        "log": log,
        "scene1": scene1,
        "scene2": scene2,
        "sample1": sample1,
        "sample2": sample2,
    }


# ── GET /api/v1/scenes/ ───────────────────────────────────────────────────────

async def test_list_scenes_returns_200(client: AsyncClient, scene_data):
    """シーン一覧が 200 を返すこと。"""
    resp = await client.get("/api/v1/scenes/")
    assert resp.status_code == 200


async def test_list_scenes_response_has_pagination_shape(client: AsyncClient, scene_data):
    """レスポンスに total / limit / offset / items キーが含まれること。"""
    resp = await client.get("/api/v1/scenes/")
    body = resp.json()
    assert set(body.keys()) >= {"total", "limit", "offset", "items"}


async def test_list_scenes_items_have_scene_fields(client: AsyncClient, scene_data):
    """items の各要素が SceneResponse のフィールドを持つこと。"""
    resp = await client.get("/api/v1/scenes/?limit=1")
    item = resp.json()["items"][0]
    expected_keys = {"token", "log_token", "name", "nbr_samples",
                     "first_sample_token", "last_sample_token"}
    assert expected_keys <= set(item.keys())


async def test_list_scenes_contains_test_scenes(client: AsyncClient, scene_data):
    """投入したテストシーンが一覧に含まれること。"""
    # 全件取得（既存データ + テストデータ、上限 500）
    resp = await client.get("/api/v1/scenes/?limit=500")
    tokens = {item["token"] for item in resp.json()["items"]}
    assert _SCENE1_TOKEN in tokens
    assert _SCENE2_TOKEN in tokens


async def test_list_scenes_total_includes_test_data(client: AsyncClient, scene_data):
    """total がテストシーン 2件分以上であること（既存データとの共存）。"""
    resp = await client.get("/api/v1/scenes/")
    assert resp.json()["total"] >= 2


async def test_list_scenes_limit_restricts_item_count(client: AsyncClient, scene_data):
    """limit=1 のとき items は 1件のみ返ること。"""
    resp = await client.get("/api/v1/scenes/?limit=1")
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["limit"] == 1


async def test_list_scenes_offset_shifts_results(client: AsyncClient, scene_data):
    """offset を変えると返るシーンが変わること。"""
    resp_0 = await client.get("/api/v1/scenes/?limit=1&offset=0")
    resp_1 = await client.get("/api/v1/scenes/?limit=1&offset=1")
    token_0 = resp_0.json()["items"][0]["token"]
    token_1 = resp_1.json()["items"][0]["token"]
    assert token_0 != token_1


async def test_list_scenes_description_can_be_none(client: AsyncClient, scene_data):
    """description=None のシーンが含まれていても正常にシリアライズされること。"""
    resp = await client.get("/api/v1/scenes/?limit=500")
    items = resp.json()["items"]
    beta = next((i for i in items if i["token"] == _SCENE2_TOKEN), None)
    assert beta is not None
    assert beta["description"] is None


# ── GET /api/v1/scenes/{token} ─────────────────────────────────────────────────

async def test_get_scene_by_token_returns_200(client: AsyncClient, scene_data):
    """存在するトークンで 200 が返ること。"""
    resp = await client.get(f"/api/v1/scenes/{_SCENE1_TOKEN}")
    assert resp.status_code == 200


async def test_get_scene_returns_correct_fields(client: AsyncClient, scene_data):
    """レスポンスが投入したシーンのフィールドと一致すること。"""
    resp = await client.get(f"/api/v1/scenes/{_SCENE1_TOKEN}")
    body = resp.json()
    assert body["token"] == _SCENE1_TOKEN
    assert body["log_token"] == _LOG_TOKEN
    assert body["name"] == "scene-inttest-alpha"
    assert body["description"] == "Integration test scene with samples"
    assert body["nbr_samples"] == 2
    assert body["first_sample_token"] == _SAMPLE1_TOKEN
    assert body["last_sample_token"] == _SAMPLE2_TOKEN


async def test_get_scene_not_found_returns_404(client: AsyncClient, scene_data):
    """存在しないトークンで 404 が返ること。"""
    resp = await client.get("/api/v1/scenes/scene-does-not-exist-000")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Scene not found"


# ── GET /api/v1/scenes/{token}/samples ────────────────────────────────────────

async def test_get_scene_samples_returns_200(client: AsyncClient, scene_data):
    """サンプル一覧が 200 を返すこと。"""
    resp = await client.get(f"/api/v1/scenes/{_SCENE1_TOKEN}/samples")
    assert resp.status_code == 200


async def test_get_scene_samples_count(client: AsyncClient, scene_data):
    """scene1 のサンプルが 2件返ること。"""
    resp = await client.get(f"/api/v1/scenes/{_SCENE1_TOKEN}/samples")
    assert len(resp.json()) == 2


async def test_get_scene_samples_ordered_by_timestamp(client: AsyncClient, scene_data):
    """サンプルがタイムスタンプ昇順で返ること。"""
    resp = await client.get(f"/api/v1/scenes/{_SCENE1_TOKEN}/samples")
    samples = resp.json()
    timestamps = [s["timestamp"] for s in samples]
    assert timestamps == sorted(timestamps)


async def test_get_scene_samples_have_correct_fields(client: AsyncClient, scene_data):
    """サンプルが SampleResponse のフィールドを持つこと。"""
    resp = await client.get(f"/api/v1/scenes/{_SCENE1_TOKEN}/samples")
    sample = resp.json()[0]
    assert set(sample.keys()) >= {"token", "scene_token", "timestamp", "prev", "next"}


async def test_get_scene_samples_prev_next_chain(client: AsyncClient, scene_data):
    """サンプルの prev/next チェーンが正しいこと。"""
    resp = await client.get(f"/api/v1/scenes/{_SCENE1_TOKEN}/samples")
    samples = resp.json()
    first = next(s for s in samples if s["token"] == _SAMPLE1_TOKEN)
    last = next(s for s in samples if s["token"] == _SAMPLE2_TOKEN)
    assert first["prev"] is None
    assert first["next"] == _SAMPLE2_TOKEN
    assert last["prev"] == _SAMPLE1_TOKEN
    assert last["next"] is None


async def test_get_scene_samples_empty_when_no_samples(client: AsyncClient, scene_data):
    """サンプルなしのシーンで空リストが返ること。"""
    resp = await client.get(f"/api/v1/scenes/{_SCENE2_TOKEN}/samples")
    assert resp.status_code == 200
    assert resp.json() == []
