"""Guarded async runner for the sa-redteam subprocess.

The scanner ingests freshly generated, potentially hostile code, so it is run as an
isolated subprocess (AGENT_INTEGRATION.md). The argv is a fixed template — only the
allowlisted `--backend` value varies — nothing user-controlled reaches argv or a shell.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from ..errors import SubprocessError

_ALLOWED_BACKENDS = {"fake", "direct"}
_MAX_OUTPUT_BYTES = 8 * 1024 * 1024  # cap stdout to avoid unbounded memory use


async def run_sa_redteam(
    *,
    bin_path: Path,
    request_json: str,
    backend: str = "fake",
    timeout_s: int = 300,
) -> str:
    """Run `sa-redteam run --backend <backend> --compact`, feeding request_json on stdin.

    Returns the report JSON string (stdout). Raises SubprocessError on any failure.
    """
    if backend not in _ALLOWED_BACKENDS:
        raise SubprocessError(f"disallowed backend '{backend}'")
    if not bin_path.is_file():
        raise SubprocessError(
            f"sa-redteam binary not found at {bin_path}. Build it first "
            "(cmake -S redteam -B redteam/build -DRT_ENABLE_DIRECT_BACKEND=OFF && "
            "cmake --build redteam/build)."
        )

    argv = [str(bin_path), "run", "--backend", backend, "--compact"]
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as e:
        raise SubprocessError(f"could not launch sa-redteam: {e}") from e

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=request_json.encode("utf-8")), timeout=timeout_s
        )
    except TimeoutError as e:
        proc.kill()
        await proc.wait()
        raise SubprocessError(f"sa-redteam timed out after {timeout_s}s") from e

    # Exit codes: 0 success (findings are data, not failure); 2 usage; 3 bad request JSON.
    if proc.returncode != 0:
        detail = stderr.decode("utf-8", "replace").strip() or f"exit code {proc.returncode}"
        raise SubprocessError("sa-redteam failed", detail=detail)
    if len(stdout) > _MAX_OUTPUT_BYTES:
        raise SubprocessError("sa-redteam produced an oversized report")
    return stdout.decode("utf-8", "replace")
