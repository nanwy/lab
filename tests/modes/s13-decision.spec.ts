import { test, expect, simulateURL } from './s13-fixture'
import type { Page } from '@playwright/test'
const root = '/api/front/wqzb/test_task/task-exp-a/blue_team/blue-d'
async function fixture(page: Page) {
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/?nopage=1',
    (r) =>
      r.fulfill({
        json: [
          {
            id: 'blue-d',
            name: '决策蓝军',
            scenario_type: 1,
            scenario: 'scenario-d',
          },
        ],
      }),
  )
  await page.route(`**${root}/control_record/?nopage=0`, (r) =>
    r.fulfill({
      json: [
        { id: 201, round: 1 },
        { id: 202, round: 2 },
      ],
    }),
  )
  const queries: string[] = []
  await page.route(`**${root}/position_instruction_record/?*`, (r) => {
    queries.push(new URL(r.request().url()).search)
    return r.fulfill({ json: [{ id: 901, number_of_decisions: 3 }] })
  })
  await page.route(`**${root}/instruction_record/?*`, (r) => {
    queries.push(new URL(r.request().url()).search)
    return r.fulfill({
      json: {
        results: [
          {
            create_time: '2026-10-25 12:00',
            instruction_name: '收集配置',
            status: 1,
            exec_return: { ip: '192.0.2.5' },
          },
        ],
      },
    })
  })
  await page.route(`**${root}/perspective/tree/?*`, (r) => {
    const u = new URL(r.request().url())
    queries.push(u.search)
    return r.fulfill({
      json: {
        status: 1,
        data:
          u.searchParams.get('blue_team_control') === '202'
            ? {}
            : {
                kind: 1,
                sub_technology_name: '开始',
                child: [
                  {
                    kind: 2,
                    sub_technology_name: '收集配置',
                    params: { ip: '192.0.2.5' },
                    status: 1,
                    create_time: '2026-10-25 12:00',
                    child: [
                      {
                        kind: 1,
                        sub_technology_name: '下一步扫描',
                        status: 0,
                        child: [{ kind: 3, sub_technology_name: '结束' }],
                      },
                    ],
                  },
                ],
              },
      },
    })
  })
  return queries
}
test('按轮次读取全部与单次决策，树右键步骤详情和下一步只读图', async ({
  page,
}) => {
  const queries = await fixture(page)
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '决策过程', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '全部过程', exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('.react-flow__node').filter({ hasText: 'ip:192.0.2.5' }),
  ).toBeVisible()
  await expect(
    page.getByText('收集配置获取到数据', { exact: false }),
  ).toBeVisible()
  await page
    .locator('.react-flow__node')
    .filter({ hasText: 'ip:192.0.2.5' })
    .click({ button: 'right' })
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '步骤详情', exact: true })
  await expect(
    detail.locator('dd').filter({ hasText: /^收集配置$/ }),
  ).toBeVisible()
  await expect(
    detail.getByText('2026-10-25 12:00', { exact: true }),
  ).toBeVisible()
  await expect(detail.getByText('成功', { exact: true })).toBeVisible()
  await expect(
    detail.locator('.react-flow__node').filter({ hasText: '下一步扫描' }),
  ).toBeVisible()
  await detail.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '第3次决策', exact: true }).click()
  await expect
    .poll(() => queries.some((q) => q.includes('instruction_record_id=901')))
    .toBe(true)
  await page.getByRole('tab', { name: '第2轮', exact: true }).click()
  await expect(page.getByText('暂无决策过程', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '全部过程', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(queries).toContain('?blue_team_control=201&nopage=1')
  expect(queries).toContain('?page=1&size=10&blue_team_control=201')
  expect(queries).toContain('?blue_team_control=201&instruction_record_id=')
  await expect(
    page.getByRole('button', { name: '下一页', exact: true }),
  ).toHaveCount(0)
})

test('决策环按原层次显示扇区并排除结束节点，轮次切换清理迟到树', async ({
  page,
}) => {
  await fixture(page)
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '决策过程', exact: true }).click()
  await page.getByRole('button', { name: '决策环视图', exact: true }).click()
  const ring = page.getByRole('img', { name: '决策环层次图', exact: true })
  await expect(ring).toBeVisible()
  await expect(
    ring
      .locator('path')
      .filter({ has: page.locator('title').filter({ hasText: /下一步扫描/ }) }),
  ).toHaveCount(1)
  await expect(ring.locator('title').filter({ hasText: /结束/ })).toHaveCount(0)
  await expect(ring.getByText('ip:192.0.2.5', { exact: true })).toBeVisible()
  await page.screenshot({
    path: '/tmp/s13-05-decision-ring.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '决策树视图', exact: true }).click()
  let finish!: () => void
  const waiting = new Promise<void>((resolve) => {
    finish = resolve
  })
  await page.route(
    `**${root}/perspective/tree/?*instruction_record_id=901`,
    async (r) => {
      await waiting
      await r
        .fulfill({
          json: {
            status: 1,
            data: { kind: 1, sub_technology_name: '晚到旧决策' },
          },
        })
        .catch(() => {})
    },
  )
  await page.getByRole('button', { name: '第3次决策', exact: true }).click()
  await page.getByRole('tab', { name: '第2轮', exact: true }).click()
  finish()
  await expect(page.getByText('暂无决策过程', { exact: true })).toBeVisible()
  await expect(page.getByText('晚到旧决策', { exact: true })).toHaveCount(0)
})

test('决策无轮次空态及读取失败可重试，合法空参数子节点与日志可展示', async ({
  page,
}) => {
  await fixture(page)
  let empty = true,
    fail = true
  await page.route(`**${root}/control_record/?nopage=0`, (r) =>
    r.fulfill({ json: empty ? [] : [{ id: 201, round: 1 }] }),
  )
  await page.route(`**${root}/instruction_record/?*`, (r) =>
    r.fulfill({ json: { results: [] } }),
  )
  await page.route(`**${root}/perspective/tree/?*`, (r) => {
    if (fail) {
      fail = false
      return r.fulfill({ status: 500, json: { message: '决策读取被拒绝' } })
    }
    return r.fulfill({
      json: {
        status: 1,
        data: {
          kind: 1,
          sub_technology_name: '空参数开始',
          params: null,
          child: null,
        },
      },
    })
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '决策过程', exact: true }).click()
  await expect(
    page.getByText('蓝军未执行，请先执行蓝军！', { exact: true }),
  ).toBeVisible()
  empty = false
  await page.reload()
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '决策过程', exact: true }).click()
  await expect(
    page.getByText('决策过程读取失败', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: '重试过程', exact: true }).click()
  await expect(
    page.locator('.react-flow__node').filter({ hasText: '空参数开始' }),
  ).toBeVisible()
  await expect(page.getByText('暂无记录', { exact: true })).toBeVisible()
  await page.screenshot({
    path: '/tmp/s13-05-decision-tree.png',
    fullPage: true,
  })
})
