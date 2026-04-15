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
from app.schemas.annotation import InstanceAnnotationResponse
from app.schemas.sensor import BestCameraResponse

router = APIRouter(prefix="/instances", tags=["instances"])


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

    best = max(cameras, key=lambda sd: _camera_score(ann.translation, sd))
    return BestCameraResponse(
        channel=best.calibrated_sensor.sensor.channel,
        sample_data_token=best.token,
    )
