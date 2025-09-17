FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

COPY packages ./packages
COPY services/worker/requirements.txt ./services/worker/requirements.txt

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r services/worker/requirements.txt

COPY services/worker/worker ./services/worker/worker

ENV PYTHONPATH="/app/packages/rag_shared:/app/services/worker"
WORKDIR /app/services/worker

CMD ["celery", "-A", "worker", "worker", "--loglevel=info", "-E", "--concurrency=2", "--max-tasks-per-child=4"]
