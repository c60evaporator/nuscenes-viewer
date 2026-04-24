import json
import logging
import os

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
    schemas = [LogS.model_validate(r) for r in _load(data_root, version, "log.json")]
    n = await _upsert_ignore(db, Log, [s.model_dump() for s in schemas])
    logger.info("logs: %d inserted", n)


async def import_scenes(data_root: str, version: str, db: AsyncSession) -> None:
    schemas = [SceneS.model_validate(r) for r in _load(data_root, version, "scene.json")]
    n = await _upsert_ignore(db, Scene, [s.model_dump() for s in schemas])
    logger.info("scenes: %d inserted", n)


async def import_samples(data_root: str, version: str, db: AsyncSession) -> None:
    """Sample は prev/next が自己参照FK。

    チャンク挿入時の FK 違反を避けるため、まず prev=next=None で全行挿入し、
    その後 UPDATE で prev/next を補完する。
    """
    schemas = [SampleS.model_validate(r) for r in _load(data_root, version, "sample.json")]
    rows_no_refs = [
        {k: v for k, v in s.model_dump().items() if k not in ("prev", "next")}
        | {"prev": None, "next": None}
        for s in schemas
    ]
    n = await _upsert_ignore(db, Sample, rows_no_refs)
    logger.info("samples: %d inserted", n)

    update_rows = [(s.token, s.prev, s.next) for s in schemas if s.prev or s.next]
    chunk_size = 500
    for i in range(0, len(update_rows), chunk_size):
        for token, prev, next_ in update_rows[i : i + chunk_size]:
            await db.execute(
                update(Sample)
                .where(Sample.token == token)
                .values(prev=prev, next=next_)
            )
    logger.info("samples: prev/next refs updated (%d records)", len(update_rows))


async def import_sensors(data_root: str, version: str, db: AsyncSession) -> None:
    schemas = [SensorS.model_validate(r) for r in _load(data_root, version, "sensor.json")]
    n = await _upsert_ignore(db, Sensor, [s.model_dump() for s in schemas])
    logger.info("sensors: %d inserted", n)


async def import_calibrated_sensors(data_root: str, version: str, db: AsyncSession) -> None:
    schemas = [CalibratedSensorS.model_validate(r) for r in _load(data_root, version, "calibrated_sensor.json")]
    n = await _upsert_ignore(db, CalibratedSensor, [s.model_dump() for s in schemas])
    logger.info("calibrated_sensors: %d inserted", n)


async def import_ego_poses(data_root: str, version: str, db: AsyncSession) -> None:
    schemas = [EgoPoseS.model_validate(r) for r in _load(data_root, version, "ego_pose.json")]
    n = await _upsert_ignore(db, EgoPose, [s.model_dump() for s in schemas])
    logger.info("ego_poses: %d inserted", n)


async def import_sample_data(data_root: str, version: str, db: AsyncSession) -> None:
    """SampleData は prev/next が自己参照FK。
    チャンク挿入時の FK 違反を避けるため、まず prev=next=None で全行挿入し、
    その後 UPDATE で prev/next を補完する。
    """
    schemas = [SampleDataS.model_validate(r) for r in _load(data_root, version, "sample_data.json")]
    rows_no_refs = [
        {k: v for k, v in s.model_dump().items() if k not in ("prev", "next")}
        | {"prev": None, "next": None}
        for s in schemas
    ]
    n = await _upsert_ignore(db, SampleData, rows_no_refs)
    logger.info("sample_data: %d inserted", n)

    # prev/next を補完（None でない場合のみ UPDATE）
    update_rows = [(s.token, s.prev, s.next) for s in schemas if s.prev or s.next]
    chunk_size = 500
    for i in range(0, len(update_rows), chunk_size):
        for token, prev, next_ in update_rows[i : i + chunk_size]:
            await db.execute(
                update(SampleData)
                .where(SampleData.token == token)
                .values(prev=prev, next=next_)
            )
    logger.info("sample_data: prev/next refs updated (%d records)", len(update_rows))


async def import_categories(data_root: str, version: str, db: AsyncSession) -> None:
    schemas = [CategoryS.model_validate(r) for r in _load(data_root, version, "category.json")]
    n = await _upsert_ignore(db, Category, [s.model_dump() for s in schemas])
    logger.info("categories: %d inserted", n)


