"""DB → NuScenes 本体データセット JSON エクスポーター。

to_nusc_db.py の逆変換。DB のレコードを NuScenes v1.0-mini と同じ JSON 形式に書き出す。
各ファイルは JSON 配列として出力される（元の NuScenes データセットに準拠）。

ラウンドトリップ整合性:
  export_all() → import_all() と繰り返しても ON CONFLICT DO NOTHING により
  同じ DB 状態になることを意図している。
  ただし category.json の "index" フィールドは元データに存在するが DB に保存されていないため
  エクスポート時には含まれない（インポート側は extra='ignore' で無視するため問題なし）。
"""
import json
import logging
import os

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
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

_YIELD_PER = 1000


def _write_json(path: str, data: list) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, ensure_ascii=False)


def _opt(value: str | None) -> str:
    """DB の None → JSON の "" （OptionalToken の逆変換）。"""
    return value if value is not None else ""


# ── 各エンティティのエクスポート関数 ──────────────────────────────────────────

async def export_logs(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(Log).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "logfile": obj.logfile,
            "vehicle": obj.vehicle,
            "date_captured": obj.date_captured,
            "location": obj.location,
        })
    path = os.path.join(output_dir, version, "log.json")
    _write_json(path, rows)
    logger.info("exported %d logs", len(rows))


async def export_scenes(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(Scene).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "log_token": obj.log_token,
            "nbr_samples": obj.nbr_samples,
            "first_sample_token": obj.first_sample_token,
            "last_sample_token": obj.last_sample_token,
            "name": obj.name,
            "description": obj.description or "",
        })
    path = os.path.join(output_dir, version, "scene.json")
    _write_json(path, rows)
    logger.info("exported %d scenes", len(rows))


async def export_samples(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(Sample).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "timestamp": obj.timestamp,
            "prev": _opt(obj.prev),
            "next": _opt(obj.next),
            "scene_token": obj.scene_token,
        })
    path = os.path.join(output_dir, version, "sample.json")
    _write_json(path, rows)
    logger.info("exported %d samples", len(rows))


async def export_categories(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(Category).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "name": obj.name,
            "description": obj.description or "",
            # "index" は DB に保存されていないため省略
            # インポート側は extra='ignore' で無視するため再インポート可能
        })
    path = os.path.join(output_dir, version, "category.json")
    _write_json(path, rows)
    logger.info("exported %d categories", len(rows))


async def export_attributes(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(Attribute).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "name": obj.name,
            "description": obj.description or "",
        })
    path = os.path.join(output_dir, version, "attribute.json")
    _write_json(path, rows)
    logger.info("exported %d attributes", len(rows))


async def export_visibilities(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(Visibility).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "level": obj.level,
            "description": obj.description or "",
        })
    path = os.path.join(output_dir, version, "visibility.json")
    _write_json(path, rows)
    logger.info("exported %d visibilities", len(rows))


async def export_instances(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(Instance).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "category_token": obj.category_token,
            "nbr_annotations": obj.nbr_annotations,
            "first_annotation_token": _opt(obj.first_annotation_token),
            "last_annotation_token": _opt(obj.last_annotation_token),
        })
    path = os.path.join(output_dir, version, "instance.json")
    _write_json(path, rows)
    logger.info("exported %d instances", len(rows))


async def export_sample_annotations(output_dir: str, version: str, db: AsyncSession) -> None:
    # annotation_token → attribute_tokens のマップを事前構築
    stmt = select(
        annotation_attribute.c.annotation_token,
        annotation_attribute.c.attribute_token,
    )
    result = await db.execute(stmt)
    attr_map: dict[str, list[str]] = {}
    for ann_tok, attr_tok in result.all():
        attr_map.setdefault(ann_tok, []).append(attr_tok)

    rows = []
    async for obj in await db.stream(
        select(SampleAnnotation).execution_options(yield_per=_YIELD_PER)
    ):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "sample_token": obj.sample_token,
            "instance_token": obj.instance_token,
            "visibility_token": _opt(obj.visibility_token),
            "attribute_tokens": attr_map.get(obj.token, []),
            "translation": obj.translation,
            "size": obj.size,
            "rotation": obj.rotation,
            "prev": _opt(obj.prev),
            "next": _opt(obj.next),
            "num_lidar_pts": obj.num_lidar_pts,
            "num_radar_pts": obj.num_radar_pts,
        })
    path = os.path.join(output_dir, version, "sample_annotation.json")
    _write_json(path, rows)
    logger.info("exported %d sample_annotations", len(rows))


