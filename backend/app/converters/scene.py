from app.models.scene import Log, Sample, Scene
from app.schemas.scene import LogResponse, SampleResponse, SceneResponse


class SceneConverter:
    @staticmethod
    def to_response(scene: Scene) -> SceneResponse:
        return SceneResponse.model_validate(scene)

    @staticmethod
    def to_log_response(log: Log) -> LogResponse:
        return LogResponse.model_validate(log)

    @staticmethod
    def to_sample_response(sample: Sample) -> SampleResponse:
        return SampleResponse.model_validate(sample)
