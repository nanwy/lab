import { expect, test } from '@playwright/test'

test('路由加载与页面挂载共享成功查询，重进路由复用新鲜缓存', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.pathname === '/api/diagnostics' &&
      url.searchParams.get('mode') === 'success'
    )
      requests.push(request.url())
  })
  await page.goto('/#/diagnostics/api')
  await expect(page.getByText('统一客户端', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '工程概览', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '工程概览', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: '接口诊断', exact: true }).click()
  await expect(page.getByText('统一客户端', { exact: true })).toBeVisible()
  expect(requests).toHaveLength(1)
})
