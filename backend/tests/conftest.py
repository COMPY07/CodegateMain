"""Shared pytest fixtures: an in-process ASGI client with no API keys configured."""

from __future__ import annotations

import httpx
import pytest

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
