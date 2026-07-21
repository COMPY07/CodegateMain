import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/local/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const headers = {}
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    if (path === '/local/projects') {
      await route.fulfill({ status: 200, headers, json: {
        root: '/Users/me/CodeGateProjects',
        projects: [{ id: 'shop', name: 'shop', path: '/Users/me/shop', runnable: true }],
      } })
      return
    }
    if (path === '/local/preview/status') {
      await route.fulfill({ status: 200, headers, json: {
        running: true, url: 'http://localhost:5190', projectPath: '/Users/me/shop', logs: [],
      } })
      return
    }
    if (path === '/local/agent/status') {
      await route.fulfill({ status: 200, headers, json: {
        models: { claude: true, gpt: true }, modelDetails: {},
      } })
      return
    }
    if (path === '/local/fs/tree') {
      await route.fulfill({ status: 200, headers, json: [] })
      return
    }
    if (path === '/local/agent/stream') {
      await route.fulfill({
        status: 200,
        headers: { ...headers, 'content-type': 'text/event-stream' },
        body: 'event: message_start\ndata: {}\n\nevent: message_done\ndata: {"text":"완료"}\n\n',
      })
      return
    }
    await route.fulfill({ status: 404, headers, json: {} })
  })
  await page.route('http://localhost:5190/**', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<button id="first">첫 번째</button><button id="second">두 번째</button>',
  }))
  await page.goto('/#live')
  await page.evaluate(() => localStorage.clear())
  await page.evaluate(() => {
    localStorage.setItem('vibe:project', 'shop')
  })
  await page.reload()
})

test('탭과 질문 도구 상태를 URL history와 동기화한다', async ({ page }) => {
  await expect(page.frameLocator('iframe[title="live-preview"]').locator('body')).toBeVisible()
  await page.getByRole('button', { name: '대시보드 📌' }).click()
  await expect(page).toHaveURL(/#dash$/)
  await page.goBack()
  await expect(page).toHaveURL(/#live$/)
  await page.getByTitle(/질문 모드/).click()
  await expect(page).toHaveURL(/#live,q$/)
})

test('다중 칩의 드래그 순서를 유지해 전송한다', async ({ page }) => {
  const frame = page.frameLocator('iframe[title="live-preview"]')
  await expect(frame.locator('#first')).toBeVisible()
  await frame.locator('body').evaluate(() => {
    parent.postMessage({ source: 'vibe-preview', type: 'pick', label: '첫 번째', selector: '#first' }, '*')
    parent.postMessage({ source: 'vibe-preview', type: 'pick', label: '두 번째', selector: '#second' }, '*')
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
