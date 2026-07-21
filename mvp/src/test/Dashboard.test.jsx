import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Dashboard from '../components/Dashboard.jsx'

describe('Dashboard', () => {
  it('Goal 체크 상태를 읽기 전용으로 표시한다', () => {
    render(<Dashboard />)

    expect(screen.getByText('50%', { selector: '.stat .n' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Goal·AI 사용 대시보드 구성' })).toBeDisabled()
    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(screen.getAllByRole('checkbox').every(checkbox => checkbox.disabled)).toBe(true)
    expect(screen.getByRole('progressbar', { name: 'Goal 진행률' })).toHaveAttribute('aria-valuenow', '50')
  })

  it('기간을 바꾸면 AI 사용 정보를 갱신한다', async () => {
    const user = userEvent.setup()
    render(<Dashboard />)

    expect(screen.getByText('142')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '7일' }))

    expect(screen.getByText('34')).toBeInTheDocument()
    expect(screen.getByText('$1.84')).toBeInTheDocument()
  })
})
