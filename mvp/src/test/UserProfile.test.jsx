import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import UserProfile from '../components/UserProfile.jsx'

describe('테마 설정', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.style.removeProperty('--theme-hue')
    document.documentElement.style.removeProperty('--theme-saturation')
    delete document.documentElement.dataset.theme
  })

  it('색상과 채도를 즉시 적용하고 브라우저에 저장한다', async () => {
    const user = userEvent.setup()
    render(<UserProfile />)

    await user.click(screen.getByRole('button', { name: /Team 14/ }))
    await user.click(screen.getByText('설정', { selector: '.profile-menu button' }))
    await user.click(screen.getByRole('button', { name: /테마/ }))

    fireEvent.change(screen.getByLabelText('색상'), { target: { value: '323' } })
    fireEvent.change(screen.getByLabelText('채도'), { target: { value: '48' } })

    expect(document.documentElement.style.getPropertyValue('--theme-hue')).toBe('323')
    expect(document.documentElement.style.getPropertyValue('--theme-saturation')).toBe('48')
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('vibe-studio.settings.v1'))
      expect(saved).toMatchObject({ themeHue: 323, themeSaturation: 48 })
    })
  })

  it('초기화 버튼으로 기본 테마 값을 복원한다', async () => {
    window.localStorage.setItem('vibe-studio.settings.v1', JSON.stringify({ themeHue: 323, themeSaturation: 40 }))
    const user = userEvent.setup()
    render(<UserProfile />)

    await user.click(screen.getByRole('button', { name: /Team 14/ }))
    await user.click(screen.getByText('설정', { selector: '.profile-menu button' }))
    await user.click(screen.getByRole('button', { name: /테마/ }))
    await user.click(screen.getByRole('button', { name: /초기화/ }))

    expect(screen.getByLabelText('색상')).toHaveValue('242')
    expect(screen.getByLabelText('채도')).toHaveValue('82')
  })

  it('밝은 테마와 어두운 테마를 전체 문서에 적용한다', async () => {
    const user = userEvent.setup()
    render(<UserProfile />)

    await user.click(screen.getByRole('button', { name: /Team 14/ }))
    await user.click(screen.getByText('설정', { selector: '.profile-menu button' }))
    await user.click(screen.getByRole('button', { name: /테마/ }))
    await user.click(screen.getByRole('button', { name: '어두운 테마' }))

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(screen.getByRole('button', { name: '어두운 테마' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '밝은 테마' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })
})
