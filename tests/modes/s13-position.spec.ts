import { test, expect } from './s13-fixture'
import type { Page } from '@playwright/test'
const task = '/api/front/wqzb/test_task/task-exp-a'
const scene = '/#/basic/user/bench/experiment/exp-a/scene'
const script = {
  id: 7,
  blue_team_id: 100,
  scenario_type: 1,
  system: 'Linux',
  blue_team_name: '剧本甲',
  custom: { keep: true },
}
const intelligent = {
  id: 7,
  blue_team_id: 200,
  scenario_type: 2,
  name: '智能终端',
  blue_team_name: '智能乙',
}
const occupied = {
  id: 8,
  blue_team_id: 100,
  scenario_type: 1,
  system: 'Windows',
  blue_team_name: '占用蓝军',
  position_init_id: 90,
}
async function fixture(page: Page) {
  const state = {
    graph: {
      lock: false,
      cells: [
        {
          id: 'blue-node',
          shape: 'custom-react-node',
          position: { x: 100, y: 100 },
          size: { width: 80, height: 80 },
          data: {
            name: '蓝军主机',
            data_id: 91,
            is_blue: true,
            nodeInfo: { id: 91 },
          },
        },
      ],
    } as Record<string, unknown>,
    association: null as Record<string, unknown> | null,
    writes: [] as { path: string; method: string; body: unknown }[],
  }
  await page.route('**/api/front/simulation/experiment/exp-a/?more=1', (r) =>
    r.fulfill({
      json: {
        id: 'exp-a',
        name: '接入实验',
        desc: '',
        node_count: 1,
        user_name: '隔离学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: null,
        topo_id: 'topo-exp-a',
        test_task: 'task-exp-a',
      },
    }),
  )
  await page.route('**/api/front/topo/topo-exp-a/draw/?task_type=6', (r) => {
    if (r.request().method() === 'POST') {
      state.graph = r.request().postDataJSON().topo
      state.writes.push({ path: 'draw', method: 'POST', body: state.graph })
      return r.fulfill({ json: { status: 1 } })
    }
    return r.fulfill({ json: state.graph })
  })
  await page.route('**/api/front/topo/topo-exp-a/status/?task_type=6', (r) =>
    r.fulfill({ json: { nodes: {}, edges: {} } }),
  )
  await page.route('**/api/front/node/last_operat/**', (r) =>
    r.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (r) =>
    r.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/template/?*', (r) =>
    r.fulfill({ json: [] }),
  )
  await page.route(`**${task}/init_info/terminal/`, (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: {
          used_data: [
            occupied,
            ...(state.association
              ? [{ ...state.association, position_init_id: 91 }]
              : []),
          ],
          unused_data: [script, intelligent].filter(
            (t) =>
              !state.association ||
              t.blue_team_id !== state.association.blue_team_id,
          ),
        },
      },
    }),
  )
  await page.route(`**${task}/init_info/`, (r) => {
    const body = r.request().postDataJSON()
    state.writes.push({ path: 'init_info', method: r.request().method(), body })
    state.association =
      r.request().method() === 'DELETE'
        ? null
        : body.blue_team === 100
          ? script
          : intelligent
    return r.fulfill({ json: { status: 1 } })
  })
  await page.route(`**${task}/blue_team/*/terminal/*/tool/?*`, (r) =>
    r.fulfill({ json: { count: 0, results: [] } }),
  )
  return state
}

