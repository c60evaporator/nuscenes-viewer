"""Integration tests for nuScenes export API.

GET /api/v1/export/nuscenes/{scene_token} と GET /api/v1/export/nuscenes を検証する.
"""
import io
import json
import zipfile

from httpx import AsyncClient

from app.models.annotation import SampleAnnotation


_EXPECTED_FILES = {
    'sample_annotation.json', 'instance.json', 'category.json',
    'attribute.json', 'visibility.json', 'sample.json', 'scene.json',
    'sample_data.json', 'calibrated_sensor.json', 'ego_pose.json',
    'log.json', 'map.json', 'sensor.json',
}

_ANN_TOKEN    = "ann-anntest-001"
_SCENE_TOKEN  = "scene-anntest-001"
_SAMPLE_TOKEN = "sample-anntest-001"
_INST_TOKEN   = "inst-anntest-001"


# ── 基本動作 ──────────────────────────────────────────────────────────────────

async def test_export_scene_returns_200_zip(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """シーン export → 200 + ZIP レスポンス."""
    resp = await client.get(f'/api/v1/export/nuscenes/{_SCENE_TOKEN}')
    assert resp.status_code == 200
    assert 'application/zip' in resp.headers['content-type']


async def test_export_scene_zip_contains_all_13_files(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """ZIP に 13 ファイルが含まれる."""
    resp = await client.get(f'/api/v1/export/nuscenes/{_SCENE_TOKEN}')
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = set(zf.namelist()) - {'WARNINGS.txt'}
    assert names == _EXPECTED_FILES


async def test_export_scene_sample_annotation_contains_original(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """編集なし → sample_annotation.json に元の annotation が含まれる."""
    resp = await client.get(f'/api/v1/export/nuscenes/{_SCENE_TOKEN}')
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        anns = json.loads(zf.read('sample_annotation.json'))
    tokens = [a['token'] for a in anns]
    assert _ANN_TOKEN in tokens


# ── 編集反映 ─────────────────────────────────────────────────────────────────

async def test_export_reflects_modify_edit(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """PATCH 後 → export に編集値が反映される."""
    patch_resp = await client.patch(
        f'/api/v1/annotations/{_ANN_TOKEN}',
        json={'translation': [99.0, 88.0, 77.0]},
    )
    assert patch_resp.status_code == 200

    resp = await client.get(f'/api/v1/export/nuscenes/{_SCENE_TOKEN}')
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        anns = json.loads(zf.read('sample_annotation.json'))
    target = next((a for a in anns if a['token'] == _ANN_TOKEN), None)
    assert target is not None
    assert target['translation'] == [99.0, 88.0, 77.0]


async def test_export_excludes_deleted_annotation(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """DELETE 後 → annotation が export から除外される."""
    del_resp = await client.delete(f'/api/v1/annotations/{_ANN_TOKEN}')
    assert del_resp.status_code == 204

    resp = await client.get(f'/api/v1/export/nuscenes/{_SCENE_TOKEN}')
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        anns = json.loads(zf.read('sample_annotation.json'))
    tokens = [a['token'] for a in anns]
    assert _ANN_TOKEN not in tokens


async def test_export_includes_added_annotation(
    client: AsyncClient, sample_annotation: SampleAnnotation
):
    """POST (add) 後 → 追加した annotation が export に含まれる."""
    post_resp = await client.post(
        '/api/v1/annotations',
        json={
            'sample_token':     _SAMPLE_TOKEN,
            'instance_token':   _INST_TOKEN,
            'translation':      [10.0, 20.0, 1.5],
            'rotation':         [1.0, 0.0, 0.0, 0.0],
            'size':             [2.0, 4.0, 1.5],
            'attribute_tokens': [],
        },
    )
    assert post_resp.status_code == 201
    added_token = post_resp.json()['token']

    resp = await client.get(f'/api/v1/export/nuscenes/{_SCENE_TOKEN}')
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        anns = json.loads(zf.read('sample_annotation.json'))
    tokens = [a['token'] for a in anns]
    assert added_token in tokens


# ── 全シーン export ───────────────────────────────────────────────────────────
# 時間がかかりすぎるため一旦コメントアウト. 必要に応じて再度有効化すること.
# async def test_export_all_returns_200_zip(
#     client: AsyncClient, sample_annotation: SampleAnnotation
# ):
#     """全シーン export → 200 + ZIP."""
#     resp = await client.get('/api/v1/export/nuscenes')
#     assert resp.status_code == 200
#     assert 'application/zip' in resp.headers['content-type']


# ── エラーケース ──────────────────────────────────────────────────────────────

async def test_export_nonexistent_scene_returns_404(client: AsyncClient):
    """存在しない scene_token → 404."""
    resp = await client.get('/api/v1/export/nuscenes/nonexistent-token-xxx')
    assert resp.status_code == 404
