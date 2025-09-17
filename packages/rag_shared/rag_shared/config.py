"""Application configuration shared across services."""
from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration."""

    # Core service metadata
    env: str = "development"
    service_name: str = "rag-system"

    # Network/service endpoints
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    worker_concurrency: int = 2

    # Vector store
    weaviate_url: str = "http://weaviate:8080"
    weaviate_api_key: Optional[str] = None
    weaviate_index: str = "rag_documents"

    # Embeddings
    embedding_service_url: str = "http://embed:9000"
    embedding_model: str = "text-embedding-3-large"
    embedding_dim: int = 3072

    # External LLM provider
    llm_provider: str = "openai"
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o"

    # Data stores
    postgres_dsn: str = "postgresql+asyncpg://rag:rag@postgres:5432/rag"
    redis_url: str = "redis://redis:6379/0"
    object_store_endpoint: str = "http://minio:9000"
    object_store_access_key: str = "minioadmin"
    object_store_secret_key: str = "minioadmin"
    object_store_bucket: str = "rag-documents"

    # Ingestion
    ingestion_default_source: str = "api"
    ingestion_watch_path: str = "/data/inbox"
    ingestion_processed_path: str = "/data/processed"
    ingestion_schedule_interval: int = 300
    ingestion_chunk_size: int = 750
    ingestion_chunk_overlap: int = 100
    ingestion_embed_batch_size: int = 32

    # Permissions / ACL
    enable_permission_filters: bool = True
    default_public_principal: str = "public"
    principal_cache_ttl_seconds: int = 900

    # SharePoint / Microsoft Graph (optional connector)
    sharepoint_tenant_id: Optional[str] = None
    sharepoint_client_id: Optional[str] = None
    sharepoint_client_secret: Optional[str] = None
    sharepoint_site_ids: List[str] = []
    sharepoint_sync_page_size: int = 100

    # Auth
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expires_minutes: int = 60

    # Memory
    memory_window_size: int = 10
    memory_include_user_messages: bool = True
    memory_include_assistant_messages: bool = True

    # Observability
    enable_metrics: bool = True
    otel_exporter_endpoint: Optional[str] = None
    otel_sample_ratio: float = 1.0

    allowed_cors_origins: List[str] = ["*"]

    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), env_nested_delimiter="__")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""

    return Settings()
