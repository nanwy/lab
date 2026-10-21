import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
import './s06-review.scenarios'
import './s06-canvas.scenarios'
import './s06-templates.scenarios'
import './s06-remediation-business.scenarios'
import './s06-remediation-visual.scenarios'

const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 's06',
        username: '隔离学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.route('**/api/front/simulation/experiment/*/?more=1', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!
    return route.fulfill({
      json: {
        id,
        name: `实验${id}`,
        desc: '',
        node_count: 1,
        user_name: '隔离学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: null,
        topo_id: `topo-${id}`,
      },
    })
  })
})

const initialGraph = () => ({
  lock: false,
  cells: [
    {
      id: 'device-one',
      shape: 'custom-react-node',
      position: { x: 100, y: 100 },
      size: { width: 80, height: 80 },
      data: { name: '路由器', data_id: 91, nodeInfo: { id: 91 } },
      ports: { items: [{ id: 'right-port', group: 'right' }] },
    },
  ],
})

test('设备面板按原资源数组加载、失败重试和筛选', async ({ page }) => {
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({ json: { cells: [] } }),
  )
  await page.route('**/api/front/node/last_operat/**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: [] }),
  )
  let failed = true
  await page.route('**/api/front/node/template/?*', (route) => {
    if (failed) {
      failed = false
      return route.fulfill({ status: 500, json: { error: '资源暂不可用' } })
    }
    return route.fulfill({
      json: [
        {
          id: 7,
          name: '测试路由器',
          classify: 1,
          device_type: 'router',
          device_type_name: '路由器',
          config_info: { base_info: { name: '测试路由器' }, ports: [{}] },
          engin: 1,
        },
      ],
    })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(page.getByRole('button', { name: '重试设备资源' })).toBeVisible()
  await page.getByRole('button', { name: '重试设备资源' }).click()
  await expect(
    page.getByRole('button', { name: '测试路由器', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('searchbox', { name: '搜索设备' })).toBeVisible()
})

