"""scene 追加（POST /scenes/import）のサービス層.

6 つの nuScenes 形式 JSON（scene / sample / sample_data / ego_pose / log /
calibrated_sensor）を 1 リクエスト・1 トランザクションで DB に投入する。

- パースは app/json_conversion/schemas_nuscenes.py の Pydantic スキーマを再利用
- 投入は app/json_conversion/to_nusc_db.py のヘルパー（_upsert_ignore / _bulk_update）を再利用
  （samples / sample_data の prev/next 自己参照 FK は「None で挿入 → bulk UPDATE 補完」の
   初期インポートと同じパターン）
- コミットは末尾の 1 回のみ。途中の例外では何もコミットされない（全ロールバック）
"""
import logging

from fastapi import HTTPException
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.json_conversion.schemas_nuscenes import (
    CalibratedSensor as CalibratedSensorSchema,
    EgoPose as EgoPoseSchema,
    Log as LogSchema,
    Sample as SampleSchema,
    SampleData as SampleDataSchema,
    Scene as SceneSchema,
)
from app.json_conversion.to_nusc_db import _bulk_update, _upsert_ignore
from app.models.scene import Log, Sample, Scene
from app.models.sensor import CalibratedSensor, EgoPose, SampleData
from app.repositories.scene_import import SceneImportRepository
from app.schemas.scene_import import ImportErrorItem, SceneImportResult

logger = logging.getLogger(__name__)

# 1 ルールあたりのエラー報告上限（レスポンス肥大防止）
_ERROR_CAP = 10

_ADAPTERS = {
    "scene.json":             TypeAdapter(list[SceneSchema]),
    "sample.json":            TypeAdapter(list[SampleSchema]),
    "sample_data.json":       TypeAdapter(list[SampleDataSchema]),
    "ego_pose.json":          TypeAdapter(list[EgoPoseSchema]),
    "log.json":               TypeAdapter(list[LogSchema]),
    "calibrated_sensor.json": TypeAdapter(list[CalibratedSensorSchema]),
}


class _ErrorCollector:
    """ルールごとに上限付きでエラーを収集する."""

    def __init__(self) -> None:
        self.items: list[ImportErrorItem] = []
        self._counts: dict[str, int] = {}

    def add(self, rule: str, *, file: str | None, token: str | None, message: str) -> None:
        n = self._counts.get(rule, 0)
        self._counts[rule] = n + 1
        if n < _ERROR_CAP:
            self.items.append(ImportErrorItem(file=file, token=token, message=message))
        elif n == _ERROR_CAP:
            self.items.append(ImportErrorItem(
                file=file, token=None,
                message=f"（同種のエラーが多数あるため以降は省略: {rule}）",
            ))

    @property
    def has_errors(self) -> bool:
        return len(self.items) > 0


def _raise_422(errors: _ErrorCollector) -> None:
    raise HTTPException(
        status_code=422,
        detail=[e.model_dump() for e in errors.items],
    )


