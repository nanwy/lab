import { expect, test as base, type Page } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
import { readFile } from 'node:fs/promises'

const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

async function setup(page: Page, cells: Array<Record<string, unknown>>) {
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: [] }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 'visual',
        username: '隔离学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.route(
    '**/api/front/simulation/experiment/visual/?more=1',
    (route) =>
      route.fulfill({
        json: {
          id: 'visual',
          name: '视觉回归',
          desc: '',
          node_count: 2,
          user_name: '隔离学员',
          tags: [],
          overview: null,
          release_type: 2,
          max_duration: 2,
          tags_category: null,
          topo_id: 'visual',
        },
      }),
  )
  let stored = { cells }
  await page.route('**/api/front/topo/visual/draw/?task_type=6', (route) => {
    if (route.request().method() !== 'GET') {
      stored = route.request().postDataJSON().topo
      return route.fulfill({ json: { status: 1 } })
    }
    return route.fulfill({ json: stored })
  })
  await page.goto('/#/basic/user/bench/experiment/visual/scene')
  await expect(
    page.getByRole('button', { name: '保存拓扑', exact: true }),
  ).toBeVisible()
  await expect(page).toHaveTitle('网络安全攻防训练平台')
  await expect(page).toHaveURL(/experiment\/visual\/scene/)
  await expect(page.locator('vite-error-overlay')).toHaveCount(0)
}

const nodes = () => [
  {
    id: 'a',
    shape: 'custom-react-node',
    position: { x: 80, y: 100 },
    size: { width: 80, height: 80 },
    ports: { items: [{ id: 'p', group: 'right' }] },
    data: {
      name: '甲',
      data_id: 1,
      nodeInfo: { id: 1, config_info: { ports: [{ nic_type: 'eth' }] } },
    },
  },
  {
    id: 'b',
    shape: 'custom-react-node',
    position: { x: 420, y: 320 },
    size: { width: 80, height: 80 },
    ports: { items: [{ id: 'p', group: 'left' }] },
    data: {
      name: '乙',
      data_id: 2,
      nodeInfo: { id: 2, config_info: { ports: [{ nic_type: 'eth' }] } },
    },
  },
]

async function expectLabelsOnPath(page: Page) {
  await expect
    .poll(() =>
      page.locator('.react-flow__edge').evaluateAll((edges) =>
        Math.max(
          ...edges.flatMap((edge) => {
            const path = edge.querySelector<SVGPathElement>(
              '.react-flow__edge-path',
            )!
            return Array.from(
              edge.querySelectorAll('.react-flow__edge-textwrapper'),
            ).map((label, index) => {
              const point = path.getPointAtLength(
                path.getTotalLength() * [0.2, 0.8][index]!,
              )
              const expected = new DOMPoint(point.x, point.y).matrixTransform(
                path.getScreenCTM()!,
              )
              const background = label
                .querySelector('rect')!
                .getBoundingClientRect()
              return Math.hypot(
                background.x + background.width / 2 - expected.x,
                background.y + background.height / 2 - expected.y,
              )
            })
          }),
        ),
      ),
    )
    .toBeLessThan(2)
}

