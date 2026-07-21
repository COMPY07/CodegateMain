import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { streamAgent } from '../api/client.js'

describe('streamAgent의 내장 런타임 연결', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })
  afterEach(() => vi.restoreAllMocks())

  const okStream = () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(
          'event: message_done\ndata: {"text":"끝"}\n\n',
        ))
        controller.close()
      },
    }),
  })

  it('별도 토큰이나 포트 없이 같은 origin 런타임으로 보낸다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream())

    await streamAgent({ prompt: '안녕', model: 'gpt', sessionId: 7, project: 'shop' })

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/local/agent/stream')
    expect(init.headers.Authorization).toBeUndefined()
    expect(JSON.parse(init.body)).toMatchObject({
      model: 'gpt', session_id: 7, project: 'shop', prompt: '안녕',
    })
  })

  it('중앙 /api 에이전트로 우회하지 않는다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream())

    await streamAgent({ prompt: '안녕' })

    expect(String(fetchSpy.mock.calls[0][0])).toBe('/local/agent/stream')
  })

  it('SSE 완료 응답을 그대로 전달한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(okStream())
    const onDone = vi.fn()

    await streamAgent({ prompt: '안녕', onDone })

    expect(onDone).toHaveBeenCalledWith({ text: '끝' })
  })
})
