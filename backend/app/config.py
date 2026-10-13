import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    app_name: str = "StockSense AI"
    app_env: str = "development"
    port: int = 8000
    host: str = "127.0.0.1"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    
    demo_data_dir: Path = BASE_DIR / "data" / "demo"
    upload_data_dir: Path = BASE_DIR / "data" / "uploads"
    
    weather_api_provider: str = "open-meteo"
    enable_live_weather: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

settings = Settings()
