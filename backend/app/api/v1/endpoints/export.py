"""nuScenes 形式エクスポートエンドポイント."""
import io
import json
import zipfile

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.models.scene import Scene
from app.services.nuscenes_export_service import NuScenesExportService


router = APIRouter(prefix='/export', tags=['export'])

_EXPECTED_FILES = {
    'sample_annotation.json', 'instance.json', 'category.json',
    'attribute.json', 'visibility.json', 'sample.json', 'scene.json',
    'sample_data.json', 'calibrated_sensor.json', 'ego_pose.json',
    'log.json', 'map.json', 'sensor.json',
}


@router.get('/nuscenes/{scene_token}')
async def export_nuscenes_scene(
    scene_token: str,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """単一シーンの nuScenes 形式メタデータを ZIP で返す."""
    result = await db.execute(select(Scene).where(Scene.token == scene_token))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scene '{scene_token}' not found",
        )
    return await _build_export_response(db, scene_token)


@router.get('/nuscenes')
async def export_nuscenes_all(
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """全シーンの nuScenes 形式メタデータを ZIP で返す."""
    return await _build_export_response(db, None)


async def _build_export_response(
    db: AsyncSession, scene_token: str | None
) -> StreamingResponse:
    service  = NuScenesExportService(db)
    records  = await service.build_all_records(scene_token)
    warnings = service.validate_consistency(records)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for filename, data in records.items():
            zf.writestr(filename, json.dumps(data, indent=2, ensure_ascii=False))
        if warnings:
            zf.writestr('WARNINGS.txt', '\n'.join(warnings) + '\n')
    buf.seek(0)

    download_filename = (
        f'nuscenes_export_{scene_token}.zip' if scene_token
        else 'nuscenes_export_all.zip'
    )

    return StreamingResponse(
        buf,
        media_type='application/zip',
        headers={
            'Content-Disposition':           f'attachment; filename="{download_filename}"',
            'X-Export-Warning-Count':        str(len(warnings)),
            'Access-Control-Expose-Headers': 'X-Export-Warning-Count, Content-Disposition',
        },
    )
