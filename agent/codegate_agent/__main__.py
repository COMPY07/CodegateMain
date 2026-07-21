"""Vibe Studio의 내장 로컬 프로젝트·AI 실행 런타임.

    python3 -m codegate_agent
"""

from __future__ import annotations

import argparse
import contextlib
import logging
import sys
from pathlib import Path

from .projects import ProjectError
from .server import (
    DEFAULT_ORIGINS,
    DEFAULT_PORT,
    PROJECTS_FILE,
    load_or_create_token,
    serve,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="codegate-agent")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument(
        "--origin",
        action="append",
        default=None,
        help="스튜디오 origin. 반복 지정 가능 (기본: localhost:5180)",
    )
    parser.add_argument(
        "--workspace",
        default="",
        help="에이전트가 편집할 프로젝트 폴더 (기본: 현재 폴더)",
    )
    parser.add_argument(
        "--backend",
        default="http://localhost:55555",
        help="보안 판정을 요청할 백엔드 주소 (운영자 키는 그쪽에만 있다)",
    )
    parser.add_argument(
        "--projects-dir",
        default="",
        help="프로젝트를 만들고 고를 폴더 (기본: --workspace 의 상위)",
    )
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
    )

    origins = tuple(args.origin) if args.origin else DEFAULT_ORIGINS
    token = load_or_create_token()

    try:
        workspace = Path(args.workspace).expanduser().resolve() if args.workspace else Path.cwd()
        httpd = serve(
            port=args.port,
            origins=origins,
            token=token,
            workspace=workspace,
            backend_url=args.backend,
            projects_registry=PROJECTS_FILE,
            projects_dir=(
                Path(args.projects_dir).expanduser().resolve()
                if args.projects_dir
                else None
            ),
        )
        # Keep the explicit default workspace selectable even when a different managed
        # projects directory is configured.
        if args.workspace:
            with contextlib.suppress(ProjectError):
                httpd.projects.open(workspace)
    except OSError as e:
        print(f"포트 {args.port} 를 열 수 없습니다: {e}", file=sys.stderr)
        return 1

    print("Vibe Studio 내장 런타임 실행 중")
    print(f"  주소   http://127.0.0.1:{args.port}  (외부에서 접근 불가)")
    print(f"  허용   {', '.join(origins)}")
    status = httpd.runner.status()
    runnable = [k for k, v in status["models"].items() if v] or ["없음"]
    print(f"  작업   {status['workspace']}"
          f"{'' if status['workspaceExists'] else '  ⚠ 폴더 없음'}")
    print(f"  모델   {', '.join(runnable)}  (이 컴퓨터의 CLI 로그인 사용)")
    print(f"  프로젝트 {httpd.projects.root}  ({len(httpd.projects.list())}개)")
    print("  중지   Ctrl+C")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n종료합니다.")
    finally:
        httpd.preview.stop()
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
