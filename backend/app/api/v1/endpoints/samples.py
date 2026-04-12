from sqlalchemy import select
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.annotation import AnnotationConverter
from app.dependencies import get_db
from app.models.scene import Sample
from app.repositories.annotation import AnnotationRepository
from app.schemas.annotation import AnnotationResponse

router = APIRouter(prefix="/samples", tags=["samples"])


@router.get("/{token}/annotations", response_model=list[AnnotationResponse])
async def get_sample_annotations(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sample).where(Sample.token == token))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Sample not found")

    annotations = await AnnotationRepository(db).get_by_sample(token)
    return [AnnotationConverter.to_response(a) for a in annotations]
