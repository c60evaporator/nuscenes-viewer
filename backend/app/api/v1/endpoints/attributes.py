from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.repositories.annotation import AnnotationRepository
from app.schemas.annotation import AttributeResponse

router = APIRouter(tags=["attributes"])


@router.get("/attributes", response_model=list[AttributeResponse])
async def list_attributes(db: AsyncSession = Depends(get_db)):
    items = await AnnotationRepository(db).get_all_attributes()
    return [AttributeResponse.model_validate(a) for a in items]
