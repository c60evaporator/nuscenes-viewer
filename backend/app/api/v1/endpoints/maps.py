import io
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.geometry import to_geojson_feature_collection
from app.dependencies import get_db
from app.repositories.map import MapRepository
from app.schemas.common import PaginatedResponse
from app.schemas.map import GeoJSONFeatureCollection, MapLayer, MapMetaResponse
from app.lib.storage import read_file

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

_basemap_cache: dict[str, bytes] = {}


def _process_basemap(location: str) -> bytes:
    filename = _BASEMAP_FILENAMES[location]
    data = read_file(f"maps/{filename}")
    Image.MAX_IMAGE_PIXELS = None  # trusted local files from NuScenes dataset
    img = Image.open(io.BytesIO(data))
    img.thumbnail((4096, 4096), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@router.get("/maps/{location}/basemap")
async def get_map_basemap(location: str):
    if not re.match(r'^[a-zA-Z0-9_-]+$', location):
        raise HTTPException(status_code=400, detail="Invalid location name")
    if location not in _BASEMAP_FILENAMES:
        raise HTTPException(status_code=404, detail="Basemap not found")

    if location not in _basemap_cache:
        try:
            _basemap_cache[location] = _process_basemap(location)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Basemap not found")

    return StreamingResponse(
        io.BytesIO(_basemap_cache[location]),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )
