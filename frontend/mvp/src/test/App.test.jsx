import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App.jsx'

// 프리뷰 메시지는 반드시 해당 iframe 의 contentWindow 에서 와야 받아들여진다
// (LiveWeb 이 e.source 를 검증한다). 실제 경로와 동일하게 흉내낸다.
const postPick = (container, label, selector) => {
  const source = container.querySelector('iframe')?.contentWindow
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source,
      origin: 'http://localhost:5190',
      data: { source: 'vibe-preview', type: 'pick', label, selector },
    }))
  })
}

describe('App 핵심 사용자 흐름', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem('vibe:project', 'shop')
    window.history.replaceState(null, '', '/#live')
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input)
      const json = (body) => new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
      if (url.includes('/local/projects')) {
        return json({
          root: '/Users/me/CodeGateProjects',
          projects: [{ id: 'shop', name: 'shop', path: '/Users/me/shop', runnable: true }],
        })
      }
      if (url.includes('/local/preview/status')) {
        return json({ running: true, url: 'http://localhost:5190', projectPath: '/Users/me/shop', logs: [] })
      }
      if (url.includes('/local/agent/status')) {
        return json({ models: { claude: true, gpt: true }, modelDetails: {} })
      }
      if (url.includes('/local/fs/tree')) return json([])
      if (url.includes('/local/agent/stream')) {
        return new Response(
          'event: message_start\ndata: {}\n\nevent: message_done\ndata: {"text":"완료"}\n\n',
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        )
      }
      return json({})
    }))
  })

  it('질문 모드와 영역 선택 모드를 배타적으로 활성화하고 hash를 갱신한다', async () => {
    const user = userEvent.setup()
    render(<App />)

    const question = screen.getByTitle(/질문 모드/)
    const region = screen.getByTitle(/서클 투 서치/)
    await user.click(question)
    expect(question).toHaveClass('active')
    expect(window.location.hash).toBe('#live,q')

    await user.click(region)
    expect(question).not.toHaveClass('active')
    expect(region).toHaveClass('active')
    expect(window.location.hash).toBe('#live,region')
  })

  it('selector 기준으로 칩 중복을 막고 모든 칩을 전송 메시지에 표시한다', async () => {
    const user = userEvent.setup()
    const { container } = render(<App />)

    await waitFor(() => expect(container.querySelector('iframe')).not.toBeNull())

    postPick(container, '같은 이름', '#first')
    postPick(container, '같은 이름', '#second')
    postPick(container, '중복 이름', '#first')
    expect(screen.getAllByRole('button', { name: /칩 삭제/ })).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: '↑' }))
    const questions = container.querySelectorAll('.msg.q')
    const latestQuestion = questions[questions.length - 1]
    expect(latestQuestion.querySelectorAll('.mchip')).toHaveLength(2)
    expect(latestQuestion).toHaveTextContent('같은 이름')
  })

  it('세션을 추가하고 localStorage에 보존한다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('세션 추가'))
    const nameInput = screen.getByRole('textbox', { name: '세션 이름' })
    expect(nameInput).toHaveValue('New Agent 2')
    await user.type(nameInput, '{enter}')
    expect(screen.getByTitle('New Agent 2 · 더블클릭 또는 F2로 이름 변경')).toBeInTheDocument()
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('vibe-studio.sessions.v2'))
      expect(saved).toHaveLength(2)
    })
  })

  it('외부 hash 변경에서 탭과 도구 상태를 복원한다', async () => {
    render(<App />)
    act(() => {
      window.history.replaceState(null, '', '/#live,q')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    await waitFor(() => expect(screen.getByTitle(/질문 모드/)).toHaveClass('active'))
    expect(screen.getByText('라이브 웹').closest('button')).toHaveClass('active')
  })

  it('세션 삭제를 공통 확인 dialog로 승인하고 결과 toast를 표시한다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByTitle('세션 추가'))
    await user.type(screen.getByRole('textbox', { name: '세션 이름' }), '{enter}')
    await user.click(screen.getByRole('button', { name: '현재 세션 삭제' }))
    expect(screen.getByRole('dialog', { name: '세션 삭제' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(await screen.findByText(/세션을 삭제했습니다/)).toBeInTheDocument()
    expect(screen.queryByTitle('New Agent 2 · 더블클릭 또는 F2로 이름 변경')).not.toBeInTheDocument()
  })
})
