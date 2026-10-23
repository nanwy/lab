import { expect, test } from '@playwright/test'
import { mount } from './s07-fixture'

test('链路流量标记读取业务链路 ID 并允许锁图运行', async ({ page }) => {
  const state = await mount(page, true)
  let status = 1
  let reject = true
  const commands: unknown[] = []
  await page.route(
    '**/api/front/topo/topo-one/edge/501/start_capture_pcap/',
    (route) => {
      commands.push(route.request().postDataJSON())
      if (reject) {
        reject = false
        return route.fulfill({ json: { status: 2, message: '捕获资源不足' } })
      }
      status = 2
      return route.fulfill({ json: { status: 1 } })
    },
  )
  await page.route(
    '**/api/front/topo/topo-one/edge/501/stop_capture_pcap/',
    (route) => {
      status = 1
      return route.fulfill({ json: { status: 1 } })
    },
  )
  await page.route(
    '**/api/front/topo/topo-one/edge/501/capture_pcap_status/',
    (route) =>
      route.fulfill({
        json: {
          status,
          pcap_size: 5,
          pcap_filter: { proto: 'tcp', host: '', port: '' },
        },
      }),
  )
  const point = await page
    .locator('.react-flow__edge-interaction')
    .evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y }
    })
  await page.mouse.click(point.x, point.y, { button: 'right' })
  await page.getByRole('menuitem', { name: '流量标记', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '流量标记' })).toBeVisible()
  await expect(page.getByLabel('每个包大小')).toHaveValue('5')
  await expect(page.getByText('未启动', { exact: true }).last()).toBeVisible()
  const dialog = page.getByRole('dialog', { name: '流量标记' })
  await expect(dialog.getByText('请输入包大小', { exact: true })).toHaveCount(0)
  await page.getByLabel('每个包大小').fill('')
  await dialog.getByRole('button', { name: '开启', exact: true }).click()
  await expect(dialog.getByText('请输入包大小', { exact: true })).toBeVisible()
  await page.getByLabel('每个包大小').fill('0')
  await dialog.getByRole('button', { name: '开启', exact: true }).click()
  await expect(dialog.getByText('包大小最小为1')).toBeVisible()
  await page.getByLabel('每个包大小').fill('8')
  await page.getByLabel('IP地址', { exact: true }).fill('192.0.2.1')
  await page.getByLabel('端口', { exact: true }).fill('80')
  await dialog.getByRole('button', { name: '开启', exact: true }).click()
  await expect(page.getByText('捕获资源不足', { exact: true })).toBeVisible()
  await expect(dialog.getByText('标记状态：未启动')).toBeVisible()
  await dialog.getByRole('button', { name: '开启', exact: true }).click()
  await expect(dialog.getByText('标记状态：已启动')).toBeVisible()
  expect(commands).toEqual([
    {
      pcap_size: '8',
      pcap_filter: { proto: 'tcp', host: '192.0.2.1', port: '80' },
    },
    {
      pcap_size: '8',
      pcap_filter: { proto: 'tcp', host: '192.0.2.1', port: '80' },
    },
  ])
  await dialog.getByRole('button', { name: '停止', exact: true }).click()
  await expect(dialog.getByText('标记状态：未启动')).toBeVisible()
  const queries: string[] = []
  await page.route(
    '**/api/front/topo/topo-one/edge/501/capture_pcap_list/?*',
    (route) => {
      queries.push(new URL(route.request().url()).search)
      return route.fulfill({
        json: new URL(route.request().url()).searchParams.get('search')
          ? {
              count: 1,
              results: [
                { name: 'link.pcap', size: '1M', created_time: '2026-10-23' },
              ],
            }
          : { count: 0, results: [] },
      })
    },
  )
  await dialog.getByRole('button', { name: '流量记录', exact: true }).click()
  await expect(dialog.getByText('暂无流量记录', { exact: true })).toBeVisible()
  await dialog.getByLabel('搜索流量记录').fill('link')
  await expect.poll(() => queries.at(-1)).toBe('?page=1&size=5&search=link')
  await expect(dialog.getByText('link.pcap', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '文件大小', exact: true }).click()
  await expect
    .poll(() => queries.at(-1))
    .toBe('?page=1&size=5&search=link&ordering=size')
  await dialog.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('刷新成功', { exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})

