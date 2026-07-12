"""POST /api/v1/scenes/import の統合テスト.

conftest の client / db_session を利用する。エンドポイント内の commit は
外側トランザクションの rollback（fixture teardown）で巻き戻される。
"""
import json

from httpx import AsyncClient

_P = "test-scnimp"   # 既存 DB の 32-hex token と衝突しない prefix


def _make_payload(location: str, sensor_token: str, suffix: str = "a") -> dict[str, list[dict]]:
    """1 scene / 2 samples / 2 sample_data / 2 ego_pose / 1 log / 1 cs の最小ペイロード."""
    log_t    = f"{_P}-log-{suffix}"
    scene_t  = f"{_P}-scene-{suffix}"
    sample1  = f"{_P}-sample-{suffix}1"
    sample2  = f"{_P}-sample-{suffix}2"
    ep1      = f"{_P}-ep-{suffix}1"
    ep2      = f"{_P}-ep-{suffix}2"
    cs_t     = f"{_P}-cs-{suffix}"
    sd1      = f"{_P}-sd-{suffix}1"
    sd2      = f"{_P}-sd-{suffix}2"

    return {
        "scene.json": [{
            "token": scene_t, "log_token": log_t, "nbr_samples": 2,
            "first_sample_token": sample1, "last_sample_token": sample2,
            "name": "scene-import-test", "description": "test scene",
        }],
        "sample.json": [
            {"token": sample1, "timestamp": 1_000_000, "prev": "", "next": sample2, "scene_token": scene_t},
            {"token": sample2, "timestamp": 1_500_000, "prev": sample1, "next": "", "scene_token": scene_t},
        ],
        "sample_data.json": [
            {"token": sd1, "sample_token": sample1, "ego_pose_token": ep1,
             "calibrated_sensor_token": cs_t, "timestamp": 1_000_000, "fileformat": "jpg",
             "is_key_frame": True, "height": 900, "width": 1600,
             "filename": "samples/CAM_FRONT/test1.jpg", "prev": "", "next": sd2},
            {"token": sd2, "sample_token": sample2, "ego_pose_token": ep2,
             "calibrated_sensor_token": cs_t, "timestamp": 1_500_000, "fileformat": "jpg",
             "is_key_frame": True, "height": 900, "width": 1600,
             "filename": "samples/CAM_FRONT/test2.jpg", "prev": sd1, "next": ""},
        ],
        "ego_pose.json": [
            {"token": ep1, "timestamp": 1_000_000, "translation": [0, 0, 0], "rotation": [1, 0, 0, 0]},
            {"token": ep2, "timestamp": 1_500_000, "translation": [1, 1, 0], "rotation": [1, 0, 0, 0]},
        ],
        "log.json": [{
            "token": log_t, "logfile": "test-log", "vehicle": "test-vehicle",
            "date_captured": "2026-01-01", "location": location,
        }],
        "calibrated_sensor.json": [{
            "token": cs_t, "sensor_token": sensor_token,
            "translation": [0, 0, 0], "rotation": [1, 0, 0, 0],
            "camera_intrinsic": [[1000, 0, 800], [0, 1000, 450], [0, 0, 1]],
        }],
    }


def _to_files(payload: dict[str, list[dict]]) -> dict[str, tuple[str, bytes, str]]:
    key_map = {
        "scene.json":             "scenes_file",
        "sample.json":            "samples_file",
        "sample_data.json":       "sample_data_file",
        "ego_pose.json":          "ego_pose_file",
        "log.json":               "log_file",
        "calibrated_sensor.json": "calibrated_sensor_file",
    }
    return {
        key_map[name]: (name, json.dumps(rows).encode(), "application/json")
        for name, rows in payload.items()
    }


