# CodeGate Backend

Python + FastAPI 백엔드. Vibe Studio 프론트엔드와 LLM 제공자(Claude·OpenAI) 및
`sa-redteam` 보안 엔진을 잇는다.

## 요구사항
- Python 3.11+
- `sa-redteam` 바이너리 빌드 (아래 참고)
- `claude` CLI 로그인 (Agent SDK 인증에 사용)

## 설치 & 실행
```bash
cd backend
python3 -m venv .venv
./.venv/bin/pip install -e ".[dev]"
cp .env.example .env      # 필요 시 ANTHROPIC_API_KEY / OPENAI_API_KEY 채우기
./.venv/bin/python run.py --reload      # .env 의 PORT 사용 (기본 55555)
```
포트는 `backend/.env` 의 `PORT` 한 곳에서 관리한다(Vite 프록시 타깃과 맞출 것).
일시적으로 바꾸려면 `PORT=55556 ./.venv/bin/python run.py` 처럼 환경변수로 덮어쓴다.
키를 채우지 않아도 **fake 제공자**로 전체 채팅 경로가 동작한다(오프라인/데모용).

## 현재 엔드포인트
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/health` | 상태 + 제공자/redteam 준비 여부 |
| GET | `/api/models` | 모델 목록(프론트 목업과 바이트 호환, `registered`는 서버 계산) |
| POST | `/api/chat/stream` | SSE 스트리밍 채팅 (BE-003) |
| POST | `/api/scan` | 취약점 스캔 (BE-007) |
| GET | `/api/scan/{runId}` | 캐시된 스캔 결과 |
| POST | `/api/review` | 로컬 코드 검수 + 요약 (BE-006) |
| POST | `/api/adjudicate` | 로컬 에이전트가 보낸 findings 에 gpt-4o 판정 |
| GET | `/api/fs/tree` | 워크스페이스 파일 트리 (BE-001) |
| POST | `/api/preview/start` | 워크스페이스 dev server 시작 (BE-002) |
| POST | `/api/preview/stop` | dev server 중지 |
| GET | `/api/preview/status` | 실행 상태 + URL + 최근 로그 |
| GET | `/api/keys` | 등록된 제공자 목록(마스킹된 힌트만) (BE-009) |
| POST | `/api/keys` | 사용자 키 등록 — 실제 제공자 호출로 검증 후 저장 |
| POST | `/api/keys/{provider}/test` | 저장하지 않고 키 유효성만 확인 |
| DELETE | `/api/keys/{provider}` | 키 삭제 |
| GET | `/api/usage/{provider}` | 사용량 (`?days=`, 기본 30) |

`/api/chat/stream` 이벤트: `message_start` → `delta*` → `message_done` (실패 시 `error`).

> **에이전트 실행은 여기 없다.** `claude`/`codex` 는 *사용자의* CLI 로그인으로 인증되므로
> 서버에서 돌리면 남의 계정을 쓰게 된다. 하네스는 `agent/` (사용자 PC) 로 옮겼고,
> 스튜디오는 `http://127.0.0.1:45455/local/agent/stream` 으로 붙는다.
> 서버가 맡는 보안 몫은 `POST /api/adjudicate` 하나 — 결정론 스캔 결과를 받아
> gpt-4o 로 판정해 돌려준다. 운영자 키가 서버 밖으로 나가지 않게 하는 유일한 방법이다.

## 에이전트 하네스는 클라이언트에 있다 (Increment 8 에서 이전)

`agent/codegate_agent/harness/` 를 참고. 아래 설명은 그쪽 코드의 동작이다.
`cwd` 는 `WORKSPACE_ROOT`, `permission_mode="acceptEdits"`, `setting_sources=["project"]`
(워크스페이스 `CLAUDE.md` 로드).

