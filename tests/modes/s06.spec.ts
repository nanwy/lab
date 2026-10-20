import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'

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
