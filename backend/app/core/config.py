from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    ENV: str = "development"
    NUSCENES_DATAROOT: str = "/data/nuscenes"
    CORS_ORIGINS: list[str] = ["*"]
    DB_ECHO: bool = False
    APP_CONFIG_PATH: str = "/app/config/settings.yml"

    POSTGRES_HOST:     str = "db"
    POSTGRES_PORT:     str = "5432"
    POSTGRES_DB:       str
    POSTGRES_USER:     str
    POSTGRES_PASSWORD: str
    @model_validator(mode="after")
    def build_database_url(self) -> "Settings":
        self.DATABASE_URL = (
            f"postgresql+asyncpg://"
            f"{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}"
            f"/{self.POSTGRES_DB}"
        )
        return self

    DATABASE_URL: str = ""

settings = Settings()
