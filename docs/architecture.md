# Architecture Overview

## Components

- **API Service (FastAPI)** exposes chat and system endpoints, orchestrates retrieval and generation workflows, streams answers, and records events.
- **Embedding Service** encapsulates embedding model providers (OpenAI by default) and serves as a shared dependency for ingestion and online reranking.
- **Worker Service (Celery)** handles ingestion pipelines, parallel document processing, re-embedding, and scheduled maintenance tasks via Redis-backed queues.
- **Weavnet Vector Store** stores chunk vectors and metadata, configured for hybrid search and periodic backups.
- **PostgreSQL** retains chat transcripts, feedback loops, principal snapshots, user accounts, and connector configurations.
- **Redis** acts as Celery broker/result backend and short-lived cache.
- **MinIO** stores original documents and derived assets.
- **Next.js UI** provides chat UX, source inspection, integration administration (SharePoint today, Confluence/Notion coming soon), and embedded API documentation.
- **Conversation Memory** leverages LangChain buffer memory over Postgres-stored messages to provide short-term context retention per conversation.

## Data Flow

1. **Ingestion**: Documents arrive via API/upload endpoints, watched directories, SharePoint sync jobs, or scheduled inbox scans; each triggers `ingest_document` Celery tasks with ACL metadata.
2. **Chunking**: Worker splits content into overlapping chunks and enriches metadata.
3. **Embedding**: Worker requests vector embeddings from the embedding service.
4. **Upsert**: Worker stores vectors + metadata in Weavnet; raw documents stored in MinIO.
5. **Query**: UI requests `/v1/chat` → API queries Weavnet for top-k chunks.
6. **Generation**: API formats context prompt and queries LLM; response fused with citations and returned to UI while persisting conversation/message records (including principal snapshots) to Postgres.
7. **Feedback Loop**: Users submit ratings that attach to assistant messages and feed evaluation pipelines. ACL metadata is retained for audit.

## Operations

- **Docker Compose** orchestrates local stack; production uses container images + Kubernetes/Helm (future work).
- **Observability hooks** instrument FastAPI with Prometheus metrics and OTLP tracing ready for Grafana/Loki/Sentry stacks. Permission-aware integrations surface sync metrics and audit logs.
- **Security**: API keys via environment variables, CORS defaults to UI origin, future RBAC integration planned.
