"""Structured-ish logging with a filter that masks anything resembling a secret.

Keys and tokens must never reach logs (CLAUDE.md rule + BE-003/BE-009). The masking
filter is a defense-in-depth backstop — we also simply never log key material.
"""

from __future__ import annotations

import logging
import re

_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{12,}"),  # OpenAI-style
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{12,}"),  # Anthropic-style
    re.compile(r"(?i)(api[_-]?key|authorization|bearer|token)\s*[=:]\s*\S+"),
]


class SecretMaskingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        masked = msg
        for pat in _SECRET_PATTERNS:
            masked = pat.sub("***", masked)
        if masked != msg:
            record.msg = masked
            record.args = ()
        return True


def configure_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    )
    handler.addFilter(SecretMaskingFilter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)
