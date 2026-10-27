import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const url = (task = '73', scene = 'scene-a') =>
  `/#/bluessituation/${scene}/6/resource-b/${task}/topo`
const root = '/api/front/wqzb/test_task'

async function fixture(page: Page) {
  const errors: string[] = []
  const reads: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(/\/api\/front\//, (route) => {
    reads.push(
      new URL(route.request().url()).pathname +
        new URL(route.request().url()).search,
    )
    return route.fulfill({ json: {} })
  })
  await page.route(`**${root}/*/rick_statistics/`, (route) => {
    reads.push(new URL(route.request().url()).pathname)
    return route.fulfill({ json: { 远程服务漏洞: 4, 弱口令: 2 } })
  })
  await page.route(`**${root}/*/control/log/?*`, (route) => {
    const u = new URL(route.request().url())
    reads.push(u.pathname + u.search)
    return route.fulfill({
      json: {
        status: 1,
        data: {
          log: Array.from({ length: 6 }, (_, i) => ({
            create_time: `2026-10-26 10:00:0${i}`,
            message: `${u.searchParams.get('kind') === '1' ? '攻击' : '执行'}记录${i}`,
          })),
        },
      },
    })
  })
  await page.route(`**${root}/*/flow_path/`, (route) => {
    reads.push(new URL(route.request().url()).pathname)
    return route.fulfill({
      json: { ip_relation: [{ '192.0.2.1': ['192.0.2.2', '198.51.100.3'] }] },
    })
  })
  return { errors, reads }
}

test('网络跳过嵌套数组目标，仍显示同条关系的合法节点', async ({ page }) => {
  const state = await fixture(page)
  await page.route(`**${root}/*/flow_path/`, (route) =>
    route.fulfill({
      json: { ip_relation: [{ '192.0.2.1': ['192.0.2.2', ['198.51.100.3']] }] },
    }),
  )
  await page.goto(url())
  const graph = page.getByRole('img', { name: '蓝军网络拓扑', exact: true })
  await expect(graph.getByText('192.0.2.1', { exact: true })).toBeVisible()
  await expect(graph.getByText('192.0.2.2', { exact: true })).toBeVisible()
  await expect(graph.getByText('198.51.100.3', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('节点数量', { exact: true })).toHaveText('2')
  await expect(page.getByLabel('交换机数量', { exact: true })).toHaveText('1')
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(state.errors).toEqual([])
})

test('独立蓝军态势使用任务数据展示网络、风险与原滚动日志', async ({ page }) => {
  const state = await fixture(page)
  await page.goto(url())
  await expect(
    page.getByRole('heading', { name: '蓝军态势', exact: true }),
  ).toBeVisible()
  for (const [name, value] of [
    ['路由器数量', '1'],
    ['交换机数量', '2'],
    ['局域网数量', '2'],
    ['节点数量', '3'],
  ])
    await expect(page.getByLabel(name, { exact: true })).toHaveText(value)
  const graph = page.getByRole('img', { name: '蓝军网络拓扑', exact: true })
  await expect(graph.getByText('192.0.2.1', { exact: true })).toBeVisible()
  await expect(graph.getByText('交换机', { exact: true })).toHaveCount(2)
  const execution = page.getByRole('region', { name: '执行日志', exact: true })
  await expect(execution.locator('li')).toHaveCount(12)
  await expect(
    page.getByRole('region', { name: '攻击日志', exact: true }).locator('li'),
  ).toHaveCount(12)
  await expect(execution.locator('ul')).toHaveCSS(
    'animation-name',
    'situation-scroll',
  )
  await expect(
    page
      .getByRole('img', { name: '蓝军发现风险与漏洞', exact: true })
      .getByText('弱口令', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '收起底部面板', exact: true }).click()
  await expect(execution).not.toBeVisible()
  await page.getByRole('button', { name: '展开底部面板', exact: true }).click()
  await expect(execution).toBeVisible()
  await expect(page.locator('.situation-bottom')).toHaveCSS('height', '300px')
  expect(state.reads.sort()).toEqual(
    [
      `${root}/73/control/log/?kind=1`,
      `${root}/73/control/log/?kind=2`,
      `${root}/73/flow_path/`,
      `${root}/73/rick_statistics/`,
    ].sort(),
  )
  expect(state.errors).toEqual([])
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    )
  })
  await expect(
    page.getByRole('heading', { name: '蓝军态势', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('节点数量', { exact: true })).toHaveText('3')
  await page.screenshot({
    path: '/tmp/s14-01-blue-situation-final.png',
    fullPage: true,
  })
})

