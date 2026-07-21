import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AgentProgress from '../components/AgentProgress.jsx'
import { agentRun } from '../data/mockData.js'

describe('AgentProgress 모델 전환', () => {
  it('각 에이전트에 현재 사용 모델을 표시한다', () => {
    render(<AgentProgress run={agentRun} />)

    expect(screen.getAllByRole('button', { name: /모델 변경 · 현재/ })).toHaveLength(5)
    expect(screen.getByRole('button', { name: '오케스트레이터 모델 변경 · 현재 Claude' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '테스트 작성 모델 변경 · 현재 Kimi' })).toBeInTheDocument()
  })

  it('모델을 변경하고 컨텍스트 인수인계 이벤트를 타임라인에 기록한다', async () => {
    const user = userEvent.setup()
    render(<AgentProgress run={agentRun} />)

    await user.click(screen.getByRole('button', { name: '폼 검증기 모델 변경 · 현재 Claude' }))
    await user.click(screen.getByRole('button', { name: 'GPT 모델로 변경' }))

    expect(screen.getByRole('button', { name: '폼 검증기 모델 변경 · 현재 GPT' })).toBeInTheDocument()
    expect(screen.getByText('Claude → GPT')).toBeInTheDocument()
    expect(screen.getByText(/컨텍스트 요약과 변경 파일을 인수인계/)).toBeInTheDocument()
    expect(screen.getByText('전환 예정')).toBeInTheDocument()
  })
})
