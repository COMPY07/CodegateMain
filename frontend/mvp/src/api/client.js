// 백엔드(/api) 클라이언트.
// 스트리밍은 SSE 로 받는데, POST 바디(prompt·chips)를 보내야 하므로
// EventSource 대신 fetch + ReadableStream 리더로 SSE 를 직접 파싱한다.

async function getJson(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error?.message || `요청 실패 (${res.status})`)
  }
  return data
}

export const getHealth = () => getJson('/api/health')
export const getModels = ({ withUsage = false } = {}) =>
  getJson(`/api/models${withUsage ? '?withUsage=1' : ''}`)
// 모델 계정 연결(BE-009). 키는 서버에만 저장되고 응답에는 절대 포함되지 않는다.
export const getKeys = () => getJson('/api/keys')
export const saveKey = (body) => postJson('/api/keys', body)
export const testKey = (provider) => postJson(`/api/keys/${provider}/test`, {})
export const getUsage = (provider, days = 30) =>
  getJson(`/api/usage/${provider}?days=${days}`)

export async function deleteKey(provider) {
  const res = await fetch(`/api/keys/${provider}`, { method: 'DELETE' })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error?.message || `요청 실패 (${res.status})`)
  return data
}

// SSE 한 덩어리(빈 줄로 구분)를 { event, data } 로 파싱한다.
function parseSseChunk(chunk) {
  let event = 'message'
  const dataLines = []
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  let data = null
  try { data = JSON.parse(dataLines.join('\n')) } catch { data = null }
  return { event, data }
}

// SSE 응답 본문을 끝까지 읽으며 handlers[event](data) 를 호출한다.
async function consumeSse(res, handlers) {
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const parsed = parseSseChunk(chunk)
      if (!parsed) continue
      const fn = handlers[parsed.event]
      if (fn) fn(parsed.data || {})
    }
  }
}

// POST 후 SSE 를 소비하는 공통 경로. 중단(AbortError)은 조용히 무시한다.
async function streamPost(path, body, { signal, onError, handlers, headers = {} }) {
  let res
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (err?.name === 'AbortError') return
    onError?.({ message: err?.message || '백엔드에 연결할 수 없습니다.' })
    return
  }
  if (!res.ok || !res.body) {
    onError?.({ message: `요청 실패 (${res.status})` })
    return
  }
  try {
    await consumeSse(res, handlers)
  } catch (err) {
    if (err?.name === 'AbortError') return
    onError?.({ message: err?.message || '스트림이 중단되었습니다.' })
  }
}

/**
 * 코딩 에이전트 실행. 한 연결에서 채팅과 에이전트 보드를 함께 받는다.
 *
 * 같은 origin의 /local은 Vibe Studio가 함께 띄운 내장 런타임으로 프록시된다.
 * Claude Code/Codex는 이 컴퓨터의 기존 로그인을 그대로 사용한다.
 */
export function streamAgent({
  sessionId = null,
  prompt,
  chips = [],
  model = 'claude',
  project = '',
  signal,
  onStart,
  onDelta,
  onDone,
  onRunUpdate,
  onError,
}) {
  return streamPost(
    '/local/agent/stream',
    { session_id: sessionId, prompt, chips, model, project },
    {
      signal,
      onError,
      handlers: {
        message_start: (d) => onStart?.(d),
        delta: (d) => onDelta?.(d.text || ''),
        message_done: (d) => onDone?.(d),
        run_update: (d) => onRunUpdate?.(d),
        error: (d) => onError?.(d),
      },
    },
  )
}

/**
 * 에이전트를 쓰지 않는 단순 채팅 스트림(폴백).
 */
export function streamChat({
  sessionId = null,
  model = 'claude',
  messages,
  chips = [],
  signal,
  onStart,
  onDelta,
  onDone,
  onError,
}) {
  return streamPost(
    '/api/chat/stream',
    { session_id: sessionId, model, messages, chips },
    {
      signal,
      onError,
      handlers: {
        message_start: (d) => onStart?.(d),
        delta: (d) => onDelta?.(d.text || ''),
        message_done: (d) => onDone?.(d),
        error: (d) => onError?.(d),
      },
    },
  )
}
