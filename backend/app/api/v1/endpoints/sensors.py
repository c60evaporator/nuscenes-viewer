from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.sensor import SensorConverter
from app.core.config import settings
from app.dependencies import get_db
from app.repositories.sensor import SensorRepository
from app.schemas.common import PaginatedResponse
from app.schemas.sensor import (
    CalibratedSensorResponse,
    EgoPoseResponse,
    SensorResponse,
)

_IMAGE_FORMATS = {"jpg", "jpeg", "png"}

router = APIRouter(tags=["sensors"])


# ── Sensor ────────────────────────────────────────────────────────────────────

@router.get("/sensors", response_model=PaginatedResponse[SensorResponse])
async def list_sensors(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    total, sensors = await SensorRepository(db).get_all_sensors(limit, offset)
    return PaginatedResponse(
        total=total, limit=limit, offset=offset,
        items=[SensorConverter.to_sensor_response(s) for s in sensors],
    )


@router.get("/sensors/{token}", response_model=SensorResponse)
async def get_sensor(token: str, db: AsyncSession = Depends(get_db)):
    sensor = await SensorRepository(db).get_sensor_by_token(token)
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return SensorConverter.to_sensor_response(sensor)


# ── CalibratedSensor ──────────────────────────────────────────────────────────

@router.get(
    "/calibrated-sensors",
    response_model=PaginatedResponse[CalibratedSensorResponse],
)
async def list_calibrated_sensors(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    total, css = await SensorRepository(db).get_all_calibrated_sensors(limit, offset)
    return PaginatedResponse(
        total=total, limit=limit, offset=offset,
        items=[SensorConverter.to_calibrated_sensor_response(cs) for cs in css],
    )


@router.get("/calibrated-sensors/{token}", response_model=CalibratedSensorResponse)
async def get_calibrated_sensor(token: str, db: AsyncSession = Depends(get_db)):
    cs = await SensorRepository(db).get_calibrated_sensor_by_token(token)
    if not cs:
        raise HTTPException(status_code=404, detail="CalibratedSensor not found")
    return SensorConverter.to_calibrated_sensor_response(cs)


# ── EgoPose ───────────────────────────────────────────────────────────────────

@router.get("/ego-poses", response_model=PaginatedResponse[EgoPoseResponse])
async def list_ego_poses(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    total, poses = await SensorRepository(db).get_all_ego_poses(limit, offset)
    return PaginatedResponse(
        total=total, limit=limit, offset=offset,
        items=[SensorConverter.to_ego_pose_response(p) for p in poses],
    )


@router.get("/ego-poses/{token}", response_model=EgoPoseResponse)
async def get_ego_pose(token: str, db: AsyncSession = Depends(get_db)):
    pose = await SensorRepository(db).get_ego_pose_by_token(token)
    if not pose:
        raise HTTPException(status_code=404, detail="EgoPose not found")
    return SensorConverter.to_ego_pose_response(pose)


# ── SampleData image ──────────────────────────────────────────────────────────

@router.get("/sensor-data/{token}/image")
async def get_sensor_data_image(token: str, db: AsyncSession = Depends(get_db)):
    sd = await SensorRepository(db).get_sample_data_by_token(token)
    if not sd:
        raise HTTPException(status_code=404, detail="SampleData not found")
    if sd.fileformat.lower() not in _IMAGE_FORMATS:
        raise HTTPException(status_code=400, detail=f"Not an image: {sd.fileformat}")
    path = Path(settings.NUSCENES_DATAROOT) / sd.filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    media_type = "image/png" if sd.fileformat.lower() == "png" else "image/jpeg"
    return FileResponse(path, media_type=media_type)


# ── SampleData pointcloud ─────────────────────────────────────────────────────

@router.get("/sensor-data/{token}/pointcloud")
async def get_sensor_data_pointcloud(token: str, db: AsyncSession = Depends(get_db)):
    sd = await SensorRepository(db).get_sample_data_by_token(token)
    if not sd:
        raise HTTPException(status_code=404, detail="SampleData not found")
    if not sd.filename.endswith(".pcd.bin"):
        raise HTTPException(
            status_code=400,
            detail=f"Not a LiDAR pointcloud: fileformat={sd.fileformat}, filename={sd.filename}",
        )
    path = Path(settings.NUSCENES_DATAROOT) / sd.filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Pointcloud file not found")

    pts = np.fromfile(str(path), dtype=np.float32).reshape(-1, 5)
    # 列: x, y, z, intensity, ring_index → 先頭 4 列のみ返す
    points = pts[:, :4].tolist()
    return {"points": points, "num_points": len(points)}