for (const route of ['normal', 'orth', 'vertices']) {
  test(`网卡标签沿实际${route}路径并随移动缩放保存重开`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await setup(page, [
      ...nodes(),
      {
        id: 'line',
        shape: 'edge',
        source: { cell: 'a', port: 'p' },
        target: { cell: 'b', port: 'p' },
        router: { name: route === 'orth' ? 'orth' : 'normal' },
        ...(route === 'vertices'
          ? {
              vertices: [
                { x: 180, y: 480 },
                { x: 380, y: 180 },
              ],
            }
          : {}),
        labels: [0.2, 0.8].map((position) => ({
          position,
          attrs: { label: { text: 'eth0' } },
        })),
      },
    ])
    await expect(page.locator('.react-flow__edge-text')).toHaveCount(2)
    await expectLabelsOnPath(page)
    const node = page.locator('.react-flow__node[data-id="a"]')
    const box = await node.boundingBox()
    await page.mouse.move(box!.x + 30, box!.y + 30)
    await page.mouse.down()
    await page.mouse.move(box!.x + 85, box!.y + 60, { steps: 5 })
    await page.mouse.up()
    const beforeRotation = await page
      .locator('.react-flow__edge-path')
      .getAttribute('d')
    const rotate = await page
      .getByRole('button', { name: '旋转 甲', exact: true })
      .boundingBox()
    await page.mouse.move(
      rotate!.x + rotate!.width / 2,
      rotate!.y + rotate!.height / 2,
    )
    await page.mouse.down()
    await page.mouse.move(rotate!.x + rotate!.width / 2, rotate!.y + 65, {
      steps: 5,
    })
    await page.mouse.up()
    await expect(page.locator('.react-flow__edge-path')).not.toHaveAttribute(
      'd',
      beforeRotation!,
    )
    await expectLabelsOnPath(page)
    await page.getByRole('button', { name: '放大拓扑', exact: true }).click()
    await expectLabelsOnPath(page)
    const canvas = await page
      .getByLabel('场景拓扑画布', { exact: true })
      .boundingBox()
    const beforePan = await page
      .locator('.react-flow__viewport')
      .getAttribute('style')
    await page.keyboard.down('Control')
    await page.mouse.move(canvas!.x + 20, canvas!.y + 20)
    await page.mouse.down()
    await page.mouse.move(canvas!.x + 65, canvas!.y + 50, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Control')
    await expect(page.locator('.react-flow__viewport')).not.toHaveAttribute(
      'style',
      beforePan!,
    )
    await expectLabelsOnPath(page)
    await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
    await expect(page.getByText('所有修改已保存')).toBeVisible()
    await page.reload()
    await expect(page.locator('.react-flow__edge-text')).toHaveCount(2)
    await expectLabelsOnPath(page)
    await page.screenshot({
      path: testInfo.outputPath(`${route}.png`),
      fullPage: true,
    })
    expect(errors).toEqual([])
  })
}

test('已保存自定义线路颜色粗细虚线与ant-line动画实际渲染', async ({ page }) => {
  await setup(page, [
    ...nodes(),
    {
      id: 'custom',
      shape: 'edge',
      source: { cell: 'a', port: 'p' },
      target: { cell: 'b', port: 'p' },
      attrs: {
        line: {
          stroke: '#d42861',
          strokeWidth: 4,
          strokeDasharray: '9 3',
          style: { animation: 'ant-line 2s infinite linear' },
        },
      },
    },
  ])
  const path = page.locator('.react-flow__edge-path')
  await expect(path).toHaveCSS('stroke', 'rgb(212, 40, 97)')
  await expect(path).toHaveCSS('stroke-width', '4px')
  await expect(path).toHaveCSS('stroke-dasharray', '9px, 3px')
  await expect(path).toHaveCSS('animation-name', 'ant-line')
  const offset = await path.evaluate(
    (node) => getComputedStyle(node).strokeDashoffset,
  )
  await expect
    .poll(() =>
      path.evaluate((node) => getComputedStyle(node).strokeDashoffset),
    )
    .not.toBe(offset)
  expect(
    await path.evaluate((node) =>
      node.getAnimations().map((animation) => animation.playState),
    ),
  ).toEqual(['running'])
  await page.locator('.react-flow__node[data-id="a"]').click()
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await page.reload()
  await expect(path).toHaveCSS('stroke', 'rgb(212, 40, 97)')
  await expect(path).toHaveCSS('stroke-width', '4px')
  await expect(path).toHaveCSS('stroke-dasharray', '9px, 3px')
  await expect(path).toHaveCSS('animation-name', 'ant-line')
})

