from fastapi import APIRouter

from app.api.v1.endpoints.annotations import router as annotations_router
from app.api.v1.endpoints.maps import router as maps_router
from app.api.v1.endpoints.samples import router as samples_router
from app.api.v1.endpoints.scenes import router as scenes_router
from app.api.v1.endpoints.sensors import router as sensors_router

router = APIRouter()
router.include_router(scenes_router)
router.include_router(samples_router)
router.include_router(annotations_router)
router.include_router(sensors_router)
router.include_router(maps_router)
