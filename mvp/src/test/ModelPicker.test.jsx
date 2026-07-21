import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import ModelPicker from '../components/ModelPicker.jsx'

describe('ModelPicker', () => {
  beforeEach(() => window.localStorage.clear())

  it('등록된 모델을 선택하고 브라우저에 저장한다', async () => {
    const user = userEvent.setup()
    const { container } = render(<ModelPicker />)
    await user.click(container.querySelector('.model-current'))
    await user.click(screen.getByRole('button', { name: /GPT/ }))
    await waitFor(() => expect(window.localStorage.getItem('vibe:model')).toBe('gpt'))
  })

  it('미등록 모델을 누르면 연결 안내 모달을 표시한다', async () => {
    const user = userEvent.setup()
    const { container } = render(<ModelPicker />)
    await user.click(container.querySelector('.model-current'))
    await user.click(screen.getByRole('button', { name: /Gemini/ }))
    expect(screen.getByText('새 모델 연결')).toBeInTheDocument()
    expect(screen.getByText(/실제 키 등록·검증은 백엔드 연동/)).toBeInTheDocument()
  })
})
