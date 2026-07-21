import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getLocalRuntimeStatus = vi.fn()
vi.mock('../api/localRuntime.js', () => ({
  getLocalRuntimeStatus: (...args) => getLocalRuntimeStatus(...args),
}))

import ModelPicker from '../components/ModelPicker.jsx'

const status = (claude, gpt) => ({
  models: { claude, gpt },
  modelDetails: {
    claude: { ready: claude, hint: claude ? '사용 가능' : 'SDK 설치와 로그인을 확인하세요.' },
    gpt: { ready: gpt, hint: gpt ? '사용 가능' : 'Codex CLI 로그인 필요' },
  },
})

describe('ModelPicker', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    getLocalRuntimeStatus.mockResolvedValue(status(true, true))
  })

  const openMenu = async (user, container) =>
    user.click(container.querySelector('.model-current'))

  it('로컬에서 사용할 수 있는 Codex를 선택하고 저장한다', async () => {
    const user = userEvent.setup()
    const { container } = render(<ModelPicker />)
    await waitFor(() => expect(container.querySelector('.mc-ready')).toBeInTheDocument())
    await openMenu(user, container)
    await user.click(screen.getByRole('button', { name: /GPT/ }))
    expect(window.localStorage.getItem('vibe:model')).toBe('gpt')
  })

  it('실행 가능 여부를 중앙 API 키가 아닌 내장 런타임 상태로 표시한다', async () => {
    getLocalRuntimeStatus.mockResolvedValue(status(false, true))
    const user = userEvent.setup()
    const { container } = render(<ModelPicker />)

    await waitFor(() => expect(window.localStorage.getItem('vibe:model')).toBe('gpt'))
    await openMenu(user, container)
    const [claudeItem, gptItem] = container.querySelectorAll('.mm-item')
    expect(claudeItem).toHaveTextContent('연결 필요')
    expect(gptItem).toHaveTextContent('사용 가능')
  })

  it('연결되지 않은 Claude를 누르면 SDK·CLI 로그인 방법을 안내한다', async () => {
    getLocalRuntimeStatus.mockResolvedValue(status(false, true))
    const user = userEvent.setup()
    const { container } = render(<ModelPicker />)
    await waitFor(() => expect(window.localStorage.getItem('vibe:model')).toBe('gpt'))
    await openMenu(user, container)
    await user.click(screen.getByRole('button', { name: /Claude/ }))

    expect(screen.getByText('로컬 CLI 연결 확인')).toBeInTheDocument()
    expect(screen.getByText(/Claude Code 로그인/)).toBeInTheDocument()
    expect(screen.queryByLabelText('API 키')).not.toBeInTheDocument()
    expect(screen.getByText(/Vibe Studio를 시작한 터미널/)).toBeInTheDocument()
  })

  it('Codex 연결에는 API 키 대신 codex login을 안내한다', async () => {
    getLocalRuntimeStatus.mockResolvedValue(status(true, false))
    const user = userEvent.setup()
    const { container } = render(<ModelPicker />)
    await waitFor(() => expect(container.querySelector('.mc-ready')).toBeInTheDocument())
    await openMenu(user, container)
    await user.click(screen.getByRole('button', { name: /GPT/ }))

    expect(screen.getByText(/Codex의 ChatGPT 로그인/)).toBeInTheDocument()
    expect(screen.getByText('codex login')).toBeInTheDocument()
    expect(screen.queryByLabelText('API 키')).not.toBeInTheDocument()
  })

  it('연결 확인 버튼으로 로컬 상태를 다시 읽는다', async () => {
    getLocalRuntimeStatus.mockResolvedValue(status(false, false))
    const user = userEvent.setup()
    const { container } = render(<ModelPicker />)
    await waitFor(() => expect(getLocalRuntimeStatus).toHaveBeenCalledOnce())
    await openMenu(user, container)
    await user.click(screen.getByRole('button', { name: /로컬 CLI 연결 확인/ }))
    await user.click(screen.getByRole('button', { name: '다시 확인' }))
    expect(getLocalRuntimeStatus).toHaveBeenCalledTimes(2)
  })
})
