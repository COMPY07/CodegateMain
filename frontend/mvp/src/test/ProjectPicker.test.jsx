import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import ProjectPicker from '../components/ProjectPicker.jsx'

const base = {
  status: 'ready',
  root: '/Users/me/CodeGateProjects',
  projects: [
    { id: 'shop', name: 'shop', runnable: true },
    { id: 'notes', name: 'notes', runnable: false },
  ],
  active: 'shop',
  select: vi.fn(),
  create: vi.fn(),
  open: vi.fn(),
}

describe('ProjectPicker', () => {
  it('내 프로젝트를 나열하고 현재 선택을 표시한다', () => {
    render(<ProjectPicker {...base} />)
    const select = screen.getByLabelText('프로젝트 선택')
    expect(select).toHaveValue('shop')
    expect(screen.getByRole('option', { name: /shop/ })).toBeInTheDocument()
  })

  it('실행할 수 없는 프로젝트임을 밝힌다', () => {
    render(<ProjectPicker {...base} />)
    expect(screen.getByRole('option', { name: /notes \(실행 불가\)/ })).toBeInTheDocument()
  })

  it('선택을 바꾸면 상위에 알린다', async () => {
    const select = vi.fn()
    const user = userEvent.setup()
    render(<ProjectPicker {...base} select={select} />)

    await user.selectOptions(screen.getByLabelText('프로젝트 선택'), 'notes')
    expect(select).toHaveBeenCalledWith('notes')
  })

  it('새 프로젝트를 만든다', async () => {
    const create = vi.fn().mockResolvedValue({ name: 'blog' })
    const user = userEvent.setup()
    render(<ProjectPicker {...base} create={create} />)

    await user.click(screen.getByRole('button', { name: /새로 만들기/ }))
    await user.type(screen.getByLabelText('새 프로젝트 이름'), 'blog')
    await user.click(screen.getByRole('button', { name: '만들기' }))

    expect(create).toHaveBeenCalledWith('blog')
  })

  it('이름이 비면 만들기를 막는다', async () => {
    const user = userEvent.setup()
    render(<ProjectPicker {...base} />)
    await user.click(screen.getByRole('button', { name: /새로 만들기/ }))
    expect(screen.getByRole('button', { name: '만들기' })).toBeDisabled()
  })

  it('생성 실패 이유를 그대로 보여주고 폼을 닫지 않는다', async () => {
    const create = vi.fn().mockRejectedValue(new Error("'blog' 프로젝트가 이미 있습니다."))
    const user = userEvent.setup()
    render(<ProjectPicker {...base} create={create} />)

    await user.click(screen.getByRole('button', { name: /새로 만들기/ }))
    await user.type(screen.getByLabelText('새 프로젝트 이름'), 'blog')
    await user.click(screen.getByRole('button', { name: '만들기' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 있습니다')
    expect(screen.getByLabelText('새 프로젝트 이름')).toBeInTheDocument()
  })

  it('런타임 준비 중에는 목업 목록을 지어내지 않는다', () => {
    render(<ProjectPicker {...base} status="unavailable" projects={[]} />)

    expect(screen.getByText(/내장 런타임을 시작하고 있습니다/)).toBeInTheDocument()
    expect(screen.queryByLabelText('프로젝트 선택')).toBeNull()
  })

  it('프로젝트가 하나도 없으면 만들라고 안내한다', () => {
    render(<ProjectPicker {...base} projects={[]} />)
    expect(screen.getByText(/아직 프로젝트가 없습니다/)).toBeInTheDocument()
  })

  it('운영체제 폴더 선택기로 기존 프로젝트를 연다', async () => {
    const open = vi.fn().mockResolvedValue({ id: 'opened-1', name: 'existing' })
    const user = userEvent.setup()
    render(<ProjectPicker {...base} open={open} />)

    await user.click(screen.getByRole('button', { name: '폴더 열기' }))
    expect(open).toHaveBeenCalledOnce()
  })
})
