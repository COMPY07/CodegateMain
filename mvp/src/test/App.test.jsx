import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppContent } from '../App.jsx'
import { NotificationProvider } from '../components/Notifications.jsx'

// 앱 최상위(App)는 프로젝트 런처를 먼저 렌더한다. 아래 테스트들은
// 에디터 내부 동작을 검증하므로 런처 게이트 없이 에디터 유닛을 직접 렌더한다.
// (런처는 File System Access API 의존이라 별도 테스트로 다룬다.)
const App = () => (
  <NotificationProvider><AppContent /></NotificationProvider>
)

const postPick = (label, selector) => {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data: { source: 'vibe-preview', type: 'pick', label, selector },
    }))
  })
}

describe('App 핵심 사용자 흐름', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, '', '/#live')
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

    postPick('같은 이름', '#first')
    postPick('같은 이름', '#second')
    postPick('중복 이름', '#first')
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
    await user.click(screen.getByRole('button', { name: '새 에이전트 만들기' }))
    const nameInput = screen.getByRole('textbox', { name: '세션 이름' })
    expect(nameInput).toHaveValue('New Agent 4')
    await user.type(nameInput, '{enter}')
    expect(screen.getByTitle('New Agent 4 · 더블클릭 또는 F2로 이름 변경')).toBeInTheDocument()
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('vibe-studio.sessions.v1'))
      expect(saved).toHaveLength(4)
    })
  })

  it('탭 관리 메뉴에서 도구 탭을 열고 닫는다', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.queryByRole('button', { name: 'report.pdf 탭 닫기' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '도구 탭 관리' }))
    const pdfToggle = screen.getByRole('checkbox', { name: 'report.pdf' })
    expect(pdfToggle).not.toBeChecked()

    await user.click(pdfToggle)
    expect(pdfToggle).toBeChecked()
    expect(screen.getByRole('button', { name: 'report.pdf 탭 닫기' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'report.pdf 탭 닫기' }))
    await user.click(screen.getByRole('button', { name: '도구 탭 관리' }))
    expect(screen.getByRole('checkbox', { name: 'report.pdf' })).not.toBeChecked()
  })

  it('핵심 화면은 항상 표시하고 닫기 기능을 제공하지 않는다', () => {
    render(<App />)

    expect(screen.queryByRole('button', { name: '에이전트 CoT 탭 닫기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '라이브 웹 탭 닫기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '대시보드 탭 닫기' })).not.toBeInTheDocument()
    expect(screen.getByText('에이전트 CoT')).toBeInTheDocument()
    expect(screen.getByText('라이브 웹')).toBeInTheDocument()
    expect(screen.getByText('대시보드')).toBeInTheDocument()
  })

  it('상단 전용 버튼에서 새 에이전트를 만든다', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '새 에이전트 만들기' }))

    expect(screen.getByRole('textbox', { name: '세션 이름' })).toHaveValue('New Agent 4')
    expect(screen.getByText('◐ 멀티 에이전트 작업 현황')).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: '현재 세션 삭제' }))
    expect(screen.getByRole('dialog', { name: '세션 삭제' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(await screen.findByText(/세션을 삭제했습니다/)).toBeInTheDocument()
    expect(screen.queryByTitle('첫 작업 · 더블클릭 또는 F2로 이름 변경')).not.toBeInTheDocument()
  })
})
