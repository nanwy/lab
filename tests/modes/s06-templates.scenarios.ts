import { expect, test as base, type Page } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
import { readFile } from 'node:fs/promises'

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

async function setup(page: Page) {
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
  await page.route('**/api/front/simulation/experiment/one/?more=1', (route) =>
    route.fulfill({
      json: {
        id: 'one',
        name: '实验one',
        desc: '',
        node_count: 1,
        user_name: '隔离学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: null,
        topo_id: 'topo-one',
      },
    }),
  )
  await page.route('**/api/front/node/last_operat/**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/template/?*', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/template/define/', (route) =>
    route.fulfill({
      json: {
        '1': {
          properties: {
            base_info: {
              type: 'object',
              properties: { name: { type: 'string', description: '设备名称' } },
            },
          },
        },
      },
    }),
  )
}

const nodeInfo = {
  id: 91,
  name: '原设备',
  engin: 1,
  device_id: 'device-one',
  logo: '/topology/person.svg',
  extension: { preserved: true },
  config_info: {
    node_id: 'device-one',
    base_info: { name: '原设备' },
    ports: [{ nic_type: 'eth' }],
    extension: { preserved: true },
  },
}
const initial = () => ({
  lock: false,
  cells: [
    {
      id: 'device-one',
      shape: 'custom-react-node',
      position: { x: 100, y: 100 },
      size: { width: 80, height: 80 },
      data: {
        name: '原设备',
        logo: '/topology/person.svg',
        data_id: 91,
        nodeInfo: structuredClone(nodeInfo),
      },
      ports: { items: [{ id: 'p', group: 'right' }] },
    },
  ],
})

test('节点模板保存失败保留编辑，重试不重复PATCH，复用新ID并保存重开', async ({
  page,
}) => {
  await setup(page)
  let stored: unknown = initial()
  let personal: Array<Record<string, unknown>> = []
  let patchCount = 0,
    templateCount = 0
  let templateBody: Record<string, unknown> | undefined
  let created: Record<string, unknown> | undefined
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: personal }),
  )
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) => {
    if (route.request().method() === 'POST')
      stored = route.request().postDataJSON().topo
    return route.fulfill({
      json: route.request().method() === 'GET' ? stored : true,
    })
  })
  await page.route('**/api/front/topo/topo-one/node/device-one/', (route) => {
    patchCount++
    return route.fulfill({
      json: { ...route.request().postDataJSON(), id: 91 },
    })
  })
  await page.route('**/api/front/node/template/', (route) => {
    templateCount++
    templateBody = route.request().postDataJSON()
    if (templateCount === 1)
      return route.fulfill({ status: 500, json: { error: '模板创建失败' } })
    personal = [{ ...templateBody, id: 707 }]
    return route.fulfill({ json: personal[0] })
  })
  await page.route('**/api/front/topo/topo-one/node/', (route) => {
    created = route.request().postDataJSON()
    return route.fulfill({ json: { ...created, id: 92 } })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await page.locator('.react-flow__node').dblclick()
  await page.getByLabel('设备名称', { exact: true }).fill('可复用设备')
  await page
    .getByRole('button', { name: '保存并设为模板', exact: true })
    .click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '模板创建失败' }),
  ).toBeVisible()
  await expect(page.getByLabel('设备名称', { exact: true })).toHaveValue(
    '可复用设备',
  )
  expect(patchCount).toBe(1)
  expect(templateCount).toBe(1)
  await page
    .getByRole('button', { name: '保存并设为模板', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(patchCount).toBe(1)
  expect(templateCount).toBe(2)
  expect(templateBody).toEqual({
    ...nodeInfo,
    name: '可复用设备',
    config_info: { ...nodeInfo.config_info, base_info: { name: '可复用设备' } },
  })
  const resource = page
    .getByRole('complementary', { name: '设备资源' })
    .getByRole('button', { name: '可复用设备', exact: true })
  await resource.dragTo(page.locator('.react-flow__pane'), {
    targetPosition: { x: 300, y: 220 },
  })
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  expect(created?.device_id).not.toBe('device-one')
  expect(created?.config_info).toMatchObject({
    node_id: created?.device_id,
    extension: { preserved: true },
  })
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await page.reload()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  await expect(
    page.locator('.react-flow__node').filter({ hasText: '可复用设备' }),
  ).toHaveCount(2)
})

