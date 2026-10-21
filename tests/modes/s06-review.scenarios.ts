import { expect, test, type Page } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
import type { X6Graph } from '../../apps/web/src/topology/x6-adapter'

const definition = {
  properties: {
    base_info: {
      type: 'object',
      description: '基础配置',
      properties: { name: { type: 'string', description: '设备名称' } },
    },
    ports: {
      type: 'array',
      description: '网卡',
      items: {
        type: 'object',
        properties: { name: { type: 'string', description: '网卡名称' } },
      },
    },
    disks: {
      type: 'array',
      description: '磁盘',
      items: {
        type: 'object',
        properties: { name: { type: 'string', description: '磁盘名称' } },
      },
    },
    _config: { port_numbers: { default: 1, minLength: 0, maxLength: 8 } },
  },
}
function graph(config: unknown): X6Graph {
  return {
    cells: [
      {
        id: 'one',
        shape: 'custom-react-node',
        position: { x: 0, y: 0 },
        data: {
          name: '设备',
          data_id: 91,
          is_blue: true,
          nodeInfo: {
            id: 91,
            name: '设备',
            engin: 1,
            is_blue: false,
            config_info: config,
          },
        },
      },
    ],
  }
}
async function mount(page: Page, initial: X6Graph, { failPatch = false } = {}) {
  let stored = structuredClone(initial)
  const patches: Array<Record<string, unknown>> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 'review',
        username: '隔离学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.route('**/api/front/simulation/experiment/one/?more=1', (route) =>
    route.fulfill({
      json: {
        id: 'one',
        name: '审查实验',
        desc: '',
        node_count: 1,
        user_name: '隔离学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: null,
        topo_id: 'review',
      },
    }),
  )
  await page.route('**/api/front/node/last_operat/**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/template/?*', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/template/define/', (route) =>
    route.fulfill({ json: { '1': definition } }),
  )
  await page.route('**/api/front/topo/review/draw/?task_type=6', (route) => {
    if (route.request().method() === 'POST') {
      stored = route.request().postDataJSON().topo
      return route.fulfill({ json: true })
    }
    return route.fulfill({ json: stored })
  })
  await page.route('**/api/front/topo/review/node/one/', (route) => {
    const patch = route.request().postDataJSON()
    patches.push(patch)
    if (failPatch) {
      failPatch = false
      return route.fulfill({ status: 500, json: { error: '节点保存失败' } })
    }
    return route.fulfill({ json: { ...patch, id: 91 } })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await page.locator('.react-flow__node[data-id="one"]').dblclick()
  return { patches, stored: () => stored, errors }
}

test('蓝军设置独立来自图元，失败保留并在draw保存重开恢复', async ({ page }) => {
  const state = await mount(
    page,
    graph({ base_info: { name: '设备' }, ports: [] }),
    { failPatch: true },
  )
  const blue = page.getByRole('switch', { name: '蓝军设置', exact: true })
  await expect(blue).toBeChecked()
  await blue.uncheck()
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(blue).not.toBeChecked()
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.patches.at(-1)?.is_blue).toBe(false)
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(state.stored().cells[0]?.data?.is_blue).toBeNull()
  expect(
    (state.stored().cells[0]?.data?.nodeInfo as Record<string, unknown>)
      .is_blue,
  ).toBe(false)
  await page.reload()
  await page.locator('.react-flow__node[data-id="one"]').dblclick()
  await expect(blue).not.toBeChecked()
  await blue.check()
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await page.reload()
  await page.locator('.react-flow__node[data-id="one"]').dblclick()
  await expect(blue).toBeChecked()
  expect(state.patches.at(-1)?.is_blue).toBe(false)
  expect(state.errors).toEqual([])
})

