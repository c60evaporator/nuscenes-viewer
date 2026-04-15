from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.repositories.annotation import AnnotationRepository
from app.schemas.annotation import CategoryResponse

router = APIRouter(tags=["categories"])


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(db: AsyncSession = Depends(get_db)):
    cats = await AnnotationRepository(db).get_all_categories()
    return [CategoryResponse.model_validate(c) for c in cats]
