"""FastAPI application factory: CORS, routers, exception handlers, lifespan."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import get_settings
from .errors import AppError, app_error_handler, unhandled_error_handler
from .logging import configure_logging
from .routers import (
    adjudicate,
    chat,
    health,
    keys,
    models,
    review,
    scan,
    usage,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    settings = get_settings()
    status = "configured" if (settings.anthropic_api_key or settings.openai_api_key) else "fake-only"
    logger.info("CodeGate backend %s starting (providers: %s)", __version__, status)
    yield
    # The dev server belongs to the local agent now — it runs on the user's machine,
    # so this process has nothing of theirs left to clean up.
    logger.info("CodeGate backend shutting down")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="CodeGate Backend", version=__version__, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    app.include_router(adjudicate.router, prefix="/api")
    app.include_router(health.router, prefix="/api")
    app.include_router(models.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(scan.router, prefix="/api")
    app.include_router(review.router, prefix="/api")
    app.include_router(keys.router, prefix="/api")
    app.include_router(usage.router, prefix="/api")

    return app


app = create_app()
