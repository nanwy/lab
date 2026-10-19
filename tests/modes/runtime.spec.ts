import { expect, test } from '@playwright/test'

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
