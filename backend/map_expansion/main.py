from uuid import UUID
import logging
import os

from fastapi import Depends, FastAPI
from sqlalchemy.orm import Session

import backend.map_expansion.schemas as schemas_mapexp

# Set logger
LOGGING_FILE = "logs/api.log"
os.makedirs(os.path.dirname(LOGGING_FILE), exist_ok=True)
logger = logging.getLogger("api")
logger.setLevel(logging.INFO)

if not logger.handlers:
    formatter = logging.Formatter("%(asctime)s %(message)s")
    file_handler = logging.FileHandler(LOGGING_FILE)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    stream_handler = logging.StreamHandler()
    stream_handler.setFormatter(formatter)
    logger.addHandler(stream_handler)

app = FastAPI()

@app.get("/drivable_areas", response_model=list[schemas_mapexp.DrivableAreaRead])
def read_drivable_areas(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud_map.get_drivable_areas(db, skip=skip, limit=limit)

@app.get("/road_segments", response_model=list[schemas_mapexp.RoadSegmentRead])
def read_road_segments(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return crud_map.get_road_segments(db, skip=skip, limit=limit)

@app.get("/drivable_areas/{drivable_area_token}/road_segments", response_model=list[schemas_mapexp.RoadSegmentRead])
def read_road_segments_by_drivable_area(drivable_area_token: UUID, db: Session = Depends(get_db)):
    return crud_map.get_road_segments_by_drivable_area(db, drivable_area_token=drivable_area_token)

@app.get("/road_segments/{road_segment_token}/road_blocks", response_model=list[schemas_mapexp.RoadBlockRead])
def read_road_blocks(road_segment_token: UUID, db: Session = Depends(get_db)):
    return crud_map.get_road_blocks_by_road_segment(db, road_segment_token=road_segment_token)
