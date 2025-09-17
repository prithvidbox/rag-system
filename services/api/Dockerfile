FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

COPY packages ./packages
COPY services/api/requirements.txt ./services/api/requirements.txt

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r services/api/requirements.txt

COPY services/api/app ./services/api/app

ENV PYTHONPATH="/app/packages/rag_shared:/app/services/api"
WORKDIR /app/services/api

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