test('设备新增配置失败恢复、NIC零连线、线路编辑删除与保存重开', async ({
  page,
}) => {
  let stored: unknown = { lock: false, cells: [] }
  const writes: Array<{ path: string; body: Record<string, unknown> }> = []
  const resource = {
    id: 7,
    name: '测试路由器',
    engin: 1,
    classify: 1,
    device_type: 1,
    device_type_name: '路由器',
    device_id: 'old',
    custom: 'preserve',
    config_info: {
      node_id: 'old',
      base_info: { name: '测试路由器', gateway: null },
      ports: [
        { name: 'eth0', nic_type: 'eth' },
        { name: 'eth1', nic_type: 'eth' },
      ],
    },
  }
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
    route.fulfill({
      json: {
        '1': {
          properties: {
            base_info: {
              type: 'object',
              description: '基础配置',
              properties: {
                name: { type: 'string', description: '设备名称' },
                gateway: { type: 'string', description: '网关' },
              },
            },
            ports: {
              type: 'array',
              description: '网卡',
              items: {
                properties: {
                  name: { type: 'string', description: '网卡名称' },
                  nic_type: { type: 'string', enum: ['eth', 'virtio'] },
                },
              },
            },
            _config: {
              properties: {
                port_numbers: { default: 2, minLength: 1, maxLength: 3 },
              },
            },
          },
        },
      },
    }),
  )
  let patchFail = true
  await page.route('**/api/front/topo/topo-one/**', (route) => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    if (method === 'GET') return route.fulfill({ json: stored })
    const body = route.request().postDataJSON()
    writes.push({ path, body })
    if (path.includes('/draw/')) {
      stored = body.topo
      return route.fulfill({ json: true })
    }
    if (method === 'PATCH' && patchFail) {
      patchFail = false
      return route.fulfill({ status: 500, json: { error: '节点更新失败' } })
    }
    return route.fulfill({
      json: path.includes('/edge_node/')
        ? { status: 1 }
        : { ...body, id: writes.length + 100 },
    })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  async function place(x: number) {
    await page.getByRole('button', { name: '测试路由器', exact: true }).click()
    await page.locator('.react-flow__pane').click({ position: { x, y: 180 } })
  }
  await place(180)
  await place(440)
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  const uuids = await page
    .locator('.react-flow__node')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-id')!))
  const create = writes.find((write) => write.path.endsWith('/node/'))!.body
  expect(create.device_id).toBe(uuids[0])
  expect((create.config_info as { node_id: string }).node_id).toBe(uuids[0])
  expect(create.custom).toBe('preserve')
  await page.locator('.react-flow__node').first().dblclick()
  await page.getByLabel('设备名称', { exact: true }).fill('配置后的路由器')
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(page.getByLabel('设备名称', { exact: true })).toHaveValue(
    '配置后的路由器',
  )
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(
    writes.some((write) => write.path.endsWith(`/node/${uuids[0]}/`)),
  ).toBe(true)
  await page.locator('.react-flow__node').first().click()
  await page.getByRole('button', { name: '连接设备' }).click()
  await page.getByLabel('目标设备', { exact: true }).selectOption(uuids[1]!)
  await page.getByLabel('源网卡', { exact: true }).selectOption('0')
  await page.getByLabel('目标网卡', { exact: true }).selectOption('0')
  await page.getByRole('button', { name: '创建链路', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  const edge = writes.find((write) => write.path.endsWith('/edge/'))!.body
  expect(edge.config_info).toMatchObject({
    dst: { node_id: uuids[0], port: 0 },
    src: { node_id: uuids[1], port: 0 },
  })
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(
    writes
      .filter((write) => write.path.includes('/draw/'))
      .flatMap((write) => write.body.last_node ?? []),
  ).toEqual([7, 7])
  await page.reload()
  await expect(page.getByText('配置后的路由器', { exact: true })).toBeVisible()
  const edgePoint = await page
    .locator('.react-flow__edge-path')
    .evaluate((element) => {
      const path = element as SVGPathElement
      const p = path.getPointAtLength(path.getTotalLength() / 2)
      const screen = new DOMPoint(p.x, p.y).matrixTransform(
        path.getScreenCTM()!,
      )
      return { x: screen.x, y: screen.y }
    })
  await page.mouse.click(edgePoint.x, edgePoint.y)
  await page.getByRole('button', { name: '编辑选中对象' }).click()
  await page.getByLabel('线路类型', { exact: true }).selectOption('orth')
  await page.getByRole('button', { name: '保存链路', exact: true }).click()
  await page.getByRole('button', { name: '删除选中对象' }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  await page.locator('.react-flow__node').first().click()
  await page.keyboard.press('Delete')
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await page.reload()
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
})

test('配置按schema保留未知字段、默认值、数组数量与engin10限制', async ({
  page,
}, testInfo) => {
  let engin = 1
  let patch: Record<string, unknown> | undefined
  await page.route('**/api/front/topo/upload_file/', (route) => {
    expect(route.request().postData()).toContain('node_template')
    expect(route.request().postData()).toContain('name="file"')
    return route.fulfill({
      json: { status: 1, data: { url: '/s06-icon.svg' } },
    })
  })
  await page.route('**/s06-icon.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>',
    }),
  )
  const config = {
    node_id: 'device-one',
    base_info: {
      name: '原设备',
      images_id: 5,
      images: 'image-key',
      readonly: '保留',
      count: 2,
      enabled: false,
      mode: 'a',
      extension: { untouched: 1 },
    },
    ports: [{ nic_type: 'eth' }],
    security_groups: [{ id: 'keep' }],
  }
  await page.route('**/api/front/node/template/?*', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/last_operat/**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/image/list/5/', (route) =>
    route.fulfill({ json: { name: '镜像名称' } }),
  )
  const definition = {
    properties: {
      base_info: {
        type: 'object',
        description: '基础配置',
        required: ['name'],
        properties: {
          name: { type: 'string', description: '设备名称', maxLength: 12 },
          readonly: {
            type: 'string',
            description: '只读字段',
            read_only: true,
          },
          count: { type: 'integer', description: '数量' },
          enabled: { type: 'boolean', description: '启用' },
          mode: { type: 'string', description: '模式', enum: ['a', 'b'] },
          images: { type: 'string', description: '镜像' },
          memo: {
            type: 'string',
            description: '说明',
            big: true,
            default: '默认说明',
          },
        },
      },
      ports: {
        type: 'array',
        description: '网卡',
        items: {
          properties: {
            nic_type: {
              type: 'string',
              description: '网卡类型',
              default: 'eth',
            },
          },
        },
      },
      security_groups: {
        type: 'array',
        description: '安全组',
        items: {
          properties: { id: { type: 'string', description: '安全组ID' } },
        },
      },
      _config: { port_numbers: { default: 1, minLength: 1, maxLength: 2 } },
    },
  }
  await page.route('**/api/front/node/template/define/', (route) =>
    route.fulfill({ json: { '1': definition, '10': definition } }),
  )
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({
      json: {
        lock: false,
        cells: [
          {
            ...initialGraph().cells[0],
            data: {
              name: '原设备',
              data_id: 91,
              nodeInfo: {
                id: 91,
                name: '原设备',
                engin,
                device_id: 'device-one',
                config_info: config,
              },
            },
          },
        ],
      },
    }),
  )
  await page.route('**/api/front/topo/topo-one/node/device-one/', (route) => {
    patch = route.request().postDataJSON()
    return route.fulfill({ json: { ...patch, id: 91 } })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await page.locator('.react-flow__node').dblclick()
  await expect(page.getByLabel('只读字段', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('镜像', { exact: true })).toContainText(
    '镜像名称',
  )
  await page.getByLabel('数量', { exact: true }).fill('3')
  await page.getByLabel('启用', { exact: true }).check()
  await page.getByLabel('模式', { exact: true }).selectOption('b')
  await page.getByLabel('节点图标', { exact: true }).setInputFiles({
    name: 'icon.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  })
  await expect(
    page.getByRole('img', { name: '节点图标', exact: true }),
  ).toBeVisible()
  await page.getByRole('tab', { name: '网卡', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '删除网卡 1', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '添加网卡', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '添加网卡', exact: true }),
  ).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('node-config.png') })
  await page.getByRole('button', { name: '保存节点', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(patch?.config_info).toMatchObject({
    base_info: {
      count: 3,
      enabled: true,
      mode: 'b',
      memo: '默认说明',
      extension: { untouched: 1 },
    },
    ports: [{ nic_type: 'eth' }, { nic_type: 'eth' }],
    security_groups: [{ id: 'keep' }],
  })
  expect(patch?.logo).toBe('/s06-icon.svg')
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  engin = 10
  await page.reload()
  await page.locator('.react-flow__node').dblclick()
  await page.getByRole('tab', { name: '网卡', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '添加网卡', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^删除网卡 / })).toHaveCount(0)
})

test('端口可作为任一连线端点，既有边和分组可见', async ({ page }, testInfo) => {
  const graph = initialGraph()
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({
      json: {
        ...graph,
        cells: [
          {
            id: 'region',
            shape: 'custom-parent',
            position: { x: 40, y: 40 },
            size: { width: 500, height: 300 },
            data: { parent: true },
            attrs: { label: { text: '测试区域' } },
            children: ['device-one', 'device-two'],
          },
          { ...graph.cells[0], parent: 'region' },
          {
            ...graph.cells[0],
            id: 'device-two',
            position: { x: 300, y: 200 },
            parent: 'region',
            data: { name: '交换机', data_id: 92, nodeInfo: { id: 92 } },
          },
          {
            id: 'edge-one',
            shape: 'edge',
            source: { cell: 'device-one', port: 'right-port' },
            target: { cell: 'device-two', port: 'right-port' },
          },
        ],
      },
    }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(page.getByText('测试区域', { exact: true })).toBeVisible()
  await expect(page.getByText('交换机', { exact: true })).toBeVisible()
  await expect(
    page.locator(
      '.react-flow__edge[data-id="edge-one"] .react-flow__edge-path',
    ),
  ).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('topology.png') })
})

async function moveNode(page: import('@playwright/test').Page) {
  const node = page.locator('.react-flow__node[data-id="device-one"]')
  const box = await node.boundingBox()
  if (!box) throw new Error('图节点不可见')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    box.x + box.width / 2 + 70,
    box.y + box.height / 2 + 40,
    { steps: 8 },
  )
  await page.mouse.up()
}

test('实验拓扑移动、失败保留草稿、保存并重新读取，离页提示与锁定', async ({
  page,
}) => {
  let stored = initialGraph()
  let attempts = 0
  await page.route(
    '**/api/front/topo/topo-one/draw/?task_type=6',
    async (route) => {
      if (route.request().method() === 'POST') {
        if (++attempts === 1)
          return route.fulfill({ status: 500, json: { error: '保存暂时失败' } })
        stored = route.request().postDataJSON().topo
        return route.fulfill({ json: { saved: true } })
      }
      return route.fulfill({ json: stored })
    },
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(page.getByText('路由器', { exact: true })).toBeVisible()
  await moveNode(page)
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  await page.getByRole('link', { name: '场景说明', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('放弃未保存的拓扑？')
  await page.getByRole('button', { name: '继续编辑' }).click()
  await page.getByRole('button', { name: '保存拓扑' }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '保存暂时失败' }),
  ).toHaveCount(1)
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  await page.getByRole('button', { name: '保存拓扑' }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(stored.cells[0]!.position).not.toEqual({ x: 100, y: 100 })
  const savedPosition = stored.cells[0]!.position
  await page.reload()
  await expect(page.getByText('路由器', { exact: true })).toBeVisible()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await expect(
    page.locator('.react-flow__node[data-id="device-one"]'),
  ).toHaveCSS(
    'transform',
    `matrix(1, 0, 0, 1, ${savedPosition.x}, ${savedPosition.y})`,
  )
  stored.lock = true
  await page.reload()
  await expect(page.getByText('拓扑已锁定，仅可查看')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存拓扑' })).toBeDisabled()
  await moveNode(page)
  await expect(page.getByText('有未保存的修改')).toHaveCount(0)
  expect(attempts).toBe(2)
})

test('保存期间的新拖动仍待保存，刷新和实验切换不丢失或串写草稿', async ({
  page,
}) => {
  let stored = initialGraph()
  let releaseSave!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseSave = resolve
  })
  let firstSave = true
  await page.route(
    '**/api/front/topo/topo-one/draw/?task_type=6',
    async (route) => {
      if (route.request().method() === 'POST') {
        stored = route.request().postDataJSON().topo
        if (firstSave) {
          firstSave = false
          await gate
        }
        return route.fulfill({ json: true })
      }
      return route.fulfill({ json: stored })
    },
  )
  await page.route('**/api/front/topo/topo-two/draw/?task_type=6', (route) =>
    route.fulfill({ json: { lock: false, cells: [] } }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(page.getByText('路由器', { exact: true })).toBeVisible()
  await moveNode(page)
  await page.getByRole('button', { name: '保存拓扑' }).click()
  await expect(
    page.getByRole('button', { name: '正在保存拓扑…' }),
  ).toBeDisabled()
  await moveNode(page)
  releaseSave()
  await expect(page.getByRole('button', { name: '保存拓扑' })).toBeEnabled()
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  let refreshWarned = false
  page.once('dialog', async (dialog) => {
    refreshWarned = dialog.type() === 'beforeunload'
    await dialog.dismiss()
  })
  await page.evaluate(() => window.location.reload())
  expect(refreshWarned).toBe(true)
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  await page.getByRole('link', { name: '返回实验列表', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '放弃并离开' }).click()
  await page.goto('/#/basic/user/bench/experiment/two/scene')
  await expect(page.getByText('暂无可显示的拓扑图元')).toBeVisible()
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(page.getByText('所有修改已保存')).toBeVisible()
})

test('读取失败重试可恢复合法空图，资源不存在提供恢复入口', async ({ page }) => {
  let read = 0
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    ++read === 1
      ? route.fulfill({ status: 500, json: { error: '拓扑读取暂时失败' } })
      : route.fulfill({ json: { lock: false, cells: [] } }),
  )
  await page.route(
    '**/api/front/topo/topo-missing/draw/?task_type=6',
    (route) => route.fulfill({ status: 404, json: {} }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(
    page.getByRole('heading', { name: '场景拓扑读取失败' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '重试拓扑' }).click()
  await expect(page.getByText('暂无可显示的拓扑图元')).toBeVisible()
  await expect(page.getByRole('button', { name: '保存拓扑' })).toBeDisabled()
  await page.goto('/#/basic/user/bench/experiment/missing/scene')
  await expect(
    page.getByRole('heading', { name: '拓扑已被删除或不存在' }),
  ).toBeVisible()
  await expect(
    page.getByRole('alert').getByRole('link', { name: '返回实验列表' }),
  ).toBeVisible()
})

test('切换实验取消旧读取，迟到图不能覆盖新实验', async ({ page }) => {
  let releaseRead!: () => void
  const gate = new Promise<void>((resolve) => {
    releaseRead = resolve
  })
  await page.route(
    '**/api/front/topo/topo-one/draw/?task_type=6',
    async (route) => {
      await gate
      await route.fulfill({ json: initialGraph() }).catch(() => {})
    },
  )
  await page.route('**/api/front/topo/topo-two/draw/?task_type=6', (route) =>
    route.fulfill({ json: { lock: false, cells: [] } }),
  )
  const cancelled = page.waitForEvent('requestfailed', (request) =>
    request.url().includes('/topo-one/draw/'),
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(page.getByText('正在加载场景拓扑…')).toBeVisible()
  await page.goto('/#/basic/user/bench/experiment/two/scene')
  await cancelled
  await expect(page.getByText('暂无可显示的拓扑图元')).toBeVisible()
  releaseRead()
  await expect(page.getByText('路由器', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '实验two' })).toBeVisible()
})

test('占用网卡与环路被拒绝，多重链路失败重试，组内节点删除失败保留关联关系', async ({
  page,
}) => {
  const devices = ['a', 'b'].map((id, index) => ({
    id,
    shape: 'custom-react-node',
    position: { x: 100 + index * 250, y: 100 },
    parent: 'group',
    data: {
      name: id,
      data_id: 101 + index,
      nodeInfo: { id: 101 + index, engin: 1, config_info: { ports: [{}, {}] } },
    },
    ports: { items: [{ id: 'p', group: 'right' }] },
  }))
  let stored = {
    cells: [
      {
        id: 'group',
        shape: 'custom-parent',
        position: { x: 0, y: 0 },
        size: { width: 600, height: 300 },
        children: ['a', 'b'],
        data: { parent: true },
      },
      ...devices,
      {
        id: 'existing-edge',
        shape: 'edge',
        source: { cell: 'a', port: 'p' },
        target: { cell: 'b', port: 'p' },
        data: { source: 0, target: 0, data_id: 501 },
      },
      {
        id: 'unknown-edge',
        shape: 'future-edge',
        source: { cell: 'a' },
        target: { cell: 'b' },
        data: { data_id: 502, unknown: 1 },
      },
    ],
  } as { cells: Array<Record<string, unknown>> }
  let failEdge = true,
    failDelete = true
  let failMenu = true
  await page.route('**/api/front/node/template/define/', (route) =>
    route.fulfill({
      json: {
        '1': {
          properties: {
            ports: {
              type: 'array',
              description: '网卡',
              items: {
                properties: { mac: { type: 'string', description: 'MAC' } },
              },
            },
            _config: { port_numbers: { minLength: 0, maxLength: 3 } },
          },
        },
      },
    }),
  )
  await page.route('**/api/front/topo/a/', (route) => {
    if (failMenu) {
      failMenu = false
      return route.fulfill({ status: 500, json: { error: '节点菜单读取失败' } })
    }
    return route.fulfill({ json: { status: 1, data: { status: 0 } } })
  })
  let deletion: unknown
  await page.route('**/api/front/topo/topo-one/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'GET')
      return route.fulfill({ json: stored })
    const body = route.request().postDataJSON()
    if (path.endsWith('/draw/')) {
      stored = body.topo
      return route.fulfill({ json: true })
    }
    if (path.endsWith('/edge/')) {
      if (failEdge) {
        failEdge = false
        return route.fulfill({ status: 500, json: { error: '链路创建失败' } })
      }
      return route.fulfill({ json: { id: 503 } })
    }
    deletion = body
    if (failDelete) {
      failDelete = false
      return route.fulfill({ status: 500, json: { error: '删除失败' } })
    }
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await page.locator('.react-flow__node[data-id="a"]').click()
  await page.getByRole('button', { name: '连接设备', exact: true }).click()
  await expect(
    page.getByLabel('目标设备').locator('option[value="a"]'),
  ).toHaveCount(0)
  await page.getByLabel('目标设备').selectOption('b')
  await expect(
    page.getByLabel('源网卡').locator('option[value="0"]'),
  ).toBeDisabled()
  await expect(
    page.getByLabel('目标网卡').locator('option[value="0"]'),
  ).toBeDisabled()
  await page.getByRole('button', { name: '创建链路', exact: true }).click()
  await expect(page.getByText('请选择源网卡', { exact: true })).toBeVisible()
  await page.getByLabel('源网卡').selectOption('1')
  await page.getByLabel('目标网卡').selectOption('1')
  await page.getByRole('button', { name: '创建链路', exact: true }).click()
  await expect(page.getByLabel('源网卡')).toHaveValue('1')
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  await page.getByRole('button', { name: '创建链路', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await page.locator('.react-flow__node[data-id="a"]').dblclick()
  await expect(
    page.getByRole('button', { name: '删除网卡 2', exact: true }),
  ).toBeDisabled()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page
    .locator('.react-flow__node[data-id="a"]')
    .click({ button: 'right' })
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '节点菜单读取失败' }),
  ).toHaveCount(1)
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page
    .locator('.react-flow__node[data-id="a"]')
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(3)
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  await page.getByRole('button', { name: '删除选中对象', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(page.locator('.react-flow__edge')).toHaveCount(0)
  expect(deletion).toEqual({ node_list: [101], edge_list: [501, 503, 502] })
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(stored.cells.find((cell) => cell.id === 'group')?.children).toEqual([
    'b',
  ])
  expect(stored.cells.map((cell) => cell.id)).toEqual(['group', 'b'])
  await page.reload()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
})

test('拖入设备失败不遗留节点，锁定图禁止所有写入口', async ({ page }) => {
  let locked = false,
    fail = true,
    writes = 0
  const resource = {
    id: 0,
    name: '拖入设备',
    classify: 1,
    device_type: 1,
    config_info: { base_info: { name: '拖入设备' }, ports: [{}] },
  }
  await page.route('**/api/front/node/template/?*', (route) =>
    route.fulfill({ json: [resource] }),
  )
  await page.route('**/api/front/node/last_operat/**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/topo/topo-one/**', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ json: { cells: [], lock: locked } })
    writes++
    if (fail) {
      fail = false
      return route.fulfill({ status: 500, json: { error: '创建失败' } })
    }
    return route.fulfill({
      json: { ...route.request().postDataJSON(), id: 91 },
    })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await page
    .getByRole('button', { name: '拖入设备', exact: true })
    .dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 150, y: 150 },
    })
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '创建失败' }),
  ).toHaveCount(1)
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await page
    .locator('.react-flow__pane')
    .click({ position: { x: 150, y: 150 } })
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await expect(page.locator('.react-flow__node')).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 150, 150)',
  )
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  locked = true
  await page.reload()
  await expect(page.getByText('拓扑已锁定，仅可查看')).toBeVisible()
  await expect(
    page.getByRole('complementary', { name: '设备资源' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '连接设备', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '删除选中对象', exact: true }),
  ).toHaveCount(0)
  await page.locator('[aria-label="场景拓扑画布"]').focus()
  await page.keyboard.press('Delete')
  expect(writes).toBe(3)
})
