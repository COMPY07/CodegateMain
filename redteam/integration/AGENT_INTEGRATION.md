# 메인 에이전트 통합 — `red_team` 도구 (LLM 툴-유즈)

sa-redteam을 LLM 툴-유즈 에이전트의 **하나의 도구**로 노출하는 방법입니다. 에이전트가 코드를
쓰거나 고친 뒤 `red_team` 도구를 호출하면, 얇은 핸들러가 요청을 조립해 `sa-redteam`을
서브프로세스로 실행하고 findings를 tool_result로 돌려줍니다.

## 구성 요소

- **`red_team.tool.json`** — Anthropic Messages API 도구 정의(name·description·input_schema).
  에이전트에게 그대로 `tools`로 전달. 에이전트는 `changed_files`(필수), `goals`, `model_output`만 채웁니다.
- **`red_team_tool.py`** — 참조 핸들러(Python). `run_red_team()` + `format_tool_result()`.
  TS/Claude Agent SDK 포팅은 서브프로세스 호출·결과 포맷 부분만 바꾸면 됩니다.

## 실행 흐름

```
에이전트 tool_use(red_team, {changed_files, goals, model_output})
  → 핸들러가 request 조립:
       agent 입력  + 하네스 컨텍스트(project.root, 최신 user_prompt,
                    상위 요약/합치는 LLM의 coding_flow·security_hints ← 있으면)
  → subprocess: sa-redteam run --backend <fake|direct> --compact
  → report.json 파싱 → 심각도순 요약 → tool_result 로 반환
에이전트가 high/critical 수정 → changed_files로 red_team 재호출(수렴까지, 상한 내)
```

## 역할 분담 — 무엇이 어디서 채워지나

| 필드 | 채우는 주체 |
|---|---|
| `changed_files`, `goals`, `model_output` | **에이전트**(도구 입력) |
| `user_prompt`, `project.root`, `backend` | **하네스**(대화/설정에서) |
| `coding_flow`, `security_hints` | **상위 단계**(요약·합치는 LLM) — 있으면 하네스가 첨부, 없으면 생략 |

도구 스키마를 최소로 유지하는 이유: 에이전트가 아는 것만 입력받고, 나머지는 하네스가 컨텍스트에서 주입.

## 시스템 프롬프트 지침 (에이전트에게)

> 소스 파일을 만들거나 수정한 뒤 — 특히 신뢰되지 않은 입력(웹 요청·파일 경로·셸 명령·SQL·역직렬화·
> 인증·암호)을 다루는 코드라면 — `red_team` 도구를 방금 바뀐 파일(`changed_files`)로 호출하라.
> 반환된 high/critical finding은 각 `suggested_fix`(또는 더 나은 수정)로 고친 뒤, 같은 파일로
> `red_team`을 다시 호출해 새 high/critical이 없는지 확인하라. 스캐너의 file:line 위치는 신뢰하라.
> 무한 루프를 피하기 위해 재호출은 파일당 3회로 제한하고, 남는 finding은 사용자에게 보고하라.

(위 지침은 최신 모델이 도구를 과도/과소 호출하지 않도록 "언제 호출/어떻게 대응"을 명시한 것입니다.)

## 백엔드 선택

- **개발 루프**: `--backend fake` — 결정론적, 네트워크 없음(휴리스틱 finding만). 빠르고 재현 가능.
- **커밋/빌드 직전 감사**: `--backend direct` — 실제 LLM 프로브. `SA_LLM_API_KEY` 환경변수 필요,
  `-DRT_ENABLE_DIRECT_BACKEND=ON`으로 빌드한 바이너리 사용. 이때 finding의 `source`가 `both`로 승격.

## 보안 메모

- 스캐너를 **서브프로세스로 격리** 실행(생성된 잠재적 취약 코드를 다루므로). 스캐너가 죽어도 에이전트는 유지.
- API 키는 sa-redteam이 **환경변수에서 직접** 읽음 — 도구 입력이나 인자로 전달하지 않음.
- LLM으로 나가는 코드 조각은 sa-redteam 내부에서 secret 마스킹됨.

## 빠른 확인

```bash
# fake 백엔드 스모크 (repo 루트에서)
python3 integration/red_team_tool.py
```
