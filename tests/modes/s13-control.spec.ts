import { test, expect, simulateURL } from './s13-fixture'
import type { Page } from '@playwright/test'
const root = '/api/front/wqzb/test_task/task-exp-a/blue_team/blue-control'
async function controlFixture(page: Page) {
  const state = {
    status: 0,
    writes: [] as unknown[],
    checks: [] as (string | null)[],
    roundReads: [] as string[],
    controlReads: 0,
    failClear: true,
  }
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/?nopage=1',
    (r) =>
      r.fulfill({
        json: [
          {
            id: 'blue-control',
            name: '运行蓝军',
            scenario_type: 1,
            scenario: 'scenario-control',
          },
        ],
      }),
  )
  await page.route(`**${root}/control/`, (r) => {
    if (r.request().method() === 'POST') {
      const b = r.request().postDataJSON()
      state.writes.push(b)
      if (b.action === 'clear' && state.failClear) {
        state.failClear = false
        return r.fulfill({ json: { status: 2, message: '清空被拒绝' } })
      }
      state.status =
        { start: 1, pause: 2, continue: 1, over: 4, clear: 0 }[
          b.action as string
        ] ?? state.status
      return r.fulfill({
        json: { status: 1, message: `服务端${b.action}成功` },
      })
    }
    state.controlReads++
    return r.fulfill({
      json: { status: 1, data: { status: state.status, executed_time: 65 } },
    })
  })
  await page.route(`**${root}/stage_check/**`, (r) => {
    const kind = new URL(r.request().url()).searchParams.get('kind')
    state.checks.push(kind)
    return r.fulfill({
      json: {
        status: 1,
        message: kind === '2' ? '检查通过（有提示）' : '检查通过',
      },
    })
  })
  await page.route(`**${root}/control_record/?*`, (r) => {
    state.roundReads.push(new URL(r.request().url()).search)
    return r.fulfill({ json: { count: 0, results: [] } })
  })
  return state
}
test('三项和一键检查保留精确通过判据，全部控制动作及清空失败确认', async ({
  page,
}) => {
  const s = await controlFixture(page)
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '启动模拟蓝军', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: '检查蓝军阵地接入', exact: true })
    .click()
  await expect(page.getByText('已接入', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: '检查蓝军武器布设', exact: true })
    .click()
  await expect(page.getByText('已布设', { exact: true })).toHaveCount(0)
  await page
    .getByRole('button', { name: '检查初始态势录入', exact: true })
    .click()
  await expect(page.getByText('已录入', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '一键检查', exact: true }).click()
  await expect(page.getByText('已布设', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '启动模拟蓝军', exact: true }).click()
  await expect(page.getByText('服务端start成功', { exact: true })).toHaveCount(
    1,
  )
  await expect(page.getByText('00小时01分05秒', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(page.getByText('服务端pause成功', { exact: true })).toHaveCount(
    1,
  )
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await expect(
    page.getByText('服务端continue成功', { exact: true }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: '结束', exact: true }).click()
  await expect(page.getByText('服务端over成功', { exact: true })).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: '启动模拟蓝军', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '清空数据', exact: true }).click()
  const d = page.getByRole('alertdialog')
  await d.getByRole('button', { name: '取消', exact: true }).click()
  expect(s.writes).toHaveLength(4)
  await page.getByRole('button', { name: '清空数据', exact: true }).click()
  await d.getByRole('button', { name: '确认清空', exact: true }).click()
  await expect(page.getByText('清空被拒绝', { exact: true })).toBeVisible()
  await expect(d).toBeVisible()
  await d.getByRole('button', { name: '确认清空', exact: true }).click()
  await expect(d).toHaveCount(0)
  await expect(page.getByText('服务端clear成功', { exact: true })).toHaveCount(
    1,
  )
  expect(s.checks).toEqual(['1', '2', '3', null])
  expect(s.writes).toEqual([
    { action: 'start' },
    { action: 'pause' },
    { action: 'continue' },
    { action: 'over' },
    { action: 'clear' },
    { action: 'clear' },
  ])
  expect(s.roundReads).toContain('?page=1&size=5')
})

