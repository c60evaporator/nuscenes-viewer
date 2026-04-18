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

    path = Path(settings.NUSCENES_DATAROOT) / sd.filename

    # ── LiDAR（.pcd.bin）──────────────────────────────────────────
    if sd.filename.endswith(".pcd.bin"):
        if not path.exists():
            raise HTTPException(status_code=404, detail="Pointcloud file not found")
        pts = np.fromfile(str(path), dtype=np.float32).reshape(-1, 5)
        points = pts[:, :4].tolist()
        return {"points": points, "num_points": len(points)}

    # ── RADAR（.pcd）──────────────────────────────────────────────
    if sd.filename.endswith(".pcd") and sd.fileformat.lower() == "pcd":
        if not path.exists():
            raise HTTPException(status_code=404, detail="Pointcloud file not found")
        points = _parse_pcd(path)
        return {"points": points, "num_points": len(points)}

    raise HTTPException(
        status_code=400,
        detail=f"Unsupported pointcloud format: {sd.fileformat}, {sd.filename}",
    )


def _parse_pcd(path: Path) -> list[list[float]]:
    """標準PCD形式（ASCIIまたはbinary）をパースしてx,y,z,intensityのリストを返す"""
    with open(path, "rb") as f:
        content = f.read()

    header_end = content.find(b"DATA ")
    if header_end == -1:
        return []

    header = content[:header_end].decode("utf-8", errors="ignore")
    data_type = ""
    fields: list[str] = []
    size:   list[int] = []
    count:  list[int] = []
    num_points = 0

    for line in header.splitlines():
        if line.startswith("FIELDS"):
            fields = line.split()[1:]
        elif line.startswith("SIZE"):
            size = [int(s) for s in line.split()[1:]]
        elif line.startswith("COUNT"):
            count = [int(c) for c in line.split()[1:]]
        elif line.startswith("POINTS"):
            num_points = int(line.split()[1])
        elif line.startswith("DATA"):
            data_type = line.split()[1]

    data_start = header_end + len(b"DATA ") + len(data_type.encode()) + 1

    if data_type == "ascii":
        lines = content[data_start:].decode("utf-8", errors="ignore").strip().splitlines()
        points = []
        for line in lines:
            vals = [float(v) for v in line.split()]
            if len(vals) >= 3:
                intensity = vals[3] if len(vals) > 3 else 0.0
                points.append([vals[0], vals[1], vals[2], intensity])
        return points

    if data_type == "binary":
        if not size or not count or not fields:
            return []
        point_step = sum(s * c for s, c in zip(size, count))
        data = content[data_start:]
        points = []
        for i in range(num_points):
            offset = i * point_step
            if offset + point_step > len(data):
                break
            vals: list[float] = []
            field_offset = 0
            for s, c in zip(size, count):
                for _ in range(c):
                    chunk = data[offset + field_offset: offset + field_offset + s]
                    if s == 4:
                        val = float(np.frombuffer(chunk, dtype=np.float32)[0])
                    elif s == 8:
                        val = float(np.frombuffer(chunk, dtype=np.float64)[0])
                    else:
                        val = float(np.frombuffer(chunk, dtype=np.uint8)[0])
                    vals.append(val)
                    field_offset += s
            if len(vals) >= 3:
                intensity = vals[3] if len(vals) > 3 else 0.0
                points.append([vals[0], vals[1], vals[2], intensity])
        return points

    return []