test('实验流量监控保留标记、PCAP记录的独立分页和操作', async ({
  page,
}, testInfo) => {
  const state = await mount(page)
  await page.route('**/api/front/topo/topo-one/capture_situation/?*', (route) =>
    route.fulfill({
      json: {
        count: 6,
        results: [
          {
            id: 1,
            topo_line: 501,
            mark_path: ['设备a', '设备b'],
            pcap_size: 5,
            pcap_filter: { proto: 'tcp', host: '', port: '' },
            create_time: '2026-10-23 10:00',
            duration_time: '00:05',
            status: 2,
          },
        ],
      },
    }),
  )
  await page.route('**/api/front/topo/topo-one/capture_pcap_list/?*', (route) =>
    route.fulfill({
      json: {
        count: 6,
        results: [
          {
            name: 'sample.pcap',
            size: '12M',
            created_time: '2026-10-23 10:01',
            mark_path: '设备a、设备b',
            detail: '/pcap-detail/sample',
          },
        ],
      },
    }),
  )
  await page.getByRole('link', { name: '流量监控', exact: true }).click()
  await expect(page.getByRole('table', { name: '流量标记节点' })).toContainText(
    '已启动',
  )
  const records = page.getByRole('table', { name: '流量记录' })
  await expect(records).toContainText('sample.pcap')
  await expect(records.getByRole('link', { name: '下载' })).toHaveAttribute(
    'href',
    '/api/front/topo/capture_pcap_download/sample.pcap',
  )
  await page.screenshot({ path: testInfo.outputPath('capture-monitor.png') })
  const popup = page.waitForEvent('popup')
  await records.getByRole('button', { name: '详情', exact: true }).click()
  await expect(await popup).toHaveURL(/\/pcap-detail\/sample/)
  await page.getByRole('button', { name: '停止', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect
    .poll(() => state.writes.at(-1)?.path)
    .toBe('/api/front/topo/topo-one/edge/501/stop_capture_pcap/')
  const deleted: unknown[] = []
  let cleared = false
  await page.route('**/api/front/topo/capture_pcap_delete/', (route) => {
    deleted.push(route.request().postDataJSON())
    return route.fulfill({ json: { status: 1 } })
  })
  await page.route('**/api/front/topo/topo-one/all_pcap_delete/', (route) => {
    cleared = route.request().method() === 'DELETE'
    return route.fulfill({ json: { status: 1 } })
  })
  const recordArea = page.getByRole('region', { name: '流量记录区域' })
  const recordPage = recordArea.getByRole('navigation', { name: '列表分页' })
  await recordPage.getByRole('button', { name: '下一页' }).click()
  await expect(recordPage).toContainText('第 2 / 2 页')
  await expect(
    page.getByRole('navigation', { name: '列表分页' }).first(),
  ).toContainText('第 1 / 2 页')
  await recordArea.getByLabel('搜索流量记录').fill('sample')
  await expect(recordPage).toContainText('第 1 / 2 页')
  await recordArea.getByLabel('选择 sample.pcap', { exact: true }).check()
  await recordArea
    .getByRole('button', { name: '批量删除', exact: true })
    .click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => deleted).toEqual([{ file_list: ['sample.pcap'] }])
  await expect(
    recordArea.getByRole('button', { name: '批量删除', exact: true }),
  ).toBeDisabled()
  await recordArea.getByRole('button', { name: '全部清空' }).click()
  await page.getByRole('button', { name: '确认', exact: true }).click()
  await expect.poll(() => cleared).toBe(true)
  expect(state.errors).toEqual([])
})

test('切换实验取消旧记录读取，错误和空记录各自展示', async ({ page }) => {
  const state = await mount(page)
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/front/topo/*/capture_situation/?*', (route) =>
    route.fulfill({ json: { count: 0, results: [] } }),
  )
  await page.route(
    '**/api/front/topo/topo-one/capture_pcap_list/?*',
    async (route) => {
      await held
      await route
        .fulfill({
          json: {
            count: 1,
            results: [
              { name: 'old.pcap', size: '1M', created_time: '2026-10-23' },
            ],
          },
        })
        .catch(() => {})
    },
  )
  let fail = true
  await page.route(
    '**/api/front/topo/topo-two/capture_pcap_list/?*',
    (route) =>
      fail
        ? route.fulfill({ status: 500, json: { error: '记录服务异常' } })
        : route.fulfill({ json: { count: 0, results: [] } }),
  )
  await page.getByRole('link', { name: '流量监控', exact: true }).click()
  await expect(
    page.getByText('正在加载流量记录…', { exact: true }),
  ).toBeVisible()
  await page.goto('/#/basic/user/bench/experiment/two/flow')
  await expect(
    page.getByText('流量记录读取失败：记录服务异常', { exact: true }),
  ).toBeVisible()
  release()
  await expect(page.getByText('old.pcap', { exact: true })).toHaveCount(0)
  fail = false
  await page.reload()
  await expect(page.getByText('暂无流量记录', { exact: true })).toBeVisible()
  await expect(page.getByText('暂无流量标记', { exact: true })).toBeVisible()
  expect(state.errors).toEqual([])
})
