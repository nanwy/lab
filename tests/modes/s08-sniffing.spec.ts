import { expect, test } from '@playwright/test'
import { mount } from './s07-fixture'

async function openSniffing(page: import('@playwright/test').Page) {
  await page.locator('.react-flow__edge-interaction').click({ button: 'right' })
  await page.getByRole('menuitem', { name: '流量嗅探', exact: true }).click()
  return page.getByRole('dialog', { name: '流量嗅探', exact: true })
}

test('锁图链路嗅探独立查询启停，复制后端命令并打开原指南', async ({
  page,
  context,
}, testInfo) => {
  const state = await mount(page, true)
  state.stored.cells[1]!.position = { x: 360, y: 240 }
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.route('**/api/admin/system/logo/default/', (route) =>
    route.fulfill({ json: { onlyoffice_url: 'https://office.example.test' } }),
  )
  await page.reload()
  let status = 1
  const actions: Array<{ path: string; method: string; body: string | null }> =
    []
  await page.route('**/api/front/topo/topo-one/edge/501/*/', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    actions.push({ path, method: request.method(), body: request.postData() })
    if (path.endsWith('/capture_status/'))
      return route.fulfill({
        json: {
          status,
          cmd: status === 1 ? '' : 'ssh capture-host | wireshark -k -i -',
        },
      })
    status = path.endsWith('/start_capture/') ? 0 : 1
    return route.fulfill({ json: { status: 1 } })
  })
  const dialog = await openSniffing(page)
  await expect(dialog.getByText('未启动', { exact: true })).toHaveCount(2)
  await dialog.getByRole('button', { name: '启动', exact: true }).click()
  await expect(dialog.getByText('已启动', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: testInfo.outputPath('sniffing.png') })
  await dialog.getByRole('button', { name: '复制命令' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'ssh capture-host | wireshark -k -i -',
  )
  await dialog.getByRole('button', { name: '操作指南', exact: true }).click()
  const guide = page.getByRole('dialog', { name: '操作指南', exact: true })
  await page.evaluate(() => {
    window.open = (url) => {
      document.body.dataset.openedUrl = String(url)
      return null
    }
  })
  await guide.getByRole('button', { name: '打开新窗口预览word文件' }).click()
  expect(await page.locator('body').getAttribute('data-opened-url')).toBe(
    `https://office.example.test/web-apps/?filePath=${new URL(page.url()).origin}/media/handbook/Wireshark_install.docx&mode=view`,
  )
  await guide.getByRole('button', { name: 'Close' }).click()
  await dialog.getByRole('button', { name: '停止', exact: true }).click()
  await expect(dialog.getByText('未启动', { exact: true })).toHaveCount(2)
  expect(actions).toEqual([
    {
      path: '/api/front/topo/topo-one/edge/501/capture_status/',
      method: 'GET',
      body: null,
    },
    {
      path: '/api/front/topo/topo-one/edge/501/start_capture/',
      method: 'POST',
      body: null,
    },
    {
      path: '/api/front/topo/topo-one/edge/501/capture_status/',
      method: 'GET',
      body: null,
    },
    {
      path: '/api/front/topo/topo-one/edge/501/stop_capture/',
      method: 'POST',
      body: null,
    },
    {
      path: '/api/front/topo/topo-one/edge/501/capture_status/',
      method: 'GET',
      body: null,
    },
  ])
  expect(state.errors).toEqual([])
})

test('嗅探失败不伪报成功；关闭后换链路重读，旧命令与指南不串用', async ({
  page,
}) => {
  const state = await mount(page)
  state.stored.cells[1]!.position = { x: 360, y: 240 }
  state.stored.cells.push(
    {
      id: 'c',
      shape: 'custom-react-node',
      position: { x: 620, y: 60 },
      data: {
        name: '设备c',
        data_id: 93,
        nodeInfo: { config_info: { type: 'docker', node_id: 'c' } },
      },
      ports: { items: [{ id: 'c-p', group: 'left' }] },
    },
    {
      id: 'link2',
      shape: 'edge',
      source: { cell: 'a', port: 'a-p' },
      target: { cell: 'c', port: 'c-p' },
      data: { data_id: 502 },
    },
  )
  let failRead = true
  await page.route('**/api/front/topo/topo-one/edge/501/*/', (route) => {
    if (route.request().url().endsWith('/capture_status/')) {
      if (failRead) {
        failRead = false
        return route.fulfill({ status: 500, json: { error: '嗅探查询失败' } })
      }
      return route.fulfill({ json: { status: 0, cmd: 'old-edge-command' } })
    }
    return route.fulfill({ json: { status: 2, message: '嗅探停止失败' } })
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/api/front/topo/topo-one/edge/502/capture_status/',
    async (route) => {
      await held
      await route.fulfill({ json: { status: 1 } })
    },
  )
  await page.reload()
  await page
    .locator('.react-flow__edge[data-id="link"] .react-flow__edge-interaction')
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '流量嗅探', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '流量嗅探', exact: true })
  await expect(dialog.getByRole('alert')).toHaveText('嗅探查询失败')
  await expect(
    dialog.getByRole('button', { name: '启动', exact: true }),
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Close' }).click()
  await page
    .locator('.react-flow__edge[data-id="link"] .react-flow__edge-interaction')
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '流量嗅探', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '流量嗅探', exact: true })
  await expect(dialog.getByText('old-edge-command')).toBeVisible()
  await dialog.getByRole('button', { name: '停止', exact: true }).click()
  await expect(page.getByText('嗅探停止失败', { exact: true })).toBeVisible()
  await expect(dialog.getByText('已启动', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '操作指南', exact: true }).click()
  const guide = page.getByRole('dialog', { name: '操作指南', exact: true })
  await guide.getByRole('button', { name: '打开新窗口预览word文件' }).click()
  await expect(
    page.getByText('未配置文档预览服务', { exact: true }),
  ).toBeVisible()
  await guide.getByRole('button', { name: 'Close' }).click()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await page
    .locator('.react-flow__edge[data-id="link2"] .react-flow__edge-interaction')
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '流量嗅探', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '流量嗅探', exact: true })
  await expect(dialog.getByRole('status')).toHaveText('正在读取嗅探状态…')
  await expect(
    page.getByRole('dialog', { name: '操作指南', exact: true }),
  ).toHaveCount(0)
  await expect(dialog.getByText('old-edge-command')).toHaveCount(0)
  release()
  await expect(dialog.getByText('未启动', { exact: true })).toHaveCount(2)
  expect(state.errors).toEqual([])
})
