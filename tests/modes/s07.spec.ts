import { expect, test } from '@playwright/test'
import { graph, mount } from './s07-fixture'

test('节点状态、错误与单节点启动释放使用原接口且不污染设计草稿', async ({
  page,
}, testInfo) => {
  const state = await mount(page)
  const device = page.locator('.react-flow__node[data-id="a"]')
  await expect(device.getByText('未启动', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '开启错误信息' }).click()
  await expect(page.getByText('设备启动失败', { exact: true })).toBeVisible()
  await expect(page.getByText('链路异常', { exact: true })).toBeVisible()
  await device.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '启动', exact: true }).click()
  await expect(device.getByText('启动成功', { exact: true })).toBeVisible()
  expect(state.writes).toEqual([
    {
      path: '/api/front/topo/topo-one/node/a/start/?task_type=6',
      method: 'POST',
      body: {},
    },
  ])
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await expect(
    page.locator('.react-flow__edge path.react-flow__edge-path'),
  ).toHaveCSS('stroke', 'rgb(135, 208, 104)')
  await page.reload()
  await expect(device.getByText('启动成功', { exact: true })).toBeVisible()
  await device.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '释放', exact: true }).click()
  await expect(device.getByText('未启动', { exact: true })).toBeVisible()
  await expect(
    page.getByText('节点释放后会删除相关数据，请谨慎操作'),
  ).toBeVisible()
  expect(state.writes.at(-1)).toEqual({
    path: '/api/front/topo/topo-one/node/a/stop/?task_type=6',
    method: 'POST',
    body: {},
  })
  await page.screenshot({ path: testInfo.outputPath('runtime.png') })
  expect(state.errors).toEqual([])
})

test('失败不改运行状态；批量/整图按原方法执行并保留移动草稿', async ({
  page,
}) => {
  const state = await mount(page)
  const a = page.locator('.react-flow__node[data-id="a"]')
  const b = page.locator('.react-flow__node[data-id="b"]')
  await expect(a.getByText('未启动', { exact: true })).toBeVisible()
  await a.click({ button: 'right' })
  state.failNext()
  await page.getByRole('menuitem', { name: '启动', exact: true }).click()
  await expect(page.getByText('资源不足', { exact: true })).toBeVisible()
  await expect(a.getByText('未启动', { exact: true })).toBeVisible()
  await a.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '启动', exact: true }).click()
  await expect(a.getByText('启动成功', { exact: true })).toBeVisible()
  await a.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '关机', exact: true }).click()
  await expect(a.getByText('关机', { exact: true })).toBeVisible()
  await a.click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: '重启', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('menuitem', { name: '启动', exact: true }).click()
  await expect(a.getByText('启动成功', { exact: true })).toBeVisible()
  await a.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '重启', exact: true }).click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  const box = (await a.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 35)
  await page.mouse.down()
  await page.mouse.move(box.x + 70, box.y + 65, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  const position = await a.evaluate(
    (element) => getComputedStyle(element).transform,
  )
  await a.click()
  await b.click({ modifiers: ['Meta'] })
  await page.getByRole('button', { name: '批量启动', exact: true }).click()
  await expect
    .poll(() => state.writes.at(-1)?.body)
    .toEqual({ node_list: ['a', 'b'] })
  expect(state.writes.at(-1)).toEqual({
    path: '/api/front/topo/topo-one/node/start/?task_type=6',
    method: 'POST',
    body: { node_list: ['a', 'b'] },
  })
  await page.getByRole('button', { name: '批量释放', exact: true }).click()
  await expect.poll(() => state.writes.at(-1)?.method).toBe('DELETE')
  await page.getByRole('button', { name: '启动场景', exact: true }).click()
  await expect
    .poll(() => state.writes.at(-1)?.path)
    .toBe('/api/front/topo/topo-one/start/?task_type=6')
  await page.getByRole('button', { name: '释放场景', exact: true }).click()
  await expect
    .poll(() => state.writes.at(-1)?.path)
    .toBe('/api/front/topo/topo-one/stop/?task_type=6')
  await expect(a).toHaveCSS('transform', position)
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  expect(state.writes.some((write) => write.path.includes('/draw/'))).toBe(
    false,
  )
  expect(state.errors).toEqual([])
})

