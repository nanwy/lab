import { expect, test } from '@playwright/test'

test('自定义 API 地址沿用同一个模拟服务入口', async ({ page }) => {
  const requests: string[] = []
  const errors: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/custom-api/'))
      requests.push(request.url())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/#/diagnostics/api')
  await expect(page.getByText('统一客户端', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '表格与表单诊断', exact: true }).click()
  await expect(
    page.getByRole('table').getByText('样本 01', { exact: true }),
  ).toBeVisible()
  expect(requests).toHaveLength(2)
  expect(errors).toEqual([])
})
