import { expect, test as base } from '@playwright/test'

// Every scenario uses a fresh browser context, including a fresh MSW worker.
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    await use(errors)
    expect(errors, 'unexpected browser runtime errors').toEqual([])
  }, { auto: true }],
})

test('loads the shell and preserves typed hash deep links after refresh', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '工程概览', exact: true })).toBeVisible()
  await page.goto('/#/resources/lab-101?tab=activity')
  await expect(page.getByRole('heading', { name: '资源 lab-101', exact: true })).toBeVisible()
  await expect(page.getByText('当前视图：活动记录')).toBeVisible()
  await page.reload()
  await expect(page.getByText('当前视图：活动记录')).toBeVisible()
  await page.goto('/#/unknown-entry')
  await expect(page.getByRole('heading', { name: '没有找到这个入口' })).toBeVisible()
})

test('MSW and Query expose success, empty, failure, cancellation and timeout states', async ({ page }) => {
  await page.goto('/#/diagnostics/api')
  await expect(page.getByRole('heading', { name: '接口状态诊断' })).toBeVisible()
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
  await expect(page.getByText('请求已取消，可以选择其他响应继续验证。')).toBeVisible()
  await page.getByRole('button', { name: '请求超时', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('超时')
})

test('mounts custom graph nodes, edits and reopens the sample, then unmounts safely', async ({ page }) => {
  await page.goto('/#/topology')
  const original = page.getByRole('button', { name: '编辑 核心路由器', exact: true })
  await expect(original).toBeVisible()
  await original.click()
  await page.getByRole('textbox', { name: '节点名称' }).fill('浏览器验证路由器')
  await page.getByRole('button', { name: '应用名称' }).click()
  await page.getByRole('button', { name: '保存并重开' }).click()
  await expect(page.getByRole('button', { name: '编辑 浏览器验证路由器', exact: true })).toBeVisible()
  await expect(page.getByText('已从 X6 格式重新打开；未知字段与未支持图元仍被保留。')).toBeVisible()
  await page.getByRole('link', { name: '工程概览', exact: true }).click()
  await expect(page.getByLabel('拓扑画布')).toHaveCount(0)
  await page.getByRole('link', { name: '拓扑适配验证', exact: true }).click()
  await expect(original).toBeVisible()
})
