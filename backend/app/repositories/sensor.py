from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.sensor import CalibratedSensor, EgoPose, SampleData, Sensor


class SensorRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Sensor ────────────────────────────────────────────────────────────────

    async def get_all_sensors(
        self, limit: int, offset: int
    ) -> tuple[int, list[Sensor]]:
        total = (await self.db.execute(
            select(func.count()).select_from(Sensor)
        )).scalar_one()
        result = await self.db.execute(
            select(Sensor).order_by(Sensor.channel).limit(limit).offset(offset)
        )
        return total, list(result.scalars().all())

    async def get_sensor_by_token(self, token: str) -> Sensor | None:
        result = await self.db.execute(
            select(Sensor).where(Sensor.token == token)
        )
        return result.scalar_one_or_none()

    # ── CalibratedSensor ──────────────────────────────────────────────────────

    async def get_all_calibrated_sensors(
        self, limit: int, offset: int
    ) -> tuple[int, list[CalibratedSensor]]:
        total = (await self.db.execute(
            select(func.count()).select_from(CalibratedSensor)
        )).scalar_one()
        result = await self.db.execute(
            select(CalibratedSensor)
            .options(selectinload(CalibratedSensor.sensor))
            .order_by(CalibratedSensor.token)
            .limit(limit)
            .offset(offset)
        )
        return total, list(result.scalars().all())

    async def get_calibrated_sensor_by_token(
        self, token: str
    ) -> CalibratedSensor | None:
        result = await self.db.execute(
            select(CalibratedSensor)
            .options(selectinload(CalibratedSensor.sensor))
            .where(CalibratedSensor.token == token)
        )
        return result.scalar_one_or_none()

    # ── EgoPose ───────────────────────────────────────────────────────────────

    async def get_all_ego_poses(
        self, limit: int, offset: int
    ) -> tuple[int, list[EgoPose]]:
        total = (await self.db.execute(
            select(func.count()).select_from(EgoPose)
        )).scalar_one()
        result = await self.db.execute(
            select(EgoPose)
            .order_by(EgoPose.timestamp)
            .limit(limit)
            .offset(offset)
        )
        return total, list(result.scalars().all())

    async def get_ego_pose_by_token(self, token: str) -> EgoPose | None:
        result = await self.db.execute(
            select(EgoPose).where(EgoPose.token == token)
        )
        return result.scalar_one_or_none()

    # ── SampleData ────────────────────────────────────────────────────────────

    async def get_sample_data_by_sample(
        self, sample_token: str
    ) -> list[SampleData]:
        """GET /samples/{token}/data で将来使用。"""
        result = await self.db.execute(
            select(SampleData)
            .options(
                selectinload(SampleData.calibrated_sensor).selectinload(
                    CalibratedSensor.sensor
                ),
                selectinload(SampleData.ego_pose),
            )
            .where(SampleData.sample_token == sample_token)
            .order_by(SampleData.timestamp)
        )
        return list(result.scalars().all())

    async def get_sample_data_by_token(self, token: str) -> SampleData | None:
        result = await self.db.execute(
            select(SampleData).where(SampleData.token == token)
        )
        return result.scalar_one_or_none()

    async def get_ego_pose_by_sample_data_token(
        self, sample_data_token: str
    ) -> EgoPose | None:
        result = await self.db.execute(
            select(EgoPose)
            .join(SampleData, SampleData.ego_pose_token == EgoPose.token)
            .where(SampleData.token == sample_data_token)
        )
        return result.scalar_one_or_none()

    async def get_camera_sample_data_by_sample(
        self, sample_token: str
    ) -> list[SampleData]:
        """指定 Sample の全カメラ SampleData（is_key_frame=True）を返す。
        calibrated_sensor.sensor + ego_pose を eager load。
        """
        result = await self.db.execute(
            select(SampleData)
            .options(
                selectinload(SampleData.calibrated_sensor).selectinload(
                    CalibratedSensor.sensor
                ),
                selectinload(SampleData.ego_pose),
            )
            .join(CalibratedSensor, SampleData.calibrated_sensor_token == CalibratedSensor.token)
            .join(Sensor, CalibratedSensor.sensor_token == Sensor.token)
            .where(
                SampleData.sample_token == sample_token,
                Sensor.modality == "camera",
                SampleData.is_key_frame.is_(True),
            )
            .order_by(SampleData.timestamp)
        )
        return list(result.scalars().all())
