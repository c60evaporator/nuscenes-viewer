"""DELETE /api/v1/scenes/{token} の統合テスト.

空 DB（v1.0-empty）でも自己完結するよう、シードは import エンドポイント
（test_api_scene_import のヘルパーを再利用）または db_session への直接 INSERT で行う。
エンドポイント内の commit は外側トランザクションの rollback（fixture teardown）で巻き戻される。
"""
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation_edit import AnnotationEdit, InstanceEdit
from app.models.scene import Log, Scene
from app.models.sensor import CalibratedSensor, EgoPose
from tests.integration.test_api_scene_import import _make_payload, _to_files

_P = "test-scndel"


async def _import(client: AsyncClient, payload: dict) -> None:
    res = await client.post("/api/v1/scenes/import", files=_to_files(payload),
                            data={"dry_run": "false"})
    assert res.status_code == 200, res.text


async def _exists(db: AsyncSession, model, token: str) -> bool:
    return (await db.execute(select(model.token).where(model.token == token))).scalar_one_or_none() is not None


class TestSceneDeleteSuccess:
    async def test_delete_success(
        self, client: AsyncClient, db_session: AsyncSession, ref_data: dict[str, str],
    ):
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"], suffix="del1")
        await _import(client, payload)
        scene_token = payload["scene.json"][0]["token"]

        res = await client.delete(f"/api/v1/scenes/{scene_token}")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["deleted_scene_token"] == scene_token
        assert body["deleted_scene_name"] == "scene-import-test"
        assert body["deleted_counts"] == {
            "scenes": 1, "samples": 2, "sample_data": 2,
            "sample_annotations": 0, "annotation_edits": 0,
            "ego_pose": 2, "calibrated_sensor": 1, "log": 1, "instance_edits": 0,
        }

        # scene 本体と孤児（ego_pose / cs / log）が消えていること
        assert (await client.get(f"/api/v1/scenes/{scene_token}")).status_code == 404
        assert not await _exists(db_session, EgoPose, payload["ego_pose.json"][0]["token"])
        assert not await _exists(db_session, CalibratedSensor,
                                 payload["calibrated_sensor.json"][0]["token"])
        assert not await _exists(db_session, Log, payload["log.json"][0]["token"])

    async def test_shared_cs_and_log_are_protected(
        self, client: AsyncClient, ref_data: dict[str, str],
    ):
        """2 scene が calibrated_sensor / log を共有 → 片方削除では消えず、両方削除で消える."""
        payload1 = _make_payload(ref_data["location"], ref_data["sensor_token"], suffix="sh1")
        await _import(client, payload1)
        cs_token  = payload1["calibrated_sensor.json"][0]["token"]
        log_token = payload1["log.json"][0]["token"]

        # 2 scene 目: cs と log を 1 scene 目と共有（dedup でスキップされる）
        payload2 = _make_payload(ref_data["location"], ref_data["sensor_token"], suffix="sh2")
        payload2["calibrated_sensor.json"][0]["token"] = cs_token
        for sd in payload2["sample_data.json"]:
            sd["calibrated_sensor_token"] = cs_token
        payload2["log.json"][0]["token"] = log_token
        payload2["scene.json"][0]["log_token"] = log_token
        await _import(client, payload2)

        # 1 scene 目を削除 → cs / log はまだ scene2 から参照されているので残る
        res1 = await client.delete(f"/api/v1/scenes/{payload1['scene.json'][0]['token']}")
        assert res1.status_code == 200, res1.text
        assert res1.json()["deleted_counts"]["calibrated_sensor"] == 0
        assert res1.json()["deleted_counts"]["log"] == 0

        # 2 scene 目を削除 → 孤児になった cs / log も消える
        res2 = await client.delete(f"/api/v1/scenes/{payload2['scene.json'][0]['token']}")
        assert res2.status_code == 200, res2.text
        assert res2.json()["deleted_counts"]["calibrated_sensor"] == 1
        assert res2.json()["deleted_counts"]["log"] == 1

    async def test_reimport_after_delete(
        self, client: AsyncClient, ref_data: dict[str, str],
    ):
        """削除後に同一ペイロードを再インポートできる（孤児掃除の完全性検証）."""
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"], suffix="re1")
        await _import(client, payload)
        res = await client.delete(f"/api/v1/scenes/{payload['scene.json'][0]['token']}")
        assert res.status_code == 200, res.text
        # token 重複エラー（422）にならず再投入できること
        await _import(client, payload)

    async def test_orphan_instance_edit_is_deleted(
        self, client: AsyncClient, db_session: AsyncSession, ref_data: dict[str, str],
    ):
        """scene の annotation_edit だけが参照する instance_edit は削除される."""
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"], suffix="ie1")
        await _import(client, payload)
        scene_token  = payload["scene.json"][0]["token"]
        sample_token = payload["sample.json"][0]["token"]

        inst_edit = InstanceEdit(token=f"{_P}-instedit-1", category_token=ref_data["category_token"])
        db_session.add(inst_edit)
        await db_session.flush()
        db_session.add(AnnotationEdit(
            token=f"{_P}-annedit-1", base_token=None, edit_type="add",
            sample_token=sample_token, instance_token=inst_edit.token,
            translation=[0.0, 0.0, 0.0], rotation=[1.0, 0.0, 0.0, 0.0], size=[1.0, 1.0, 1.0],
        ))
        await db_session.flush()

        res = await client.delete(f"/api/v1/scenes/{scene_token}")
        assert res.status_code == 200, res.text
        assert res.json()["deleted_counts"]["annotation_edits"] == 1
        assert res.json()["deleted_counts"]["instance_edits"] == 1
        assert not await _exists(db_session, AnnotationEdit, f"{_P}-annedit-1")
        assert not await _exists(db_session, InstanceEdit, f"{_P}-instedit-1")


class TestSceneDeleteErrors:
    async def test_delete_nonexistent_scene(self, client: AsyncClient):
        res = await client.delete(f"/api/v1/scenes/{_P}-no-such-scene")
        assert res.status_code == 404

    async def test_delete_initial_scene_forbidden(
        self, client: AsyncClient, db_session: AsyncSession, ref_data: dict[str, str],
    ):
        """is_user_created=false（初回インポート相当）の scene は 403 で拒否され、残る."""
        log = Log(token=f"{_P}-log-init", logfile="init.log", vehicle="v",
                  date_captured="2024-01-01", location=ref_data["location"])
        db_session.add(log)
        await db_session.flush()
        scene = Scene(token=f"{_P}-scene-init", log_token=log.token,
                      name="scene-init", description=None, nbr_samples=0,
                      first_sample_token="", last_sample_token="")
        db_session.add(scene)   # is_user_created は server_default の false
        await db_session.flush()

        res = await client.delete(f"/api/v1/scenes/{scene.token}")
        assert res.status_code == 403
        assert await _exists(db_session, Scene, scene.token)
