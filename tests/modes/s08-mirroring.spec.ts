import { expect, test } from '@playwright/test'
import { mount } from './s07-fixture'

test('镜像页签按原接口查询、搜索分页，保留场景拓扑草稿', async ({ page }) => {
  const state = await mount(page)
  const queries: string[] = []
  await page.route('**/api/front/topo/topo-one/flow_miror/?*', (route) => {
    const url = new URL(route.request().url())
    queries.push(url.search)
    return route.fulfill({
      json: {
        count: 11,
        results: [
          {
            id: 71,
            src_node_name: '源节点',
            src_tap: 'tap-a',
            dst_node_name: '目标节点',
            dst_tap: 'tap-b',
            status: 1,
          },
        ],
      },
    })
  })
  const node = page.locator('.react-flow__node[data-id="a"]')
  await expect(node).toBeVisible()
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 35)
  await page.mouse.down()
  await page.mouse.move(box.x + 70, box.y + 65, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  const position = await node.evaluate(
    (element) => getComputedStyle(element).transform,
  )
  await page.getByRole('tab', { name: '流量镜像', exact: true }).click()
  await expect(
    page.getByRole('tab', { name: '流量模拟', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('table', { name: '流量镜像规则' })).toContainText(
    '源节点',
  )
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect.poll(() => queries.at(-1)).toBe('?page=2&size=10')
  await page.getByRole('textbox', { name: '镜像规则搜索' }).fill('源')
  await expect
    .poll(() => queries.at(-1))
    .toBe('?page=1&size=10&search=%E6%BA%90')
  await page.getByRole('tab', { name: '场景拓扑', exact: true }).click()
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  await expect(node).toHaveCSS('transform', position)
  await page.getByRole('tab', { name: '流量镜像', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '镜像规则搜索' })).toHaveValue(
    '',
  )
  await expect.poll(() => queries.at(-1)).toBe('?page=1&size=10')
  expect(state.errors).toEqual([])
})

test('镜像规则四项校验、TAP互斥和节点重选，创建启动关闭确认删除完整闭环', async ({
  page,
}, testInfo) => {
  const state = await mount(page)
  const writes: Array<{ path: string; method: string; body: unknown }> = []
  let rows: Array<{
    id: number
    src_node_name: string
    src_tap: string
    dst_node_name: string
    dst_tap: string
    status: number
  }> = []
  await page.route('**/api/front/topo/topo-one/node_list/?nopage=1', (route) =>
    route.fulfill({
      json: [
        { id: 91, name: '设备a', node_tap_list: ['tap-a', 'tap-b'] },
        { id: 92, name: '设备b', node_tap_list: ['tap-c', 'tap-d'] },
      ],
    }),
  )
  await page.route('**/api/front/topo/topo-one/flow_miror/**', (route) => {
    const request = route.request()
    if (request.method() === 'GET')
      return route.fulfill({ json: { count: rows.length, results: rows } })
    writes.push({
      path: new URL(request.url()).pathname,
      method: request.method(),
      body: request.postDataJSON(),
    })
    rows = [
      {
        id: 71,
        src_node_name: '设备a',
        src_tap: 'tap-a',
        dst_node_name: '设备a',
        dst_tap: 'tap-b',
        status: 1,
      },
    ]
    return route.fulfill({ json: rows[0] })
  })
  await page.route('**/api/front/topo/topo-one/mirror_*/*/', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    writes.push({ path, method: request.method(), body: request.postData() })
    if (path.includes('mirror_del')) rows = []
    else rows[0]!.status = path.includes('mirror_start') ? 2 : 1
    return route.fulfill({ json: { status: 1 } })
  })
  await page.getByRole('tab', { name: '流量镜像', exact: true }).click()
  await expect(
    page.getByText('暂无流量镜像规则', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '添加规则', exact: true }).click()
  const form = page.getByRole('dialog', { name: '流量镜像规则', exact: true })
  await expect(form.getByText('请选择源节点', { exact: true })).toHaveCount(0)
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(form.getByText('请选择源节点', { exact: true })).toBeVisible()
  await expect(
    form.getByRole('alert').filter({ hasText: '请选择目标节点TAP网卡' }),
  ).toBeVisible()
  await form
    .getByRole('combobox', { name: '源节点', exact: true })
    .fill('设备a')
  await page.getByRole('option', { name: '设备a', exact: true }).click()
  await form.getByLabel('源节点TAP网卡', { exact: true }).selectOption('tap-a')
  await form
    .getByRole('combobox', { name: '目标节点', exact: true })
    .fill('设备a')
  await page.getByRole('option', { name: '设备a', exact: true }).click()
  await expect(
    form
      .getByLabel('目标节点TAP网卡', { exact: true })
      .locator('option[value="tap-a"]'),
  ).toBeDisabled()
  await form
    .getByLabel('目标节点TAP网卡', { exact: true })
    .selectOption('tap-b')
  await form
    .getByRole('combobox', { name: '源节点', exact: true })
    .fill('设备b')
  await page.getByRole('option', { name: '设备b', exact: true }).click()
  await expect(form.getByLabel('源节点TAP网卡', { exact: true })).toHaveValue(
    '',
  )
  await form
    .getByRole('combobox', { name: '源节点', exact: true })
    .fill('设备a')
  await page.getByRole('option', { name: '设备a', exact: true }).click()
  await form.getByLabel('源节点TAP网卡', { exact: true }).selectOption('tap-a')
  await form.screenshot({ path: testInfo.outputPath('mirror-form.png') })
  await form.getByRole('button', { name: '保存', exact: true }).click()
  await expect(form).toHaveCount(0)
  const table = page.getByRole('table', { name: '流量镜像规则', exact: true })
  await expect(table).toContainText('未启动')
  await table.getByRole('button', { name: '启动', exact: true }).click()
  await expect(table).toContainText('启动成功')
  await page.screenshot({ path: testInfo.outputPath('mirroring.png') })
  await table.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(table).toContainText('未启动')
  await table.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '取消', exact: true })
    .click()
  expect(writes).toHaveLength(3)
  await table.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认', exact: true })
    .click()
  await expect(
    page.getByText('暂无流量镜像规则', { exact: true }),
  ).toBeVisible()
  expect(writes).toEqual([
    {
      path: '/api/front/topo/topo-one/flow_miror/',
      method: 'POST',
      body: { src_node: 91, src_tap: 'tap-a', dst_node: 91, dst_tap: 'tap-b' },
    },
    {
      path: '/api/front/topo/topo-one/mirror_start/71/',
      method: 'POST',
      body: null,
    },
    {
      path: '/api/front/topo/topo-one/mirror_stop/71/',
      method: 'POST',
      body: null,
    },
    {
      path: '/api/front/topo/topo-one/mirror_del/71/',
      method: 'DELETE',
      body: null,
    },
  ])
  expect(state.errors).toEqual([])
})

