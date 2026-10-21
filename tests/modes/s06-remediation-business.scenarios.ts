import { expect, test, type Page } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
import type { X6Graph } from '../../apps/web/src/topology/x6-adapter'

const resource = {
  id: 7,
  name: '业务设备',
  engin: 1,
  config_info: {
    base_info: { name: '业务设备' },
    ports: [{ mac: '00:00:00:00:00:01', extension: '保留' }],
  },
}
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
      port_type: 'port',
      items: { properties: { mac: { type: 'string', description: 'MAC' } } },
    },
    disks: {
      type: 'array',
      description: '磁盘',
      items: {
        properties: {
          name: {
            type: 'string',
            description: '磁盘名称',
            default: '默认磁盘',
          },
        },
      },
    },
  },
}
async function mount(page: Page, initial: X6Graph = { cells: [] }) {
  let stored = structuredClone(initial)
  const writes: Array<{ path: string; body: Record<string, unknown> }> = []
  let failDraw = false,
    failBusiness = false
  let holdDraw: (() => Promise<void>) | undefined
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
        id: 'business',
        username: '隔离学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.route('**/api/front/simulation/experiment/one/?more=1', (route) =>
    route.fulfill({
      json: {
        id: 'one',
        name: '实验',
        desc: '',
        node_count: 0,
        user_name: '隔离学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: null,
        topo_id: 'business',
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
    route.fulfill({ json: [resource] }),
  )
  await page.route('**/api/front/node/template/define/', (route) =>
    route.fulfill({ json: { '1': definition, '10': definition } }),
  )
  await page.route('**/api/front/topo/business/**', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: stored })
    const path = new URL(route.request().url()).pathname,
      body = route.request().postDataJSON()
    writes.push({ path, body })
    if (path.includes('/draw/')) {
      if (holdDraw) await holdDraw()
      if (failDraw)
        return route.fulfill({ status: 500, json: { error: '画布失败' } })
      stored = body.topo
      return route.fulfill({ json: true })
    }
    if (failBusiness)
      return route.fulfill({ status: 500, json: { error: '业务失败' } })
    return route.fulfill({
      json: path.includes('/edge_node/')
        ? { status: 1 }
        : { ...body, id: 100 + writes.length },
    })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(
    page.getByRole('button', { name: '业务设备', exact: true }),
  ).toBeVisible()
  return {
    writes,
    errors,
    get stored() {
      return stored
    },
    set failDraw(value: boolean) {
      failDraw = value
    },
    set failBusiness(value: boolean) {
      failBusiness = value
    },
    set holdDraw(value: (() => Promise<void>) | undefined) {
      holdDraw = value
    },
  }
}
async function place(page: Page, x: number) {
  await page.getByRole('button', { name: '业务设备', exact: true }).click()
  await page.locator('.react-flow__pane').click({ position: { x, y: 220 } })
}
function linkedDevices(): X6Graph {
  return {
    cells: ['a', 'b'].map((id, i) => ({
      id,
      shape: 'custom-react-node',
      position: { x: 100 + i * 320, y: 120 },
      size: { width: 80, height: 80 },
      ports: {
        items: [
          { id: `${id}-right`, group: 'right' },
          { id: `${id}-left`, group: 'left' },
        ],
      },
      data: {
        name: id,
        data_id: 91 + i,
        nodeInfo: {
          ...resource,
          id: 91 + i,
          config_info: {
            base_info: { name: id },
            ports: [{ mac: '00:00:00:00:00:01' }, { mac: '00:00:00:00:00:02' }],
          },
        },
      },
    })),
  }
}

test('专项业务：新增设备自动提交画布，配置默认行与MAC补零随配置保存重开', async ({
  page,
}) => {
  const state = await mount(page)
  await place(page, 240)
  await expect.poll(() => state.stored.cells.length).toBe(1)
  expect(state.writes.map((w) => w.path.split('/').at(-2))).toEqual([
    'node',
    'draw',
  ])
  await page.locator('.react-flow__node').dblclick()
  await page.getByLabel('设备名称', { exact: true }).fill('持久化配置')
  await page.getByRole('tab', { name: '网卡' }).click()
  await page.getByRole('button', { name: '添加网卡' }).click()
  await expect(page.getByLabel('MAC', { exact: true }).nth(1)).toHaveValue(
    '00:00:00:00:00:02',
  )
  await page.getByRole('tab', { name: '磁盘' }).click()
  await expect(page.getByLabel('磁盘名称', { exact: true })).toHaveValue(
    '默认磁盘',
  )
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect.poll(() => state.stored.cells[0]?.data?.name).toBe('持久化配置')
  const info = state.stored.cells[0]!.data!.nodeInfo as typeof resource
  expect(info.config_info.ports).toEqual([
    { mac: '00:00:00:00:00:01', extension: '保留' },
    { mac: '00:00:00:00:00:02' },
  ])
  await page.reload()
  await expect(page.locator('.react-flow__node')).toContainText('持久化配置')
  expect(state.errors).toEqual([])
})

test('专项业务：业务失败不提交画布，业务成功画布失败只重试画布并保留离页保护', async ({
  page,
}) => {
  const state = await mount(page)
  state.failBusiness = true
  await place(page, 240)
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0]!.path).toMatch(/\/node\/$/)
  state.failBusiness = false
  state.failDraw = true
  await place(page, 240)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await expect(page.getByText(/业务操作已成功，画布保存失败/)).toBeVisible()
  expect(state.stored.cells).toEqual([])
  await page.getByRole('link', { name: '场景说明' }).click()
  await expect(page.getByText(/已经成功的远端业务操作不会撤销/)).toBeVisible()
  await page.getByRole('button', { name: '继续编辑' }).click()
  state.failDraw = false
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect.poll(() => state.stored.cells.length).toBe(1)
  expect(state.writes.filter((w) => w.path.endsWith('/node/'))).toHaveLength(2)
  expect(state.writes.filter((w) => w.path.includes('/draw/'))).toHaveLength(2)
  await page.reload()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  expect(state.errors).toEqual([])
})