async def import_scenes_from_json(
    db: AsyncSession,
    *,
    scenes_json: bytes,
    samples_json: bytes,
    sample_data_json: bytes,
    ego_pose_json: bytes,
    log_json: bytes,
    calibrated_sensor_json: bytes,
    dry_run: bool = False,
) -> SceneImportResult:
    errors = _ErrorCollector()

    # ── 1. パース ────────────────────────────────────────────────────────────
    raw = {
        "scene.json":             scenes_json,
        "sample.json":            samples_json,
        "sample_data.json":       sample_data_json,
        "ego_pose.json":          ego_pose_json,
        "log.json":               log_json,
        "calibrated_sensor.json": calibrated_sensor_json,
    }
    parsed: dict[str, list] = {}
    for name, data in raw.items():
        try:
            parsed[name] = _ADAPTERS[name].validate_json(data)
        except ValidationError as e:
            first = e.errors()[0]
            loc = ".".join(str(x) for x in first.get("loc", ()))
            errors.add(
                "parse", file=name, token=None,
                message=f"パース失敗（{e.error_count()}件。例: {first.get('msg')} @ {loc}）",
            )
    if errors.has_errors:
        _raise_422(errors)

    scenes:  list[SceneSchema]            = parsed["scene.json"]
    samples: list[SampleSchema]           = parsed["sample.json"]
    sds:     list[SampleDataSchema]       = parsed["sample_data.json"]
    eps:     list[EgoPoseSchema]          = parsed["ego_pose.json"]
    logs:    list[LogSchema]              = parsed["log.json"]
    css:     list[CalibratedSensorSchema] = parsed["calibrated_sensor.json"]

    # ── 2. バリデーション ────────────────────────────────────────────────────
    repo = SceneImportRepository(db)

    valid_locations   = await repo.get_map_locations()
    valid_sensor_toks = await repo.get_sensor_tokens()
    existing_log_toks = await repo.get_existing_tokens(Log, [l.token for l in logs])
    existing_cs_toks  = await repo.get_existing_tokens(CalibratedSensor, [c.token for c in css])

    scene_toks  = {s.token for s in scenes}
    sample_toks = {s.token for s in samples}
    sd_toks     = {s.token for s in sds}
    ep_toks     = {e.token for e in eps}
    log_toks    = {l.token for l in logs}
    cs_toks     = {c.token for c in css}

    # 2-a. log.location ∈ map_meta
    for l in logs:
        if l.location not in valid_locations:
            errors.add("log_location", file="log.json", token=l.token,
                       message=f"未知の location: {l.location}")

    # 2-b. calibrated_sensor.sensor_token ∈ sensors テーブル
    for c in css:
        if c.sensor_token not in valid_sensor_toks:
            errors.add("cs_sensor", file="calibrated_sensor.json", token=c.token,
                       message=f"未知の sensor_token: {c.sensor_token}")

    # 2-c. scene.log_token ∈ アップロード log ∪ DB logs（FK違反防止）
    for s in scenes:
        if s.log_token not in log_toks and s.log_token not in existing_log_toks:
            errors.add("scene_log", file="scene.json", token=s.token,
                       message=f"log_token が log.json / DB に存在しません: {s.log_token}")

    # 2-d. sample.scene_token ∈ アップロード scene.json
    for s in samples:
        if s.scene_token not in scene_toks:
            errors.add("sample_scene", file="sample.json", token=s.token,
                       message=f"scene_token が scene.json に存在しません: {s.scene_token}")
        # prev/next はバッチ内の sample を指すこと（FK違反防止）
        for ref in (s.prev, s.next):
            if ref and ref not in sample_toks:
                errors.add("sample_chain", file="sample.json", token=s.token,
                           message=f"prev/next がバッチ内に存在しません: {ref}")

    # 2-e. sample_data の相互参照
    for sd in sds:
        if sd.sample_token not in sample_toks:
            errors.add("sd_sample", file="sample_data.json", token=sd.token,
                       message=f"sample_token が sample.json に存在しません: {sd.sample_token}")
        if sd.ego_pose_token not in ep_toks:
            errors.add("sd_ego", file="sample_data.json", token=sd.token,
                       message=f"ego_pose_token が ego_pose.json に存在しません: {sd.ego_pose_token}")
        # calibrated_sensor は dedup 対象のため DB 既存も許容
        if sd.calibrated_sensor_token not in cs_toks and sd.calibrated_sensor_token not in existing_cs_toks:
            errors.add("sd_cs", file="sample_data.json", token=sd.token,
                       message=f"calibrated_sensor_token が calibrated_sensor.json / DB に存在しません: {sd.calibrated_sensor_token}")
        for ref in (sd.prev, sd.next):
            if ref and ref not in sd_toks:
                errors.add("sd_chain", file="sample_data.json", token=sd.token,
                           message=f"prev/next がバッチ内に存在しません: {ref}")

    # 2-f. 重複検出: scene / sample / sample_data / ego_pose は既存 DB と衝突したらエラー
    #      （calibrated_sensor / log は dedup してスキップするため対象外）
    for model, toks, fname in (
        (Scene,      scene_toks,  "scene.json"),
        (Sample,     sample_toks, "sample.json"),
        (SampleData, sd_toks,     "sample_data.json"),
        (EgoPose,    ep_toks,     "ego_pose.json"),
    ):
        dup = await repo.get_existing_tokens(model, list(toks))
        for t in sorted(dup):
            errors.add("duplicate", file=fname, token=t,
                       message="token が DB に既に存在します（インポート済み？）")

    if errors.has_errors:
        _raise_422(errors)

    # ── 3./4. 投入 & 集計 ────────────────────────────────────────────────────
    new_log_count = len([l for l in logs if l.token not in existing_log_toks])
    new_cs_count  = len([c for c in css if c.token not in existing_cs_toks])

    counts = {
        "scenes":            len(scenes),
        "samples":           len(samples),
        "sample_data":       len(sds),
        "ego_pose":          len(eps),
        "log":               new_log_count,
        "calibrated_sensor": new_cs_count,
    }
    added_scene_names = sorted(s.name for s in scenes)

    if dry_run:
        return SceneImportResult(
            dry_run=True, ok=True,
            imported_counts=counts,
            added_scene_names=added_scene_names,
        )

    def _rows(schemas: list, *, null_chain: bool = False) -> list[dict]:
        rows = []
        for s in schemas:
            row = s.model_dump()
            if null_chain:
                row["prev"] = None
                row["next"] = None
            row["is_user_created"] = True
            rows.append(row)
        return rows

    try:
        # 親 → 子の順に投入（logs → calibrated_sensors → ego_poses → scenes → samples → sample_data）
        counts["log"]               = await _upsert_ignore(db, Log, _rows(logs))
        counts["calibrated_sensor"] = await _upsert_ignore(db, CalibratedSensor, _rows(css))
        counts["ego_pose"]          = await _upsert_ignore(db, EgoPose, _rows(eps))
        counts["scenes"]            = await _upsert_ignore(db, Scene, _rows(scenes))
        # samples / sample_data: prev/next は自己参照 FK のため None で挿入 → UPDATE で補完
        counts["samples"]           = await _upsert_ignore(db, Sample, _rows(samples, null_chain=True))
        await _bulk_update(db, Sample, [
            {"token": s.token, "prev": s.prev, "next": s.next}
            for s in samples if s.prev or s.next
        ])
        counts["sample_data"]       = await _upsert_ignore(db, SampleData, _rows(sds, null_chain=True))
        await _bulk_update(db, SampleData, [
            {"token": s.token, "prev": s.prev, "next": s.next}
            for s in sds if s.prev or s.next
        ])
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("scene import failed (rolled back)")
        raise

    logger.info("scene import: %s", counts)
    return SceneImportResult(
        dry_run=False, ok=True,
        imported_counts=counts,
        added_scene_names=added_scene_names,
    )
