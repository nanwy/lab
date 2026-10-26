import { test, expect, simulateURL } from './s13-fixture'
import type { Page, WebSocketRoute } from '@playwright/test'
const root = '/api/front/wqzb/test_task/task-exp-a/blue_team/blue-run'
async function fixture(page: Page, scenario = true) {
  const state = { records: [] as string[], logs: [] as string[] }
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/?nopage=1',
    (r) =>
      r.fulfill({
        json: [
          {
            id: 'blue-run',
            name: '执行蓝军',
            scenario_type: 1,
            ...(scenario ? { scenario: 'scenario-run' } : {}),
          },
        ],
      }),
  )
  await page.route(`**${root}/control_record/?nopage=0`, (r) =>
    r.fulfill({
      json: [
        { id: 31, round: 3 },
        { id: 21, round: 2 },
      ],
    }),
  )
  await page.route(`**${root}/control/`, (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: {
          status: 1,
          number_of_decisions: 2,
          exec_scenario_node_uid: 'action',
        },
      },
    }),
  )
  await page.route(`**${root}/control/log/**`, (r) => {
    state.logs.push(new URL(r.request().url()).search)
    return r.fulfill({
      json: {
        status: 1,
        data: {
          log: [
            {
              create_time: '初始时间',
              message: '历史日志',
              status: 1,
              spend_time: '1秒',
            },
          ],
        },
      },
    })
  })
  await page.route(`**${root}/position_instruction_record/?*`, (r) => {
    const u = new URL(r.request().url())
    state.records.push(u.search)
    const p = u.searchParams.get('page')
    return r.fulfill({
      json: {
        count: 11,
        results: [
          {
            id: 101,
            number_of_decisions: p === '2' ? 11 : 1,
            update_time: '2026-10-26 00:00',
            instruction_name: p === '2' ? '后页动作' : '采集动作',
            status: 3,
            exec_params: { data: { ip: '192.0.2.1' } },
            exec_return: { ok: true },
          },
        ],
      },
    })
  })
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-run/draw/',
    (r) =>
      r.fulfill({
        json: {
          topo_json: {
            nodes: [
              {
                id: 'start',
                type: 'customNode',
                position: { x: 0, y: 0 },
                data: { name: '开始', type: 1 },
              },
              {
                id: 'action',
                type: 'customNode',
                position: { x: 0, y: 100 },
                data: { name: '执行采集', type: 4 },
              },
            ],
            edges: [
              {
                id: 'edge-run',
                source: 'start',
                target: 'action',
                sourceHandle: '2',
                targetHandle: '1',
                type: 'straight',
                label: '',
              },
            ],
          },
        },
      }),
  )
  return state
}
test('按轮次查看只读执行图和决策输入输出，历史日志保持无query', async ({
  page,
}) => {
  const s = await fixture(page)
  await page.routeWebSocket('**/ws/emulate_task/**', () => {})
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '执行过程', exact: true }).click()
  await expect(
    page.getByRole('tab', { name: '第3轮', exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('.react-flow__node[data-id="action"]'),
  ).toContainText('执行采集')
  await expect(
    page.locator('.react-flow__node[data-id="action"]'),
  ).toHaveAttribute('aria-current', 'true')
  await expect(
    page.getByRole('button', { name: '保存剧本', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('row', { name: /第1次决策/ }).click()
  const d = page.getByRole('dialog', { name: '第1次决策', exact: true })
  await expect(d.getByText('192.0.2.1', { exact: false })).toBeVisible()
  await expect(d.getByText('true', { exact: true })).toBeVisible()
  await d.getByRole('button', { name: 'Close', exact: true }).click()
  await page
    .getByRole('navigation', { name: '执行决策分页', exact: true })
    .getByRole('button', { name: '下一页', exact: true })
    .click()
  await expect(
    page.getByRole('cell', { name: '后页动作', exact: true }),
  ).toBeVisible()
  await page.getByRole('tab', { name: '第2轮', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: '采集动作', exact: true }),
  ).toBeVisible()
  expect(s.records).toEqual([
    '?page=1&size=10&blue_team_control=31',
    '?page=2&size=10&blue_team_control=31',
    '?page=1&size=10&blue_team_control=21',
  ])
  expect(s.logs).toEqual(['', ''])
  await page.getByRole('button', { name: '收起决策过程', exact: true }).click()
  await expect(
    page.getByRole('table', { name: '执行决策记录', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '展开决策过程', exact: true }).click()
  await expect(page.getByText('历史日志', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/s13-05-execution.png', fullPage: true })
})

test('实时日志前插、运行事件刷新和60秒心跳，切轮次关闭旧连接', async ({
  page,
}) => {
  const s = await fixture(page, false)
  await page.clock.install()
  const connections: {
    socket: WebSocketRoute
    messages: (string | Buffer)[]
    closed: boolean
  }[] = []
  await page.routeWebSocket('**/ws/emulate_task/**', (socket) => {
    const c = { socket, messages: [] as (string | Buffer)[], closed: false }
    connections.push(c)
    socket.onMessage((data) => c.messages.push(data))
    socket.onClose(() => {
      c.closed = true
    })
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '执行过程', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: '采集动作', exact: true }),
  ).toBeVisible()
  await expect.poll(() => connections.filter((c) => !c.closed).length).toBe(1)
  const current = connections.at(-1)!
  const initial = connections.length
  expect(current.socket.url()).toContain(
    '/ws/emulate_task/task-exp-a/blue_team/blue-run/',
  )
  current.socket.send(
    JSON.stringify({
      kind: 1,
      create_time: '实时一',
      log_message: '实时日志一',
      status: 1,
      spend_time: 2,
    }),
  )
  current.socket.send(
    JSON.stringify({
      kind: 1,
      create_time: '实时二',
      log_message: '实时日志二',
      status: 2,
    }),
  )
  await expect(page.locator('ol li').first()).toContainText('实时日志二')
  await expect(page.locator('ol li').last()).toContainText('历史日志')
  const count = s.records.length
  current.socket.send(
    JSON.stringify({
      kind: 2,
      number_of_decisions: 8,
      exec_scenario_node_uid: 'action',
    }),
  )
  await expect(
    page.getByText('正在进行第8次决策', { exact: true }),
  ).toBeVisible()
  await expect.poll(() => s.records.length).toBe(count + 1)
  await expect(page.getByLabel('只读执行剧本图')).toHaveCount(0)
  await page.clock.fastForward(60000)
  await expect.poll(() => current.messages).toEqual(['{"heart":"HeartBeat"}'])
  await page.getByRole('tab', { name: '第2轮', exact: true }).click()
  await expect.poll(() => connections.length).toBeGreaterThan(initial)
  const next = connections.at(-1)!
  await expect.poll(() => current.closed).toBe(true)
  await expect(page.getByText('实时日志二', { exact: true })).toHaveCount(0)
  next.socket.close({ code: 1000, reason: '隔离断开' })
  await expect(page.getByText('实时连接已关闭', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '蓝军控制', exact: true }).click()
  const sent = current.messages.length
  await page.clock.fastForward(120000)
  expect(connections.filter((c) => !c.closed)).toHaveLength(0)
  expect(current.messages).toHaveLength(sent)
})

test('无轮次不连接实时或读取记录，读取失败可重试并恢复空态', async ({
  page,
}) => {
  await fixture(page, false)
  let fail = true
  const sockets: WebSocketRoute[] = []
  await page.routeWebSocket('**/ws/emulate_task/**', (s) => sockets.push(s))
  await page.route(`**${root}/control_record/?nopage=0`, (r) =>
    fail ? r.fulfill({ json: { status: 2 } }) : r.fulfill({ json: [] }),
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '执行过程', exact: true }).click()
  await expect(
    page.getByText('执行轮次读取失败', { exact: false }),
  ).toBeVisible()
  fail = false
  await page.getByRole('button', { name: '重试轮次', exact: true }).click()
  await expect(
    page.getByText('蓝军未执行，请先执行蓝军！', { exact: true }),
  ).toBeVisible()
  expect(sockets).toHaveLength(0)
})
