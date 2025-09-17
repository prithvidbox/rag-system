from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from rag_shared import Settings, configure_logging, get_settings

from .db import close_db, init_db
from .infra.weaviate_schema import ensure_weavnet_schema
from .routers import auth, chat, integrations, conversations, documents, feedback, system
from .telemetry import setup_observability


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    configure_logging(f"api::{settings.env}")
    ensure_weavnet_schema(settings)
    await init_db(settings)
    try:
        yield
    finally:
        await close_db()


def create_app() -> FastAPI:
    settings: Settings = get_settings()

    app = FastAPI(title="RAG System API", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    setup_observability(app, settings)

    app.include_router(system.router)
    app.include_router(auth.router)
    app.include_router(conversations.router)
    app.include_router(documents.router)
    app.include_router(integrations.router)
    app.include_router(feedback.router)
    app.include_router(chat.router)

    @app.get("/")
    async def root() -> dict:
        return {"service": "rag-api", "env": settings.env}

    return app


app = create_app()