test('攻击轮次删除退页与对比门控、结果分页和两侧JSON详情', async ({ page }) => {
  await controlFixture(page)
  const rounds = [
    { id: 101, round: 1, status: 4 },
    { id: 202, round: 2, status: 4 },
    { id: 303, round: 3, status: 5 },
    { id: 404, round: 4, status: 2 },
    { id: 505, round: 5, status: 0 },
  ].map((r) => ({
    ...r,
    start_time: '2026-10-25 10:00:00',
    end_time: '2026-10-25 10:01:00',
  }))
  let last = true,
    failDelete = true,
    failCompare = true
  const writes: string[] = [],
    reads: string[] = []
  await page.route(`**${root}/control_record/?*`, (r) => {
    const p = new URL(r.request().url()).searchParams.get('page')
    return r.fulfill({
      json: {
        count: last ? 6 : 5,
        results:
          p === '2' && last ? [{ id: 606, round: 6, status: 4 }] : rounds,
      },
    })
  })
  await page.route(`**${root}/control_record/606/`, (r) => {
    writes.push('delete606')
    if (failDelete) {
      failDelete = false
      return r.fulfill({ json: { status: 2, message: '轮次删除失败' } })
    }
    last = false
    return r.fulfill({ json: { status: 1 } })
  })
  await page.route(`**${root}/control_record/compare/*/**`, (r) => {
    const url = new URL(r.request().url()),
      id = url.pathname.split('/').at(-2),
      p = url.searchParams.get('page')
    if (r.request().method() === 'POST') {
      writes.push(`compare${id}`)
      if (failCompare) {
        failCompare = false
        return r.fulfill({ json: { status: 2, message: '对比业务失败' } })
      }
      rounds[1]!.status = 5
      return r.fulfill({ json: { status: 1 } })
    }
    reads.push(`${id}:${p}`)
    if (id === '303') return r.fulfill({ json: { count: 0, results: [] } })
    return r.fulfill({
      json: {
        count: 11,
        results: [
          {
            id: 900,
            sub_technology_name: p === '2' ? '第二页动作' : '读取配置',
            undefended_return: { host: { ip: '192.0.2.1' } },
            defended_return: { host: { ip: '192.0.2.1' } },
            conclusion: '内容一致',
          },
        ],
      },
    })
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '对比第1轮', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '对比第4轮', exact: true }),
  ).toBeDisabled()
  await expect(page.getByText('00时01分00秒', { exact: true })).toHaveCount(5)
  await page.getByRole('button', { name: '对比第2轮', exact: true }).click()
  await expect(page.getByText('对比业务失败', { exact: true })).toBeVisible()
  await expect(
    page.getByText('对比完成，点击查看，可查看对比结果！', { exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '对比第2轮', exact: true }).click()
  await page.getByRole('button', { name: '查看第2轮', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: '读取配置', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: '对比详情：读取配置', exact: true })
    .click()
  const d = page.getByRole('dialog', { name: '对比详情', exact: true })
  await expect(
    d.getByText('数据一致，可能未采取防御措施或者防御无效', { exact: true }),
  ).toBeVisible()
  await expect(d.getByText('192.0.2.1', { exact: false })).toHaveCount(2)
  await page.screenshot({ path: '/tmp/s13-04-comparison.png', fullPage: true })
  await d.getByRole('button', { name: 'Close', exact: true }).click()
  await page
    .getByRole('navigation', { name: '结果分页', exact: true })
    .getByRole('button', { name: '下一页', exact: true })
    .click()
  await expect(
    page.getByRole('cell', { name: '第二页动作', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '查看第2轮', exact: true }).click()
  await expect(
    page.getByRole('navigation', { name: '结果分页', exact: true }),
  ).toContainText('第1页')
  await expect(
    page.getByRole('cell', { name: '读取配置', exact: true }),
  ).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: '查看第3轮', exact: true }).click()
  await expect(page.getByText('暂无对比结果', { exact: true })).toBeVisible()
  expect(reads).toEqual(['202:1', '202:2', '202:1', '303:1'])
  await page
    .getByRole('navigation', { name: '轮次分页', exact: true })
    .getByRole('button', { name: '下一页', exact: true })
    .click()
  await page.getByRole('button', { name: '删除第6轮', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认删除', exact: true })
    .click()
  await expect(page.getByText('轮次删除失败', { exact: true })).toBeVisible()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认删除', exact: true })
    .click()
  await expect(
    page.getByRole('navigation', { name: '轮次分页', exact: true }),
  ).toContainText('第1页')
  await expect(
    page.getByRole('button', { name: '删除第2轮', exact: true }),
  ).toBeVisible()
  expect(writes).toEqual(['compare202', 'compare202', 'delete606', 'delete606'])
  await page.screenshot({ path: '/tmp/s13-04-control.png', fullPage: true })
})

test('首行执行中才5秒重读轮次，结束只读一次状态，计时与切蓝军清理', async ({
  page,
}) => {
  const s = await controlFixture(page)
  s.status = 1
  await page.clock.install({ time: new Date('2026-10-25T00:00:00Z') })
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/?nopage=1',
    (r) =>
      r.fulfill({
        json: [
          {
            id: 'blue-control',
            name: '运行蓝军',
            scenario_type: 1,
            scenario: 's1',
          },
          {
            id: 'blue-other',
            name: '另一蓝军',
            scenario_type: 1,
            scenario: 's2',
          },
        ],
      }),
  )
  let reads = 0,
    stopped = false,
    otherReads = 0
  await page.route(`**${root}/control_record/?*`, (r) => {
    reads++
    return r.fulfill({
      json: {
        count: 1,
        results: [{ id: 101, round: 1, status: stopped ? 4 : 1 }],
      },
    })
  })
  await page.route(
    '**/api/front/wqzb/test_task/task-exp-a/blue_team/blue-other/control/',
    (r) => {
      otherReads++
      return r.fulfill({ json: { status: 1, data: { status: 99 } } })
    },
  )
  await page.route(
    '**/api/front/wqzb/test_task/task-exp-a/blue_team/blue-other/control_record/?*',
    (r) => r.fulfill({ json: { count: 0, results: [] } }),
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await expect(page.getByText('00小时01分05秒', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: '检查蓝军阵地接入', exact: true })
    .click()
  await expect(page.getByText('已接入', { exact: true })).toBeVisible()
  await page.clock.runFor(1000)
  expect(reads).toBe(1)
  await expect(page.getByText('00小时01分06秒', { exact: true })).toBeVisible()
  await page.clock.runFor(4000)
  await expect.poll(() => reads).toBe(2)
  stopped = true
  await page.clock.runFor(5000)
  await expect.poll(() => reads).toBe(3)
  await expect.poll(() => s.controlReads).toBe(2)
  await page.clock.runFor(15000)
  expect(reads).toBe(3)
  expect(s.controlReads).toBe(2)
  stopped = false
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '继续', exact: true }),
  ).toBeVisible()
  await expect.poll(() => reads).toBe(4)
  await page
    .getByRole('button', { name: '选择蓝军：另一蓝军', exact: true })
    .click()
  await expect(
    page.getByText('当前状态无可用控制操作', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('已接入', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '启动模拟蓝军', exact: true }),
  ).toHaveCount(0)
  await page.clock.runFor(10000)
  expect(reads).toBe(4)
  const last = otherReads
  await page.goto('/#/basic/home')
  await page.clock.runFor(10000)
  expect(otherReads).toBe(last)
})