test('删除我的节点失败保留资源，明确重试后刷新，不删除画布实例', async ({
  page,
}) => {
  await setup(page)
  let personal = [{ ...nodeInfo, id: 707 }]
  let attempts = 0
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({ json: initial() }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: personal }),
  )
  await page.route('**/api/front/node/list/', (route) => {
    expect(route.request().method()).toBe('DELETE')
    expect(route.request().postDataJSON()).toEqual({ id_list: [707] })
    if (++attempts === 1)
      return route.fulfill({ json: { status: 0, message: '模板删除失败' } })
    personal = []
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const remove = page.getByRole('button', {
    name: '删除我的节点 原设备',
    exact: true,
  })
  await remove.click()
  await expect(
    page.getByRole('alert').filter({ hasText: '删除失败' }),
  ).toBeVisible()
  await expect(remove).toBeEnabled()
  expect(attempts).toBe(1)
  await remove.click()
  await expect(remove).toHaveCount(0)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  expect(attempts).toBe(2)
})

test('PNG与SVG导出实际画布DOM，产物含图标与连线像素，空图明确提示', async ({
  page,
}, testInfo) => {
  await setup(page)
  const graph = initial()
  graph.cells[0]!.data.logo =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#00aa00"/></svg>',
    ).toString('base64')
  const second = structuredClone(graph.cells[0]!)
  second.id = 'device-two'
  second.position.x = 350
  second.data.name = '第二设备'
  second.ports.items[0]!.group = 'left'
  const cells: Array<Record<string, unknown>> = [
    ...graph.cells,
    second,
    {
      id: 'edge-one',
      shape: 'edge',
      source: { cell: 'device-one', port: 'p' },
      target: { cell: 'device-two', port: 'p' },
      attrs: { line: { stroke: '#ff0000', strokeWidth: 4 } },
      labels: [{ position: 0.5, attrs: { label: { text: 'eth0' } } }],
    },
  ]
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({ json: { cells } }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: [] }),
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(page.locator('.react-flow__edge-path')).toHaveAttribute(
    'd',
    'M 180 140 L 350 140',
  )
  const labelBounds = await page
    .locator('.react-flow__edge-textbg')
    .evaluate((label) => {
      const rect = label.getBoundingClientRect()
      const canvas = label
        .closest('[aria-label="场景拓扑画布"]')!
        .getBoundingClientRect()
      return {
        x: rect.x - canvas.x,
        y: rect.y - canvas.y,
        width: rect.width,
        height: rect.height,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      }
    })
  const dimensions: Array<{ width: number; height: number }> = []
  for (const format of ['PNG', 'SVG']) {
    const downloaded = page.waitForEvent('download')
    await page
      .getByRole('button', { name: `导出${format}`, exact: true })
      .click()
    const download = await downloaded
    expect(download.suggestedFilename()).toBe(`拓扑.${format.toLowerCase()}`)
    const path = testInfo.outputPath(download.suggestedFilename())
    await download.saveAs(path)
    const bytes = await readFile(path)
    const dataUrl = `data:image/${format === 'PNG' ? 'png' : 'svg+xml'};base64,${bytes.toString('base64')}`
    const pixels = await page.evaluate(
      async ({ url, labelBounds, scale }) => {
        const image = new Image()
        image.src = url
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const data = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height,
        ).data
        let green = 0,
          red = 0
        for (let index = 0; index < data.length; index += 4) {
          if (
            data[index]! < 30 &&
            data[index + 1]! > 140 &&
            data[index + 1]! < 200 &&
            data[index + 2]! < 30
          )
            green++
          if (
            data[index]! > 220 &&
            data[index + 1]! < 30 &&
            data[index + 2]! < 30
          )
            red++
        }
        let labelWhite = 0
        for (
          let y = Math.ceil((labelBounds.y + 2) * scale);
          y < (labelBounds.y + labelBounds.height - 2) * scale;
          y++
        )
          for (
            let x = Math.ceil((labelBounds.x + 2) * scale);
            x < (labelBounds.x + labelBounds.width - 2) * scale;
            x++
          ) {
            const index = (y * canvas.width + x) * 4
            if (
              data[index]! > 240 &&
              data[index + 1]! > 240 &&
              data[index + 2]! > 240
            )
              labelWhite++
          }
        return {
          width: canvas.width,
          height: canvas.height,
          green,
          red,
          labelWhite,
        }
      },
      { url: dataUrl, labelBounds, scale: format === 'PNG' ? 3 : 1 },
    )
    dimensions.push({ width: pixels.width, height: pixels.height })
    const resolution = format === 'PNG' ? 3 : 1
    expect(pixels.width).toBe(labelBounds.canvasWidth * resolution)
    expect(pixels.height).toBe(labelBounds.canvasHeight * resolution)
    expect(pixels.width).toBeGreaterThan(450)
    expect(pixels.height).toBeGreaterThan(400)
    expect(pixels.green).toBeGreaterThan(100)
    expect(pixels.red).toBeGreaterThan(100)
    expect(pixels.labelWhite).toBeGreaterThan(100)
    if (format === 'SVG') {
      expect(bytes.toString()).toContain('foreignObject')
      expect(bytes.toString()).toContain('react-flow__edge-path')
      expect(bytes.toString()).toContain('第二设备')
    }
  }
  expect(dimensions[0]).toEqual({
    width: dimensions[1]!.width * 3,
    height: dimensions[1]!.height * 3,
  })
  await page.screenshot({ path: testInfo.outputPath('canvas-export.png') })
  expect(errors).toEqual([])
  cells.length = 0
  await page.reload()
  await page.getByRole('button', { name: '导出PNG', exact: true }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '请绘制拓扑图' }),
  ).toBeVisible()
})

