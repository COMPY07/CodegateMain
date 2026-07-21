# Vibe Studio 내장 로컬 런타임

이 디렉터리는 별도 사용자용 수집기가 아니라 Vibe Studio에 포함된 내부 런타임입니다.
사용자는 여기서 프로세스를 실행하거나 토큰을 복사하지 않습니다. `frontend/mvp`의
`npm run dev`가 설치·시작·종료를 모두 관리합니다.

내장 런타임의 역할은 다음 네 가지뿐입니다.

1. 운영체제 폴더 선택기와 프로젝트 생성
2. 선택한 프로젝트의 실제 파일 트리 제공
3. 프로젝트의 `dev` 스크립트 실행과 hot-reload URL 관리
4. 이 컴퓨터에 로그인된 Claude Code 또는 Codex로 프로젝트 편집

브라우저는 같은 origin의 `/local/*`만 호출합니다. Vite가 요청을 loopback 런타임으로
프록시하고 실행 시 생성한 임시 인증값을 내부에서 주입하므로 수동 페어링이 없습니다.

## 내부 엔드포인트

| 메서드 | 경로 | 역할 |
|---|---|---|
| GET | `/local/ping` | 런타임 준비 상태 |
| GET | `/local/agent/status` | Claude/Codex 사용 가능 상태 |
| POST | `/local/agent/stream` | 선택한 프로젝트에서 에이전트 실행(SSE) |
| POST | `/local/agent/interrupt` | 실행 중단 |
| GET/POST | `/local/projects` | 프로젝트 목록/생성 |
| POST | `/local/projects/open` | 기존 폴더 열기 |
| GET | `/local/fs/tree?project=` | 실제 파일 트리 |
| GET/POST | `/local/preview/*` | dev server 상태/시작/중지 |

런타임은 `127.0.0.1`에만 바인딩하고 Host 검사와 bearer 인증을 유지합니다. 브라우저에는
인증값을 저장하지 않습니다.

## 검증

```bash
./.venv/bin/python -m pytest
./.venv/bin/ruff check codegate_agent tests
```
