import { expect, test as base } from '@playwright/test'

// Every scenario uses a fresh browser context, including a fresh MSW worker.
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await use(errors)
      expect(errors, 'unexpected browser runtime errors').toEqual([])
    },
    { auto: true },
  ],
})

test('loads the shell and preserves typed hash deep links after refresh', async ({
  page,
}) => {
  await page.goto('/#/overview')
  await expect(
    page.getByRole('heading', { name: '工程概览', exact: true }),
  ).toBeVisible()
  await page.goto('/#/resources/lab-101?tab=activity')
  await expect(
    page.getByRole('heading', { name: '资源 lab-101', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('当前视图：活动记录')).toBeVisible()
  await page.reload()
  await expect(page.getByText('当前视图：活动记录')).toBeVisible()
  await page.goto('/#/unknown-entry')
  await expect(
    page.getByRole('heading', { name: '没有找到这个入口' }),
  ).toBeVisible()
})

test('validates login, restores the current user and handles session expiry', async ({
  page,
  runtimeErrors,
}) => {
  await page.goto('/#/login')
  await expect(
    page.getByRole('heading', { name: '平台登录', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: '验证码' })).toBeVisible()

  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('请输入用户名', { exact: true })).toBeVisible()
  await expect(page.getByText('请输入密码', { exact: true })).toBeVisible()
  await expect(page.getByText('请输入验证码', { exact: true })).toBeVisible()

  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill('learner')
  await page.getByLabel('密码', { exact: true }).fill('wrong-password')
  await page.getByRole('textbox', { name: '验证码', exact: true }).fill('0000')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const captchaError = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: '验证码错误' })
  await expect(captchaError).toBeVisible()
  await expect(captchaError).toHaveCount(1)
  await expect(page.locator('[data-slot="field-error"]')).toHaveCount(0)

  await page.getByRole('textbox', { name: '验证码', exact: true }).fill('2468')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const passwordError = page
    .locator('[data-sonner-toast]')
    .filter({ hasText: '用户名或密码错误' })
  await expect(passwordError).toBeVisible()
  await expect(passwordError).toHaveCount(1)
  await expect(page.locator('[data-slot="field-error"]')).toHaveCount(0)

  await page.getByLabel('密码', { exact: true }).fill('xueyuan123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('learner-001', { exact: true })).toBeVisible()

  await page.reload()
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()

  await page.evaluate(() => localStorage.removeItem('token'))
  await page.reload()
  await expect(page.getByText('会话已失效，请重新登录。')).toBeVisible()

  expect(runtimeErrors.splice(0)).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
    'Failed to load resource: the server responded with a status of 400 (Bad Request)',
    'Failed to load resource: the server responded with a status of 400 (Bad Request)',
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
  ])
})

test('signs out and clears account-specific client state', async ({
  page,
  runtimeErrors,
}) => {
  await page.goto('/#/login')
  await page
    .getByRole('textbox', { name: '用户名', exact: true })
    .fill('learner')
  await page.getByLabel('密码', { exact: true }).fill('xueyuan123')
  await page.getByRole('textbox', { name: '验证码', exact: true }).fill('2468')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()

  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByText('已安全退出。')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('token')))
    .toBeNull()
  expect(runtimeErrors.splice(0)).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
  ])
})

