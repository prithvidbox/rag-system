# RAG System

Production-grade Retrieval Augmented Generation platform leveraging Weavnet as the vector store. The system ships with API, embedding microservice, ingestion workers for parallel job execution, and a Next.js UI for end users and admins. Docker Compose orchestrates local development; Helm charts target production rollouts.

## Services

- **API (FastAPI)** - Query endpoints, orchestration with LangChain, SSE streaming.
- **Worker (Celery)** - Ingestion, re-embedding, evaluation jobs processed in parallel.
- **Scheduler & Watchers** - Celery Beat and filesystem watchers feed ingestion jobs from shared inbox volumes.
- **Embedding Service** - Dedicated microservice providing embedding vectors via configured providers.
- **UI (Next.js)** - Unified workspace with chat, conversation memory, integration management, and API docs.
- **Infrastructure** - Weavnet vector store, PostgreSQL metadata DB, Redis job queue, MinIO object store.
- **Observability** - Prometheus metrics & OTLP tracing wiring ready for Grafana/Tempo stacks.
- **Permission Controls** - ACL-aware ingestion with principal filters (SharePoint connector scaffold included).

## Getting Started

Documentation lives in `docs/` (coming soon). For now see `scripts/bootstrap.sh` for local setup instructions.

### Configuration

- Chunking defaults are driven by environment variables `RAG_SHARED__INGESTION_CHUNK_SIZE` and
  `RAG_SHARED__INGESTION_CHUNK_OVERLAP`. Adjust them in `.env` and rebuild the worker service with
  `docker compose up -d --build worker` to reload the settings.
- Enable permission-aware retrieval by configuring principal defaults (`RAG_SHARED__DEFAULT_PUBLIC_PRINCIPAL`) and,
  optionally, SharePoint credentials (`RAG_SHARED__SHAREPOINT_*`). Documents ingested without explicit principals
  automatically inherit the public principal.
- Authentication requires JWT configuration (`RAG_SHARED__JWT_SECRET_KEY` etc.). Users can self-register through the UI,
  manage enterprise integrations, and trigger sync jobs with live status tracking.
- Conversation memory retains the last `RAG_SHARED__MEMORY_WINDOW_SIZE` exchanges per conversation, feeding them into
  prompt construction via LangChain. Continue chats by reusing the `conversation_id` returned by `/v1/chat`.
