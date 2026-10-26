import { expect, test } from '@playwright/test'

const logo =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="4" y="4" width="56" height="56" fill="#34bfff"/></svg>',
  )
const cells = [
  {
    id: 'a',
    shape: 'custom-react-node',
    position: { x: 900, y: 500 },
    data: { name: '防御节点甲', logo },
  },
  {
    id: 'b',
    shape: 'custom-react-node',
    position: { x: 1100, y: 700 },
    data: { name: '防御节点乙', logo },
  },
  { id: 'ab', shape: 'edge', source: { cell: 'a' }, target: { cell: 'b' } },
]
const url = (model = 'scene', id = 'scene-a', type = '14') =>
  `/#/defensive/${id}/${type}/unused/73/${model}`

test('防御深链读取原场景拓扑，保留固定指标、空日志和面板控制', async ({
  page,
}) => {
  const reads: string[] = []
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/\/api\/front\//, (route) => {
    reads.push(
      route.request().method() +
        ' ' +
        new URL(route.request().url()).pathname +
        new URL(route.request().url()).search,
    )
    return route.fulfill({ json: { cells } })
  })
  await page.goto(url())
  await expect(
    page.getByRole('heading', { name: '防御态势', exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('img', { name: '防御3D拓扑', exact: true })
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
  await expect(page.getByText('90%', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '防御操作日志' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '防御效果日志' }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('img', { name: '资产分布', exact: true })
      .getByText('防火墙', { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: '/tmp/s14-02-defense-initial.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '收起底部面板', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '防御操作日志' }),
  ).not.toBeVisible()
  await page.getByRole('button', { name: '收起右侧面板', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '训练任务' }),
  ).not.toBeVisible()
  expect(reads).toEqual(['GET /api/front/scene/scene-a/draw/?task_type=14'])
  expect(errors).toEqual([])
})

test('3D相机可旋转缩放和平移，拓扑切换及离页释放画面', async ({ page }) => {
  const reads: string[] = []
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(/\/api\/front\//, (route) => {
    reads.push(new URL(route.request().url()).pathname)
    return route.fulfill({
      json: { cells: route.request().url().includes('empty') ? [] : cells },
    })
  })
  await page.goto(url('topo', 'topo-a', '6'))
  const canvas = page
    .getByRole('img', { name: '防御3D拓扑', exact: true })
    .locator('canvas')
  await expect(canvas).toBeVisible()
  await page.getByRole('button', { name: '收起底部面板', exact: true }).click()
  await page.getByRole('button', { name: '收起右侧面板', exact: true }).click()
  await expect(page.locator('.defensive-right')).toHaveCSS('width', '30px')
  const image = await canvas.screenshot()
  await page.mouse.move(500, 250)
  await page.mouse.down()
  await page.mouse.move(650, 320, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(async () => Buffer.compare(await canvas.screenshot(), image))
    .not.toBe(0)
  const rotated = await canvas.screenshot()
  await page.mouse.wheel(0, -400)
  await expect
    .poll(async () => Buffer.compare(await canvas.screenshot(), rotated))
    .not.toBe(0)
  const zoomed = await canvas.screenshot()
  await page.mouse.move(500, 250)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(650, 320, { steps: 8 })
  await page.mouse.up({ button: 'right' })
  await expect
    .poll(async () => Buffer.compare(await canvas.screenshot(), zoomed))
    .not.toBe(0)
  await page.getByRole('button', { name: '展开右侧面板', exact: true }).click()
  await page.getByRole('button', { name: '展开底部面板', exact: true }).click()
  await expect(page.locator('.situation-bottom')).toHaveCSS('height', '300px')
  await page.screenshot({ path: '/tmp/s14-02-defense.png', fullPage: true })
  await page.goto(url('scene', 'empty', '14'))
  await expect(page.getByText('暂无拓扑数据', { exact: true })).toBeVisible()
  await page.goto('/#/missing-page')
  await expect(canvas).toHaveCount(0)
  expect(reads).toEqual([
    '/api/front/topo/topo-a/draw/',
    '/api/front/scene/empty/draw/',
  ])
  expect(errors).toEqual([])
})

test('切场景取消旧读取，失败只提示一次且不新增日志或轮询', async ({ page }) => {
  await page.clock.install()
  const reads: string[] = []
  let finish: (() => void) | undefined
  await page.route(/\/api\/front\//, async (route) => {
    const path = new URL(route.request().url()).pathname
    reads.push(path)
    if (path.includes('slow'))
      await new Promise<void>((resolve) => {
        finish = resolve
      })
    if (path.includes('fail'))
      return route.fulfill({ status: 500, json: { error: '场景读取失败' } })
    try {
      await route.fulfill({ json: { cells } })
    } catch {
      /* 切页取消的读取不再消费。 */
    }
  })
  await page.goto(url('scene', 'slow'))
  await expect(page.getByText('正在读取态势…', { exact: true })).toBeVisible()
  await page.goto(url('scene', 'fail'))
  finish?.()
  await expect(page.getByText('场景读取失败', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('alert')).toHaveText('态势读取失败')
  await expect(
    page.getByRole('img', { name: '防御3D拓扑', exact: true }),
  ).toHaveCount(0)
  await page.clock.fastForward(120000)
  expect(reads).toEqual([
    '/api/front/scene/slow/draw/',
    '/api/front/scene/fail/draw/',
  ])
})