test('新业务链路默认蓝色虚线流动并随HTTP保存重开及高清导出', async ({
  page,
}, testInfo) => {
  const devices = nodes().map((node) => ({
    ...node,
    data: {
      ...node.data,
      logo:
        'data:image/svg+xml;base64,' +
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#00aa00"/></svg>',
        ).toString('base64'),
    },
  }))
  await setup(page, devices)
  await page.route('**/api/front/topo/visual/edge/', (route) =>
    route.fulfill({ json: { id: 80 } }),
  )
  await page.locator('.react-flow__node[data-id="a"]').click()
  await page.getByRole('button', { name: '连接设备', exact: true }).click()
  await page.getByLabel('目标设备', { exact: true }).selectOption('b')
  await page.getByLabel('源网卡', { exact: true }).selectOption('0')
  await page.getByLabel('目标网卡', { exact: true }).selectOption('0')
  await page.getByLabel('线路类型', { exact: true }).selectOption('orth')
  await page.getByRole('button', { name: '创建链路', exact: true }).click()
  const path = page.locator('.react-flow__edge-path')
  await expect(path).toHaveCSS('stroke', 'rgb(24, 144, 255)')
  await expect(path).toHaveCSS('stroke-dasharray', '5px')
  await expect(path).toHaveCSS('animation-name', 'ant-line')
  await expect(path).toHaveCSS('animation-duration', '30s')
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await page.reload()
  await expect(path).toHaveCSS('stroke', 'rgb(24, 144, 255)')
  await expect(path).toHaveCSS('stroke-dasharray', '5px')
  await expect(path).toHaveCSS('animation-name', 'ant-line')
  const offset = await path.evaluate(
    (node) => getComputedStyle(node).strokeDashoffset,
  )
  await expect
    .poll(() =>
      path.evaluate((node) => getComputedStyle(node).strokeDashoffset),
    )
    .not.toBe(offset)
  await expectLabelsOnPath(page)
  const bounds = await page
    .locator('.react-flow__edge-textbg')
    .evaluateAll((labels) =>
      labels.map((label) => {
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
      }),
    )
  for (const format of ['PNG', 'SVG']) {
    const downloadPromise = page.waitForEvent('download')
    await page
      .getByRole('button', { name: `导出${format}`, exact: true })
      .click()
    const download = await downloadPromise
    const file = testInfo.outputPath(`visual.${format.toLowerCase()}`)
    await download.saveAs(file)
    const bytes = await readFile(file)
    const pixels = await page.evaluate(
      async ({ url, bounds, scale }) => {
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
        let blue = 0,
          green = 0
        for (let i = 0; i < data.length; i += 4) {
          if (
            data[i]! < 50 &&
            data[i + 1]! > 110 &&
            data[i + 1]! < 180 &&
            data[i + 2]! > 230
          )
            blue++
          if (
            data[i]! < 30 &&
            data[i + 1]! > 140 &&
            data[i + 1]! < 200 &&
            data[i + 2]! < 30
          )
            green++
        }
        const labels = bounds.map((label) => {
          let white = 0,
            dark = 0
          for (
            let y = Math.ceil((label.y + 1) * scale);
            y < (label.y + label.height - 1) * scale;
            y++
          )
            for (
              let x = Math.ceil((label.x + 1) * scale);
              x < (label.x + label.width - 1) * scale;
              x++
            ) {
              const i = (y * canvas.width + x) * 4
              if (data[i]! > 240 && data[i + 1]! > 240 && data[i + 2]! > 240)
                white++
              if (data[i]! < 120 && data[i + 1]! < 120 && data[i + 2]! < 120)
                dark++
            }
          return { white, dark }
        })
        return {
          width: canvas.width,
          height: canvas.height,
          blue,
          green,
          labels,
        }
      },
      {
        url: `data:image/${format === 'PNG' ? 'png' : 'svg+xml'};base64,${bytes.toString('base64')}`,
        bounds,
        scale: format === 'PNG' ? 3 : 1,
      },
    )
    const scale = format === 'PNG' ? 3 : 1
    expect(pixels.width).toBe(bounds[0]!.canvasWidth * scale)
    expect(pixels.height).toBe(bounds[0]!.canvasHeight * scale)
    expect(pixels.blue).toBeGreaterThan(80 * scale)
    expect(pixels.green).toBeGreaterThan(100 * scale)
    for (const label of pixels.labels) {
      expect(label.white).toBeGreaterThan(100 * scale)
      expect(label.dark).toBeGreaterThan(5 * scale)
    }
  }
  await page.screenshot({
    path: testInfo.outputPath('default-orth-export.png'),
    fullPage: true,
  })
})
