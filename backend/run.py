"""Entrypoint that honours PORT from .env — `python run.py [--reload]`.

Keeps the port in one place (backend/.env) so it can't drift from the Vite proxy
target. `uvicorn app.main:app --port N` still works if you prefer the CLI.
"""

from __future__ import annotations

import sys

import uvicorn

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=settings.port,
        reload="--reload" in sys.argv,
    )


if __name__ == "__main__":
    main()
