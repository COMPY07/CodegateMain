# Vibe Studio 내장 로컬 런타임

이 디렉터리는 별도 사용자용 수집기가 아니라 Vibe Studio에 포함된 내부 런타임입니다.
사용자는 여기서 프로세스를 실행하거나 토큰을 복사하지 않습니다. `frontend/mvp`의
`npm run dev`가 설치·시작·종료를 모두 관리합니다.

내장 런타임의 역할은 다음 다섯 가지뿐입니다.

1. 운영체제 폴더 선택기와 프로젝트 생성
2. 선택한 프로젝트의 실제 파일 트리 제공
3. 프로젝트의 `dev` 스크립트 실행과 hot-reload URL 관리
4. 이 컴퓨터에 로그인된 Claude Code 또는 Codex로 프로젝트 편집
5. 개발 응답 완료 직전 VibeGate typed-Proof 증거 감사 실행

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

## red_team과 analysis의 역할

두 기능은 같은 스캐너의 이름만 바꾼 것이 아닙니다.

| 구분 | red_team | analysis |
|---|---|---|
| 실행 시점 | 개발 중 필요할 때 수동 호출 | 모든 Claude/Codex 턴의 `message_done` 직전 자동 실행 |
| 목적 | 공격자 관점의 빠른 휴리스틱 후보 탐색 | typed Proof에 대한 경로 기반 최종 판정 |
| 구현 | `sa-redteam` 결정론 패턴/위험 분석, 선택적 서버 판정 | TypeScript Compiler API → Semantic IR → CFG/Call graph/Value-flow → Verdict |
| 결과 | severity/confidence를 가진 수정 후보 | `SUPPORTED` / `REFUTED` / `INCONCLUSIVE` |
| 완료 판정 권한 | 없음 | MCP 엔진 결과만 권한을 가짐 |

Claude Code의 `red_team_scan`은 개발 도중 빠르게 의심 지점을 찾고 싶을 때만
사용합니다. 더 이상 Write/Edit 후크나 Codex 턴 종료 게이트로 자동 실행되지 않습니다.

개발 에이전트가 응답을 끝내면 런타임은 아직 `message_done`을 보내지 않고 별도의
읽기 전용 Analysis Agent를 시작합니다. 이 에이전트는 다음 순서를 지켜야 합니다.

1. `security_index`, `security_inventory`로 실제 프로젝트의 entrypoint/effect를 확인
2. 소스를 읽고 각 보안 가설을 계약의 typed Proof로 작성
3. `security_prove`로 엔진 판정 요청
4. `SUPPORTED`/`INCONCLUSIVE`는 동일 Proof로 `security_evidence`, `security_slice` 확장
5. `security_scan`은 설정·시크릿 보조 점검으로만 실행
6. MCP 결과를 상태판에 반영한 뒤에만 `message_done` 전송

모델의 자연어 요약은 verdict를 덮어쓸 수 없습니다. 경로 또는 방어 검색이 덜 된
경우에는 안전으로 승격하지 않고 `INCONCLUSIVE`로 남깁니다. Analysis Agent를 실행할
수 없는 경우에도 결정론 CLI를 제한적으로 실행하지만, 전체 프로토콜이 아니므로
완료 상태는 `INCONCLUSIVE`로 표시합니다.

## 검증

```bash
./.venv/bin/python -m pytest
./.venv/bin/ruff check codegate_agent tests
```
