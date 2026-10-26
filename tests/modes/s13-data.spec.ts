import { test, expect, simulateURL } from './s13-fixture'
import type { Page, WebSocketRoute } from '@playwright/test'
const root = '/api/front/wqzb/test_task/task-exp-a/blue_team/blue-data'
async function fixture(page: Page) {
  const state = {
    tree: [
      {
        id: 11,
        data_type: 1,
        data_define: 1,
        define_name: 'IP',
        define_value: '192.0.2.11',
        child: [],
      },
    ] as object[],
    writes: [] as { method: string; body: Record<string, unknown> }[],
    reads: [] as string[],
  }
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/?nopage=1',
    (r) =>
      r.fulfill({
        json: [{ id: 'blue-data', name: '数据蓝军', scenario_type: 1 }],
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
  await page.route(`**${root}/init_situation_node/**`, (r) => {
    const method = r.request().method()
    if (method === 'GET') {
      state.reads.push(new URL(r.request().url()).search)
      return r.fulfill({ json: { status: 1, data: state.tree } })
    }
    const body = r.request().postDataJSON()
    state.writes.push({ method, body })
    if (method === 'POST')
      state.tree = [
        ...state.tree,
        {
          id: 12,
          data_type: 1,
          data_define: 1,
          define_name: 'IP',
          define_value: body.data[0].define_value,
        },
      ]
    if (method === 'PATCH')
      state.tree = [
        {
          id: 11,
          data_type: 1,
          data_define: 1,
          define_name: 'IP',
          define_value: body.define_value,
        },
      ]
    if (method === 'DELETE') state.tree = []
    return r.fulfill({ json: { status: 1 } })
  })
  await page.route('**/api/front/wqzb/basic_resources/inouput/?nopage=1', (r) =>
    r.fulfill({ json: [{ id: 1, datatype: 'ip', desc: 'IP地址' }] }),
  )
  await page.route(`**${root}/position_instruction_record/?*`, (r) =>
    r.fulfill({
      json: {
        count: 11,
        results: [
          {
            id: 100,
            create_time: '执行时间',
            instruction_name: '记录采集',
            status: 1,
            exec_return: { received: true },
          },
        ],
      },
    }),
  )
  await page.route(`**${root}/flow_path/?*`, (r) =>
    r.fulfill({ json: { ip_relation: [], input_ip_params_map: {} } }),
  )
  return state
}
test('蓝军数据复用录入编辑删除，kind3与轮次读写路径分别保留', async ({
  page,
}) => {
  const s = await fixture(page)
  await page.routeWebSocket('**/ws/emulate_task/**', () => {})
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '蓝军数据', exact: true }).click()
  await page.getByRole('button', { name: '数据视图', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="11"]')).toContainText(
    '192.0.2.11',
  )
  await page.getByRole('button', { name: '新增节点', exact: true }).click()
  const d = page.getByRole('dialog', { name: '数据录入', exact: true })
  await d
    .getByRole('combobox', { name: '字段1数据类型', exact: true })
    .fill('IP')
  await page.getByRole('option', { name: 'ip（IP地址）', exact: true }).click()
  await d.getByLabel('字段1数据值', { exact: true }).fill('192.0.2.12')
  await d.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="12"]')).toContainText(
    '192.0.2.12',
  )
  expect(s.writes[0]!.body).toMatchObject({
    kind: 3,
    parent: null,
    data: [{ data_define: 1, define_value: '192.0.2.12' }],
  })
  expect(s.writes[0]!.body).not.toHaveProperty('blue_team_control')
  await page
    .locator('.react-flow__node[data-id="11"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '编辑节点', exact: true }).click()
  await page
    .getByRole('dialog', { name: '编辑数据', exact: true })
    .getByLabel('字段1数据值', { exact: true })
    .fill('192.0.2.20')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存', exact: true })
    .click()
  await expect(page.locator('.react-flow__node[data-id="11"]')).toContainText(
    '192.0.2.20',
  )
  await page
    .locator('.react-flow__node[data-id="11"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '删除节点', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText(
    '附带的子节点全部删除',
  )
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认删除', exact: true })
    .click()
  await expect(page.getByText('暂无态势数据', { exact: true })).toBeVisible()
  expect(s.reads.every((q) => q === '?blue_team_control=31')).toBe(true)
  await expect(
    page.getByRole('cell', { name: '记录采集', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('navigation', { name: '数据执行记录分页', exact: true })
    .getByRole('button', { name: '下一页', exact: true })
    .click()
  await expect(
    page.getByRole('navigation', { name: '数据执行记录分页', exact: true }),
  ).toContainText('第2页')
  await page.getByRole('button', { name: '收起执行记录', exact: true }).click()
  await expect(
    page.getByRole('table', { name: '数据执行记录', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('tab', { name: '第2轮', exact: true }).click()
  await page.getByRole('button', { name: '数据视图', exact: true }).click()
  await expect(
    page.getByRole('navigation', { name: '数据执行记录分页', exact: true }),
  ).toContainText('第1页')
  expect(s.reads.at(-1)).toBe('?blue_team_control=21')
})

test('连续态势节点事件读取消息data_define并保留父子数据，切视图停止旧连接', async ({
  page,
}) => {
  await fixture(page)
  await page.clock.install()
  const sessions: {
    socket: WebSocketRoute
    closed: boolean
    sent: (string | Buffer)[]
  }[] = []
  await page.routeWebSocket('**/ws/emulate_task/**', (socket) => {
    const s = { socket, closed: false, sent: [] as (string | Buffer)[] }
    sessions.push(s)
    socket.onClose(() => {
      s.closed = true
    })
    socket.onMessage((data) => s.sent.push(data))
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '蓝军数据', exact: true }).click()
  await page.getByRole('button', { name: '数据视图', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="11"]')).toBeVisible()
  await expect.poll(() => sessions.filter((s) => !s.closed).length).toBe(1)
  const current = sessions.at(-1)!
  expect(current.socket.url()).toContain(
    '/ws/emulate_task/task-exp-a/blue_team/blue-data/situation_node/',
  )
  current.socket.send(
    JSON.stringify({
      id: 21,
      parent: 11,
      data_type: 1,
      data_define: 1,
      define_name: '子IP',
      define_value: '192.0.2.21',
    }),
  )
  current.socket.send(
    JSON.stringify({
      id: 22,
      parent: 21,
      data_type: 1,
      data_define: 1,
      define_name: '孙IP',
      define_value: '192.0.2.22',
    }),
  )
  await expect(page.locator('.react-flow__node[data-id="21"]')).toContainText(
    '192.0.2.21',
  )
  await expect(page.locator('.react-flow__node[data-id="22"]')).toContainText(
    '192.0.2.22',
  )
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await page
    .locator('.react-flow__node[data-id="21"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '编辑节点', exact: true }).click()
  const d = page.getByRole('dialog', { name: '编辑数据', exact: true })
  await expect(
    d.getByRole('combobox', { name: '字段1数据类型', exact: true }),
  ).toHaveValue('ip（IP地址）')
  await d.getByRole('button', { name: '取消', exact: true }).click()
  await page.clock.fastForward(60000)
  await expect.poll(() => current.sent).toEqual(['{"heart":"HeartBeat"}'])
  await page.locator('.react-flow__controls-fitview').click()
  await page.screenshot({ path: '/tmp/s13-06-data.png', fullPage: true })
  await page.getByRole('button', { name: '网络视图', exact: true }).click()
  await expect.poll(() => current.closed).toBe(true)
  const count = sessions.length
  await page.clock.fastForward(120000)
  expect(sessions).toHaveLength(count)
  expect(current.sent).toHaveLength(1)
})