test('场景蓝军终端按稳定组合标识关联、重关联及取消，并保存图后重开', async ({
  page,
}) => {
  const state = await fixture(page)
  await page.goto(scene)
  await page.getByRole('button', { name: '蓝军配置', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '蓝军配置', exact: true })
  await expect(
    panel.getByText('当前蓝军节点未配置蓝军终端', { exact: false }),
  ).toBeVisible()
  await panel.getByRole('button', { name: '选择蓝军终端', exact: true }).click()
  const form = page.getByRole('dialog', { name: '关联终端', exact: true })
  await form.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    form.getByRole('alert').filter({ hasText: '请选择终端' }),
  ).toBeVisible()
  const select = form.getByLabel('选择终端', { exact: true })
  await select.selectOption('100-7')
  await expect(
    select.locator('option', { hasText: 'Windows（占用蓝军）' }),
  ).toBeDisabled()
  await form.getByRole('button', { name: '确定', exact: true }).click()
  await expect(form).toHaveCount(0)
  await expect(
    panel.getByText('Linux（剧本甲）', { exact: false }),
  ).toBeVisible()
  await expect
    .poll(() => state.writes.filter((w) => w.path === 'draw').length)
    .toBe(1)
  expect(state.writes.find((w) => w.path === 'init_info')?.body).toEqual({
    blue_team: 100,
    terminal: 7,
    device_id: 'blue-node',
  })
  expect(
    (state.graph.cells as { data: Record<string, unknown> }[])[0]!.data
      .blueInfo,
  ).toMatchObject({ ...script, terminal_id: '100-7' })
  await panel.getByRole('button', { name: '重新关联', exact: true }).click()
  await page
    .getByRole('dialog', { name: '关联终端', exact: true })
    .getByLabel('选择终端', { exact: true })
    .selectOption('200-7')
  await page
    .getByRole('dialog', { name: '关联终端', exact: true })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  await expect
    .poll(() => state.writes.filter((w) => w.path === 'draw').length)
    .toBe(2)
  expect(
    state.writes.filter((w) => w.path === 'init_info').at(-1)?.body,
  ).toEqual({ blue_team: 200, intelligent_terminal: 7, device_id: 'blue-node' })
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: '蓝军配置', exact: true }).click()
  await expect(
    panel.getByText('智能终端（智能乙）', { exact: false }),
  ).toBeVisible()
  await panel.getByRole('button', { name: '取消关联', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认解除', exact: true })
    .click()
  await expect
    .poll(() => state.writes.filter((w) => w.path === 'draw').length)
    .toBe(3)
  expect(
    state.writes.filter((w) => w.path === 'init_info').at(-1)?.body,
  ).toEqual({ ids: [91] })
  expect(
    (state.graph.cells as { data: Record<string, unknown> }[])[0]!.data
      .blueInfo,
  ).toEqual({})
})

test('部署列表业务失败可重试，搜索分页和单项批量操作保留原参数', async ({
  page,
}) => {
  const state = await fixture(page)
  state.association = script
  ;(
    state.graph.cells as { data: Record<string, unknown> }[]
  )[0]!.data.blueInfo = { ...script, terminal_id: '100-7' }
  let fail = true
  const queries: string[] = []
  await page.route(`**${task}/blue_team/100/terminal/7/tool/?*`, (r) => {
    const url = new URL(r.request().url())
    queries.push(url.search)
    if (fail) {
      fail = false
      return r.fulfill({ json: { status: 2, message: '工具读取被拒绝' } })
    }
    return r.fulfill({
      json: {
        count: 11,
        results: [
          {
            id: 301,
            tool_name:
              url.searchParams.get('page') === '2' ? '第二页工具' : '采集工具',
            version: 'v1',
            instruction_count: 2,
            status: 1,
            run_status: 1,
          },
          { id: 302, tool_name: '正在部署工具', status: 3 },
          { id: 303, tool_name: '未启动工具', status: 1, run_status: 2 },
        ],
      },
    })
  })
  await page.route(`**${task}/node_tool/*/*/`, (r) => {
    state.writes.push({
      path: new URL(r.request().url()).pathname,
      method: r.request().method(),
      body: r.request().postData(),
    })
    return r.fulfill({ json: { status: 1, message: '操作完成' } })
  })
  await page.route(`**${task}/terminal/7/node_tool/*/?type=1`, (r) => {
    state.writes.push({
      path:
        new URL(r.request().url()).pathname + new URL(r.request().url()).search,
      method: r.request().method(),
      body: r.request().postData(),
    })
    return r.fulfill({ json: { status: 1, message: '批量操作完成' } })
  })
  await page.goto(scene)
  await page.getByRole('button', { name: '蓝军配置', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '蓝军配置', exact: true })
  await expect(
    panel.getByText('部署工具读取失败', { exact: false }),
  ).toBeVisible()
  await panel.getByRole('button', { name: '重试工具', exact: true }).click()
  const row = panel.getByRole('row').filter({ hasText: '采集工具' })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '部署', exact: true }).click()
  await row.getByRole('button', { name: '检测', exact: true }).click()
  await expect(
    panel
      .getByRole('row')
      .filter({ hasText: '正在部署工具' })
      .getByRole('button', { name: '部署', exact: true }),
  ).toBeDisabled()
  const count = state.writes.length
  await panel
    .getByRole('row')
    .filter({ hasText: '未启动工具' })
    .getByRole('button', { name: '检测', exact: true })
    .click()
  await expect(page.getByText('请先启动环境！', { exact: true })).toBeVisible()
  expect(state.writes).toHaveLength(count)
  await panel.getByRole('button', { name: '批量部署', exact: true }).click()
  await panel.getByRole('button', { name: '批量检测', exact: true }).click()
  await panel
    .getByRole('navigation', { name: '蓝军工具分页' })
    .getByRole('button', { name: '下一页', exact: true })
    .click()
  await expect(
    panel.getByRole('cell', { name: '第二页工具 v1', exact: true }),
  ).toBeVisible()
  await panel.getByLabel('工具关键字', { exact: true }).fill('采集')
  await expect(
    panel.getByRole('cell', { name: '采集工具 v1', exact: true }),
  ).toBeVisible()
  expect(queries).toContain('?page=1&size=10&search=&node_id=100')
  expect(queries).toContain('?page=2&size=10&search=&node_id=100')
  expect(queries).toContain(
    '?page=1&size=10&search=%E9%87%87%E9%9B%86&node_id=100',
  )
  expect(state.writes.map((w) => w.path)).toEqual([
    `${task}/node_tool/301/deploy/`,
    `${task}/node_tool/301/check/`,
    `${task}/terminal/7/node_tool/deploy/?type=1`,
    `${task}/terminal/7/node_tool/check/?type=1`,
  ])
  expect(
    state.writes.every((w) => w.method === 'POST' && w.body === null),
  ).toBe(true)
  await page.screenshot({ path: '/tmp/s13-position-tools.png', fullPage: true })
})