- **PreToolUse 훅** — 허용목록 밖 도구(Bash 등)를 거부한다. 서버에는 승인할 사람이 없으므로
  권한 프롬프트로 멈추는 대신 즉시 거부한다. (`allowed_tools` 는 콜백보다 먼저 승인하므로
  `can_use_tool` 이 아니라 훅을 쓴다.)
- **PostToolUse 훅** — Write/Edit 직후 `SecurityService.scan` 실행 →
  high/critical 이면 `additionalContext` 로 findings 를 되돌려 에이전트가 자가 수정.
  파일당 재스캔 3회 상한.
- **`red_team_scan` MCP 도구** — 에이전트가 명시적으로 스캔을 호출할 수도 있다.
- `app/services/agent_run_state.py` 가 SDK 메시지를 프론트 `agentRun` 형태로 접는다.
  보안 게이트는 "검수기" 서브에이전트로 표시된다.

## 보안 엔진 구조 (Increment 2)

**2단계 파이프라인** — 제품 설계("결정론 위치는 authoritative, LLM은 advisory")를 그대로 구현:

1. **결정론 코어** — C++ `sa-redteam` 을 **fake 백엔드**(네트워크 없음)로 서브프로세스 실행.
   파일 세그먼트화·taint 신호·위험 점수·랭킹으로 **권위 있는 file:line + 카테고리**를 얻는다.
   13종 탐지(command-injection, sql-injection, path-traversal, memory-safety, xss, ssrf …).
2. **LLM 레드팀 판정** — 각 finding 의 코드 조각을 **OpenAI gpt-4o**(`REDTEAM_MODEL`)로
   적대적 프로브. 심각도·확신도·근거·수정안을 보강하고 **오탐을 `dismissed` 로 판정**한다.
   키가 없거나 호출이 실패하면 휴리스틱 결과를 그대로 유지한다(안전한 저하).

> C++ `DirectApiBackend` 는 Anthropic Messages API 전용이라 gpt-4o 를 쓸 수 없다.
> 그래서 LLM 단계를 백엔드로 올렸고, 덕분에 **libcurl 빌드도 `SA_LLM_API_KEY` 도 불필요**하다.

`preventedCount` = `dismissed` 가 아닌 high/critical 수 → 대시보드 "예방한 보안 이슈"(BE-010) 로 연결.

### sa-redteam 빌드 (최초 1회)
```bash
cd ..   # 저장소 루트
cmake -S redteam -B redteam/build -DRT_ENABLE_DIRECT_BACKEND=OFF -DRT_BUILD_TESTS=ON
cmake --build redteam/build -j4
ctest --test-dir redteam/build      # 54/54 통과
```

## 구조
```
app/
  main.py            앱 팩토리 (CORS, 라우터, 예외 핸들러, lifespan)
  config.py          Settings (.env)
  errors.py          AppError 계층 → {"error":{code,message,detail}}
  sse.py logging.py deps.py
  routers/           health, models, chat, scan, review, agent, files
  schemas/           Pydantic 요청 스키마 (chat, security, agent)
  services/llm/      base(Protocol) + anthropic/openai/fake 제공자 + registry
  services/security_service.py   sa-redteam 호출 + gpt-4o 레드팀 판정
  services/subprocess_runner.py  고정 argv·timeout·출력 상한 격리 실행
  services/agent_service.py      Claude Agent SDK 하네스 + 보안 게이트 훅
  services/agent_run_state.py    SDK 메시지 → 프론트 agentRun 리듀서
  services/preview_service.py    dev server 프로세스 관리(고정 argv, 프로세스 그룹 종료)
run.py               .env 의 PORT 로 기동
tests/               health, models, chat-stream, security(실제 바이너리),
                     llm-adjudication·security-gate(목킹), agent-run-state, fs-tree,
                     preview — 모두 네트워크 없이 동작
                     (RUN_PREVIEW_TESTS=1 이면 실제 dev server 기동까지 검증)
```

