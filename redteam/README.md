# sa-redteam — 레드 티밍 단계 (secure_agent)

`secure_agent` 파이프라인의 **개발 단계 레드 티밍** 컴포넌트입니다. 메인 에이전트가 호출하면,
① 사용자 프롬프트·목표, ② 모델 출력, ③ coding flow 세 신호를 읽어 현재 작성된 파일들 중
**취약 가능성이 높은 지점을 '대략' 필터링**한 뒤 그 지점에 레드 티밍(LLM 프로브)을 수행하고,
분석 리포트를 메인 에이전트로 되돌려줍니다(각 finding에 `fix_request` 포함).

## 아키텍처

- **결정론적 코어(`redteam_core`)** — 파일 세그먼트화·신호 탐지·위험 점수화·랭킹·finding 합성.
  JSON/네트워크 라이브러리를 링크하지 않아 **LLM 없이도 빌드·테스트가 통과**합니다.
- **LLM 백엔드 포트(`LlmBackend`)** — 레드팀 추론은 이 포트 뒤에 격리됩니다.
  - `DirectApiBackend` (libcurl → Anthropic Messages API): API 키를 받아 직접 호출.
  - `FakeBackend`: 결정론적 테스트/오프라인 실행.
- **결정론 위치·신호가 authoritative**, LLM은 심각도·수정안에 advisory. `FindingSynthesizer`가
  LLM 환각(범위 밖 라인 등)을 검증·정렬한 뒤 휴리스틱 finding과 병합합니다.
- 코드 조각은 LLM으로 나가기 전에 **secret 마스킹(redaction)** 됩니다.

## 빌드

```bash
# 기본(네트워크 없음): 결정론 코어 + Fake 백엔드. curl 링크 안 함.
cmake -S . -B build -DRT_ENABLE_DIRECT_BACKEND=OFF -DRT_BUILD_TESTS=ON
cmake --build build -j4
ctest --test-dir build

# 실제 LLM 호출용(libcurl):
cmake -S . -B build-direct -DRT_ENABLE_DIRECT_BACKEND=ON
cmake --build build-direct -j4
```

요구사항: CMake ≥ 3.20, C++20 컴파일러, (Direct 백엔드에 한해) libcurl. nlohmann/json·GoogleTest는 FetchContent로 받습니다.

## 호출 (메인 에이전트 ↔ 도구)

```bash
sa-redteam run [--backend fake|direct] [--compact] < request.json > report.json
```

- 종료 코드: **finding 개수와 무관하게 성공이면 0**. 사용법 오류 2, 잘못된 요청 JSON 3.
- API 키는 요청의 `backend.direct.api_key_env`가 지정한 **환경 변수에서만** 읽습니다(argv/로그에 남기지 않음).

예시:
```bash
./build/sa-redteam run --compact < examples/request.example.json | python3 -m json.tool
```

### 입력 (`request.json`)
`signals`(user_prompt·goals·model_output·`coding_flow`·`security_hints`), `project`(root·include/exclude·changed_files),
`backend`(kind: `fake`|`direct`, direct: base_url·model·api_key_env), `limits`, `config`(weights·min_severity).
자세한 필드는 `examples/request.example.json` 및 아래 finding 스키마 참고. `coding_flow`/`security_hints`는
상위 단계(요약·합치는 LLM)가 있으면 넘기고, 없으면 도구가 자체 경량 추론으로 저하(fallback)합니다.

### 출력 (`report.json`) — finding 스키마가 핵심 산출물
```json
{
  "findings": [{
    "id": "RT-0001",
    "location": {"file": "app.py", "start_line": 15, "end_line": 15},
    "function": "ping",
    "category": "command-injection",
    "cwe": ["CWE-78"],
    "severity": "critical",
    "confidence": 0.9,
    "source": "both",
    "status": "confirmed",
    "title": "...",
    "rationale": "...",
    "evidence": {"code_slice": "...", "matched_pattern": "sink:os_system", "signals": ["source:http-request", "proximity:source+sink"]},
    "suggested_fix": "...",
    "fix_request": {"target": "main_agent", "action": "apply_patch", "priority": 1}
  }],
  "ranked_regions": [...],
  "signal_summary": {"intent_profile": {"command-injection": 0.8}},
  "run": {"id": "...", "backend": "fake", "config_hash": "...", "stats": {...}},
  "errors": []
}
```
`source`는 `heuristic`|`llm`|`both`. 모든 finding은 `fix_request`(→`main_agent`)를 가져 보안 에이전트가 그대로 소비합니다.

## 탐지 범주

command-injection, path-traversal, sql-injection, deserialization, ssrf, code-injection,
memory-safety(C/C++), auth-weakness, crypto-weakness, secret-exposure, redos, csrf, xss.
언어 자동 감지(Python·JS/TS·C/C++ 등, 미지원은 범용 폴백). 패턴은 `src/domain/PatternLibrary.cpp`에서 데이터로 튜닝.