class TestSceneImportSuccess:
    async def test_import_success(self, client: AsyncClient, ref_data: dict[str, str]):
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"])
        res = await client.post("/api/v1/scenes/import", files=_to_files(payload),
                                data={"dry_run": "false"})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["ok"] is True
        assert body["dry_run"] is False
        assert body["imported_counts"] == {
            "scenes": 1, "samples": 2, "sample_data": 2,
            "ego_pose": 2, "log": 1, "calibrated_sensor": 1,
        }
        assert body["added_scene_names"] == ["scene-import-test"]
        assert body["errors"] == []

        # scene が is_user_created=true で登録されていること
        scene_token = payload["scene.json"][0]["token"]
        res2 = await client.get(f"/api/v1/scenes/{scene_token}")
        assert res2.status_code == 200
        assert res2.json()["is_user_created"] is True

        # samples の prev/next チェーンが補完されていること
        res3 = await client.get(f"/api/v1/scenes/{scene_token}/samples")
        samples = sorted(res3.json(), key=lambda s: s["timestamp"])
        assert len(samples) == 2
        assert samples[0]["next"] == samples[1]["token"]
        assert samples[1]["prev"] == samples[0]["token"]

    async def test_import_dedups_existing_calibrated_sensor(
        self, client: AsyncClient, ref_data: dict[str, str],
    ):
        """既存 DB の calibrated_sensor token を再送してもスキップされ 0 件になる.

        1 回目のインポートで cs を作成し、2 回目（別 scene・同一 cs token）で
        dedup されることを検証する（空 DB でも自己完結）。
        """
        payload1 = _make_payload(ref_data["location"], ref_data["sensor_token"], suffix="d1")
        res1 = await client.post("/api/v1/scenes/import", files=_to_files(payload1),
                                 data={"dry_run": "false"})
        assert res1.status_code == 200, res1.text
        assert res1.json()["imported_counts"]["calibrated_sensor"] == 1

        # 2 回目: scene/sample/... は別 token、cs だけ 1 回目と同一
        payload2 = _make_payload(ref_data["location"], ref_data["sensor_token"], suffix="d2")
        cs_token = payload1["calibrated_sensor.json"][0]["token"]
        payload2["calibrated_sensor.json"][0]["token"] = cs_token
        for sd in payload2["sample_data.json"]:
            sd["calibrated_sensor_token"] = cs_token
        res2 = await client.post("/api/v1/scenes/import", files=_to_files(payload2),
                                 data={"dry_run": "false"})
        assert res2.status_code == 200, res2.text
        assert res2.json()["imported_counts"]["calibrated_sensor"] == 0
        assert res2.json()["imported_counts"]["scenes"] == 1

    async def test_dry_run_does_not_insert(self, client: AsyncClient, ref_data: dict[str, str]):
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"])
        res = await client.post("/api/v1/scenes/import", files=_to_files(payload),
                                data={"dry_run": "true"})
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["dry_run"] is True
        assert body["imported_counts"]["scenes"] == 1
        # DB には入っていない
        scene_token = payload["scene.json"][0]["token"]
        res2 = await client.get(f"/api/v1/scenes/{scene_token}")
        assert res2.status_code == 404


class TestSceneImportValidation:
    async def _post(self, client: AsyncClient, payload: dict) -> tuple[int, list[dict]]:
        res = await client.post("/api/v1/scenes/import", files=_to_files(payload),
                                data={"dry_run": "false"})
        detail = res.json().get("detail", [])
        return res.status_code, detail

    async def test_unknown_location(self, client: AsyncClient, ref_data: dict[str, str]):
        payload = _make_payload("no-such-location", ref_data["sensor_token"])
        status, detail = await self._post(client, payload)
        assert status == 422
        assert any(d["file"] == "log.json" and "location" in d["message"] for d in detail)

    async def test_unknown_sensor_token(self, client: AsyncClient, ref_data: dict[str, str]):
        payload = _make_payload(ref_data["location"], "no-such-sensor")
        status, detail = await self._post(client, payload)
        assert status == 422
        assert any(d["file"] == "calibrated_sensor.json" and "sensor_token" in d["message"]
                   for d in detail)

    async def test_bad_scene_token_in_sample(self, client: AsyncClient, ref_data: dict[str, str]):
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"])
        payload["sample.json"][0]["scene_token"] = "no-such-scene"
        status, detail = await self._post(client, payload)
        assert status == 422
        assert any(d["file"] == "sample.json" and "scene_token" in d["message"] for d in detail)

    async def test_bad_sample_token_in_sample_data(self, client: AsyncClient, ref_data: dict[str, str]):
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"])
        payload["sample_data.json"][0]["sample_token"] = "no-such-sample"
        status, detail = await self._post(client, payload)
        assert status == 422
        assert any(d["file"] == "sample_data.json" and "sample_token" in d["message"] for d in detail)

    async def test_duplicate_scene_token(self, client: AsyncClient, ref_data: dict[str, str]):
        """同一ペイロードの二重インポート（ダブルクリック等）は 422 になる."""
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"], suffix="dup")
        res1 = await client.post("/api/v1/scenes/import", files=_to_files(payload),
                                 data={"dry_run": "false"})
        assert res1.status_code == 200, res1.text

        status, detail = await self._post(client, payload)
        assert status == 422
        scene_token = payload["scene.json"][0]["token"]
        assert any(d["file"] == "scene.json" and d["token"] == scene_token for d in detail)

    async def test_unparsable_json(self, client: AsyncClient, ref_data: dict[str, str]):
        payload = _make_payload(ref_data["location"], ref_data["sensor_token"])
        files = _to_files(payload)
        files["scenes_file"] = ("scene.json", b"{ not valid json", "application/json")
        res = await client.post("/api/v1/scenes/import", files=files,
                                data={"dry_run": "false"})
        assert res.status_code == 422
        detail = res.json()["detail"]
        assert any(d["file"] == "scene.json" for d in detail)
