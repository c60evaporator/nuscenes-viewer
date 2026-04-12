from pydantic import BaseModel, ConfigDict


class LogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    logfile: str
    vehicle: str
    date_captured: str
    location: str


class SceneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    log_token: str
    name: str
    description: str | None
    nbr_samples: int
    first_sample_token: str
    last_sample_token: str


class SampleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    token: str
    scene_token: str
    timestamp: int
    prev: str | None
    next: str | None
