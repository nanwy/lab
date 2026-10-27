import { expect, test, type Page } from '@playwright/test'
const url = (task = '73', scene = 'scene-a', model = 'scene') =>
  `/#/leadingtone/${scene}/14/unused/${task}/${model}`
const cells = [
  {
    id: 'a',
    shape: 'custom-react-node',
    position: { x: 900, y: 500 },
    data: { name: '导调节点甲' },
  },
  {
    id: 'b',
    shape: 'custom-react-node',
    position: { x: 1100, y: 700 },
    data: { name: '导调节点乙' },
  },
  { id: 'ab', shape: 'edge', source: { cell: 'a' }, target: { cell: 'b' } },
]
async function fixture(page: Page) {
  const reads: string[] = [],
    errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(/\/api\/front\//, (route) => {
    const u = new URL(route.request().url())
    reads.push(route.request().method() + ' ' + u.pathname + u.search)
    if (u.pathname.endsWith('/draw/')) return route.fulfill({ json: { cells } })
    if (u.pathname.endsWith('/rick_statistics/'))
      return route.fulfill({ json: { 弱口令: 3, 配置漏洞: 2 } })
    if (u.pathname.endsWith('/control/log/'))
      return route.fulfill({
        json: {
          status: 1,
          data: {
            log: Array.from({ length: 6 }, (_, i) => ({
              create_time: `2026-10-27 10:00:0${i}`,
              message: `${u.searchParams.get('kind') === '1' ? '攻击' : '执行'}记录${i}`,
            })),
          },
        },
      })
    return route.fulfill({ status: 404, json: { error: '未授权的额外请求' } })
  })
  return { reads, errors }
}
test('导调深链呈现原拓扑、静态区、任务风险与日志映射和三侧收起', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1100 })
  const state = await fixture(page)
  await page.goto(url())
  await expect(
    page.getByRole('heading', { name: '导调态势', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('img', { name: '导调3D拓扑', exact: true })
      .locator('canvas'),
  ).toBeVisible()
  for (const name of [
    '路由器数量',
    '交换机数量',
    '局域网数量',
    '防火墙数量',
    '节点数量',
  ])
    await expect(page.getByLabel(name, { exact: true })).toHaveText('0')
  await expect(page.getByText('90', { exact: true })).toBeVisible()
  await expect(page.getByText('901', { exact: true })).toBeVisible()
  const event = page.getByRole('region', { name: '事件日志', exact: true })
  const traffic = page.getByRole('region', { name: '流量日志', exact: true })
  const blue = page.getByRole('region', { name: '蓝军攻击日志', exact: true })
  await expect(event.locator('li')).toHaveCount(12)
  await expect(event.locator('li').first()).toHaveAttribute(
    'title',
    '执行记录0',
  )
  await expect(blue.locator('li').first()).toHaveAttribute('title', '执行记录0')
  await expect(traffic.locator('li').first()).toHaveAttribute(
    'title',
    '攻击记录0',
  )
  await expect(event.locator('ul')).toHaveCSS(
    'animation-name',
    'situation-scroll',
  )
  await expect(
    page
      .getByRole('img', { name: '蓝军发现风险与漏洞', exact: true })
      .getByText('弱口令', { exact: true }),
  ).toBeVisible()
  for (const title of ['事件分布', '资产分布'])
    await expect(
      page
        .getByRole('img', { name: title, exact: true })
        .getByText('防火墙', { exact: true }),
    ).toBeVisible()
  for (const title of ['训练任务', '训练过程与效果'])
    await expect(
      page.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible()
  await page.getByRole('button', { name: '收起左侧面板', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '事件分布', exact: true }),
  ).not.toBeVisible()
  await page.getByRole('button', { name: '展开左侧面板', exact: true }).click()
  await page.getByRole('button', { name: '收起右侧面板', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '训练任务', exact: true }),
  ).not.toBeVisible()
  await page.getByRole('button', { name: '展开右侧面板', exact: true }).click()
  await page.getByRole('button', { name: '收起底部面板', exact: true }).click()
  await expect(event).not.toBeVisible()
  await page.getByRole('button', { name: '展开底部面板', exact: true }).click()
  await expect(page.locator('.situation-bottom')).toHaveCSS('height', '300px')
  await expect(event).toBeVisible()
  expect(state.reads.sort()).toEqual(
    [
      'GET /api/front/scene/scene-a/draw/?task_type=14',
      'GET /api/front/wqzb/test_task/73/rick_statistics/',
      'GET /api/front/wqzb/test_task/73/control/log/?kind=1',
      'GET /api/front/wqzb/test_task/73/control/log/?kind=2',
    ].sort(),
  )
  expect(state.errors).toEqual([])
  await page.screenshot({ path: '/tmp/s14-03-leading.png', fullPage: true })
})

