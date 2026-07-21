import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AgentProgress from '../components/AgentProgress.jsx'

const run = (over = {}) => ({
  title: '로그인 폼 추가',
  runId: 101,
  main: {
    name: '오케스트레이터',
    role: 'Main Agent',
    status: 'running',
    steps: [{ state: 'active', head: '파일 작성', thought: 'src/App.jsx', tool: 'Write App.jsx' }],
  },
  subs: [],
  ...over,
})

describe('AgentProgress', () => {
  // 회귀 방지: 예전에는 빈 상태 확인 전에 run 을 역참조해 null 이면 크래시했다.
  it('실행이 없을 때(run=null) 크래시하지 않고 빈 상태를 보여준다', () => {
    render(<AgentProgress run={null} />)
    expect(screen.getByText('진행 중인 에이전트 실행이 없습니다')).toBeInTheDocument()
  })

  it('연결이 끊기면 재연결 안내를 보여준다', () => {
    render(<AgentProgress run={null} connection="disconnected" />)
    expect(screen.getByText('에이전트 연결이 끊겼습니다')).toBeInTheDocument()
  })

  it('실행 정보를 렌더한다', () => {
    render(<AgentProgress run={run()} />)
    expect(screen.getByText(/실행 #101/)).toBeInTheDocument()
    expect(screen.getByText('오케스트레이터')).toBeInTheDocument()
    expect(screen.getByText('파일 작성')).toBeInTheDocument()
  })

  it('보안 게이트를 검수기 서브에이전트로 표시한다', () => {
    render(
      <AgentProgress
        run={run({
          subs: [
            {
              id: 'review',
              name: '검수기',
              role: 'Reviewer',
              status: 'failed',
              order: 1,
              progress: 100,
              files: ['src/api.js'],
              current: '1건 수정 필요',
              steps: [{ state: 'failed', head: '변경 diff 검수', thought: '...', tool: null }],
            },
          ],
        })}
      />,
    )
    expect(screen.getByText('검수기')).toBeInTheDocument()
    // 카드는 현재 상태를 "▸ {current}" 로 렌더한다.
    expect(screen.getByText(/1건 수정 필요/)).toBeInTheDocument()
    expect(screen.getByText('src/api.js')).toBeInTheDocument()
  })

  it('시나리오 선택기(개발용 시뮬레이션)를 더 이상 렌더하지 않는다', () => {
    const { container } = render(<AgentProgress run={run()} />)
    expect(container.querySelector('.agent-scenarios')).toBeNull()
  })
})
