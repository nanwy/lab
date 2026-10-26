import { test, expect, simulateURL } from './s13-fixture'
import type { Page } from '@playwright/test'
const root = '/api/front/wqzb/test_task/task-exp-a/blue_team/blue-network'
async function fixture(page: Page) {
  const reads: string[] = []
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/?nopage=1',
    (r) =>
      r.fulfill({
        json: [{ id: 'blue-network', name: '网络蓝军', scenario_type: 1 }],
      }),
  )
  await page.route(`**${root}/control_record/?nopage=0`, (r) =>
    r.fulfill({
      json: [
        { id: 31, round: 1 },
        { id: 42, round: 2 },
      ],
    }),
  )
  await page.route(`**${root}/flow_path/?*`, (r) => {
    reads.push(new URL(r.request().url()).search)
    return r.fulfill({
      json: {
        ip_relation: [{ '192.0.2.1': ['192.0.2.2', '198.51.100.3'] }],
        input_ip_params_map: { '192.0.2.1': { host: { name: '采集主机' } } },
      },
    })
  })
  return reads
}
test('网络按原交换机路由关系展示，仅IP查看采集JSON与无数据提示', async ({
  page,
}) => {
  const reads = await fixture(page)
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '蓝军数据', exact: true }).click()
  await expect(
    page.locator('.react-flow__node[data-id="192.0.2.sw"]'),
  ).toContainText('交换机')
  await expect(
    page.locator('.react-flow__node[data-id="198.51.100.sw"]'),
  ).toContainText('交换机')
  await expect(
    page.locator('.react-flow__node[data-id="192.0.2_to_198.51.100_r"]'),
  ).toContainText('路由器')
  await expect(page.locator('.react-flow__edge')).toHaveCount(5)
  await page.locator('.react-flow__node[data-id="192.0.2.1"]').click()
  const d = page.getByRole('dialog', { name: '节点数据', exact: true })
  await expect(d.getByText('"采集主机"', { exact: true })).toBeVisible()
  await d.getByRole('button', { name: 'Close', exact: true }).click()
  await page.locator('.react-flow__node[data-id="192.0.2.2"]').click()
  await expect(
    page.getByText('当前节点未采集到数据！', { exact: true }),
  ).toBeVisible()
  expect(reads).toEqual(['?blue_team_control=31'])
  await page.screenshot({ path: '/tmp/s13-06-network.png', fullPage: true })
})

test('60秒网络刷新保留当前轮次，切视图轮次取消旧轮询和响应', async ({
  page,
}) => {
  const reads = await fixture(page)
  await page.clock.install()
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '蓝军数据', exact: true }).click()
  await expect(
    page.locator('.react-flow__node[data-id="192.0.2.1"]'),
  ).toBeVisible()
  await page.clock.fastForward(60000)
  await expect
    .poll(() => reads)
    .toEqual(['?blue_team_control=31', '?blue_team_control=31'])
  await page.getByRole('tab', { name: '第2轮', exact: true }).click()
  await expect.poll(() => reads).toHaveLength(3)
  await page.clock.fastForward(60000)
  await expect
    .poll(() => reads)
    .toEqual([
      '?blue_team_control=31',
      '?blue_team_control=31',
      '?blue_team_control=42',
      '?blue_team_control=42',
    ])
  await page.getByRole('button', { name: '数据视图', exact: true }).click()
  await page.clock.fastForward(120000)
  expect(reads).toHaveLength(4)
  let finish!: () => void
  const waiting = new Promise<void>((r) => {
    finish = r
  })
  await page.route(`**${root}/flow_path/?blue_team_control=42`, async (r) => {
    await waiting
    await r
      .fulfill({
        json: {
          ip_relation: [{ '203.0.113.99': [] }],
          input_ip_params_map: {},
        },
      })
      .catch(() => {})
  })
  await page.getByRole('button', { name: '网络视图', exact: true }).click()
  await page.getByRole('tab', { name: '第1轮', exact: true }).click()
  finish()
  await expect(
    page.locator('.react-flow__node[data-id="192.0.2.1"]'),
  ).toBeVisible()
  await expect(
    page.locator('.react-flow__node[data-id="203.0.113.99"]'),
  ).toHaveCount(0)
  await page.getByRole('tab', { name: '蓝军控制', exact: true }).click()
  const count = reads.length
  await page.clock.fastForward(120000)
  expect(reads).toHaveLength(count)
})

test('网络刷新失败不保留旧图作成功，重试后显示原空态', async ({ page }) => {
  await fixture(page)
  await page.clock.install()
  let reads = 0
  await page.route(`**${root}/flow_path/?*`, (r) => {
    reads++
    return reads === 2
      ? r.fulfill({ status: 500, json: { message: '隔离刷新失败' } })
      : r.fulfill({
          json: {
            ip_relation: reads === 1 ? [{ '192.0.2.1': [] }] : [],
            input_ip_params_map: {},
          },
        })
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '蓝军数据', exact: true }).click()
  await expect(
    page.locator('.react-flow__node[data-id="192.0.2.1"]'),
  ).toBeVisible()
  await page.clock.fastForward(60000)
  await expect(
    page.getByRole('alert').filter({ hasText: '网络视图读取失败' }),
  ).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page.getByRole('button', { name: '重试网络视图', exact: true }).click()
  await expect(page.getByText('暂无阵地数据', { exact: true })).toBeVisible()
})