test('数组逐行删除保留中间剩余项的未知字段，未连中间NIC可删但已连索引受保护', async ({
  page,
}) => {
  const initial = graph({
    base_info: { name: '设备' },
    ports: [
      { name: 'eth0', extension: 'port-a' },
      { name: 'eth1', extension: 'port-b' },
      { name: 'eth2', extension: 'port-c' },
    ],
    disks: [
      { name: '磁盘A', extension: { id: 'a' } },
      { name: '磁盘B', extension: { id: 'b' } },
      { name: '磁盘C', extension: { id: 'c' } },
    ],
  })
  initial.cells.push(
    {
      id: 'two',
      shape: 'custom-react-node',
      position: { x: 300, y: 0 },
      data: {
        name: '对端',
        data_id: 92,
        nodeInfo: { config_info: { ports: [{}] } },
      },
    },
    {
      id: 'edge',
      shape: 'edge',
      source: { cell: 'one' },
      target: { cell: 'two' },
      data: { source: 0, target: 0, data_id: 201 },
    },
  )
  const state = await mount(page, initial)
  await page.getByRole('tab', { name: '磁盘', exact: true }).click()
  await page.getByRole('button', { name: '删除磁盘 2', exact: true }).click()
  await page.getByRole('tab', { name: '网卡', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '删除网卡 1', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '删除网卡 2', exact: true }).click()
  await expect(page.getByLabel('网卡名称', { exact: true })).toHaveCount(2)
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.patches.at(-1)?.config_info).toMatchObject({
    ports: [
      { name: 'eth0', extension: 'port-a' },
      { name: 'eth2', extension: 'port-c' },
    ],
    disks: [
      { name: '磁盘A', extension: { id: 'a' } },
      { name: '磁盘C', extension: { id: 'c' } },
    ],
  })
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(
    state.stored().cells.find((cell) => cell.id === 'edge')?.data?.source,
  ).toBe(0)
  await page.reload()
  await page.locator('.react-flow__node[data-id="one"]').dblclick()
  await page.getByRole('tab', { name: '网卡', exact: true }).click()
  await expect(page.getByLabel('网卡名称', { exact: true }).nth(1)).toHaveValue(
    'eth2',
  )
  expect(state.errors).toEqual([])
})

test('删除会移动已连NIC索引的任一网卡行都受保护', async ({ page }) => {
  const initial = graph({
    ports: [{ name: 'eth0' }, { name: 'eth1' }, { name: 'eth2' }],
  })
  initial.cells.push(
    {
      id: 'two',
      shape: 'custom-react-node',
      position: { x: 300, y: 0 },
      data: { name: '对端', nodeInfo: { config_info: { ports: [{}] } } },
    },
    {
      id: 'edge',
      shape: 'edge',
      source: { cell: 'one' },
      target: { cell: 'two' },
      data: { source: 2, target: 0 },
    },
  )
  const state = await mount(page, initial)
  await page.getByRole('tab', { name: '网卡', exact: true }).click()
  for (const i of [1, 2, 3])
    await expect(
      page.getByRole('button', { name: `删除网卡 ${i}`, exact: true }),
    ).toBeDisabled()
  await expect(
    page.getByText('删除此行会改变已连接网卡的索引，请先删除关联链路。', {
      exact: true,
    }),
  ).toHaveCount(3)
  expect(state.patches).toHaveLength(0)
  expect(state.errors).toEqual([])
})

test('损坏配置明确拒绝编辑提交并保留原图', async ({ page }) => {
  const initial = graph({
    base_info: { name: '设备' },
    ports: 'bad',
    extension: { preserve: 1 },
  })
  const state = await mount(page, initial)
  await expect(page.getByRole('alert')).toContainText('ports')
  await expect(
    page.getByRole('button', { name: '保存节点', exact: true }),
  ).toHaveCount(0)
  expect(state.patches).toHaveLength(0)
  expect(state.stored()).toEqual(initial)
  expect(state.errors).toEqual([])
})

test('合法缺失配置使用schema端口默认且保留未知字段', async ({ page }) => {
  const state = await mount(page, graph({ extension: { preserve: 1 } }))
  await page.getByRole('tab', { name: '网卡', exact: true }).click()
  await expect(page.getByLabel('网卡名称', { exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.patches.at(-1)?.config_info).toMatchObject({
    ports: [{}],
    extension: { preserve: 1 },
  })
  expect(state.errors).toEqual([])
})