test('镜像失败沿原刷新和提示处理，删除末项回前页，切实验取消旧请求', async ({
  page,
}) => {
  const state = await mount(page)
  let failRead = true,
    failAction = true,
    count = 11,
    listReads = 0
  await page.route('**/api/front/topo/topo-one/flow_miror/?*', (route) => {
    listReads++
    if (failRead) {
      failRead = false
      return route.fulfill({ status: 500, json: { error: '镜像读取失败' } })
    }
    const query = new URL(route.request().url()).searchParams
    return route.fulfill({
      json: {
        count,
        results: [
          {
            id: query.get('page') === '2' ? 81 : 71,
            src_node_name: '设备a',
            src_tap: 'tap-a',
            dst_node_name: '设备b',
            dst_tap: 'tap-b',
            status: 3,
          },
        ],
      },
    })
  })
  await page.route('**/api/front/topo/topo-one/mirror_*/*/', (route) => {
    if (failAction) {
      failAction = false
      return route.fulfill({ json: { status: 2, message: '镜像操作失败' } })
    }
    count = 10
    return route.fulfill({ json: { status: 1 } })
  })
  await page.getByRole('tab', { name: '流量镜像', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('镜像读取失败')
  await page.getByRole('tab', { name: '场景拓扑', exact: true }).click()
  await page.getByRole('tab', { name: '流量镜像', exact: true }).click()
  const table = page.getByRole('table', { name: '流量镜像规则', exact: true })
  await expect(table).toContainText('启动失败')
  const readsBefore = listReads
  await table.getByRole('button', { name: '启动', exact: true }).click()
  await expect(page.getByText('镜像操作失败', { exact: true })).toBeVisible()
  await expect.poll(() => listReads).toBeGreaterThan(readsBefore)
  await expect(table).toContainText('启动失败')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('第 2 / 2 页，共 11 项')).toBeVisible()
  await table.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认', exact: true })
    .click()
  await expect(page.getByText('第 1 / 1 页，共 10 项')).toBeVisible()
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const failedRequests: string[] = []
  page.on('requestfailed', (request) =>
    failedRequests.push(new URL(request.url()).pathname),
  )
  await page.route(
    '**/api/front/topo/topo-one/flow_miror/?*',
    async (route) => {
      await held
      await route.fulfill({ json: { count: 0, results: [] } }).catch(() => {})
    },
  )
  const request = page.waitForRequest(
    '**/api/front/topo/topo-one/flow_miror/?*',
  )
  await page.getByRole('textbox', { name: '镜像规则搜索' }).fill('等待')
  await request
  await page.route('**/api/front/topo/topo-two/draw/?task_type=6', (route) =>
    route.fulfill({ json: state.stored }),
  )
  await page.route('**/api/front/topo/topo-two/status/?task_type=6', (route) =>
    route.fulfill({ json: { nodes: {}, edges: {} } }),
  )
  await page.route('**/api/front/topo/topo-two/flow_miror/?*', (route) =>
    route.fulfill({ json: { count: 0, results: [] } }),
  )
  await page.evaluate(() => {
    window.location.hash = '#/basic/user/bench/experiment/two/scene'
  })
  await expect(
    page.getByRole('tab', { name: '场景拓扑', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect
    .poll(() => failedRequests)
    .toContain('/api/front/topo/topo-one/flow_miror/')
  release()
  await page.getByRole('tab', { name: '流量镜像', exact: true }).click()
  await expect(
    page.getByText('暂无流量镜像规则', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('textbox', { name: '镜像规则搜索' })).toHaveValue(
    '',
  )
  expect(state.errors).toEqual([])
})