test('窄窗口画布不会被资源面板挤成零宽，SVG保留实际可见区域', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await setup(page)
  const graph = initial()
  graph.cells[0]!.data.logo =
    'data:image/svg+xml;base64,' +
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#00aa00"/></svg>',
    ).toString('base64')
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({ json: graph }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const canvas = page.getByLabel('场景拓扑画布', { exact: true })
  for (const viewportWidth of [360, 1280]) {
    await page.setViewportSize({ width: viewportWidth, height: 900 })
    if (viewportWidth === 1280)
      await page
        .getByLabel('实验场景拓扑', { exact: true })
        .evaluate((element) => {
          element.style.maxWidth = '320px'
        })
    await expect
      .poll(async () => (await canvas.boundingBox())?.width ?? 0)
      .toBeGreaterThan(200)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '导出SVG', exact: true }).click(),
    ])
    const file = testInfo.outputPath(`narrow-${viewportWidth}.svg`)
    await download.saveAs(file)
    const source = await readFile(file, 'utf8')
    const width = Number(source.match(/^<svg[^>]*width="([^"]+)"/)?.[1])
    expect(width).toBeGreaterThan(200)
    expect(source).toContain('原设备')
    const green = await page.evaluate(async (source) => {
      const image = new Image()
      image.src =
        'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(source)
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data
      let green = 0
      for (let index = 0; index < pixels.length; index += 4)
        if (
          pixels[index]! < 30 &&
          pixels[index + 1]! > 140 &&
          pixels[index + 2]! < 30
        )
          green++
      return green
    }, source)
    expect(green).toBeGreaterThan(100)
    await page.screenshot({
      path: testInfo.outputPath(`narrow-canvas-${viewportWidth}.png`),
      fullPage: true,
    })
  }
  let downloads = 0
  page.on('download', () => downloads++)
  await canvas.evaluate((element) => {
    element.style.width = '0px'
  })
  await page.getByRole('button', { name: '导出SVG', exact: true }).click()
  await expect(
    page.getByText('画布导出失败：画布当前不可见，请展开画布后重试。', {
      exact: true,
    }),
  ).toBeVisible()
  expect(downloads).toBe(0)
})