## 검증
```bash
./.venv/bin/ruff check .
./.venv/bin/pytest -q            # 52 passed (1 skipped)
# 라이브 스모크
curl -s localhost:55555/api/health | python3 -m json.tool
curl -N -X POST localhost:55555/api/chat/stream -H 'content-type: application/json' \
  -d '{"model":"claude","messages":[{"role":"user","content":"안녕"}]}'
# 보안 스캔 (번들된 취약 픽스처 대상)
FIX=../redteam/tests/fixtures/projects/vuln_sample
curl -s -X POST localhost:55555/api/scan -H 'content-type: application/json' \
  -d "{\"project_root\":\"$(cd $FIX && pwd)\",\"changed_files\":[\"app.py\"],\"use_llm\":false}" \
  | python3 -m json.tool
```

## 라이브 프리뷰 (Increment 4)

`preview_service.py` 가 워크스페이스에서 `npm run dev` 를 자식 프로세스로 띄운다.
argv 는 고정이고(사용자 입력이 셸에 닿지 않음), 종료는 프로세스 그룹 단위라
`npm → vite` 트리가 통째로 정리된다. 백엔드 종료 시 lifespan 에서도 함께 멈춘다.

> Vite 는 출력에 ANSI 색상을 넣기 때문에 포트가 `localhost:\x1b[1m5190\x1b[22m/` 형태로 온다.
> 이스케이프를 제거한 뒤 URL 을 파싱한다(회귀 테스트로 고정).

## 사용자 로그인과 사용량 (Increment 5, BE-009)

**두 종류의 자격증명을 분리한다.** 섞으면 운영자 키로 사용자가 채팅하게 된다.

| | 출처 | 용도 | 사용자에게 노출 |
|---|---|---|---|
| 레드팀 키 | `.env` 의 `OPENAI_API_KEY` | gpt-4o 취약점 판정 | 아니오 — 모델 목록에 뜨지 않음 |
| 사용자 키 | UI → `POST /api/keys` | 그 사용자의 채팅 모델 | 마스킹 힌트만 |

- `.env` 키가 있어도 `/api/models` 의 `gpt` 는 `registered: false` 다
  (`test_redteam_key_does_not_register_gpt_for_the_user` 로 고정).
- `claude` 는 설치된 `claude` CLI 로그인으로 등록되므로 `ANTHROPIC_API_KEY` 가 필요 없다.
- 저장 위치는 `~/.config/codegate/credentials.json` (0600). 이 체크아웃은 exFAT 볼륨에 있을 수 있고
  거기서는 chmod 가 무시돼 모든 파일이 `-rwx------` 로 보이므로, 저장소 밖 홈 디렉터리에 둔다.
  `CODEGATE_CONFIG_DIR` 로 바꿀 수 있다.

`GET /api/usage/{provider}` 는 권위 순서대로 답한다:

1. **Admin 키(`sk-admin-…`)가 있으면** OpenAI `/v1/organization/usage/completions` 의 실제 수치
   (+`/v1/organization/costs` 의 비용). `source: "openai"`.
2. **없으면** Vibe Studio 가 직접 쓴 토큰만 집계. `source: "local"` + 이유를 담은 `warning`.

> 조직 사용량은 **Admin 키 전용**이다. 일반 프로젝트 키는 *인증*은 되지만 *인가*가 안 돼
> OpenAI 가 **403** 을 준다(401 은 잘못된 키일 때만). 실제 API 로 확인한 동작이며,
> 둘 다 "Admin 키가 필요합니다" 한 문장으로 바꿔 보여주고 요청 자체는 로컬 집계로 성공시킨다.

## 다음 증분
- 수정 승인 다이얼로그(BE-004 잔여), MCP (BE-008)
- 대시보드 집계·세션 영속·감사 (BE-010/011/013)
- 키 저장을 OS keychain 으로(현재는 0600 파일)

전체 계획은 저장소 루트 `README.md` 및 플랜 문서를 참고.
