import { expect, test } from '@playwright/test'
import { mount } from './s07-fixture'

test('快照可搜索分页、创建、恢复及删除；失败保留输入且原标识不混用', async ({
  page,
}) => {
  const state = await mount(page)
  let snapshots = [
    { id: 11, name: '初始快照', enable: false, create_time: '2026-10-21' },
  ]
  snapshots.push(
    ...Array.from({ length: 10 }, (_, index) => ({
      id: 100 + index,
      name: `历史快照${index}`,
      enable: false,
      create_time: '2026-10-20',
    })),
  )
  let fail = true
  let failRestore = true
  const calls: Array<{ path: string; method: string; body: unknown }> = []
  await page.route('**/api/front/topo/topo-one/node/a/snapshot/**', (route) => {
    const req = route.request(),
      url = new URL(req.url())
    calls.push({
      path: url.pathname + url.search,
      method: req.method(),
      body: req.postData() ? req.postDataJSON() : null,
    })
    if (req.method() === 'GET') {
      const matched = snapshots.filter((item) =>
        item.name.includes(url.searchParams.get('search') || ''),
      )
      const page = Number(url.searchParams.get('page'))
      return route.fulfill({
        json: {
          count: matched.length,
          results: matched.slice((page - 1) * 10, page * 10),
        },
      })
    }
    if (req.method() === 'POST' && !url.pathname.includes('/resume/')) {
      if (fail) {
        fail = false
        return route.fulfill({ status: 500, json: { error: '快照创建失败' } })
      }
      snapshots.push({
        id: 12,
        name: req.postDataJSON().name,
        enable: false,
        create_time: '2026-10-22',
      })
      return route.fulfill({ json: { id: 12 } })
    }
    if (req.method() === 'POST' && failRestore) {
      failRestore = false
      return route.fulfill({ json: { status: 2, message: '恢复被拒绝' } })
    }
    if (req.method() === 'DELETE')
      snapshots = snapshots.filter((item) => item.id !== 11)
    else snapshots[0]!.enable = true
    return route.fulfill({ json: { status: 1 } })
  })
  const node = page.locator('.react-flow__node[data-id="a"]')
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '快照', exact: true }).click()
  await expect(page.getByRole('table', { name: '快照列表' })).toContainText(
    '初始快照',
  )
  await page.getByLabel('搜索快照', { exact: true }).fill('不存在')
  await expect(page.getByText('暂无快照', { exact: true })).toBeVisible()
  await page.getByLabel('搜索快照', { exact: true }).fill('')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(
    page.getByText('第 2 / 2 页，共 11 项', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '上一页', exact: true }).click()
  await page.getByRole('button', { name: '创建时间排序', exact: true }).click()
  await page.getByRole('button', { name: '创建快照', exact: true }).click()
  await expect(
    page.getByText('节点未启动，无法创建快照', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '启动', exact: true }).click()
  await expect(node.getByText('启动成功', { exact: true })).toBeVisible()
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '快照', exact: true }).click()
  await page.getByRole('button', { name: '创建快照', exact: true }).click()
  await page.getByLabel('快照名称', { exact: true }).fill('测试快照')
  await page.getByRole('button', { name: '保存快照', exact: true }).click()
  await expect(page.getByLabel('快照名称', { exact: true })).toHaveValue(
    '测试快照',
  )
  await page.getByRole('button', { name: '保存快照', exact: true }).click()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByRole('table', { name: '快照列表' })).toContainText(
    '测试快照',
  )
  await page.getByRole('button', { name: '上一页', exact: true }).click()
  await page
    .getByRole('row')
    .filter({ hasText: '初始快照' })
    .getByRole('button', { name: '恢复', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText(
    '恢复快照将覆盖当前环境',
  )
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByText('恢复被拒绝', { exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: '初始快照' })
      .getByRole('button', { name: '恢复', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('row')
    .filter({ hasText: '初始快照' })
    .getByRole('button', { name: '删除', exact: true })
    .click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByRole('table', { name: '快照列表' })).not.toContainText(
    '初始快照',
  )
  expect(calls.find((c) => c.method === 'DELETE')).toMatchObject({
    path: '/api/front/topo/topo-one/node/a/snapshot/11/resume/?task_type=6',
    body: {},
  })
  expect(state.errors).toEqual([])
})

const imageFixture = () => ({
  id: 7,
  name: '原镜像',
  file_path: 'base.test.qcow2',
  config: { cpu: 2, ram: 1024, disk: 10, extension: '保留' },
  open_service: [],
  system_user: [],
  app_user: [],
  ip_config: [],
  type: 1,
  property: 2,
  ip_type: 1,
  system_type: 3,
  desc: '镜像说明',
  start_config: '',
  extension: { preserve: true },
})

test('关机保存镜像：载入全部配置、校验、失败保留、数组与未知字段按原请求提交', async ({
  page,
}, testInfo) => {
  const state = await mount(page)
  const info = state.stored.cells[0]!.data!.nodeInfo as Record<string, unknown>
  info.engin = 1
  info.config_info = {
    type: 'libvirt',
    node_id: 'a',
    base_info: { images_id: 7, console_type: 'vnc' },
  }
  await page.reload()
  await page.route('**/api/front/node/image/list/7/', (route) =>
    route.fulfill({ json: imageFixture() }),
  )
  let saved: Record<string, unknown> | undefined,
    fail = true
  await page.route(
    '**/api/front/topo-one/node/a/save_image/?task_type=6',
    (route) => {
      saved = route.request().postDataJSON()
      if (fail) {
        fail = false
        return route.fulfill({ json: { status: 2, message: '镜像保存失败' } })
      }
      return route.fulfill({ json: { status: 1 } })
    },
  )
  const node = page.locator('.react-flow__node[data-id="a"]')
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '保存镜像', exact: true }).click()
  await expect(
    page.getByText('保存镜像只有在关机状态下可操作！', { exact: true }),
  ).toBeVisible()
  await page.getByRole('menuitem', { name: '启动', exact: true }).click()
  await expect(node.getByText('启动成功', { exact: true })).toBeVisible()
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '关机', exact: true }).click()
  await expect(node.getByText('关机', { exact: true })).toBeVisible()
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '保存镜像', exact: true }).click()
  await expect(page.getByLabel('镜像文件名称', { exact: true })).toHaveValue(
    'base.test',
  )
  await page.getByLabel('镜像名称', { exact: true }).fill('')
  await page.getByRole('button', { name: '保存镜像', exact: true }).click()
  await expect(
    page.getByText('请输入镜像名称！', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('镜像名称', { exact: true }).fill('新镜像')
  await page.getByLabel('CPU(H)', { exact: true }).fill('4')
  await page.getByLabel('镜像文件名称', { exact: true }).fill('新image')
  await expect(page.getByLabel('镜像文件名称', { exact: true })).toHaveValue(
    'image',
  )
  await page.getByLabel('开放服务1 服务', { exact: true }).fill('自定义服务')
  await page.getByLabel('开放服务1 端口', { exact: true }).fill('8080')
  await page.getByRole('button', { name: '添加开放服务', exact: true }).click()
  await page.getByLabel('开放服务2 服务', { exact: true }).fill('SSH服务')
  await page.getByLabel('IP类型', { exact: true }).selectOption('2')
  await page.getByLabel('IP配置1 IP', { exact: true }).fill('10.0.0.2')
  await page.getByLabel('镜像描述', { exact: true }).fill('第一行\n第二行')
  await page.getByRole('button', { name: '保存镜像', exact: true }).click()
  await expect(page.getByText('镜像保存失败', { exact: true })).toBeVisible()
  await expect(page.getByLabel('镜像名称', { exact: true })).toHaveValue(
    '新镜像',
  )
  await page.getByRole('button', { name: '保存镜像', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(saved).toMatchObject({
    name: '新镜像',
    file_path: 'image',
    image: 7,
    config: { cpu: 4, ram: 1024, disk: 10, extension: '保留' },
    open_service: [{ name: '自定义服务', port: 8080 }, { name: 'SSH服务' }],
    ip_config: [{ ip: '10.0.0.2', subnet_mask: '', gateway: '' }],
    desc: '第一行\n第二行',
    extension: { preserve: true },
  })
  await page.screenshot({ path: testInfo.outputPath('saved-image.png') })
  expect(state.errors).toEqual([])
})

test('节点转换仅保存draw，保留业务ID与未知图字段，详情沿schema只读显示', async ({
  page,
}) => {
  const state = await mount(page, true)
  const info = state.stored.cells[0]!.data!.nodeInfo as Record<string, unknown>
  Object.assign(info, {
    engin: 1,
    device_type: 4,
    icon_classify: 5,
    config_info: {
      type: 'libvirt',
      node_id: 'a',
      base_info: { name: '旧名称', images_id: 7 },
      enabled: false,
    },
  })
  state.stored.cells[0]!.data!.extension = '保留节点未知字段'
  await page.reload()
  await page.route('**/api/front/node/image/list/7/', (route) =>
    route.fulfill({ json: imageFixture() }),
  )
  await page.route('**/api/front/node/template/define/', (route) =>
    route.fulfill({
      json: {
        '1': {
          properties: {
            base_info: {
              type: 'object',
              description: '基础信息',
              properties: { name: { type: 'string', description: '设备名称' } },
            },
            enabled: { type: 'boolean', description: '启用', default: true },
          },
        },
      },
    }),
  )
  const node = page.locator('.react-flow__node[data-id="a"]')
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '详情', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('旧名称')
  await expect(page.getByRole('dialog')).toContainText('否')
  await expect(page.getByRole('dialog')).toContainText('镜像说明')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  let query = ''
  await page.route('**/api/front/node/convert/?*', (route) => {
    query = new URL(route.request().url()).search
    return route.fulfill({
      json: [
        {
          id: 800,
          name: '转换模板',
          engin: 1,
          config_info: {
            type: 'docker',
            node_id: 'template-uuid',
            base_info: { name: '转换模板' },
          },
        },
      ],
    })
  })
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '节点转换', exact: true }).click()
  await page.getByRole('button', { name: '确认转换', exact: true }).click()
  await expect(
    page.getByText('请选择需要转换的节点', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('转换节点', { exact: true }).selectOption('800')
  await page.getByRole('button', { name: '确认转换', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(node).toContainText('转换模板')
  expect(query).toContain('device_type_id=4')
  expect(query).toContain('icon_classify_id=5')
  expect(state.stored.cells[0]!.data).toMatchObject({
    data_id: 91,
    extension: '保留节点未知字段',
    nodeInfo: {
      id: 91,
      device_id: 'a',
      config_info: { node_id: 'a', type: 'docker' },
    },
  })
  expect(state.writes.map((write) => write.path)).toEqual([
    '/api/front/topo/topo-one/draw/?task_type=6',
  ])
  await page.reload()
  await expect(node).toContainText('转换模板')
  await expect(page.getByText('拓扑已锁定，仅可查看')).toBeVisible()
  expect(state.errors).toEqual([])
})

test('NAT新增删除与网络入口设置按原协议工作，入口结果随draw重开', async ({
  page,
}) => {
  const state = await mount(page, true)
  const info = state.stored.cells[0]!.data!.nodeInfo as Record<string, unknown>
  info.config_info = { type: 'nat_net', node_id: 'a' }
  await page.route('**/api/front/topo/topo-one/status/?task_type=6', (route) =>
    route.fulfill({ json: { nodes: { a: { status: 2 } }, edges: {} } }),
  )
  await page.reload()
  let rules: Array<{
    id: number
    nat_type: string
    external_ip: string
    logical_ip: string
  }> = []
  let fail = true
  const requests: Array<{ path: string; method: string; body: unknown }> = []
  await page.route('**/api/front/topo/topo-one/node/a/nat/**', (route) => {
    const request = route.request(),
      url = new URL(request.url())
    requests.push({
      path: url.pathname + url.search,
      method: request.method(),
      body: request.postData() ? request.postDataJSON() : null,
    })
    if (request.method() === 'GET')
      return route.fulfill({ json: { count: rules.length, results: rules } })
    if (request.method() === 'POST') {
      if (fail) {
        fail = false
        return route.fulfill({ status: 500, json: { error: 'NAT保存失败' } })
      }
      rules.push({ id: 18, ...request.postDataJSON() })
      return route.fulfill({ json: { id: 18 } })
    }
    rules = []
    return route.fulfill({ json: true })
  })
  const node = page.locator('.react-flow__node[data-id="a"]')
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'NAT网络', exact: true }).click()
  await expect(page.getByText('暂无NAT网络', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '添加NAT网络', exact: true }).click()
  await page.getByRole('button', { name: '保存NAT', exact: true }).click()
  await expect(page.getByText('请选择nat类型', { exact: true })).toBeVisible()
  await page.getByLabel('nat类型', { exact: true }).selectOption('snat')
  await page.getByLabel('外部IP', { exact: true }).fill('192.0.2.1')
  await page.getByLabel('内部IP', { exact: true }).fill('10.0.0.2')
  await page.getByRole('button', { name: '保存NAT', exact: true }).click()
  await expect(page.getByLabel('内部IP', { exact: true })).toHaveValue(
    '10.0.0.2',
  )
  await page.getByRole('button', { name: '保存NAT', exact: true }).click()
  await expect(page.getByRole('table', { name: 'NAT网络' })).toContainText(
    '192.0.2.1',
  )
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(page.getByText('暂无NAT网络', { exact: true })).toBeVisible()
  expect(requests.find((request) => request.method === 'DELETE')).toEqual({
    path: '/api/front/topo/topo-one/node/a/nat/18/?task_type=6',
    method: 'DELETE',
    body: {},
  })
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  let entrances = 0
  await page.route('**/api/front/topo/topo-one/network/a/', (route) => {
    expect(route.request().method()).toBe('GET')
    entrances++
    return route.fulfill({ json: { status: 1 } })
  })
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '设置入口', exact: true }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(node.getByText('入口点', { exact: true })).toBeVisible()
  expect(entrances).toBe(1)
  expect(state.stored.cells[0]!.data!.nodeInfo).toMatchObject({
    network_cut: true,
  })
  expect(state.stored.cells[1]!.data!.nodeInfo).toMatchObject({
    network_cut: false,
  })
  await page.reload()
  await expect(node.getByText('入口点', { exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

test('运行文件上传仅向当前支持的节点发送FormData，详情关闭取消读取', async ({
  page,
}) => {
  const state = await mount(page)
  const info = state.stored.cells[0]!.data!.nodeInfo as Record<string, unknown>
  info.config_info = {
    type: 'libvirt',
    node_id: 'a',
    base_info: { console_type: 'vnc', images_id: 7 },
  }
  await page.route('**/api/front/topo/topo-one/status/?task_type=6', (route) =>
    route.fulfill({ json: { nodes: { a: { status: 2 } }, edges: {} } }),
  )
  await page.reload()
  let uploaded = ''
  await page.route('**/api/front/topo/node_run/a/upload_file/', (route) => {
    expect(route.request().method()).toBe('POST')
    uploaded = route.request().postDataBuffer()!.toString()
    return route.fulfill({ json: { status: 1 } })
  })
  const node = page.locator('.react-flow__node[data-id="a"]')
  await node.click({ button: 'right' })
  const fileChooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: '上传文件', exact: true }).click()
  await (
    await fileChooser
  ).setFiles({
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('runtime upload'),
  })
  await expect.poll(() => uploaded).toContain('runtime upload')
  expect(uploaded).toContain('name="file"; filename="test.txt"')
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const aborted: string[] = []
  page.on('requestfailed', (request) =>
    aborted.push(new URL(request.url()).pathname),
  )
  await page.route('**/api/front/node/image/list/7/', async (route) => {
    await held
    await route.fulfill({ json: imageFixture() }).catch(() => {})
  })
  await node.click({ button: 'right' })
  await page.getByRole('menuitem', { name: '详情', exact: true }).click()
  await expect(page.getByText('正在读取镜像…', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect.poll(() => aborted).toContain('/api/front/node/image/list/7/')
  release()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.errors).toEqual([])
})
