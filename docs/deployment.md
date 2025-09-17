# Deployment Guide

## Prerequisites

- Docker 24+
- docker compose plugin
- OpenAI API key (or compatible provider) available as `OPENAI_API_KEY`
- Optional: managed Weavnet instance credentials for production

## Local Development

```bash
cp .env.example .env
export OPENAI_API_KEY=sk-...
scripts/bootstrap.sh
```

Navigate to `http://localhost:3000` for UI and `http://localhost:8000/docs` for OpenAPI schema.

## Production Outline

1. Build images via CI (`docker build` per service) and push to registry.
2. Provision infrastructure (Kubernetes/ECS) with managed Weavnet, Postgres, Redis, and object store.
3. Inject configuration via secrets manager or environment variables.
4. Deploy using Helm/Compose stacks; configure autoscaling for API, workers, and embedding service.
5. Wire monitoring (Prometheus, Grafana) and logging (Loki/ELK). Point OTLP exporters to your collector endpoint.
6. Schedule periodic backups for Weavnet and Postgres; enable encryption at rest/in transit.
7. Ensure Celery worker, beat scheduler, and file watcher deployments share access to the ingestion inbox (e.g., persistent volume mounted at `/data`).
8. For SharePoint/Graph integrations configure tenant/client credentials via user-level integration settings or global `RAG_SHARED__SHAREPOINT_*` secrets and grant app permissions (`Sites.Read.All`, `Group.Read.All`). Ensure JWT secrets are rotated securely for user authentication.
9. Tune conversation memory via `RAG_SHARED__MEMORY_WINDOW_SIZE`; monitor Postgres growth from stored histories and prune or summarize when required.
