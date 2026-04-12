from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.geometry import to_geojson_feature_collection
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
