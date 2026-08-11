from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
import secrets


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    # Application
    APP_NAME: str = "Chai Analysis Application"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:3001"]

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://chai_analysis:Vasanth13@localhost:5432/chai_analysis"
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 40

    # Redis
    REDIS_URL: str = "redis://:Vasanth13@localhost:6379/0"
    REDIS_CACHE_TTL: int = 3600  # 1 hour

    # OpenRouter
    OPENROUTER_API_KEY: str
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_SITE_URL: str = "https://chai-analysis.local"
    OPENROUTER_SITE_NAME: str = "Chai Analysis Application"

    # Model routing
    MODEL_ANALYSIS: str = "~anthropic/claude-sonnet-latest"
    MODEL_SQL: str = "qwen/qwen3-coder"

    # Fallback models in order
    FALLBACK_MODELS: List[str] = [
        "~anthropic/claude-sonnet-latest",
        "deepseek/deepseek-chat",
        "openai/gpt-4o-mini",
    ]

    # Observability
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"
    ENABLE_METRICS: bool = True
    LOG_LEVEL: str = "INFO"

    # File storage
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 50

    # SMTP (used as fallback when tenant has no custom SMTP config)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@chai-analysis.local"

    # Multi-tenancy
    MAX_TENANTS: int = 1000
    DEFAULT_TENANT_QUOTA_REQUESTS: int = 10000


settings = Settings()
