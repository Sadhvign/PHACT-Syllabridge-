import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from app import jobs, observability, sources
from app.config import get_settings
from app.routers import admin, analyses, dashboard, me, portal, syllabi

observability.configure_logging()
log = logging.getLogger("phact")

settings = get_settings()
_stop = threading.Event()


def _every(seconds: float, task, name: str) -> None:
    """Local stand-in for EventBridge Scheduler: run a task periodically in this process."""

    def loop() -> None:
        while not _stop.wait(seconds):
            try:
                task()
            except Exception as exc:
                observability.warning(
                    log,
                    "scheduler_task_failed",
                    task=name,
                    error_type=type(exc).__name__,
                )

    threading.Thread(target=loop, name=name, daemon=True).start()


@asynccontextmanager
async def lifespan(_: FastAPI):
    observability.info(log, "api_starting", local_worker=settings.local_worker)
    if settings.local_worker:
        _every(15, jobs.sweep_expired, "job-deadline-sweeper")
        _every(20, sources.refresh_sync, "source-sync-poller")
    yield
    _stop.set()
    observability.info(log, "api_stopping")


app = FastAPI(
    title="PHACT API",
    version="0.2.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id"],
)


@app.middleware("http")
async def observe_requests(request: Request, call_next):
    """Log request metadata only — never bodies, auth headers, or query secrets."""
    rid = observability.set_request_id(request.headers.get("x-request-id"))
    start = time.perf_counter()
    status_code = 500
    try:
        response: Response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-Id"] = rid
        return response
    finally:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        path = request.url.path
        if path != "/health" or status_code >= 400:
            observability.info(
                log,
                "http_request",
                method=request.method,
                path=path[:120],
                status=status_code,
                duration_ms=duration_ms,
            )
        observability.metric(
            "HttpRequest",
            1,
            dimensions={"StatusClass": f"{status_code // 100}xx"},
        )
        observability.metric("HttpLatency", duration_ms, unit="Milliseconds")
        if status_code >= 500:
            observability.metric("Http5xx", 1)


@app.get("/health")
def health() -> dict:
    """Liveness + shallow dependency status. Never returns user or guardrail content."""
    result = observability.check_dependencies()
    observability.metric(
        "HealthCheck",
        1,
        dimensions={"Status": str(result.get("status", "unknown"))},
    )
    return result


app.include_router(me.router)
app.include_router(dashboard.router)
app.include_router(syllabi.router)
app.include_router(analyses.router)
app.include_router(admin.router)
app.include_router(portal.router)

handler = Mangum(app, lifespan="off")