test('图片跨域和字体失败阻止不完整产物，恢复资源后可重新导出且设计保留', async ({
  page,
}) => {
  await setup(page)
  const graph = initial()
  graph.cells[0]!.data.logo = 'https://assets.example.test/node.svg'
  let allowCors = false,
    downloads = 0
  page.on('download', () => downloads++)
  await page.route('https://assets.example.test/node.svg*', (route) => {
    if (!allowCors && route.request().resourceType() === 'fetch')
      return route.abort('failed')
    return route.fulfill({
      contentType: 'image/svg+xml',
      headers: allowCors ? { 'Access-Control-Allow-Origin': '*' } : {},
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="green"/></svg>',
    })
  })
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({ json: graph }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(page.locator('.react-flow__node img')).toBeVisible()
  await page.getByRole('button', { name: '导出SVG', exact: true }).click()
  await expect(
    page
      .locator('[data-sonner-toast]')
      .filter({ hasText: '画布导出失败：图标读取或解码失败' }),
  ).toBeVisible()
  expect(downloads).toBe(0)
  allowCors = true
  await page.getByRole('button', { name: '导出SVG', exact: true }).click()
  await expect.poll(() => downloads).toBe(1)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.route('**/broken-font.woff2*', (route) =>
    route.fulfill({ status: 500, body: '' }),
  )
  const stylesheet = await page.addStyleTag({
    content:
      '@font-face { font-family: BrokenExport; src: url("/broken-font.woff2") format("woff2"); } .react-flow__node { font-family: BrokenExport; }',
  })
  await page.evaluate(() =>
    document.fonts.load('16px BrokenExport').catch(() => {}),
  )
  await page.getByRole('button', { name: '导出PNG', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '导出PNG', exact: true }),
  ).toBeEnabled()
  await expect(
    page
      .locator('[data-sonner-toast]')
      .filter({ hasText: '画布导出失败：字体加载失败' }),
  ).toBeVisible()
  expect(downloads).toBe(1)
  await stylesheet.evaluate((element) => element.remove())
  await page.getByRole('button', { name: '导出PNG', exact: true }).click()
  await expect.poll(() => downloads).toBe(2)
  await expect(page.getByText('所有修改已保存')).toBeVisible()
})

test('节点保存失败不创建模板，资源刷新失败仅重读，锁图禁模板写入', async ({
  page,
}) => {
  await setup(page)
  let locked = false,
    failPatch = true,
    failList = false
  let patches = 0,
    templates = 0
  let personal: Array<Record<string, unknown>> = []
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({ json: { ...initial(), lock: locked } }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) => {
    if (failList) {
      failList = false
      return route.fulfill({ status: 500, json: {} })
    }
    return route.fulfill({ json: personal })
  })
  await page.route('**/api/front/topo/topo-one/node/device-one/', (route) => {
    patches++
    if (failPatch) {
      failPatch = false
      return route.fulfill({ status: 500, json: { error: '节点保存失败' } })
    }
    return route.fulfill({ json: { id: 91 } })
  })
  await page.route('**/api/front/node/template/', (route) => {
    templates++
    personal = [{ ...route.request().postDataJSON(), id: 707 }]
    failList = true
    return route.fulfill({ json: { id: 707 } })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  await expect(
    page.getByRole('button', { name: '人员', exact: true }),
  ).toBeVisible()
  await page.locator('.react-flow__node').dblclick()
  await page.getByLabel('设备名称', { exact: true }).fill('保存失败草稿')
  await page
    .getByRole('button', { name: '保存并设为模板', exact: true })
    .click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '节点保存失败' }),
  ).toBeVisible()
  expect(templates).toBe(0)
  await expect(page.getByLabel('设备名称', { exact: true })).toHaveValue(
    '保存失败草稿',
  )
  await page
    .getByRole('button', { name: '保存并设为模板', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '重试设备资源', exact: true }).click()
  await expect(
    page
      .getByRole('complementary', { name: '设备资源' })
      .getByRole('button', { name: '保存失败草稿', exact: true }),
  ).toBeVisible()
  expect(patches).toBe(2)
  expect(templates).toBe(1)
  locked = true
  page.once('dialog', (dialog) => dialog.accept())
  await page.reload()
  await expect(page.getByText('拓扑已锁定，仅可查看')).toBeVisible()
  await expect(
    page.getByRole('complementary', { name: '设备资源' }),
  ).toHaveCount(0)
  await page.locator('.react-flow__node').dblclick()
  await expect(
    page.getByRole('button', { name: '保存并设为模板', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '导出SVG', exact: true }),
  ).toBeEnabled()
  expect(patches).toBe(2)
  expect(templates).toBe(1)
})