test('对比详情区分数组与数字键对象，并保留JSON展开', async ({ page }) => {
  await controlFixture(page)
  await page.route(`**${root}/control_record/?*`, (r) =>
    r.fulfill({
      json: { count: 1, results: [{ id: 202, round: 2, status: 5 }] },
    }),
  )
  await page.route(`**${root}/control_record/compare/202/?*`, (r) =>
    r.fulfill({
      json: {
        count: 1,
        results: [
          {
            id: 900,
            sub_technology_name: '比较容器',
            undefended_return: { items: [1, 2] },
            defended_return: { items: { '0': 1, '1': 2 } },
            conclusion: '内容不同',
          },
        ],
      },
    }),
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('button', { name: '查看第2轮', exact: true }).click()
  await page
    .getByRole('button', { name: '对比详情：比较容器', exact: true })
    .click()
  const d = page.getByRole('dialog', { name: '对比详情', exact: true })
  const before = d.locator('section').filter({
    has: page.getByRole('heading', {
      name: '未防御攻击结果数据',
      exact: true,
    }),
  })
  const after = d.locator('section').filter({
    has: page.getByRole('heading', {
      name: '防御后攻击结果数据',
      exact: true,
    }),
  })
  await expect(before.locator('summary')).toHaveText('items []')
  await expect(after.locator('summary')).toHaveText('items {}')
  await before.locator('summary').click()
  await expect(before.locator('details')).not.toHaveAttribute('open')
  await before.locator('summary').click()
  await expect(before.getByText('1', { exact: true })).toBeVisible()
})
