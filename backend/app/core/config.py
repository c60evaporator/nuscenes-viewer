from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    DATABASE_URL: str
    ENV: str = "development"
    NUSCENES_DATAROOT: str = "/data/nuscenes"
    CORS_ORIGINS: list[str] = ["*"]
    DB_ECHO: bool = False
    APP_CONFIG_PATH: str = "/app/config/settings.yml"


settings = Settings()
