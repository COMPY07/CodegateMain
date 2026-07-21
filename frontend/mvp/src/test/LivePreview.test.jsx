import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CenterViewport from '../components/CenterViewport.jsx'

// frontend/CLAUDE.md: "iframe 메시지는 origin과 payload를 검증한다"
// 실제 dev server 를 임베드하면 origin 이 생기므로 이 검증이 실동작한다.

const PREVIEW_URL = 'http://localhost:5190'
const PROJECT = { id: 'shop', name: 'shop', path: '/Users/me/shop', runnable: true }

function renderLive(over = {}) {
  const onPick = vi.fn()
  const onRegionPick = vi.fn()
  const utils = render(
    <CenterViewport
      activeTab="live"
      questionMode
      regionMode={false}
      onPick={onPick}
      onRegionPick={onRegionPick}
      previewWidth={null}
      previewReloadKey={0}
      highlightGroups={[]}
      preview={{ status: 'running', url: PREVIEW_URL, logs: [], error: null }}
      project={PROJECT}
      projectsStatus="ready"
      {...over}
    />,
  )
  const iframe = utils.container.querySelector('iframe')
  return { ...utils, onPick, onRegionPick, iframe }
}

// contentWindow 는 jsdom 에서 읽기 전용이라 정의를 덮어써 흉내낸다.
function fakeContentWindow(iframe) {
  const win = { postMessage: vi.fn() }
  Object.defineProperty(iframe, 'contentWindow', { value: win, configurable: true })
  return win
}

function post({ source, origin = PREVIEW_URL, data }) {
  window.dispatchEvent(new MessageEvent('message', { source, origin, data }))
}

describe('LiveWeb (라이브 프리뷰)', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('dev server 가 떠 있으면 실제 URL 을 iframe src 로 쓴다', () => {
    const { iframe } = renderLive()
    expect(iframe.getAttribute('src')).toBe(PREVIEW_URL)
    expect(iframe.hasAttribute('srcdoc')).toBe(false)
    expect(screen.getByText(/localhost:5190/)).toBeInTheDocument()
  })

  it('dev server 가 없으면 목업을 렌더링하지 않고 실제 서버 상태를 안내한다', () => {
    const { container } = renderLive({ preview: { status: 'idle', url: null } })
    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('[srcdoc]')).toBeNull()
    expect(screen.getByText(/개발 서버를 준비하고 있습니다/)).toBeInTheDocument()
  })

  it('다른 origin 에서 온 pick 메시지는 무시한다', async () => {
    const { iframe, onPick } = renderLive()
    const win = fakeContentWindow(iframe)
    post({
      source: win,
      origin: 'http://evil.example',
      data: { source: 'vibe-preview', type: 'pick', label: 'x', selector: 'y' },
    })
    await waitFor(() => expect(onPick).not.toHaveBeenCalled())
  })

  it('이 iframe 이 아닌 창에서 온 메시지는 무시한다', async () => {
    const { iframe, onPick } = renderLive()
    fakeContentWindow(iframe)
    post({
      source: { postMessage: vi.fn() },   // 다른 창
      data: { source: 'vibe-preview', type: 'pick', label: 'x', selector: 'y' },
    })
    await waitFor(() => expect(onPick).not.toHaveBeenCalled())
  })

  it('origin 과 source 가 맞으면 pick 을 전달한다', async () => {
    const { iframe, onPick } = renderLive()
    const win = fakeContentWindow(iframe)
    post({
      source: win,
      data: { source: 'vibe-preview', type: 'pick', label: 'URL 입력 필드', selector: 'header input' },
    })
    await waitFor(() =>
      expect(onPick).toHaveBeenCalledWith({ label: 'URL 입력 필드', selector: 'header input' }),
    )
  })

  it('형태가 잘못된 payload 는 버린다', async () => {
    const { iframe, onPick, onRegionPick } = renderLive()
    const win = fakeContentWindow(iframe)

    // label 이 문자열이 아님
    post({ source: win, data: { source: 'vibe-preview', type: 'pick', label: 42, selector: 'x' } })
    // rect 좌표가 숫자가 아님
    post({
      source: win,
      data: { source: 'vibe-preview', type: 'region', rect: { x: 'a', y: 0, w: 1, h: 1 }, elements: [] },
    })
    await waitFor(() => {
      expect(onPick).not.toHaveBeenCalled()
      expect(onRegionPick).not.toHaveBeenCalled()
    })
  })

  it('region 요소 목록에서 형태가 어긋난 항목만 걸러낸다', async () => {
    const { iframe, onRegionPick } = renderLive()
    const win = fakeContentWindow(iframe)
    post({
      source: win,
      data: {
        source: 'vibe-preview',
        type: 'region',
        groupId: 3,
        rect: { x: 1, y: 2, w: 3, h: 4 },
        elements: [
          { label: '버튼', selector: 'button', extra: '무시됨' },
          { label: 5, selector: 'bad' },
          null,
        ],
      },
    })
    await waitFor(() =>
      expect(onRegionPick).toHaveBeenCalledWith({
        groupId: 3,
        rect: { x: 1, y: 2, w: 3, h: 4 },
        elements: [{ label: '버튼', selector: 'button' }],
      }),
    )
  })

  it('브리지의 ready 신호를 받으면 현재 모드를 정확한 origin 으로 다시 보낸다', async () => {
    const { iframe } = renderLive()
    const win = fakeContentWindow(iframe)
    win.postMessage.mockClear()

    post({ source: win, data: { source: 'vibe-preview', type: 'ready' } })

    await waitFor(() => expect(win.postMessage).toHaveBeenCalled())
    for (const call of win.postMessage.mock.calls) {
      expect(call[1]).toBe(PREVIEW_URL)   // 와일드카드가 아니어야 한다
    }
    const types = win.postMessage.mock.calls.map(c => c[0].type)
    expect(types).toContain('qmode')
    expect(types).toContain('region')
    expect(types).toContain('syncHighlights')
  })
})
