from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.scene import SceneConverter
from app.dependencies import get_db
from app.repositories.scene import SceneRepository
from app.schemas.common import PaginatedResponse
from app.schemas.scene import SceneResponse, SampleResponse
from app.schemas.scene_delete import SceneDeleteResult
from app.schemas.scene_import import SceneImportResult
from app.schemas.sensor import SampleEgoPoseResponse
from app.services.scene_delete_service import delete_scene as delete_scene_service
from app.services.scene_import_service import import_scenes_from_json

router = APIRouter(prefix="/scenes", tags=["scenes"])


@router.post("/import", response_model=SceneImportResult)
async def import_scenes(
    scenes_file:            UploadFile = File(...),
    samples_file:           UploadFile = File(...),
    sample_data_file:       UploadFile = File(...),
    ego_pose_file:          UploadFile = File(...),
    log_file:               UploadFile = File(...),
    calibrated_sensor_file: UploadFile = File(...),
    dry_run: bool = Form(False),
    db: AsyncSession = Depends(get_db),
):
    """nuScenes 形式の 6 JSON から scene 一式を追加する（1 リクエスト・1 トランザクション）.

    dry_run=True のときはバリデーションのみ実施し、投入予定件数を返す。
    """
    return await import_scenes_from_json(
        db,
        scenes_json=await scenes_file.read(),
        samples_json=await samples_file.read(),
        sample_data_json=await sample_data_file.read(),
        ego_pose_json=await ego_pose_file.read(),
        log_json=await log_file.read(),
        calibrated_sensor_json=await calibrated_sensor_file.read(),
        dry_run=dry_run,
    )


@router.get("", response_model=PaginatedResponse[SceneResponse])
async def list_scenes(
    log_token: str | None = Query(None, description="Log で絞り込む"),
    limit:     int        = Query(50, ge=1, le=500),
    offset:    int        = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    repo = SceneRepository(db)
    total, scenes = await repo.get_all(limit, offset, log_token)
    return PaginatedResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[SceneConverter.to_response(s) for s in scenes],
    )


@router.delete("/{token}", response_model=SceneDeleteResult)
async def delete_scene(token: str, db: AsyncSession = Depends(get_db)):
    """ユーザ追加 scene を依存レコードごと削除する（1 トランザクション）.

    - 404: scene が存在しない
    - 403: is_user_created=false（初回インポート scene は削除不可）
    """
    return await delete_scene_service(db, token)


@router.get("/{token}", response_model=SceneResponse)
async def get_scene(token: str, db: AsyncSession = Depends(get_db)):
    scene = await SceneRepository(db).get_by_token(token)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    return SceneConverter.to_response(scene)


@router.get("/{token}/samples", response_model=list[SampleResponse])
async def get_scene_samples(token: str, db: AsyncSession = Depends(get_db)):
    samples = await SceneRepository(db).get_samples_by_scene(token)
    return [SceneConverter.to_sample_response(s) for s in samples]


@router.get("/{token}/ego-poses", response_model=list[SampleEgoPoseResponse])
async def get_scene_ego_poses(token: str, db: AsyncSession = Depends(get_db)):
    """
    Get ego poses for all samples in the scene, sorted by timestamp.

    Each ego pose uses LIDAR_TOP if it exists, otherwise uses the oldest available ego_pose.
    """
    repo = SceneRepository(db)
    scene = await repo.get_by_token(token)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")
    sample_data_list = await repo.get_ego_poses_by_scene(token)
    result = [
        SampleEgoPoseResponse(
            sample_token=sd.sample_token,
            timestamp=sd.ego_pose.timestamp,
            translation=sd.ego_pose.translation,
            rotation=sd.ego_pose.rotation,
        )
        for sd in sample_data_list
    ]
    result.sort(key=lambda r: r.timestamp)
    return result