test('锁图可运行而不可编辑；状态读取失败可按原刷新入口重试', async ({
  page,
}) => {
  const state = await mount(page, true)
  let first = true
  await page.route(
    '**/api/front/topo/topo-one/status/?task_type=6',
    async (route) => {
      if (first) {
        first = false
        return route.fulfill({ status: 500, json: { error: '状态服务异常' } })
      }
      return route.fallback()
    },
  )
  await page.reload()
  await expect(page.getByText('拓扑已锁定，仅可查看')).toBeVisible()
  await expect(page.getByText('运行状态读取失败：状态服务异常')).toBeVisible()
  await page.getByRole('button', { name: '刷新运行状态' }).click()
  const a = page.locator('.react-flow__node[data-id="a"]')
  await expect(a.getByText('未启动', { exact: true })).toBeVisible()
  await a.click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: '编辑', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('menuitem', { name: '删除', exact: true }),
  ).toHaveCount(0)
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/api/front/topo/topo-one/node/a/start/?task_type=6',
    async (route) => {
      await held
      return route.fallback()
    },
  )
  await page.getByRole('menuitem', { name: '启动', exact: true }).click()
  await expect(
    page.getByRole('status').filter({ hasText: '正在启动，请稍候…' }),
  ).toBeVisible()
  release()
  await expect(a.getByText('启动成功', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '保存拓扑', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '延时', exact: true }),
  ).toHaveCount(0)
  expect(state.writes).toHaveLength(1)
  expect(state.errors).toEqual([])
})

test('批量过滤分组和标注，运行期间拦截重复提交，离页取消旧操作', async ({
  page,
}) => {
  const state = await mount(page)
  state.stored.cells.push(
    {
      id: 'group',
      shape: 'custom-parent',
      position: { x: 10, y: 10 },
      data: { parent: true },
      children: [],
    },
    {
      id: 'person',
      shape: 'custom-react-node',
      position: { x: 600, y: 300 },
      data: { name: '人员', nodeType: 'base_element', nodeInfo: { type: 2 } },
    },
  )
  await page.reload()
  await expect(page.locator('.react-flow__node')).toHaveCount(4)
  await page.getByLabel('场景拓扑画布').focus()
  await page.keyboard.press('Meta+a')
  await page.getByRole('button', { name: '批量启动', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]?.body).toEqual({ node_list: ['a', 'b'] })
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let requests = 0
  const aborted: string[] = []
  page.on('requestfailed', (request) =>
    aborted.push(new URL(request.url()).pathname),
  )
  await page.route(
    '**/api/front/topo/topo-one/start/?task_type=6',
    async (route) => {
      requests++
      await held
      await route.fulfill({ json: { status: 1 } }).catch(() => {})
    },
  )
  await page.getByRole('button', { name: '启动场景', exact: true }).click()
  await expect.poll(() => requests).toBe(1)
  await expect(
    page.getByRole('button', { name: '释放场景', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '保存拓扑', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('link', { name: '返回实验列表', exact: true })
    .first()
    .click()
  await page.getByRole('button', { name: '放弃并离开', exact: true }).click()
  await expect(page).toHaveURL(/\/bench$/)
  await expect.poll(() => aborted).toContain('/api/front/topo/topo-one/start/')
  release()
  expect(requests).toBe(1)
  expect(
    state.writes.filter((write) => write.path.includes('/stop/')),
  ).toHaveLength(0)
  expect(state.errors).toEqual([])
})

test('切换实验取消旧状态读取，迟到结果不覆盖新实验', async ({ page }) => {
  const state = await mount(page)
  await expect(
    page
      .locator('.react-flow__node[data-id="a"]')
      .getByText('未启动', { exact: true }),
  ).toBeVisible()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const aborted: string[] = []
  page.on('requestfailed', (request) =>
    aborted.push(new URL(request.url()).pathname),
  )
  await page.route(
    '**/api/front/topo/topo-one/status/?task_type=6',
    async (route) => {
      await held
      await route
        .fulfill({ json: { nodes: { a: { status: 2 } }, edges: {} } })
        .catch(() => {})
    },
  )
  await page.route('**/api/front/topo/topo-two/draw/?task_type=6', (route) =>
    route.fulfill({ json: graph() }),
  )
  await page.route('**/api/front/topo/topo-two/status/?task_type=6', (route) =>
    route.fulfill({ json: { nodes: { a: { status: 4 } }, edges: {} } }),
  )
  const requested = page.waitForRequest(
    '**/api/front/topo/topo-one/status/?task_type=6',
  )
  await page.getByRole('button', { name: '刷新运行状态', exact: true }).click()
  await requested
  await page.evaluate(() => {
    window.location.hash = '#/basic/user/bench/experiment/two/scene'
  })
  await expect(
    page
      .locator('.react-flow__node[data-id="a"]')
      .getByText('关机', { exact: true }),
  ).toBeVisible()
  await expect.poll(() => aborted).toContain('/api/front/topo/topo-one/status/')
  release()
  await expect(
    page
      .locator('.react-flow__node[data-id="a"]')
      .getByText('关机', { exact: true }),
  ).toBeVisible()
  expect(state.writes).toEqual([])
  expect(state.errors).toEqual([])
})
