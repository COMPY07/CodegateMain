import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/#live')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('탭과 질문 도구 상태를 URL history와 동기화한다', async ({ page }) => {
  await page.getByRole('button', { name: '대시보드 📌' }).click()
  await expect(page).toHaveURL(/#dash$/)
  await page.goBack()
  await expect(page).toHaveURL(/#live$/)
  await page.getByTitle(/질문 모드/).click()
  await expect(page).toHaveURL(/#live,q$/)
})

test('다중 칩의 드래그 순서를 유지해 전송한다', async ({ page }) => {
  await page.evaluate(() => {
    window.postMessage({ source: 'vibe-preview', type: 'pick', label: '첫 번째', selector: '#first' }, '*')
    window.postMessage({ source: 'vibe-preview', type: 'pick', label: '두 번째', selector: '#second' }, '*')
  })
  const chips = page.locator('.chatbox > .chip')
  await expect(chips).toHaveCount(2)
  await chips.nth(1).dragTo(chips.nth(0))
  await expect(chips.nth(0)).toContainText('두 번째')
  await page.getByRole('button', { name: '↑' }).click()
  await expect(page.locator('.msg.q').last().locator('.mchip')).toHaveCount(2)
})

test('모바일에서 좌우 패널을 drawer로 연다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('button', { name: '파일 패널 열기' }).click()
  await expect(page.locator('aside.rail')).toBeVisible()
  await page.getByRole('button', { name: '열린 패널 닫기' }).click({ position: { x: 380, y: 420 } })
  await page.getByRole('button', { name: '대화 패널 열기' }).click()
  await expect(page.locator('aside.right')).toBeVisible()
})
