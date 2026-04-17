import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.geometry import to_geojson_feature_collection
from app.core.config import settings
from app.dependencies import get_db
from app.repositories.map import MapRepository
from app.schemas.common import PaginatedResponse
from app.schemas.map import GeoJSONFeatureCollection, MapLayer, MapMetaResponse

router = APIRouter(tags=["maps"])


# ── MapMeta ───────────────────────────────────────────────────────────────────

@router.get("/maps", response_model=PaginatedResponse[MapMetaResponse])
async def list_maps(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    total, maps = await MapRepository(db).get_all_maps(limit, offset)
    return PaginatedResponse(
        total=total, limit=limit, offset=offset,
        items=[MapMetaResponse.model_validate(m) for m in maps],
    )


@router.get("/maps/{token}", response_model=MapMetaResponse)
async def get_map(token: str, db: AsyncSession = Depends(get_db)):
    m = await MapRepository(db).get_map_by_token(token)
    if not m:
        raise HTTPException(status_code=404, detail="Map not found")
    return MapMetaResponse.model_validate(m)


# ── GeoJSON Layer ─────────────────────────────────────────────────────────────

@router.get("/maps/{token}/geojson", response_model=GeoJSONFeatureCollection)
async def get_map_geojson(
    token: str,
    layer: MapLayer = Query(..., description="取得するレイヤー名"),
    db: AsyncSession = Depends(get_db),
):
    repo = MapRepository(db)
    m = await repo.get_map_by_token(token)
    if not m:
        raise HTTPException(status_code=404, detail="Map not found")

    features = await repo.get_layer_features(m.location, layer)
    return to_geojson_feature_collection(features, layer_name=layer.value)


# ── Basemap PNG ───────────────────────────────────────────────────────────────

_BASEMAP_FILENAMES: dict[str, str] = {
    "boston-seaport":           "36092f0b03a857c6a3403e25b4b7aab3.png",
    "singapore-hollandvillage": "37819e65e09e5547b8a3ceaefba56bb2.png",
    "singapore-onenorth":       "53992ee3023e5494b90c316c183be829.png",
    "singapore-queenstown":     "93406b464a165eaba6d9de76ca09f5da.png",
}


@router.get("/maps/{location}/basemap")
async def get_map_basemap(location: str):
    if not re.match(r'^[a-zA-Z0-9_-]+$', location):
        raise HTTPException(status_code=400, detail="Invalid location name")
    filename = _BASEMAP_FILENAMES.get(location)
    if filename is None:
        raise HTTPException(status_code=404, detail="Basemap not found")
    path = Path(settings.NUSCENES_DATAROOT) / "maps" / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Basemap not found")
    return FileResponse(path, media_type="image/png")
