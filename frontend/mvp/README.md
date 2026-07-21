# Vibe Studio

프로젝트 생성·폴더 열기·Claude Code/Codex 실행·hot-reload Live View를 한 화면에서 사용하는
로컬 AI 개발 스튜디오입니다. 별도 수집기 실행, 포트 입력, 토큰 페어링이 없습니다.

## 실행

```bash
cd frontend/mvp
npm install
npm run dev
```

`npm run dev` 한 번이 웹 UI와 내장 로컬 런타임을 함께 시작합니다. 첫 실행에만 `agent/.venv`와
Claude Agent SDK를 자동으로 준비합니다. 브라우저는 `http://localhost:5180`에서 열립니다.

## 프로젝트 흐름

- 왼쪽 `폴더 열기`로 운영체제 폴더 선택기에서 기존 프로젝트를 엽니다.
- `새로 만들기`는 React/Vite 프로젝트를 만들고 곧바로 선택합니다.
- `package.json`에 `dev` 스크립트가 있으면 의존성을 확인하고 dev server를 자동 시작합니다.
- Live View는 실제 dev server URL만 iframe으로 표시하며 목업 HTML로 폴백하지 않습니다.
- 모델 선택은 이 컴퓨터의 Claude Code/Codex 설치 및 로그인 상태를 그대로 반영합니다.

Claude는 터미널에서 `claude`, Codex는 `codex login`으로 로그인하면 됩니다. API 키를
브라우저에 입력하지 않습니다.
