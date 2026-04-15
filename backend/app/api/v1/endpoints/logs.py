from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.repositories.scene import SceneRepository
from app.schemas.common import PaginatedResponse
from app.schemas.scene import LogResponse

router = APIRouter(tags=["logs"])


@router.get("/logs", response_model=PaginatedResponse[LogResponse])
async def list_logs(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    total, logs = await SceneRepository(db).get_all_logs(limit, offset)
    return PaginatedResponse(
        total=total, limit=limit, offset=offset,
        items=[LogResponse.model_validate(l) for l in logs],
    )