test('网络支持节点拖放与缩放，风险保留提示和滚动图例', async ({ page }) => {
  await page.clock.install()
  const state = await fixture(page)
  await page.route(`**${root}/*/rick_statistics/`, (route) =>
    route.fulfill({
      json: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`风险${i + 1}`, i + 1]),
      ),
    }),
  )
  await page.goto(url())
  const graph = page.getByRole('img', { name: '蓝军网络拓扑', exact: true })
  await expect(graph.locator('image')).toHaveCount(6)
  await page.clock.runFor(20000)
  await page.getByRole('button', { name: '收起底部面板', exact: true }).click()
  await page.clock.runFor(600)
  await expect(page.locator('.situation-bottom')).toHaveCSS('height', '35px')
  // 高亮会重排SVG绘制顺序，保留同一可见图元的DOM身份。
  const node = (await graph.locator('image').first().elementHandle())!
  const farNode = (await graph.locator('image').last().elementHandle())!
  // 力导向布局稳定后，通过真实指针拖放与滚轮操作验证图形，而非读取图表实例。
  expect(await node.isVisible()).toBe(true)
  await node.click()
  const distance = async () => {
    const first = (await node.boundingBox())!
    const last = (await farNode.boundingBox())!
    return Math.hypot(first.x - last.x, first.y - last.y)
  }
  const size = await distance()
  await node.hover()
  await page.mouse.wheel(0, -200)
  await page.clock.runFor(300)
  await expect
    .poll(async () => {
      await page.clock.runFor(100)
      return distance()
    })
    .toBeGreaterThan(size + 10)
  const before = (await node.boundingBox())!
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  )
  await page.mouse.down()
  for (let step = 1; step <= 8; step++) {
    await page.mouse.move(
      before.x + before.width / 2 + (90 * step) / 8,
      before.y + before.height / 2 - (60 * step) / 8,
    )
    await page.clock.runFor(32)
  }
  await page.clock.runFor(100)
  await expect
    .poll(async () => Math.abs((await node.boundingBox())!.x - before.x))
    .toBeGreaterThan(30)
  await page.mouse.up()
  await page.getByRole('button', { name: '展开底部面板', exact: true }).click()
  await page.clock.runFor(600)
  await expect(page.locator('.situation-bottom')).toHaveCSS('height', '300px')
  const risk = page.getByRole('img', {
    name: '蓝军发现风险与漏洞',
    exact: true,
  })
  const slice = risk.locator('svg > g > path').first()
  await slice.hover()
  await page.clock.runFor(300)
  await expect(
    risk.locator('div').filter({ hasText: /风险1/ }).last(),
  ).toBeVisible()
  await expect(
    risk.locator('svg text').filter({ hasText: /^风险1$/ }),
  ).toBeVisible()
  // ECharts 的滚动图例具有页码及下一页图标；点击右侧的下一页三角形。
  const pager = risk.locator('svg text').filter({ hasText: /^\d+\/\d+$/ })
  const previousPage = await pager.textContent()
  const nextPage = risk.locator('svg > g path').last()
  await nextPage.click()
  await page.clock.runFor(300)
  await expect(pager).not.toHaveText(previousPage!)
  expect(state.errors).toEqual([])
})

test('只首次读取，切任务空图及迟到响应不会残留，离页不再读取', async ({
  page,
}) => {
  const state = await fixture(page)
  await page.clock.install()
  await page.goto(url())
  await expect(
    page.getByRole('img', { name: '蓝军网络拓扑', exact: true }),
  ).toBeVisible()
  await page.clock.fastForward(120000)
  expect(state.reads).toHaveLength(4)
  await page.route(`**${root}/74/flow_path/`, (route) =>
    route.fulfill({ json: { ip_relation: [] } }),
  )
  await page.goto(url('74', 'scene-new'))
  await expect(page.getByText('暂无阵地数据', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('img', { name: '蓝军网络拓扑', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByLabel('节点数量', { exact: true })).toHaveText('0')
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**${root}/75/flow_path/`, async (route) => {
    await waiting
    await route
      .fulfill({ json: { ip_relation: [{ '203.0.113.99': [] }] } })
      .catch(() => {})
  })
  await page.goto(url('75'))
  await expect(
    page.getByRole('status').filter({ hasText: '正在读取态势' }).first(),
  ).toBeVisible()
  await page.goto(url('74'))
  release()
  await expect(page.getByText('暂无阵地数据', { exact: true })).toBeVisible()
  await expect(page.getByText('203.0.113.99', { exact: true })).toHaveCount(0)
  await page.goto('/#/not-found')
  const reads = state.reads.length
  await page.clock.fastForward(120000)
  expect(state.reads).toHaveLength(reads)
  expect(state.errors).toEqual([])
})

test('失败只提示一次，其他成功面板仍可显示且不把错误当空图', async ({
  page,
}) => {
  const state = await fixture(page)
  await page.route(`**${root}/*/flow_path/`, (route) =>
    route.fulfill({ status: 500, json: { message: '隔离网络读取失败' } }),
  )
  await page.goto(url())
  await expect(
    page.getByRole('alert').filter({ hasText: '态势读取失败' }),
  ).toHaveCount(1)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)
  await expect(page.getByText('暂无阵地数据', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: '执行日志', exact: true }).locator('li'),
  ).toHaveCount(12)
  expect(state.errors).toEqual([])
})

test('日志业务失败提示原消息一次，其余成功面板仍可显示', async ({ page }) => {
  const state = await fixture(page)
  await page.route(`**${root}/73/control/log/?kind=1`, (route) =>
    route.fulfill({ json: { status: 0, message: '任务不可用' } }),
  )
  await page.goto(url())
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(1)
  await expect(page.locator('[data-sonner-toast]')).toContainText('任务不可用')
  await expect(
    page
      .getByRole('region', { name: '攻击日志', exact: true })
      .getByRole('alert'),
  ).toContainText('态势读取失败')
  await expect(
    page.getByRole('region', { name: '执行日志', exact: true }).locator('li'),
  ).toHaveCount(12)
  await expect(
    page.getByRole('img', { name: '蓝军网络拓扑', exact: true }),
  ).toBeVisible()
  expect(state.errors).toEqual([])
})