test('专项业务：自动保存期间的新拖动保持未保存，显式保存再重开保留新位置', async ({
  page,
}) => {
  const state = await mount(page)
  let release!: () => void
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  state.holdDraw = () => wait
  await place(page, 240)
  await expect.poll(() => state.writes.length).toBe(2)
  const node = page.locator('.react-flow__node').first()
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + 35, box.y + 35)
  await page.mouse.down()
  await page.mouse.move(box.x + 155, box.y + 85, { steps: 8 })
  await page.mouse.up()
  release()
  await expect(page.getByText('有未保存的修改', { exact: true })).toBeVisible()
  const first = state.writes[1]!.body.topo as X6Graph
  state.holdDraw = undefined
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存', { exact: true })).toBeVisible()
  expect(state.stored.cells[0]!.position).not.toEqual(first.cells[0]!.position)
  const position = state.stored.cells[0]!.position
  await page.reload()
  expect(state.stored.cells[0]!.position).toEqual(position)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  expect(state.errors).toEqual([])
})

test('专项业务：失效旧边占用两端NIC零，空闲NIC可连，链路画布失败不重复创建', async ({
  page,
}) => {
  const initial = linkedDevices()
  initial.cells.push({
    id: 'legacy',
    shape: 'edge',
    source: { cell: 'a', port: 'missing' },
    target: { cell: 'b', port: 'missing' },
    data: { source: 0, target: 0, data_id: 77 },
    unknown: '保留旧边',
  })
  const state = await mount(page, initial)
  await page.locator('.react-flow__node[data-id="a"]').click()
  await page.getByRole('button', { name: '连接设备', exact: true }).click()
  await page.getByLabel('目标设备', { exact: true }).selectOption('b')
  await expect(
    page.getByLabel('源网卡', { exact: true }).locator('option[value="0"]'),
  ).toBeDisabled()
  await expect(
    page.getByLabel('目标网卡', { exact: true }).locator('option[value="0"]'),
  ).toBeDisabled()
  await page.getByLabel('源网卡', { exact: true }).selectOption('1')
  await page.getByLabel('目标网卡', { exact: true }).selectOption('1')
  state.failDraw = true
  await page.getByRole('button', { name: '创建链路', exact: true }).click()
  await expect(page.getByText(/业务操作已成功，画布保存失败/)).toBeVisible()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  state.failDraw = false
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect.poll(() => state.stored.cells.length).toBe(4)
  expect(state.stored.cells.find((cell) => cell.id === 'legacy')).toEqual(
    initial.cells[2],
  )
  expect(state.writes.filter((w) => w.path.endsWith('/edge/'))).toHaveLength(1)
  await page.reload()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  expect(state.errors).toEqual([])
})

test('专项业务：配置业务成功画布失败后仅重试画布，链路编辑与删除继续自动提交', async ({
  page,
}) => {
  const state = await mount(page, linkedDevices())
  await page.locator('.react-flow__node[data-id="a"]').dblclick()
  await page.getByLabel('设备名称', { exact: true }).fill('保存后的设备')
  state.failDraw = true
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(page.getByText(/业务操作已成功，画布保存失败/)).toBeVisible()
  state.failDraw = false
  await page.locator('.react-flow__node[data-id="a"]').dblclick()
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect
    .poll(() => state.stored.cells[0]?.data?.name)
    .toBe('保存后的设备')
  expect(state.writes.filter((w) => w.path.includes('/node/a/'))).toHaveLength(
    1,
  )
  await page.locator('.react-flow__node[data-id="a"]').click()
  await page.getByRole('button', { name: '连接设备', exact: true }).click()
  await page.getByLabel('目标设备', { exact: true }).selectOption('b')
  await page.getByLabel('源网卡', { exact: true }).selectOption('0')
  await page.getByLabel('目标网卡', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: '创建链路', exact: true }).click()
  await expect.poll(() => state.stored.cells.length).toBe(3)
  expect(state.writes.slice(-2).map((w) => w.path.split('/').at(-2))).toEqual([
    'edge',
    'draw',
  ])
  await page.locator('.react-flow__edge').click()
  await page.getByRole('button', { name: '编辑选中对象', exact: true }).click()
  await page.getByLabel('线路类型', { exact: true }).selectOption('orth')
  await page.getByRole('button', { name: '保存链路', exact: true }).click()
  await expect
    .poll(
      () =>
        state.stored.cells.find((cell) => cell.shape === 'edge')?.data
          ?.lineType,
    )
    .toBe('orth')
  await page.locator('.react-flow__edge').click()
  await page.getByRole('button', { name: '删除选中对象', exact: true }).click()
  await expect.poll(() => state.stored.cells.length).toBe(2)
  expect(state.errors).toEqual([])
})