test('切任务场景清旧数据且空态不残留，离页停止原读取', async ({ page }) => {
  await page.clock.install()
  const state = await fixture(page)
  await page.goto(url())
  await expect(
    page.getByRole('region', { name: '事件日志', exact: true }).locator('li'),
  ).toHaveCount(12)
  await page.clock.fastForward(120000)
  expect(state.reads).toHaveLength(4)
  const releases: (() => void)[] = []
  await page.route(
    '**/api/front/wqzb/test_task/74/control/log/?*',
    async (route) => {
      await new Promise<void>((resolve) => {
        releases.push(resolve)
      })
      try {
        await route.fulfill({
          json: { status: 1, data: { log: [{ message: '旧任务迟到日志' }] } },
        })
      } catch {
        /* 已切页取消。 */
      }
    },
  )
  await page.goto(url('74', 'scene-slow'))
  await expect(
    page
      .getByRole('region', { name: '事件日志', exact: true })
      .getByText('正在读取态势…', { exact: true }),
  ).toBeVisible()
  await page.route('**/api/front/scene/empty/draw/?*', (route) =>
    route.fulfill({ json: { cells: [] } }),
  )
  await page.route('**/api/front/wqzb/test_task/75/rick_statistics/', (route) =>
    route.fulfill({ json: {} }),
  )
  await page.route('**/api/front/wqzb/test_task/75/control/log/?*', (route) =>
    route.fulfill({ json: { status: 1, data: { log: [] } } }),
  )
  await page.goto(url('75', 'empty'))
  releases.forEach((release) => release())
  await expect(page.getByText('暂无拓扑数据', { exact: true })).toBeVisible()
  await expect(page.getByText('暂无日志', { exact: true })).toHaveCount(3)
  await expect(page.getByText('暂无风险与漏洞', { exact: true })).toBeVisible()
  await expect(page.getByText('旧任务迟到日志', { exact: true })).toHaveCount(0)
  await page.goto('/#/not-found')
  await expect(
    page.getByRole('img', { name: '导调3D拓扑', exact: true }),
  ).toHaveCount(0)
  const reads = state.reads.length
  await page.clock.fastForward(120000)
  expect(state.reads).toHaveLength(reads)
  expect(state.errors).toEqual([])
})

test('重复消费执行日志的业务失败仍只提示一次，其余面板正常', async ({
  page,
}) => {
  const state = await fixture(page)
  await page.route(
    '**/api/front/wqzb/test_task/73/control/log/?kind=2',
    (route) =>
      route.fulfill({ json: { status: 0, message: '执行日志不可用' } }),
  )
  await page.goto(url())
  await expect(page.getByText('执行日志不可用', { exact: true })).toHaveCount(1)
  await expect(
    page
      .getByRole('region', { name: '事件日志', exact: true })
      .getByRole('alert'),
  ).toHaveText('态势读取失败')
  await expect(
    page
      .getByRole('region', { name: '蓝军攻击日志', exact: true })
      .getByRole('alert'),
  ).toHaveText('态势读取失败')
  await expect(
    page.getByRole('region', { name: '流量日志', exact: true }).locator('li'),
  ).toHaveCount(12)
  await expect(
    page
      .getByRole('img', { name: '导调3D拓扑', exact: true })
      .locator('canvas'),
  ).toBeVisible()
  expect(state.errors).toEqual([])
})
