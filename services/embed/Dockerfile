FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1
WORKDIR /app

COPY packages ./packages
COPY services/embed/requirements.txt ./services/embed/requirements.txt

RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r services/embed/requirements.txt

COPY services/embed/app ./services/embed/app

ENV PYTHONPATH="/app/packages/rag_shared:/app/services/embed"
WORKDIR /app/services/embed

EXPOSE 9000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
