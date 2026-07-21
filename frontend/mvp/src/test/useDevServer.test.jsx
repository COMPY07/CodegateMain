import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getPreview = vi.fn()
const startProjectPreview = vi.fn()
const stopProjectPreview = vi.fn()

vi.mock('../api/localRuntime.js', () => ({
  getPreview: (...args) => getPreview(...args),
  startProjectPreview: (...args) => startProjectPreview(...args),
  stopProjectPreview: (...args) => stopProjectPreview(...args),
}))

import { useDevServer } from '../hooks/useDevServer.js'

const project = { id: 'opened:abc', name: 'shop', path: '/Users/me/shop', runnable: true }

describe('useDevServer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startProjectPreview.mockResolvedValue({
      running: true,
      url: 'http://localhost:5191',
      projectPath: project.path,
      logs: [],
    })
  })

  it('같은 프로젝트의 실행 중 서버는 그대로 이어받는다', async () => {
    getPreview.mockResolvedValue({
      running: true,
      url: 'http://localhost:5190',
      projectPath: project.path,
      logs: [],
    })
    const { result } = renderHook(() => useDevServer(project))

    await waitFor(() => expect(result.current.preview.status).toBe('running'))
    expect(result.current.preview.url).toBe('http://localhost:5190')
    expect(startProjectPreview).not.toHaveBeenCalled()
  })

  it('선택한 프로젝트와 다른 서버가 떠 있으면 선택 프로젝트로 교체한다', async () => {
    getPreview.mockResolvedValue({
      running: true,
      url: 'http://localhost:5189',
      projectPath: '/Users/me/old-project',
      logs: [],
    })
    const { result } = renderHook(() => useDevServer(project))

    await waitFor(() => expect(result.current.preview.url).toBe('http://localhost:5191'))
    expect(startProjectPreview).toHaveBeenCalledWith('opened:abc')
  })

  it('실행 불가능한 폴더에는 패키지 명령을 실행하지 않는다', async () => {
    const plain = { ...project, runnable: false }
    const { result } = renderHook(() => useDevServer(plain))

    await waitFor(() => expect(result.current.preview.status).toBe('idle'))
    expect(getPreview).not.toHaveBeenCalled()
    expect(startProjectPreview).not.toHaveBeenCalled()
  })
})
