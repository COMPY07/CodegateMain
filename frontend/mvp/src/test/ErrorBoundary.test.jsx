import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ErrorBoundary from '../components/ErrorBoundary.jsx'

function BrokenView() {
  throw new Error('test render failure')
}

describe('ErrorBoundary', () => {
  it('렌더링 오류에 복구 화면을 표시한다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><BrokenView /></ErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('화면을 표시하지 못했습니다.')
    expect(screen.getByRole('button', { name: '앱 다시 불러오기' })).toBeInTheDocument()
  })
})