test('MSW and Query expose success, empty, failure, cancellation and timeout states', async ({
  page,
  runtimeErrors,
}) => {
  await page.goto('/#/diagnostics/api')
  await expect(
    page.getByRole('heading', { name: '接口状态诊断' }),
  ).toBeVisible()
  await expect(page.getByText('统一客户端', { exact: true })).toBeVisible()
  await expect(page.getByText('TanStack Query', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '空数据', exact: true }).click()
  await expect(page.getByText('响应成功，但没有数据。')).toBeVisible()
  await page.getByRole('button', { name: 'HTTP 错误', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('HTTP 503')
  await page.getByRole('button', { name: '业务错误', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('业务失败')
  await page.getByRole('button', { name: '可取消请求', exact: true }).click()
  await page.getByRole('button', { name: '取消当前请求' }).click()
  await expect(
    page.getByText('请求已取消，可以选择其他响应继续验证。'),
  ).toBeVisible()
  await page.getByRole('button', { name: '请求超时', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('超时')
  expect(runtimeErrors.splice(0)).toEqual([
    'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
  ])
})

test('the route boundary displays a controlled failure and can return to the shell', async ({
  page,
  runtimeErrors,
}) => {
  await page.goto('/#/diagnostics/error')
  await expect(
    page.getByRole('heading', { name: '页面暂时无法显示' }),
  ).toBeVisible()
  await page.getByRole('link', { name: '返回工程概览', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '工程概览', exact: true }),
  ).toBeVisible()
  expect(runtimeErrors.splice(0)).toEqual([
    expect.stringContaining(
      'Error: Deterministic route-boundary demonstration',
    ),
  ])
})

test('pages, sorts and filters the full sample collection while retaining row selection', async ({
  page,
}) => {
  await page.goto('/#/diagnostics/data')
  const table = page.getByRole('table', { name: '模拟样本表格' })
  await expect(table.getByText('样本 01', { exact: true })).toBeVisible()
  await expect(table.getByText('样本 06', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(table.getByText('样本 06', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '名称 ↑', exact: true }).click()
  await expect(table.getByText('样本 12', { exact: true })).toBeVisible()
  await expect(page.getByText('第 1 / 3 页', { exact: true })).toBeVisible()
  await page
    .getByRole('checkbox', { name: '选择 sample-12', exact: true })
    .check()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(table.getByText('样本 07', { exact: true })).toBeVisible()
  await expect(
    page.getByText('已选 1 项（跨页保留）；共 12 项', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('textbox', { name: '筛选样本名称', exact: true })
    .fill('样本 02')
  await expect(table.getByText('样本 02', { exact: true })).toBeVisible()
  await expect(
    page.getByText('已选 1 项（跨页保留）；共 1 项', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('第 1 / 1 页', { exact: true })).toBeVisible()
})

test('validates nested fields and refreshes the saved sample', async ({
  page,
  runtimeErrors,
}) => {
  await page.goto('/#/diagnostics/data')
  const table = page.getByRole('table', { name: '模拟样本表格' })
  await page
    .getByRole('button', { name: '编辑 sample-01', exact: true })
    .click()
  const name = page.getByRole('textbox', { name: '样本名称', exact: true })
  const save = page.getByRole('button', { name: '保存模拟样本', exact: true })
  await name.fill('x')
  await save.click()
  await expect(
    page.getByText('名称至少 2 个字符', { exact: true }),
  ).toBeVisible()
  await name.fill('样本 00 浏览器已更新')
  await page.getByRole('button', { name: '添加别名', exact: true }).click()
  await save.click()
  await expect(page.getByText('别名不能为空', { exact: true })).toBeVisible()
  await page
    .getByRole('textbox', { name: '别名 2', exact: true })
    .fill('浏览器嵌套别名')
  await save.click()
  await expect(
    page.getByText('模拟保存成功，列表已刷新', { exact: true }),
  ).toBeVisible()
  await expect(
    table.getByText('样本 00 浏览器已更新', { exact: true }),
  ).toBeVisible()
  await expect(
    table.getByText('别名 1、浏览器嵌套别名', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '重置模拟样本', exact: true }).click()
  await expect(table.getByText('样本 01', { exact: true })).toBeVisible()
  await expect(
    table.getByText('样本 00 浏览器已更新', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: '样本编辑器', exact: true }),
  ).toHaveCount(0)
  expect(runtimeErrors.splice(0)).toEqual([])
})

test('mounts custom graph nodes, edits and reopens the sample, then unmounts safely', async ({
  page,
}) => {
  await page.goto('/#/topology')
  const original = page.getByRole('button', {
    name: '编辑 核心路由器',
    exact: true,
  })
  await expect(original).toBeVisible()
  await original.click()
  await page.getByRole('textbox', { name: '节点名称' }).fill('浏览器验证路由器')
  await page.getByRole('button', { name: '应用名称' }).click()
  await page.getByRole('button', { name: '保存并重开' }).click()
  await expect(
    page.getByRole('button', { name: '编辑 浏览器验证路由器', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('已从 X6 格式重新打开；未知字段与未支持图元仍被保留。'),
  ).toBeVisible()
  await page.getByRole('link', { name: '工程概览', exact: true }).click()
  await expect(page.getByLabel('拓扑画布')).toHaveCount(0)
  await page.getByRole('link', { name: '拓扑适配验证', exact: true }).click()
  await expect(original).toBeVisible()
})
