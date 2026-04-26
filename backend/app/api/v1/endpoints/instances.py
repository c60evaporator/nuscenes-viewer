import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.annotation import AnnotationConverter
from app.dependencies import get_db
from app.models.annotation import Instance
from app.models.sensor import SampleData
from app.repositories.annotation import AnnotationRepository
from app.repositories.sensor import SensorRepository
from app.schemas.annotation import InstanceAnnotationResponse, InstanceResponse
from app.schemas.common import PaginatedResponse
from app.schemas.sensor import BestCameraResponse

router = APIRouter(prefix="/instances", tags=["instances"])


# ── GET /instances ────────────────────────────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[InstanceResponse])
async def list_instances(
    scene_token:   str | None = Query(None, description="SceneでInstanceを絞り込む"),
    category_name: str | None = Query(None, description="Category名で絞り込む（部分一致）"),
    limit:         int        = Query(50, ge=1, le=500),
    offset:        int        = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    repo = AnnotationRepository(db)
    total, instances = await repo.get_all_instances(
        limit, offset, scene_token, category_name
    )
    return PaginatedResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[AnnotationConverter.to_instance_response(i) for i in instances],
    )


# ── GET /instances/{token} ────────────────────────────────────────────────────

@router.get("/{token}", response_model=InstanceResponse)
async def get_instance(token: str, db: AsyncSession = Depends(get_db)):
    inst = await AnnotationRepository(db).get_instance_by_token(token)
    if inst is None:
        raise HTTPException(status_code=404, detail="Instance not found")
    return AnnotationConverter.to_instance_response(inst)


# ── helpers ───────────────────────────────────────────────────────────────────

def _quat_to_rot(q: list[float]) -> np.ndarray:
    """[w, x, y, z] → 3×3 回転行列"""
    w, x, y, z = q
    return np.array([
        [1 - 2*(y*y + z*z),  2*(x*y - z*w),   2*(x*z + y*w)],
        [2*(x*y + z*w),      1 - 2*(x*x + z*z), 2*(y*z - x*w)],
        [2*(x*z - y*w),      2*(y*z + x*w),   1 - 2*(x*x + y*y)],
    ])


def _camera_score(ann_global: list[float], sd: SampleData) -> float:
    """annotation の global 座標がカメラ光軸方向にある度合（cos θ）を返す。
    正値が大きいほど正面に写っている。背面の場合は負値。
    """
    p = np.array(ann_global, dtype=np.float64)

    R_ego = _quat_to_rot(sd.ego_pose.rotation)
    p_ego = R_ego.T @ (p - np.array(sd.ego_pose.translation, dtype=np.float64))

    R_cs = _quat_to_rot(sd.calibrated_sensor.rotation)
    p_cam = R_cs.T @ (p_ego - np.array(sd.calibrated_sensor.translation, dtype=np.float64))

    norm = float(np.linalg.norm(p_cam))
    return float(p_cam[2] / norm) if norm > 1e-6 else -1.0


# ── GET /instances/{token}/annotations ───────────────────────────────────────

@router.get("/{token}/annotations", response_model=list[InstanceAnnotationResponse])
async def get_instance_annotations(token: str, db: AsyncSession = Depends(get_db)):
    inst = (await db.execute(select(Instance).where(Instance.token == token))).scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=404, detail="Instance not found")
    annotations = await AnnotationRepository(db).get_by_instance(token)
    return [
        InstanceAnnotationResponse(
            **AnnotationConverter.to_response(ann).model_dump(),
            timestamp=ann.sample.timestamp,
        )
        for ann in annotations
    ]


# ── GET /instances/{token}/best-camera ───────────────────────────────────────

@router.get("/{token}/best-camera", response_model=BestCameraResponse)
async def get_instance_best_camera(
    token: str,
    sample_token: str = Query(..., description="対象サンプルのトークン"),
    rank: int = Query(1, ge=1, description="取得するカメラの順位（1=最良、2=2番目など）"),
    db: AsyncSession = Depends(get_db),
):
    ann = await AnnotationRepository(db).get_by_instance_and_sample(token, sample_token)
    if not ann:
        raise HTTPException(
            status_code=404,
            detail="Annotation not found for this instance/sample combination",
        )

    cameras = await SensorRepository(db).get_camera_sample_data_by_sample(sample_token)
    if not cameras:
        raise HTTPException(status_code=404, detail="No camera data found for this sample")

    sorted_cameras = sorted(cameras, key=lambda sd: _camera_score(ann.translation, sd), reverse=True)
    if rank > len(sorted_cameras):
        raise HTTPException(status_code=404, detail=f"Camera rank {rank} not available (only {len(sorted_cameras)} cameras)")

    selected = sorted_cameras[rank - 1]
    return BestCameraResponse(
        channel=selected.calibrated_sensor.sensor.channel,
        sample_data_token=selected.token,
    )
