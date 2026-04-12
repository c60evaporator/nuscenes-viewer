from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.annotation import AnnotationConverter
from app.dependencies import get_db
from app.repositories.annotation import AnnotationRepository
from app.schemas.annotation import AnnotationResponse, AnnotationUpdate
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/annotations", tags=["annotations"])


@router.get("/", response_model=PaginatedResponse[AnnotationResponse])
async def list_annotations(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    repo = AnnotationRepository(db)
    total, annotations = await repo.get_all(limit, offset)
    return PaginatedResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[AnnotationConverter.to_response(a) for a in annotations],
    )


@router.get("/{token}", response_model=AnnotationResponse)
async def get_annotation(token: str, db: AsyncSession = Depends(get_db)):
    ann = await AnnotationRepository(db).get_by_token(token)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return AnnotationConverter.to_response(ann)


@router.patch("/{token}", response_model=AnnotationResponse)
async def update_annotation(
    token: str,
    data: AnnotationUpdate,
    db: AsyncSession = Depends(get_db),
):
    ann = await AnnotationRepository(db).update(token, data)
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    await db.commit()
    return AnnotationConverter.to_response(ann)