async def import_attributes(data_root: str, version: str, db: AsyncSession) -> None:
    schemas = [AttributeS.model_validate(r) for r in _load(data_root, version, "attribute.json")]
    n = await _upsert_ignore(db, Attribute, [s.model_dump() for s in schemas])
    logger.info("attributes: %d inserted", n)


async def import_visibilities(data_root: str, version: str, db: AsyncSession) -> None:
    schemas = [VisibilityS.model_validate(r) for r in _load(data_root, version, "visibility.json")]
    n = await _upsert_ignore(db, Visibility, [s.model_dump() for s in schemas])
    logger.info("visibilities: %d inserted", n)


async def import_instances(
    data_root: str, version: str, db: AsyncSession
) -> list[InstanceS]:
    """Instance を first/last_annotation_token=None で挿入し、スキーマを返す。

    Instance.first_annotation_token / last_annotation_token は
    sample_annotations.token への循環FK（use_alter=True）のため、
    sample_annotation 挿入後に _update_instance_refs() で補完する。
    """
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
    logger.info("instances: %d inserted", n)
    return schemas


async def import_sample_annotations(data_root: str, version: str, db: AsyncSession) -> None:
    """SampleAnnotation は prev/next が自己参照FK。
    チャンク挿入時の FK 違反を避けるため、まず prev=next=None で全行挿入し、
    その後 UPDATE で prev/next を補完する。
    """
    schemas = [SampleAnnotationS.model_validate(r) for r in _load(data_root, version, "sample_annotation.json")]

    # アノテーション本体（attribute_tokens・prev・next は別途処理）
    ann_rows = [
        {k: v for k, v in s.model_dump().items() if k not in ("attribute_tokens", "prev", "next")}
        | {"prev": None, "next": None}
        for s in schemas
    ]
    n = await _upsert_ignore(db, SampleAnnotation, ann_rows)
    logger.info("sample_annotations: %d inserted", n)

    # prev/next を補完
    update_rows = [(s.token, s.prev, s.next) for s in schemas if s.prev or s.next]
    chunk_size = 500
    for i in range(0, len(update_rows), chunk_size):
        for token, prev, next_ in update_rows[i : i + chunk_size]:
            await db.execute(
                update(SampleAnnotation)
                .where(SampleAnnotation.token == token)
                .values(prev=prev, next=next_)
            )
    logger.info("sample_annotations: prev/next refs updated (%d records)", len(update_rows))

    # annotation_attribute 中間テーブル（複合PK で ON CONFLICT DO NOTHING）
    m2m_rows = [
        {"annotation_token": s.token, "attribute_token": attr}
        for s in schemas
        for attr in s.attribute_tokens
    ]
    if m2m_rows:
        chunk_size = max(1, _ASYNCPG_MAX_PARAMS // 2)  # 2 cols: annotation_token, attribute_token
        for i in range(0, len(m2m_rows), chunk_size):
            chunk = m2m_rows[i : i + chunk_size]
            stmt = pg_insert(annotation_attribute).values(chunk).on_conflict_do_nothing()
            await db.execute(stmt)
        logger.info("annotation_attributes: %d rows processed", len(m2m_rows))


async def _update_instance_refs(
    instance_schemas: list[InstanceS], db: AsyncSession
) -> None:
    """sample_annotation 挿入後に Instance の循環FK フィールドを補完する。"""
    for s in instance_schemas:
        await db.execute(
            update(Instance)
            .where(Instance.token == s.token)
            .values(
                first_annotation_token=s.first_annotation_token,
                last_annotation_token=s.last_annotation_token,
            )
        )
    logger.info("instances: annotation refs updated (%d records)", len(instance_schemas))


# ── エントリーポイント ─────────────────────────────────────────────────────────

async def import_all(
    data_root: str = settings.NUSCENES_DATAROOT,
    version: str = "v1.0-mini",
) -> None:
    """NuScenes JSON データを DB に一括投入する。

    FK 制約の順序に従って投入し、既存レコードはスキップする（冪等）。
    """
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
            logger.info("NuScenes import complete (version=%s)", version)
        except Exception:
            await db.rollback()
            logger.exception("NuScenes import failed")
            raise
