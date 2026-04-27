from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.repositories.annotation import AnnotationRepository
from app.schemas.annotation import VisibilityResponse

router = APIRouter(tags=["visibilities"])


@router.get("/visibilities", response_model=list[VisibilityResponse])
async def list_visibilities(db: AsyncSession = Depends(get_db)):
    items = await AnnotationRepository(db).get_all_visibilities()
    return [VisibilityResponse.model_validate(v) for v in items]
