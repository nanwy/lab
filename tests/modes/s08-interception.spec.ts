import { expect, test } from '@playwright/test'
import { mount } from './s07-fixture'
import type { Page } from '@playwright/test'
async function editScript(page: Page, value: string) {
  const editor = page.getByRole('textbox', { name: /拦截代码/ })
  await editor.focus()
  await editor.press('Meta+A')
  await page.keyboard.insertText(value)
}

test('运行中的拦截节点可配置、保存并启动流量拦截', async ({ page }) => {
  const state = await mount(page, true)
  const device = state.stored.cells[0]!
  device.data!.nodeInfo = {
    id: 91,
    config_info: { type: 'libvirt_middle_intercept', node_id: 'a' },
  }
  await page.reload()
  await page.route('**/api/front/topo/topo-one/status/?task_type=6', (route) =>
    route.fulfill({
      json: { nodes: { a: { status: 2 }, b: { status: 0 } }, edges: {} },
    }),
  )
  let saved: unknown = null
  let running = false
  let rejectSave = true
  const writes: Array<{ path: string; body: unknown; method: string }> = []
  await page.route(
    '**/api/front/topo/topo-one/node/a/blocking_info/',
    (route) =>
      route.fulfill({
        json: {
          status: 1,
          data: saved
            ? { ...(saved as object), status: running ? 2 : 0, cid: 77 }
            : {},
        },
      }),
  )
  for (const action of ['draft', 'start', 'close'])
    await page.route(
      `**/api/front/topo/topo-one/node/a/blocking_${action}/`,
      (route) => {
        const request = route.request()
        writes.push({
          path: new URL(request.url()).pathname,
          body: request.postData() ? request.postDataJSON() : null,
          method: request.method(),
        })
        if (action === 'draft' && rejectSave) {
          rejectSave = false
          return route.fulfill({ json: { status: 2, message: '草稿保存失败' } })
        }
        if (action === 'draft') saved = request.postDataJSON()
        running = action === 'start'
        return route.fulfill({ json: { status: 1 } })
      },
    )
  await page.route('**/api/front/topo/build_strategy/', (route) =>
    route.fulfill({
      json: { status: 1, data: ['tcp from 192.0.2.1 to port 80'] },
    }),
  )
  let connectionClosed = false
  await page.routeWebSocket('**/ws/traffic_block_log/77/', (socket) => {
    socket.send(JSON.stringify('拦截一条TCP流量'))
    socket.onClose(() => {
      connectionClosed = true
    })
  })
  await page.route('**/api/front/topo/common_protocol/', (route) =>
    route.fulfill({ json: { status: 1, data: ['tcp', 'udp'] } }),
  )
  await page.reload()
  await page
    .locator('.react-flow__node[data-id="a"]')
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '流量拦截', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '拦截修改' })).toBeVisible()
  await expect(page.getByLabel('协议', { exact: true })).toBeVisible()
  const dialog = page.getByRole('dialog', { name: '拦截修改' })
  await expect(page.getByRole('textbox', { name: /拦截代码/ })).toBeVisible()
  await dialog.getByRole('button', { name: '启动', exact: true }).click()
  await expect(
    dialog.getByText('请选择或输入协议', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByText('请输入拦截代码', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('协议', { exact: true }).fill('tcp')
  await page.getByLabel('IP地址', { exact: true }).fill('192.0.2.1')
  await page.getByLabel('端口', { exact: true }).fill('80')
  await expect(
    page.getByText('tcp from 192.0.2.1 to port 80', { exact: true }),
  ).toBeVisible()
  await editScript(page, 'print("drop")')
  await page.mouse.click(8, 8)
  await expect(dialog).toBeVisible()
  await expect(page.getByLabel('协议', { exact: true })).toHaveValue('tcp')
  await dialog.getByRole('button', { name: '启动', exact: true }).click()
  await expect(
    page.getByText('存在未保存更改，请先保存修改', { exact: true }),
  ).toBeVisible()
  expect(writes).toEqual([])
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('草稿保存失败', { exact: true })).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: '保存', exact: true }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect
    .poll(() => writes.at(-1)?.body)
    .toEqual({
      config: { protocol: 'tcp', src_ip: '192.0.2.1', dst_port: '80' },
      script: 'print("drop")',
    })
  await dialog.getByRole('button', { name: '启动', exact: true }).click()
  await expect(
    page.getByText('启动状态：运行中', { exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('协议', { exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '拦截日志', exact: true }).click()
  await expect(page.getByText('拦截一条TCP流量', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '清空日志', exact: true }).click()
  await expect(page.getByText('拦截一条TCP流量', { exact: true })).toHaveCount(
    0,
  )
  await dialog.getByRole('button', { name: '暂停', exact: true }).click()
  await expect(
    page.getByText('启动状态：未启动', { exact: true }),
  ).toBeVisible()
  expect(writes.at(-1)?.method).toBe('GET')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect.poll(() => connectionClosed).toBe(true)
  expect(state.errors).toEqual([])
})

test('拦截模板支持另存、编辑、内置应用以及导入导出', async ({
  page,
}, testInfo) => {
  const state = await mount(page)
  state.stored.cells[0]!.data!.nodeInfo = {
    id: 91,
    config_info: { type: 'libvirt_middle_intercept', node_id: 'a' },
  }
  await page.route('**/api/front/topo/topo-one/status/?task_type=6', (route) =>
    route.fulfill({ json: { nodes: { a: { status: 2 } }, edges: {} } }),
  )
  await page.route('**/api/front/topo/common_protocol/', (route) =>
    route.fulfill({ json: { status: 1, data: ['tcp'] } }),
  )
  await page.route(
    '**/api/front/topo/topo-one/node/a/blocking_info/',
    (route) =>
      route.fulfill({
        json: {
          status: 1,
          data: {
            status: 0,
            cid: null,
            config: { protocol: 'tcp', src_ip: '', dst_port: '' },
            script: 'print("node")',
          },
        },
      }),
  )
  const templates = [
    {
      id: 1,
      name: '内置',
      is_built_in: true,
      script: 'print("built-in")',
      config: { protocol: 'udp', src_ip: '', dst_port: '' },
    },
  ]
  const writes: Array<{ method: string; body: unknown }> = []
  await page.route('**/api/front/topo/blocking_template/?nopage=1', (route) =>
    route.fulfill({ json: templates }),
  )
  await page.route('**/api/front/topo/blocking_template/', (route) => {
    const body = route.request().postDataJSON()
    writes.push({ method: route.request().method(), body })
    const created = {
      id: 2,
      name: body.name,
      is_built_in: false,
      script: body.script,
      config: body.strategy,
    }
    templates.push(created)
    return route.fulfill({ json: created })
  })
  await page.route('**/api/front/topo/blocking_template/2/', (route) => {
    const request = route.request()
    if (request.method() === 'DELETE') {
      templates.splice(1)
      return route.fulfill({ status: 204 })
    }
    const body = request.postDataJSON()
    writes.push({ method: request.method(), body })
    templates[1] = {
      ...templates[1]!,
      script: body.script,
      config: body.strategy,
    }
    return route.fulfill({ json: templates[1] })
  })
  let imported = false
  await page.route(
    '**/api/front/topo/blocking_template/import_export/',
    (route) => {
      imported = route
        .request()
        .postDataBuffer()!
        .includes(Buffer.from('multipart-test'))
      return route.fulfill({ json: { status: 1 } })
    },
  )
  await page.reload()
  await page
    .locator('.react-flow__node[data-id="a"]')
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '流量拦截', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '拦截修改', exact: true })
  await dialog.getByRole('button', { name: '另存为模板' }).click()
  const saveAs = page.getByRole('dialog', { name: '另存为模板', exact: true })
  await saveAs.getByRole('button', { name: '确认', exact: true }).click()
  await expect(saveAs.getByText('请输入模板名称')).toBeVisible()
  await saveAs.getByLabel('模板名称').fill('我的模板')
  await page.mouse.click(8, 8)
  await expect(saveAs).toBeVisible()
  await expect(saveAs.getByLabel('模板名称')).toHaveValue('我的模板')
  await saveAs.getByRole('button', { name: '确认', exact: true }).click()
  await expect(saveAs).toHaveCount(0)
  expect(writes[0]?.body).toMatchObject({
    name: '我的模板',
    strategy: { protocol: 'tcp', src_ip: '', dst_port: '' },
  })
  await dialog.getByRole('button', { name: '拦截模板', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '内置', exact: true }),
  ).toBeVisible()
  await expect(dialog.getByLabel('协议', { exact: true })).toBeDisabled()
  await expect(
    dialog.getByRole('button', { name: '删除模板 内置' }),
  ).toHaveCount(0)
  await expect(
    dialog.getByRole('button', { name: '保存模板', exact: true }),
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: '应用模板', exact: true }).click()
  await dialog.getByRole('button', { name: '拦截修改', exact: true }).click()
  await expect(dialog.getByLabel('协议', { exact: true })).toHaveValue('udp')
  await dialog.getByRole('button', { name: '启动', exact: true }).click()
  await expect(page.getByText('存在未保存更改，请先保存修改')).toBeVisible()
  await dialog.getByRole('button', { name: '拦截模板', exact: true }).click()
  await dialog.getByRole('button', { name: '我的模板', exact: true }).click()
  await editScript(page, 'print("edited")')
  await dialog.getByRole('button', { name: '保存模板', exact: true }).click()
  await expect.poll(() => writes.at(-1)?.method).toBe('PATCH')
  expect(writes.at(-1)?.body).toMatchObject({ script: 'print("edited")' })
  await expect(
    page.getByText('拦截模板保存响应不符合契约', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('编辑成功', { exact: true })).toBeVisible()
  await dialog.evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({
    path: testInfo.outputPath('interception-template.png'),
  })
  await expect(dialog.getByRole('link', { name: '导出模板' })).toHaveAttribute(
    'href',
    '/api/scene/blocking_template/import_export/',
  )
  await dialog.getByRole('button', { name: '导入模板' }).click()
  const importing = page.getByRole('dialog', {
    name: '导入拦截模板',
    exact: true,
  })
  await importing.getByLabel('上传文件').setInputFiles({
    name: 'templates.json',
    mimeType: 'application/json',
    buffer: Buffer.from('multipart-test'),
  })
  await page.mouse.click(8, 8)
  await expect(importing).toBeVisible()
  await expect
    .poll(() =>
      importing
        .getByLabel('上传文件')
        .evaluate((element: HTMLInputElement) => element.files?.[0]?.name),
    )
    .toBe('templates.json')
  await importing.getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => imported).toBe(true)
  await expect(importing).toHaveCount(0)
  await dialog.getByRole('button', { name: '删除模板 我的模板' }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '我的模板', exact: true }),
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: '新建模板', exact: true }).click()
  await dialog.getByRole('button', { name: '保存模板', exact: true }).click()
  await expect(dialog.getByText('请输入模板名称')).toBeVisible()
  await expect(dialog.getByText('请选择或输入协议')).toBeVisible()
  await dialog.getByLabel('模板名称').fill('新模板')
  await dialog.getByLabel('协议', { exact: true }).fill('tcp')
  await editScript(page, 'print("new")')
  await dialog.getByRole('button', { name: '保存模板', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '新模板', exact: true }),
  ).toBeVisible()
  expect(state.errors).toEqual([])
})

