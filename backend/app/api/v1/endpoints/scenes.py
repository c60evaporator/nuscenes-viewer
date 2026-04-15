from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.scene import SceneConverter
from app.dependencies import get_db
from app.repositories.scene import SceneRepository
from app.schemas.common import PaginatedResponse
from app.schemas.scene import SceneResponse, SampleResponse
from app.schemas.sensor import SampleEgoPoseResponse

router = APIRouter(prefix="/scenes", tags=["scenes"])


@router.get("/", response_model=PaginatedResponse[SceneResponse])
async def list_scenes(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    repo = SceneRepository(db)
    total, scenes = await repo.get_all(limit, offset)
    return PaginatedResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[SceneConverter.to_response(s) for s in scenes],
    )


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
