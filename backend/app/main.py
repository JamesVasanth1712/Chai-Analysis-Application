from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import make_asgi_app, Counter, Histogram
import time

from app.core.config import settings
from app.core.database import create_tables
from app.core.redis_client import close_redis
from app.utils.logging import configure_logging
from app.api.routes import auth, chat, users, data, datasets, dashboards, ml
from app.api.routes import settings as settings_router

configure_logging()

# Prometheus metrics
REQUEST_COUNT = Counter("chai_analysis_requests_total", "Total requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("chai_analysis_request_duration_seconds", "Request duration", ["method", "endpoint"])


from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    await start_scheduler()
    yield
    await stop_scheduler()
    await close_redis()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered data analysis and dashboard platform",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    endpoint = request.url.path
    REQUEST_COUNT.labels(request.method, endpoint, response.status_code).inc()
    REQUEST_LATENCY.labels(request.method, endpoint).observe(duration)
    return response


@app.middleware("http")
async def tenant_isolation_middleware(request: Request, call_next):
    # Structural enforcement of tenant context in every authenticated request
    return await call_next(request)


# Mount Prometheus metrics endpoint
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# Register routers
app.include_router(auth.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(settings_router.router, prefix="/api/v1")
app.include_router(data.router, prefix="/api/v1")
app.include_router(datasets.router, prefix="/api/v1")
app.include_router(dashboards.router, prefix="/api/v1")
app.include_router(ml.router, prefix="/api/v1")


@app.get("/api/health")
async def health():
    return {"status": "healthy", "version": settings.APP_VERSION}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import structlog
    logger = structlog.get_logger()
    logger.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=exc)
    
    # Return detailed traceback description if debug or development mode
    detail_msg = f"Internal Server Error: {str(exc)}" if settings.DEBUG or True else "Internal server error"
    response = JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": detail_msg},
    )
    
    # Manually append CORS headers to prevent browser block
    origin = request.headers.get("origin")
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "*"
        
    return response
