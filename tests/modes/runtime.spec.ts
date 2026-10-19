import { expect, test } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'

test.beforeEach(async ({ page }) => {
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
})

test('登录按钮在点击和 Enter 提交时显示 loading，失败恢复且不重复请求', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  let authenticated = false
  let requests = 0
  let release!: () => void
  await page.route('**/api/admin/system/background/', (route) =>
    route.fulfill({ json: { front_background: '' } }),
  )
  await page.route('**/api/captcha/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
  )
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      status: authenticated ? 200 : 403,
      json: authenticated
        ? { id: 'loading-test', extend_info: { first_entry: true } }
        : { error: '未登录' },
    }),
  )
  await page.route('**/api/front/login/', async (route) => {
    requests += 1
    const attempt = requests
    await new Promise<void>((resolve) => {
      release = resolve
    })
    if (attempt === 1) await route.fulfill({ status: 503, json: {} })
    else {
      authenticated = true
      await route.fulfill({ json: { status: 1 } })
    }
  })
  await page.goto('/#/login')
  const button = page.getByRole('button', { name: '登录', exact: true })
  const username = page.getByLabel('用户名', { exact: true })
  await username.fill('loading-test')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByLabel('验证码', { exact: true }).fill('1234')
  await button.click()
  await expect.poll(() => requests).toBe(1)
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('aria-busy', 'true')
  await username.press('Enter')
  release()
  await expect(page.getByText('服务暂时不可用，请稍后重试')).toBeVisible()
  await expect(button).toBeEnabled()
  await expect(button).not.toHaveAttribute('aria-busy')
  expect(requests).toBe(1)
  await username.press('Enter')
  await expect.poll(() => requests).toBe(2)
  await expect(button).toHaveAttribute('aria-busy', 'true')
  await expect(button).toBeDisabled()
  release()
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()
  expect(requests).toBe(2)
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
    'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
  ])
})

test('登录背景使用服务的 front_background 图片地址', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/api/admin/system/background/', (route) =>
    route.fulfill({ json: { front_background: '/test-background.svg' } }),
  )
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({ status: 403, json: { error: '未登录' } }),
  )
  await page.route('**/api/captcha/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
  )
  await page.route('**/test-background.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="navy"/></svg>',
    }),
  )
  const image = page.waitForResponse('**/test-background.svg')
  await page.goto('/#/login')
  expect((await image).status()).toBe(200)
  await expect(page.getByRole('main')).toHaveCSS(
    'background-image',
    /test-background\.svg/,
  )
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
  ])
})

test('账号页面在生产与模拟关闭模式处理服务失败、恢复和退出重试', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  let authenticated = false
  let rejectLogin = true
  let rejectLogout = true
  await page.route('**/api/admin/system/background/', (route) =>
    route.fulfill({ json: { front_background: '' } }),
  )
  await page.route('**/api/captcha/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="104" height="40"><text x="10" y="28">1234</text></svg>',
    }),
  )
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      status: authenticated ? 200 : 403,
      json: authenticated
        ? { id: 'test-user', extend_info: { first_entry: true } }
        : { error: '未登录' },
    }),
  )
  await page.route('**/api/front/login/', async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      username: 'test-user',
      password: 'test-password',
      code: '1234',
    })
    if (rejectLogin) {
      await route.fulfill({ status: 503, json: { error: 'unavailable' } })
    } else {
      authenticated = true
      await route.fulfill({ json: { status: 1 } })
    }
  })
  await page.route('**/api/front/logout/', async (route) => {
    if (rejectLogout) {
      await route.fulfill({ status: 503, json: {} })
    } else {
      authenticated = false
      await route.fulfill({ json: { status: 1 } })
    }
  })
  await page.goto('/#/login')
  await expect(page.getByText('本地模拟：', { exact: false })).toHaveCount(0)
  await page.getByLabel('用户名', { exact: true }).fill('test-user')
  await page.getByLabel('密码', { exact: true }).fill('test-password')
  await page.getByLabel('验证码', { exact: true }).fill('1234')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('服务暂时不可用，请稍后重试')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('login-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('button', { name: '登录', exact: true }),
  ).toBeInViewport()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('login-mobile.png'),
    fullPage: true,
  })
  rejectLogin = false
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '首页' })).toBeVisible()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(
    page.getByText('退出失败，当前会话仍保留，请重试。'),
  ).toBeVisible()
  rejectLogout = false
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByText('已安全退出。')).toBeVisible()
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
    'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
    'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
  ])
})

test('无权访问的 403 保留会话并进入独立权限说明页', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() =>
    localStorage.setItem('token', 'existing-session'),
  )
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({ status: 403, json: { error: '您无权访问' } }),
  )
  await page.goto('/#/basic/home')
  await expect(page.getByRole('heading', { name: '您无权访问' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe(
    'existing-session',
  )
  expect(page.url()).toContain('#/forbidden')
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
  ])
})

test('模拟关闭及生产模式停用诊断入口，不请求 API 或注册模拟 Worker', async ({
  page,
}) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      requests.push(request.url())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/#/diagnostics/api')
  await expect(
    page.getByRole('heading', { name: '接口状态诊断' }),
  ).toBeVisible()
  await expect(
    page.getByText('模拟服务未启用；接口诊断已停用，不会发送诊断请求。'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '成功响应' })).toHaveCount(0)
  await page.getByRole('link', { name: '表格与表单诊断', exact: true }).click()
  await expect(
    page.getByText('当前环境不会发送样本读取或写入请求。', { exact: false }),
  ).toBeVisible()
  await expect(page.getByRole('table')).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '表格与表单诊断' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistrations()).length,
    ),
  ).toBe(0)
  expect(requests).toEqual([])
  expect(errors).toEqual([])
})
