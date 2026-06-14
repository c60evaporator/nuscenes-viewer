"""nuScenes 形式 JSON エクスポート用 builder 関数群.

各関数は対応する JSON ファイル 1 件分のレコードリストを返す.
scene_token を受け取る関数はそのシーン分のみを出力する. None の場合は全件.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.annotation import Attribute, Category, Instance, SampleAnnotation, Visibility
from app.models.annotation_edit import AnnotationEdit, InstanceEdit
from app.models.map import MapMeta
from app.models.scene import Log, Sample, Scene
from app.models.sensor import CalibratedSensor, EgoPose, SampleData, Sensor


# ── 内部ユーティリティ ──────────────────────────────────────────────────────────

async def _get_filtered_scenes(
    db: AsyncSession, scene_token: str | None
) -> list[Scene]:
    stmt = select(Scene)
    if scene_token is not None:
        stmt = stmt.where(Scene.token == scene_token)
    return list((await db.execute(stmt)).scalars().all())

# ── 静的データ（scene_token 依存なし） ────────────────────────────────────────

async def build_category_records(db: AsyncSession) -> list[dict]:
    """category.json: 全カテゴリ."""
    result = await db.execute(select(Category))
    return [
        {
            'token':       c.token,
            'name':        c.name,
            'description': c.description or '',
        }
        for c in result.scalars().all()
    ]


async def build_attribute_records(db: AsyncSession) -> list[dict]:
    """attribute.json: 全属性."""
    result = await db.execute(select(Attribute))
    return [
        {
            'token':       a.token,
            'name':        a.name,
            'description': a.description or '',
        }
        for a in result.scalars().all()
    ]


async def build_visibility_records(db: AsyncSession) -> list[dict]:
    """visibility.json: 全可視性レベル."""
    result = await db.execute(select(Visibility))
    return [
        {
            'token':       v.token,
            'level':       v.level,
            'description': v.description or '',
        }
        for v in result.scalars().all()
    ]


async def build_sensor_records(db: AsyncSession) -> list[dict]:
    """sensor.json: 全センサー."""
    result = await db.execute(select(Sensor))
    return [
        {
            'token':    s.token,
            'channel':  s.channel,
            'modality': s.modality,
        }
        for s in result.scalars().all()
    ]


# ── シーン関連データ ────────────────────────────────────────────────────────────

async def build_scene_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """scene.json."""
    scenes = await _get_filtered_scenes(db, scene_token)
    return [
        {
            'token':              s.token,
            'log_token':          s.log_token,
            'name':               s.name,
            'description':        s.description or '',
            'nbr_samples':        s.nbr_samples,
            'first_sample_token': s.first_sample_token,
            'last_sample_token':  s.last_sample_token,
        }
        for s in scenes
    ]


async def build_log_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """log.json. scene_token 指定時はそのシーンの log のみ."""
    if scene_token is None:
        result = await db.execute(select(Log))
        logs = list(result.scalars().all())
    else:
        scenes    = await _get_filtered_scenes(db, scene_token)
        log_tokens = {s.log_token for s in scenes}
        if not log_tokens:
            return []
        result = await db.execute(select(Log).where(Log.token.in_(log_tokens)))
        logs = list(result.scalars().all())

    return [
        {
            'token':         log.token,
            'logfile':       log.logfile,
            'vehicle':       log.vehicle,
            'date_captured': log.date_captured,
            'location':      log.location,
        }
        for log in logs
    ]


async def build_sample_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """sample.json."""
    stmt = select(Sample)
    if scene_token is not None:
        stmt = stmt.where(Sample.scene_token == scene_token)
    samples = list((await db.execute(stmt)).scalars().all())

    return [
        {
            'token':       s.token,
            'timestamp':   s.timestamp,
            'prev':        s.prev or '',
            'next':        s.next or '',
            'scene_token': s.scene_token,
        }
        for s in samples
    ]


async def build_sample_data_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """sample_data.json."""
    stmt = select(SampleData)
    if scene_token is not None:
        sample_tokens = list(
            (await db.execute(
                select(Sample.token).where(Sample.scene_token == scene_token)
            )).scalars().all()
        )
        if not sample_tokens:
            return []
        stmt = stmt.where(SampleData.sample_token.in_(sample_tokens))

    sample_data = list((await db.execute(stmt)).scalars().all())
    return [
        {
            'token':                   sd.token,
            'sample_token':            sd.sample_token,
            'ego_pose_token':          sd.ego_pose_token,
            'calibrated_sensor_token': sd.calibrated_sensor_token,
            'timestamp':               sd.timestamp,
            'fileformat':              sd.fileformat,
            'is_key_frame':            sd.is_key_frame,
            'height':                  sd.height if sd.height is not None else 0,
            'width':                   sd.width  if sd.width  is not None else 0,
            'filename':                sd.filename,
            'prev':                    sd.prev or '',
            'next':                    sd.next or '',
        }
        for sd in sample_data
    ]


async def build_calibrated_sensor_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """calibrated_sensor.json. scene_token 指定時はそのシーンで使われたもののみ."""
    if scene_token is None:
        result = await db.execute(select(CalibratedSensor))
        cs_list = list(result.scalars().all())
    else:
        # json型カラムはDISTINCTできないため、tokenのみをサブクエリで絞り込む
        token_subq = (
            select(CalibratedSensor.token)
            .join(SampleData, SampleData.calibrated_sensor_token == CalibratedSensor.token)
            .join(Sample,     SampleData.sample_token             == Sample.token)
            .where(Sample.scene_token == scene_token)
            .distinct()
        )
        stmt = select(CalibratedSensor).where(CalibratedSensor.token.in_(token_subq))
        cs_list = list((await db.execute(stmt)).scalars().all())

    return [
        {
            'token':            cs.token,
            'sensor_token':     cs.sensor_token,
            'translation':      cs.translation,
            'rotation':         cs.rotation,
            'camera_intrinsic': cs.camera_intrinsic if cs.camera_intrinsic is not None else [],
        }
        for cs in cs_list
    ]


async def build_ego_pose_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """ego_pose.json."""
    if scene_token is None:
        result = await db.execute(select(EgoPose))
        ep_list = list(result.scalars().all())
    else:
        # json型カラムはDISTINCTできないため、tokenのみをサブクエリで絞り込む
        token_subq = (
            select(EgoPose.token)
            .join(SampleData, SampleData.ego_pose_token == EgoPose.token)
            .join(Sample,     SampleData.sample_token   == Sample.token)
            .where(Sample.scene_token == scene_token)
            .distinct()
        )
        stmt = select(EgoPose).where(EgoPose.token.in_(token_subq))
        ep_list = list((await db.execute(stmt)).scalars().all())

    return [
        {
            'token':       ep.token,
            'timestamp':   ep.timestamp,
            'rotation':    ep.rotation,
            'translation': ep.translation,
        }
        for ep in ep_list
    ]


async def build_map_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """map.json.

    nuScenes 形式: {token, log_tokens, category='semantic_prior', filename=...}
    MapMeta から再構築し, location → log_tokens の逆引きを行う.
    """
    result = await db.execute(select(MapMeta))
    map_metas = list(result.scalars().all())

    log_stmt = select(Log)
    if scene_token is not None:
        scenes    = await _get_filtered_scenes(db, scene_token)
        log_token_set = {s.log_token for s in scenes}
        if not log_token_set:
            return []
        log_stmt = log_stmt.where(Log.token.in_(log_token_set))

    logs = list((await db.execute(log_stmt)).scalars().all())

    location_to_log_tokens: dict[str, list[str]] = {}
    for log in logs:
        location_to_log_tokens.setdefault(log.location, []).append(log.token)

    records: list[dict] = []
    for m in map_metas:
        log_toks = location_to_log_tokens.get(m.location, [])
        if scene_token is not None and not log_toks:
            continue
        filename = m.basemap_path or f'maps/{m.location}.png'
        records.append({
            'token':      m.token,
            'log_tokens': log_toks,
            'category':   'semantic_prior',
            'filename':   filename,
        })
    return records


# ── 動的データ（マージ反映） ────────────────────────────────────────────────────

async def build_instance_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """instance.json. バッチクエリで N+1 を回避.

    元 Instance テーブル + InstanceEdit テーブル両方を含む.
    
    nbr_annotations / first/last_annotation_token は全 annotation を 1 クエリで取得し,
    Python 内で instance ごとに集計する.
    
    scene_token 指定時はそのシーンに annotation がある instance のみ出力.
    """
    # 1. scene_token 指定時, 対象 sample_token の集合を取得
    sample_tokens: set[str] | None = None
    if scene_token is not None:
        sample_stmt = select(Sample.token).where(Sample.scene_token == scene_token)
        sample_tokens = set(
            (await db.execute(sample_stmt)).scalars().all()
        )
        if not sample_tokens:
            return []

    # 2. 全 SampleAnnotation を 1 クエリで取得 (instance_token, token, timestamp)
    base_stmt = (
        select(
            SampleAnnotation.token,
            SampleAnnotation.instance_token,
            Sample.timestamp,
        )
        .join(Sample, Sample.token == SampleAnnotation.sample_token)
    )
    if sample_tokens is not None:
        base_stmt = base_stmt.where(SampleAnnotation.sample_token.in_(sample_tokens))
    base_rows = list((await db.execute(base_stmt)).all())

    # 3. 全 AnnotationEdit を 1 クエリで取得
    edits_result = await db.execute(select(AnnotationEdit))
    edits = list(edits_result.scalars().all())

    # 4. delete された base_token の集合
    delete_base_tokens = {
        e.base_token for e in edits
        if e.edit_type == 'delete' and e.base_token
    }

    # 5. add edit の sample timestamp をバッチで取得
    add_sample_token_list = [
        e.sample_token for e in edits
        if e.edit_type == 'add' and e.sample_token is not None
    ]
    sample_ts_map: dict[str, int] = {}
    if add_sample_token_list:
        ts_stmt = select(Sample.token, Sample.timestamp).where(
            Sample.token.in_(add_sample_token_list)
        )
        sample_ts_map = {
            row[0]: row[1] for row in (await db.execute(ts_stmt)).all()
        }

    # 6. instance_token → [(timestamp, ann_token), ...] を構築
    inst_ann_map: dict[str, list[tuple[int, str]]] = {}

    # 6a. 元 annotation (delete されてないもの)
    for ann_token, inst_tok, ts in base_rows:
        if ann_token in delete_base_tokens:
            continue
        inst_ann_map.setdefault(inst_tok, []).append((ts, ann_token))

    # 6b. add edit
    for e in edits:
        if e.edit_type != 'add' or e.instance_token is None or e.sample_token is None:
            continue
        # scene 絞り込み
        if sample_tokens is not None and e.sample_token not in sample_tokens:
            continue
        ts = sample_ts_map.get(e.sample_token)
        if ts is None:
            continue
        inst_ann_map.setdefault(e.instance_token, []).append((ts, e.token))

    # 7. 全 Instance + InstanceEdit を取得 (token, category_token のみ)
    inst_result = await db.execute(
        select(Instance.token, Instance.category_token)
    )
    instances: list[tuple[str, str]] = list(inst_result.all())
    ie_result = await db.execute(
        select(InstanceEdit.token, InstanceEdit.category_token)
    )
    instances += list(ie_result.all())

    # 8. レコード組み立て
    records: list[dict] = []
    for inst_token, category_token in instances:
        ann_list = inst_ann_map.get(inst_token, [])
        if not ann_list:
            continue  # この instance には annotation がない (scene 外, または完全孤立)
        ann_list.sort(key=lambda x: x[0])   # timestamp 昇順
        records.append({
            'token':                  inst_token,
            'category_token':         category_token,
            'nbr_annotations':        len(ann_list),
            'first_annotation_token': ann_list[0][1],
            'last_annotation_token':  ann_list[-1][1],
        })
    return records


async def build_sample_annotation_records(
    db: AsyncSession, scene_token: str | None
) -> list[dict]:
    """sample_annotation.json.

    AnnotationRepository.get_by_sample を使いマージ済み（modify/add/delete 反映）で取得.
    """
    from app.repositories.annotation import AnnotationRepository

    stmt = select(Sample)
    if scene_token is not None:
        stmt = stmt.where(Sample.scene_token == scene_token)
    samples = list((await db.execute(stmt)).scalars().all())

    repo    = AnnotationRepository(db)
    records: list[dict] = []
    for sample in samples:
        for ann in await repo.get_by_sample(sample.token):
            records.append({
                'token':            ann.token,
                'sample_token':     ann.sample_token,
                'instance_token':   ann.instance_token,
                'visibility_token': ann.visibility_token or '',
                'attribute_tokens': [a.token for a in (ann.attributes or [])],
                'translation':      ann.translation,
                'size':             ann.size,
                'rotation':         ann.rotation,
                'prev':             ann.prev or '',
                'next':             ann.next or '',
                'num_lidar_pts':    ann.num_lidar_pts,
                'num_radar_pts':    ann.num_radar_pts,
            })
    return records
