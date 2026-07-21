# Vibe Studio

로컬 프로젝트를 만들거나 기존 폴더를 열고, Claude Code/Codex로 편집하면서 실제 hot-reload
화면을 확인하는 하나의 개발 소프트웨어입니다.

## 빠른 시작

```bash
cd frontend/mvp
npm install
npm run dev
```

브라우저에서 `http://localhost:5180`을 엽니다. 이것으로 끝입니다. 별도 수집기 실행, 로컬 포트
입력, 토큰 복사, API 키 입력은 필요하지 않습니다. 첫 실행 시 필요한 Python 가상환경과
Claude Agent SDK도 실행기가 자동으로 준비합니다.

## 실제 동작

- `폴더 열기`: 운영체제 폴더 선택기로 임의의 기존 프로젝트를 선택합니다.
- `새로 만들기`: 바로 실행 가능한 React/Vite 프로젝트를 생성합니다.
- 파일 트리: 선택한 실제 프로젝트 폴더를 읽습니다.
- Live View: 선택 프로젝트의 `dev` 스크립트를 실행하고 실제 localhost URL을 iframe에
  표시합니다. 샘플 HTML이나 `srcDoc` 목업은 사용하지 않습니다.
- Claude/Codex: 이 컴퓨터에 설치·로그인된 CLI를 사용해 선택 프로젝트를 실제로 편집합니다.

Claude는 `claude`, Codex는 `codex login`으로 한 번 로그인하면 모델 선택기에 사용 가능 상태가
표시됩니다.

## 구조

```text
frontend/mvp/   Vibe Studio UI + 단일 개발 실행기 + /local 프록시
agent/          앱이 자동으로 구동하는 내부 프로젝트/AI 런타임
workspace/      기본 예제 프로젝트
backend/        선택적인 중앙 API
redteam/        선택적인 보안 엔진 소스
```

내부 런타임은 별도 제품이나 수집기가 아닙니다. `npm run dev`의 자식 프로세스로 함께 시작되고
웹이 종료되면 같이 종료됩니다. 브라우저는 같은 origin의 `/local/*`만 호출하므로 사용자가
런타임 토큰이나 포트를 관리하지 않습니다.

## 검증

```bash
cd frontend/mvp
npm test -- --run
npm run test:e2e
npm run build

cd ../../agent
./.venv/bin/python -m pytest
./.venv/bin/ruff check codegate_agent tests
```
