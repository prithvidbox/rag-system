from __future__ import annotations

import logging

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from prometheus_fastapi_instrumentator import Instrumentator

from rag_shared import Settings

_logger = logging.getLogger(__name__)
_METRICS_INSTRUMENTED = False
_TRACING_CONFIGURED = False


def setup_observability(app: FastAPI, settings: Settings) -> None:
    global _METRICS_INSTRUMENTED
    global _TRACING_CONFIGURED

    if settings.enable_metrics and not _METRICS_INSTRUMENTED:
        instrumentator = Instrumentator()
        instrumentator.instrument(app)
        instrumentator.expose(app, include_in_schema=False)
        _METRICS_INSTRUMENTED = True
        _logger.info("metrics instrumentation enabled")

    if settings.otel_exporter_endpoint and not _TRACING_CONFIGURED:
        resource = Resource(
            attributes={
                "service.name": settings.service_name,
                "service.namespace": "rag-system",
                "service.environment": settings.env,
            }
        )
        tracer_provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=settings.otel_exporter_endpoint, insecure=True)
        tracer_provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(tracer_provider)

        FastAPIInstrumentor.instrument_app(app)
        LoggingInstrumentor().instrument(set_logging_format=True)
        _TRACING_CONFIGURED = True
        _logger.info("opentelemetry exporter configured", extra={"endpoint": settings.otel_exporter_endpoint})
