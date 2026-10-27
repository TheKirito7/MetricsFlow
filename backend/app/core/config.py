from datetime import date, datetime
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = (
        "postgresql+psycopg://metricsflow:local-development-only@127.0.0.1:5432/metricsflow?connect_timeout=5"
    )
    app_env: str = "development"
    cookie_secure: bool = False
    allowed_origins: str = "http://localhost:5173"
    session_hours: int = 8
    read_only_demo: bool = False
    forwarded_allow_ips: str = "127.0.0.1"
    demo_admin_email: str = "admin@metricsflow.test"
    demo_viewer_email: str = "viewer@metricsflow.test"
    demo_password: str | None = None
    seed_today: date | None = None
    test_now: datetime | None = None

    @model_validator(mode="after")
    def production_safety(self):
        if self.app_env == "production" and not self.cookie_secure:
            raise ValueError("Production requires COOKIE_SECURE=true and HTTPS")
        if self.app_env == "production" and "*" in self.forwarded_allow_ips:
            raise ValueError("Production must trust explicit proxy addresses, never a wildcard")
        if self.app_env != "development" and self.test_now is not None:
            raise ValueError("TEST_NOW is only allowed for isolated development tests")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