test('普通节点无拦截动作，关闭后换节点取消旧读取且清理日志连接', async ({
  page,
}) => {
  const state = await mount(page)
  await page.route('**/api/front/topo/topo-one/status/?task_type=6', (route) =>
    route.fulfill({
      json: { nodes: { a: { status: 2 }, b: { status: 2 } }, edges: {} },
    }),
  )
  await page.reload()
  await page
    .locator('.react-flow__node[data-id="a"]')
    .click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: '流量拦截', exact: true }),
  ).toHaveCount(0)
  await page.keyboard.press('Escape')
  for (const cell of state.stored.cells.slice(0, 2))
    cell.data!.nodeInfo = {
      config_info: { type: 'libvirt_middle_intercept', node_id: cell.id },
    }
  await page.route('**/api/front/topo/common_protocol/', (route) =>
    route.fulfill({ json: { status: 1, data: ['udp'] } }),
  )
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/api/front/topo/topo-one/node/a/blocking_info/',
    async (route) => {
      await held
      await route
        .fulfill({
          json: {
            status: 1,
            data: {
              status: 0,
              cid: 1,
              config: { protocol: 'tcp', src_ip: 'old', dst_port: '1' },
              script: 'old()',
            },
          },
        })
        .catch(() => {})
    },
  )
  await page.route(
    '**/api/front/topo/topo-one/node/b/blocking_info/',
    (route) =>
      route.fulfill({
        json: {
          status: 1,
          data: {
            status: 0,
            cid: 88,
            config: { protocol: 'udp', src_ip: 'new', dst_port: '2' },
            script: 'new()',
          },
        },
      }),
  )
  let closed = false
  await page.routeWebSocket('**/ws/traffic_block_log/88/', (socket) => {
    socket.send(JSON.stringify('节点b日志'))
    socket.onClose(() => {
      closed = true
    })
  })
  await page.reload()
  await page
    .locator('.react-flow__node[data-id="a"]')
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '流量拦截', exact: true }).click()
  await expect(
    page.getByText('正在加载拦截配置…', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('dialog', { name: '拦截修改', exact: true })
    .getByRole('button', { name: 'Close' })
    .click()
  await page
    .locator('.react-flow__node[data-id="b"]')
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '流量拦截', exact: true }).click()
  await expect(page.getByLabel('协议', { exact: true })).toHaveValue('udp')
  release()
  await expect(page.getByLabel('IP地址', { exact: true })).toHaveValue('new')
  await page.getByRole('button', { name: '拦截日志', exact: true }).click()
  await expect(page.getByText('节点b日志', { exact: true })).toBeVisible()
  await page
    .getByRole('dialog', { name: '拦截修改', exact: true })
    .getByRole('button', { name: 'Close' })
    .click()
  await expect.poll(() => closed).toBe(true)
  expect(state.errors).toEqual([])
})

