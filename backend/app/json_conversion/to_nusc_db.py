import json
import logging
import os
import time

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.json_conversion.schemas_nuscenes import (
    Attribute as AttributeS,
    CalibratedSensor as CalibratedSensorS,
    Category as CategoryS,
    EgoPose as EgoPoseS,
    Instance as InstanceS,
    Log as LogS,
    SampleAnnotation as SampleAnnotationS,
    Sample as SampleS,
    SampleData as SampleDataS,
    Scene as SceneS,
    Sensor as SensorS,
    Visibility as VisibilityS,
)
from app.models.annotation import (
    Attribute,
    Category,
    Instance,
    SampleAnnotation,
    Visibility,
    annotation_attribute,
)
from app.models.scene import Log, Sample, Scene
from app.models.sensor import CalibratedSensor, EgoPose, SampleData, Sensor

logger = logging.getLogger(__name__)


# ── ヘルパー ──────────────────────────────────────────────────────────────────

def _load(data_root: str, version: str, filename: str) -> list[dict]:
    path = os.path.join(data_root, version, filename)
    with open(path) as f:
        return json.load(f)


_ASYNCPG_MAX_PARAMS = 32767


async def _bulk_update(
    db: AsyncSession,
    model,
    rows: list[dict],
    chunk_size: int = 5000,
    label: str = "",
) -> int:
    """ORM Bulk UPDATE by Primary Key（token PK で更新）。

    rows は {"token": ..., field1: ..., field2: ...} の辞書リスト。
    update() に WHERE/VALUES を指定せず rows に PK を含めることで
    SQLAlchemy が各行を executemany で処理する。
    chunk_size ごとにバッチ実行し、進捗を logger.info で報告する。
    """
    if not rows:
        return 0
    stmt = update(model).execution_options(synchronize_session=None)
    total = len(rows)
    n_chunks = (total + chunk_size - 1) // chunk_size
    for idx, i in enumerate(range(0, total, chunk_size)):
        await db.execute(stmt, rows[i : i + chunk_size])
        if label and (idx % max(1, n_chunks // 10) == 0 or idx == n_chunks - 1):
            pct = min(100, (i + chunk_size) * 100 // total)
            logger.info("%s: updating refs... %d/%d (%d%%)", label, min(i + chunk_size, total), total, pct)
    return total


async def _upsert_ignore(db: AsyncSession, model, rows: list[dict]) -> int:
    """bulk INSERT ... ON CONFLICT (token) DO NOTHING。挿入件数を返す。

    asyncpg の上限（32767パラメータ）を超えないようチャンク単位で投入する。
    """
    if not rows:
        return 0
    n_cols = len(rows[0])
    chunk_size = max(1, _ASYNCPG_MAX_PARAMS // n_cols)
    total = 0
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        stmt = pg_insert(model).values(chunk).on_conflict_do_nothing(index_elements=["token"])
        result = await db.execute(stmt)
        total += result.rowcount
    return total


# ── エンティティ別インポート関数 ──────────────────────────────────────────────

async def import_logs(data_root: str, version: str, db: AsyncSession) -> None:
    t0 = time.perf_counter()
    schemas = [LogS.model_validate(r) for r in _load(data_root, version, "log.json")]
    n = await _upsert_ignore(db, Log, [s.model_dump() for s in schemas])
    logger.info("logs: %d inserted (%.1fs)", n, time.perf_counter() - t0)


async def import_scenes(data_root: str, version: str, db: AsyncSession) -> None:
    t0 = time.perf_counter()
    schemas = [SceneS.model_validate(r) for r in _load(data_root, version, "scene.json")]
    n = await _upsert_ignore(db, Scene, [s.model_dump() for s in schemas])
    logger.info("scenes: %d inserted (%.1fs)", n, time.perf_counter() - t0)


async def import_samples(data_root: str, version: str, db: AsyncSession) -> None:
    """Sample は prev/next が自己参照FK。

    チャンク挿入時の FK 違反を避けるため、まず prev=next=None で全行挿入し、
    その後 bulk UPDATE で prev/next を補完する。
    """
    t0 = time.perf_counter()
    schemas = [SampleS.model_validate(r) for r in _load(data_root, version, "sample.json")]
    rows_no_refs = [
        {k: v for k, v in s.model_dump().items() if k not in ("prev", "next")}
        | {"prev": None, "next": None}
        for s in schemas
    ]
    n = await _upsert_ignore(db, Sample, rows_no_refs)
    logger.info("samples: %d inserted (%.1fs)", n, time.perf_counter() - t0)

    update_rows = [{"token": s.token, "prev": s.prev, "next": s.next} for s in schemas if s.prev or s.next]
    await _bulk_update(db, Sample, update_rows, label="samples")
    logger.info("samples: prev/next refs updated (%d records, %.1fs)", len(update_rows), time.perf_counter() - t0)


async def import_sensors(data_root: str, version: str, db: AsyncSession) -> None:
    t0 = time.perf_counter()
    schemas = [SensorS.model_validate(r) for r in _load(data_root, version, "sensor.json")]
    n = await _upsert_ignore(db, Sensor, [s.model_dump() for s in schemas])
    logger.info("sensors: %d inserted (%.1fs)", n, time.perf_counter() - t0)


async def import_calibrated_sensors(data_root: str, version: str, db: AsyncSession) -> None:
    t0 = time.perf_counter()
    schemas = [CalibratedSensorS.model_validate(r) for r in _load(data_root, version, "calibrated_sensor.json")]
    n = await _upsert_ignore(db, CalibratedSensor, [s.model_dump() for s in schemas])
    logger.info("calibrated_sensors: %d inserted (%.1fs)", n, time.perf_counter() - t0)


async def import_ego_poses(data_root: str, version: str, db: AsyncSession) -> None:
    t0 = time.perf_counter()
    logger.info("ego_poses: loading %s ...", os.path.join("ego_pose.json"))
    schemas = [EgoPoseS.model_validate(r) for r in _load(data_root, version, "ego_pose.json")]
    logger.info("ego_poses: %d records loaded, inserting...", len(schemas))
    n = await _upsert_ignore(db, EgoPose, [s.model_dump() for s in schemas])
    logger.info("ego_poses: %d inserted (%.1fs)", n, time.perf_counter() - t0)


async def import_sample_data(data_root: str, version: str, db: AsyncSession) -> None:
    """SampleData は prev/next が自己参照FK。
    チャンク挿入時の FK 違反を避けるため、まず prev=next=None で全行挿入し、
    その後 bulk UPDATE で prev/next を補完する。
    """
    t0 = time.perf_counter()
    logger.info("sample_data: loading sample_data.json ...")
    schemas = [SampleDataS.model_validate(r) for r in _load(data_root, version, "sample_data.json")]
    logger.info("sample_data: %d records loaded, inserting...", len(schemas))
    rows_no_refs = [
        {k: v for k, v in s.model_dump().items() if k not in ("prev", "next")}
        | {"prev": None, "next": None}
        for s in schemas
    ]
    n = await _upsert_ignore(db, SampleData, rows_no_refs)
    logger.info("sample_data: %d inserted (%.1fs)", n, time.perf_counter() - t0)

    update_rows = [{"token": s.token, "prev": s.prev, "next": s.next} for s in schemas if s.prev or s.next]
    await _bulk_update(db, SampleData, update_rows, label="sample_data")
    logger.info("sample_data: prev/next refs updated (%d records, %.1fs)", len(update_rows), time.perf_counter() - t0)


async def import_categories(data_root: str, version: str, db: AsyncSession) -> None:
    t0 = time.perf_counter()
    schemas = [CategoryS.model_validate(r) for r in _load(data_root, version, "category.json")]
    n = await _upsert_ignore(db, Category, [s.model_dump() for s in schemas])
    logger.info("categories: %d inserted (%.1fs)", n, time.perf_counter() - t0)


async def import_attributes(data_root: str, version: str, db: AsyncSession) -> None:
    t0 = time.perf_counter()
    schemas = [AttributeS.model_validate(r) for r in _load(data_root, version, "attribute.json")]
    n = await _upsert_ignore(db, Attribute, [s.model_dump() for s in schemas])
    logger.info("attributes: %d inserted (%.1fs)", n, time.perf_counter() - t0)


async def import_visibilities(data_root: str, version: str, db: AsyncSession) -> None:
    t0 = time.perf_counter()
    schemas = [VisibilityS.model_validate(r) for r in _load(data_root, version, "visibility.json")]
    n = await _upsert_ignore(db, Visibility, [s.model_dump() for s in schemas])
    logger.info("visibilities: %d inserted (%.1fs)", n, time.perf_counter() - t0)


async def import_instances(
    data_root: str, version: str, db: AsyncSession
) -> list[InstanceS]:
    """Instance を first/last_annotation_token=None で挿入し、スキーマを返す。

    Instance.first_annotation_token / last_annotation_token は
    sample_annotations.token への循環FK（use_alter=True）のため、
    sample_annotation 挿入後に _update_instance_refs() で補完する。
    """
    t0 = time.perf_counter()
    schemas = [InstanceS.model_validate(r) for r in _load(data_root, version, "instance.json")]
    rows = [
        {
            "token": s.token,
            "category_token": s.category_token,
            "nbr_annotations": s.nbr_annotations,
            "first_annotation_token": None,
            "last_annotation_token": None,
        }
        for s in schemas
    ]
    n = await _upsert_ignore(db, Instance, rows)
    logger.info("instances: %d inserted (%.1fs)", n, time.perf_counter() - t0)
    return schemas


async def import_sample_annotations(data_root: str, version: str, db: AsyncSession) -> None:
    """SampleAnnotation は prev/next が自己参照FK。
    チャンク挿入時の FK 違反を避けるため、まず prev=next=None で全行挿入し、
    その後 bulk UPDATE で prev/next を補完する。
    """
    t0 = time.perf_counter()
    logger.info("sample_annotations: loading sample_annotation.json ...")
    schemas = [SampleAnnotationS.model_validate(r) for r in _load(data_root, version, "sample_annotation.json")]
    logger.info("sample_annotations: %d records loaded, inserting...", len(schemas))

    ann_rows = [
        {k: v for k, v in s.model_dump().items() if k not in ("attribute_tokens", "prev", "next")}
        | {"prev": None, "next": None}
        for s in schemas
    ]
    n = await _upsert_ignore(db, SampleAnnotation, ann_rows)
    logger.info("sample_annotations: %d inserted (%.1fs)", n, time.perf_counter() - t0)

    update_rows = [{"token": s.token, "prev": s.prev, "next": s.next} for s in schemas if s.prev or s.next]
    await _bulk_update(db, SampleAnnotation, update_rows, label="sample_annotations")
    logger.info("sample_annotations: prev/next refs updated (%d records, %.1fs)", len(update_rows), time.perf_counter() - t0)

    m2m_rows = [
        {"annotation_token": s.token, "attribute_token": attr}
        for s in schemas
        for attr in s.attribute_tokens
    ]
    if m2m_rows:
        m2m_chunk = max(1, _ASYNCPG_MAX_PARAMS // 2)
        for i in range(0, len(m2m_rows), m2m_chunk):
            stmt = pg_insert(annotation_attribute).values(m2m_rows[i : i + m2m_chunk]).on_conflict_do_nothing()
            await db.execute(stmt)
        logger.info("annotation_attributes: %d rows processed (%.1fs)", len(m2m_rows), time.perf_counter() - t0)


async def _update_instance_refs(
    instance_schemas: list[InstanceS], db: AsyncSession
) -> None:
    """sample_annotation 挿入後に Instance の循環FK フィールドを補完する。"""
    t0 = time.perf_counter()
    rows = [
        {
            "token": s.token,
            "first_annotation_token": s.first_annotation_token,
            "last_annotation_token": s.last_annotation_token,
        }
        for s in instance_schemas
    ]
    await _bulk_update(db, Instance, rows, label="instances")
    logger.info("instances: annotation refs updated (%d records, %.1fs)", len(instance_schemas), time.perf_counter() - t0)


# ── エントリーポイント ─────────────────────────────────────────────────────────

async def import_all(
    data_root: str = settings.NUSCENES_DATAROOT,
    version: str = "v1.0-mini",
) -> None:
    """NuScenes JSON データを DB に一括投入する。

    FK 制約の順序に従って投入し、既存レコードはスキップする（冪等）。
    """
    t_total = time.perf_counter()
    logger.info("=== NuScenes import start (version=%s) ===", version)
    async with AsyncSessionLocal() as db:
        try:
            await import_logs(data_root, version, db)
            await import_scenes(data_root, version, db)
            await import_samples(data_root, version, db)
            await import_sensors(data_root, version, db)
            await import_calibrated_sensors(data_root, version, db)
            await import_ego_poses(data_root, version, db)
            await import_sample_data(data_root, version, db)
            await import_categories(data_root, version, db)
            await import_attributes(data_root, version, db)
            await import_visibilities(data_root, version, db)
            instance_schemas = await import_instances(data_root, version, db)
            await import_sample_annotations(data_root, version, db)
            await _update_instance_refs(instance_schemas, db)
            await db.commit()
            logger.info("=== NuScenes import complete (version=%s, total=%.1fs) ===", version, time.perf_counter() - t_total)
        except Exception:
            await db.rollback()
            logger.exception("NuScenes import failed")
            raise
