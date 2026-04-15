from sqlalchemy import select
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.converters.annotation import AnnotationConverter
from app.dependencies import get_db
from app.models.scene import Sample
from app.repositories.annotation import AnnotationRepository
from app.repositories.sensor import SensorRepository
from app.schemas.annotation import AnnotationResponse, SampleInstanceResponse
from app.schemas.sensor import SensorDataBriefResponse

router = APIRouter(prefix="/samples", tags=["samples"])


@router.get("/{token}/annotations", response_model=list[AnnotationResponse])
async def get_sample_annotations(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sample).where(Sample.token == token))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Sample not found")

    annotations = await AnnotationRepository(db).get_by_sample(token)
    return [AnnotationConverter.to_response(a) for a in annotations]


@router.get("/{token}/sensor-data", response_model=dict[str, SensorDataBriefResponse])
async def get_sample_sensor_data(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sample).where(Sample.token == token))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Sample not found")

    sample_data_list = await SensorRepository(db).get_sample_data_by_sample(token)
    return {
        sd.calibrated_sensor.sensor.channel: SensorDataBriefResponse.model_validate(sd)
        for sd in sample_data_list
        if sd.is_key_frame
    }


@router.get("/{token}/instances", response_model=list[SampleInstanceResponse])
async def get_sample_instances(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sample).where(Sample.token == token))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Sample not found")

    annotations = await AnnotationRepository(db).get_by_sample(token)
    seen: set[str] = set()
    instances = []
    for ann in annotations:
        if ann.instance_token not in seen:
            seen.add(ann.instance_token)
            instances.append(SampleInstanceResponse(
                instance_token=ann.instance_token,
                category_name=ann.instance.category.name,
                nbr_annotations=ann.instance.nbr_annotations,
            ))
    return instances