test('协议响应损坏明确报错且保留手动输入，合法空列表正常显示', async ({
  page,
}) => {
  const state = await mount(page)
  state.stored.cells[0]!.data!.nodeInfo = {
    id: 91,
    config_info: { type: 'libvirt_middle_intercept', node_id: 'a' },
  }
  await page.route('**/api/front/topo/topo-one/status/?task_type=6', (route) =>
    route.fulfill({ json: { nodes: { a: { status: 2 } }, edges: {} } }),
  )
  await page.route(
    '**/api/front/topo/topo-one/node/a/blocking_info/',
    (route) => route.fulfill({ json: { status: 1, data: {} } }),
  )
  await page.route('**/api/front/topo/blocking_template/?nopage=1', (route) =>
    route.fulfill({ json: [] }),
  )
  let data: unknown = ['tcp', 42]
  await page.route('**/api/front/topo/common_protocol/', (route) =>
    route.fulfill({ json: { status: 1, data } }),
  )
  async function open() {
    await page
      .locator('.react-flow__node[data-id="a"]')
      .click({ button: 'right' })
    await page.getByRole('menuitem', { name: '流量拦截', exact: true }).click()
  }
  await page.reload()
  await open()
  const dialog = page.getByRole('dialog', { name: '拦截修改', exact: true })
  await expect(dialog.getByRole('alert')).toContainText('协议列表读取失败：')
  await dialog.getByLabel('协议', { exact: true }).fill('custom')
  await expect(dialog.getByLabel('协议', { exact: true })).toHaveValue('custom')
  await dialog.getByRole('button', { name: '拦截模板', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('协议列表读取失败：')
  await dialog.getByRole('button', { name: '新建模板', exact: true }).click()
  await dialog.getByLabel('协议', { exact: true }).fill('custom')
  await expect(dialog.getByLabel('协议', { exact: true })).toHaveValue('custom')
  data = []
  await page.reload()
  await open()
  await expect(dialog.getByLabel('协议', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  expect(state.errors).toEqual([])
})