test('锁图关联保存失败可重试，重试后可解除，保存中关窗不锁死拓扑', async ({
  page,
}) => {
  const state = await fixture(page)
  state.graph.lock = true
  let fail = true,
    hold = false
  let release!: () => void
  let waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/api/front/topo/topo-exp-a/draw/?task_type=6',
    async (r) => {
      if (r.request().method() === 'GET')
        return r.fulfill({ json: state.graph })
      state.writes.push({
        path: 'draw',
        method: 'POST',
        body: r.request().postDataJSON().topo,
      })
      if (fail) {
        fail = false
        return r.fulfill({ json: { status: 2, message: '图保存拒绝' } })
      }
      if (hold) {
        await waiting
        return r.fulfill({ json: { status: 1 } }).catch(() => {})
      }
      state.graph = r.request().postDataJSON().topo
      return r.fulfill({ json: { status: 1 } })
    },
  )
  await page.goto(scene)
  await expect(
    page.getByRole('button', { name: '保存拓扑', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '蓝军配置', exact: true }).click()
  const panel = page.getByRole('dialog', { name: '蓝军配置', exact: true })
  const choose = async () => {
    await panel
      .getByRole('button', { name: '选择蓝军终端', exact: true })
      .click()
    const form = page.getByRole('dialog', { name: '关联终端', exact: true })
    await form.getByLabel('选择终端', { exact: true }).selectOption('100-7')
    await form.getByRole('button', { name: '确定', exact: true }).click()
  }
  await choose()
  await expect(
    panel.getByText('关联关系已更新，拓扑尚未保存。', { exact: false }),
  ).toBeVisible()
  await panel.getByRole('button', { name: '重试保存关联', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: '重试保存关联', exact: true }),
  ).toHaveCount(0)
  expect(state.writes.filter((w) => w.path === 'init_info')).toHaveLength(1)
  await panel.getByRole('button', { name: '取消关联', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认解除', exact: true })
    .click()
  await expect(
    panel.getByRole('button', { name: '选择蓝军终端', exact: true }),
  ).toBeVisible()
  hold = true
  await choose()
  await expect
    .poll(() => state.writes.filter((w) => w.path === 'draw').length)
    .toBe(4)
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '蓝军配置', exact: true }),
  ).toBeEnabled()
  hold = false
  release()
  await page.getByRole('button', { name: '蓝军配置', exact: true }).click()
  waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  hold = true
  await panel.getByRole('button', { name: '重试保存关联', exact: true }).click()
  await expect
    .poll(() => state.writes.filter((w) => w.path === 'draw').length)
    .toBe(5)
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  try {
    await expect(
      page.getByRole('button', { name: '蓝军配置', exact: true }),
    ).toBeEnabled()
  } finally {
    hold = false
    release()
  }
  await page.getByRole('button', { name: '蓝军配置', exact: true }).click()
  await panel.getByRole('button', { name: '重试保存关联', exact: true }).click()
  await expect(
    panel.getByRole('button', { name: '重试保存关联', exact: true }),
  ).toHaveCount(0)
  expect(
    state.writes.filter((w) => w.path === 'init_info' && w.method === 'POST'),
  ).toHaveLength(2)
  expect(state.writes.filter((w) => w.path === 'draw')).toHaveLength(6)
  expect(state.graph.lock).toBe(true)
  expect(
    (state.graph.cells as { data: Record<string, unknown> }[])[0]!.data
      .blueInfo,
  ).toMatchObject({ id: 7, blue_team_id: 100 })
  await panel.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '保存拓扑', exact: true }),
  ).toBeDisabled()
})