async def export_sensors(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(Sensor).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "channel": obj.channel,
            "modality": obj.modality,
        })
    path = os.path.join(output_dir, version, "sensor.json")
    _write_json(path, rows)
    logger.info("exported %d sensors", len(rows))


async def export_calibrated_sensors(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(
        select(CalibratedSensor).execution_options(yield_per=_YIELD_PER)
    ):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "sensor_token": obj.sensor_token,
            "translation": obj.translation,
            "rotation": obj.rotation,
            # None → [] : 非カメラセンサーは元データで [] として保存されていた
            "camera_intrinsic": obj.camera_intrinsic if obj.camera_intrinsic is not None else [],
        })
    path = os.path.join(output_dir, version, "calibrated_sensor.json")
    _write_json(path, rows)
    logger.info("exported %d calibrated_sensors", len(rows))


async def export_ego_poses(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(select(EgoPose).execution_options(yield_per=_YIELD_PER)):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "timestamp": obj.timestamp,
            "translation": obj.translation,
            "rotation": obj.rotation,
        })
    path = os.path.join(output_dir, version, "ego_pose.json")
    _write_json(path, rows)
    logger.info("exported %d ego_poses", len(rows))


async def export_sample_data(output_dir: str, version: str, db: AsyncSession) -> None:
    rows = []
    async for obj in await db.stream(
        select(SampleData).execution_options(yield_per=_YIELD_PER)
    ):
        obj = obj[0]
        rows.append({
            "token": obj.token,
            "sample_token": obj.sample_token,
            "ego_pose_token": obj.ego_pose_token,
            "calibrated_sensor_token": obj.calibrated_sensor_token,
            "timestamp": obj.timestamp,
            "fileformat": obj.fileformat,
            "is_key_frame": obj.is_key_frame,
            # None → 0 : 非カメラセンサーは元データで 0 として保存されていた
            "height": obj.height if obj.height is not None else 0,
            "width": obj.width if obj.width is not None else 0,
            "filename": obj.filename,
            "prev": _opt(obj.prev),
            "next": _opt(obj.next),
        })
    path = os.path.join(output_dir, version, "sample_data.json")
    _write_json(path, rows)
    logger.info("exported %d sample_data", len(rows))


# ── エントリーポイント ─────────────────────────────────────────────────────────

async def export_all(
    output_dir: str,
    version: str = "v1.0-mini",
    location: str | None = None,
) -> None:
    """DB の NuScenes データを JSON ファイルとして書き出す。

    Parameters
    ----------
    output_dir:
        書き出し先ルートディレクトリ。存在しない場合は自動作成される。
    version:
        バージョン文字列（例: "v1.0-mini"）。サブディレクトリ名になる。
    location:
        将来のフィルタ用（現状は未使用、全レコードをエクスポートする）。
    """
    async with AsyncSessionLocal() as db:
        await export_logs(output_dir, version, db)
        await export_scenes(output_dir, version, db)
        await export_samples(output_dir, version, db)
        await export_categories(output_dir, version, db)
        await export_attributes(output_dir, version, db)
        await export_visibilities(output_dir, version, db)
        await export_instances(output_dir, version, db)
        await export_sample_annotations(output_dir, version, db)
        await export_sensors(output_dir, version, db)
        await export_calibrated_sensors(output_dir, version, db)
        await export_ego_poses(output_dir, version, db)
        await export_sample_data(output_dir, version, db)
        logger.info("NuScenes export complete → %s/%s/", output_dir, version)
