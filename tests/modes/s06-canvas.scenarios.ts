import { expect, test } from '@playwright/test'
import type { X6Graph } from '../../apps/web/src/topology/x6-adapter'

test('取消多选对象后Delete只删除仍被选中的对象', async ({ page }) => {
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({
      json: {
        cells: ['a', 'b'].map((id, i) => ({
          id,
          shape: 'custom-react-node',
          position: { x: 100 + 200 * i, y: 100 },
          data: { name: id, nodeType: 'base_element', nodeInfo: { type: 2 } },
        })),
      },
    }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const canvas = page.getByLabel('场景拓扑画布'),
    a = canvas.locator('[data-id="a"]'),
    b = canvas.locator('[data-id="b"]')
  await a.click()
  await b.click({ modifiers: ['Meta'] })
  await b.click({ modifiers: ['Meta'] })
  await expect(a).toHaveClass(/selected/)
  await expect(b).not.toHaveClass(/selected/)
  await page.keyboard.press('Delete')
  await expect(a).toHaveCount(0)
  await expect(b).toHaveCount(1)
})

test('文本尚未失焦时登记未保存状态，刷新会提示，失焦仍按原语义提交', async ({
  page,
}) => {
  let stored: X6Graph = {
    cells: [
      {
        id: 't',
        shape: 'custom-react-text',
        position: { x: 100, y: 100 },
        data: {
          name: '原文字',
          nodeType: 'base_element',
          nodeInfo: { type: 3 },
        },
      },
    ],
  }
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) => {
    if (route.request().method() === 'POST')
      stored = route.request().postDataJSON().topo
    return route.fulfill({ json: stored })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const text = page.getByRole('textbox', { name: '文本 原文字' })
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await text.fill('未失焦修改')
  await expect(page.getByText('有未保存的修改')).toBeVisible({ timeout: 1200 })
  let refreshWarned = false
  page.once('dialog', async (dialog) => {
    refreshWarned = dialog.type() === 'beforeunload'
    await dialog.dismiss()
  })
  await page.evaluate(() => window.location.reload())
  expect(refreshWarned).toBe(true)
  await expect(text).toHaveValue('未失焦修改')
  expect(stored.cells[0]!.data?.name).toBe('原文字')
  await text.blur()
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('textbox', { name: '文本 未失焦修改' }),
  ).toBeVisible()
})

test('基础元素连接无业务NIC的设备仍为纯图边且零业务请求', async ({ page }) => {
  const writes: string[] = []
  await page.route('**/api/front/topo/topo-one/**', (route) => {
    if (!route.request().url().includes('/draw/')) {
      writes.push(route.request().url())
      return route.fulfill({ json: {} })
    }
    return route.fulfill({
      json: {
        cells: [
          {
            id: 'base',
            shape: 'custom-react-node',
            position: { x: 100, y: 100 },
            ports: { items: [{ id: 'r', group: 'right' }] },
            data: {
              name: '人员',
              nodeType: 'base_element',
              nodeInfo: { type: 2 },
            },
          },
          {
            id: 'node',
            shape: 'custom-react-node',
            position: { x: 400, y: 150 },
            ports: { items: [{ id: 'l', group: 'left' }] },
            data: {
              name: '无网卡设备',
              data_id: 91,
              nodeType: 'node',
              nodeInfo: { id: 91, config_info: { ports: [] } },
            },
          },
        ],
      },
    })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const canvas = page.getByLabel('场景拓扑画布'),
    source = (await canvas
      .locator('[data-id="base"] [data-handleid="r"]')
      .boundingBox())!,
    target = (await canvas
      .locator('[data-id="node"] [data-handleid="l"]')
      .boundingBox())!
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 10 },
  )
  await page.mouse.up()
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(1, {
    timeout: 1200,
  })
  expect(writes).toEqual([])
})

test('框选旋转文字超出原矩形的可见区域仍能选中', async ({ page }) => {
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) =>
    route.fulfill({
      json: {
        cells: [
          {
            id: 'text',
            shape: 'custom-react-text',
            position: { x: 200, y: 200 },
            size: { width: 180, height: 80 },
            angle: 90,
            data: {
              name: '旋转文字',
              nodeType: 'base_element',
              nodeInfo: { type: 3 },
            },
          },
        ],
      },
    }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const node = page.getByLabel('场景拓扑画布').locator('[data-id="text"]')
  const outer = (await node.boundingBox())!,
    visual = (await node.locator('.topology-node').boundingBox())!
  await page.mouse.move(visual.x - 8, outer.y + outer.height + 8)
  await page.mouse.down()
  await page.mouse.move(
    visual.x + visual.width + 8,
    visual.y + visual.height - 4,
    { steps: 8 },
  )
  await page.mouse.up()
  await expect(node).toHaveClass(/selected/, { timeout: 1200 })
})

test('锁定专门保存当前快照，失败保留草稿，解锁后才能继续编辑', async ({
  page,
}) => {
  let stored: X6Graph = {
    lock: false,
    cells: [
      {
        id: 'a',
        shape: 'custom-react-node',
        position: { x: 100, y: 100 },
        data: {
          name: '锁定设备',
          nodeType: 'base_element',
          nodeInfo: { type: 2 },
        },
      },
    ],
  }
  let fail = true
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) => {
    if (route.request().method() === 'POST') {
      if (fail) {
        fail = false
        return route.fulfill({ status: 500, json: { error: '保存失败' } })
      }
      stored = route.request().postDataJSON().topo
    }
    return route.fulfill({ json: stored })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const node = page.getByLabel('场景拓扑画布').locator('[data-id="a"]')
  await node.click()
  await page.getByRole('button', { name: '锁定拓扑', exact: true }).click()
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '锁定拓扑', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: '锁定拓扑', exact: true }).click()
  await expect(page.getByText('拓扑已锁定，仅可查看')).toBeVisible()
  expect(stored.lock).toBe(true)
  await expect(
    page.getByRole('button', { name: '保存拓扑', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: '解锁拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(stored.lock).toBe(false)
  await node.click()
  await expect(
    page.getByRole('button', { name: '旋转 锁定设备' }),
  ).toBeVisible()
})

test('基础元素岗位可添加编辑删除，图元连线只保存图且锁定阻止全部编辑', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let stored: X6Graph = { lock: false, cells: [] }
  const businessWrites: string[] = []
  await page.route('**/api/front/node/last_operat/**', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/list/?nopage=0', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/node/template/?*', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/topo/topo-one/**', (route) => {
    if (!route.request().url().includes('/draw/')) {
      businessWrites.push(route.request().url())
      return route.fulfill({ json: {} })
    }
    if (route.request().method() === 'POST')
      stored = route.request().postDataJSON().topo
    return route.fulfill({ json: stored })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const canvas = page.getByLabel('场景拓扑画布')
  await page.getByRole('button', { name: '人员', exact: true }).click()
  await canvas.click({ position: { x: 160, y: 130 } })
  await page.getByRole('button', { name: '安全检测岗', exact: true }).click()
  await canvas.click({ position: { x: 410, y: 180 } })
  const people = canvas.locator('.react-flow__node-topologyNode')
  await expect(people).toHaveCount(2)
  await people.first().dblclick()
  await page.getByLabel('名称', { exact: true }).fill('')
  await page.getByRole('button', { name: '应用名称', exact: true }).click()
  await expect(page.getByText('请输入名称', { exact: true })).toBeVisible()
  await page.getByLabel('名称', { exact: true }).fill('参与人员')
  await page.getByRole('button', { name: '应用名称', exact: true }).click()
  const source = (await people
      .first()
      .locator('[data-handlepos="right"]')
      .boundingBox())!,
    target = (await people
      .last()
      .locator('[data-handlepos="left"]')
      .boundingBox())!
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 10 },
  )
  await page.mouse.up()
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(1)
  await canvas.locator('.react-flow__edge-interaction').dblclick()
  await page.getByLabel('线路类型').selectOption('orth')
  await page.getByRole('button', { name: '保存链路', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 1500 })
  await page.getByRole('button', { name: '区域', exact: true }).click()
  await canvas.click({ position: { x: 100, y: 300 } })
  const area = canvas.locator('.react-flow__node-topologyGroup')
  await area.dblclick({ position: { x: 15, y: 15 } })
  await page.getByLabel('名称', { exact: true }).fill('')
  await page.getByRole('button', { name: '应用名称', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(businessWrites).toEqual([])
  expect(
    stored.cells.find((cell) => cell.data?.name === '参与人员')?.data,
  ).toMatchObject({
    logo: '/topology/person.svg',
    nodeInfo: { logo: '/topology/person.svg' },
  })
  expect(
    stored.cells.find((cell) => cell.data?.name === '安全检测岗')?.data,
  ).toMatchObject({
    logo: '/topology/position.svg',
    nodeInfo: { logo: '/topology/position.svg' },
  })
  await page.screenshot({
    path: '/tmp/xueyuan-s06-notes.50KSb2/03-static-symbols.png',
    fullPage: true,
  })
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, {
    timeout: 6000,
  })
  expect(stored.cells.find((cell) => cell.shape === 'edge')).toMatchObject({
    router: { name: 'orth' },
    data: { nodeType: 'base_element' },
  })
  await page.getByRole('button', { name: '文本框', exact: true }).click()
  await canvas.click({ position: { x: 450, y: 300 } })
  await page.getByRole('textbox', { name: '文本 文本框' }).fill('临时说明')
  await page.getByRole('textbox', { name: '文本 文本框' }).blur()
  const text = canvas
    .locator('.react-flow__node')
    .filter({ has: page.getByRole('textbox', { name: '文本 临时说明' }) })
  await text.click({ button: 'right', position: { x: 5, y: 5 } })
  await expect(
    page.getByRole('menuitem', { name: '编辑', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await expect(text).toHaveCount(0)
  await people.first().click({ button: 'right', position: { x: 5, y: 5 } })
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  await expect(people).toHaveCount(1)
  await expect(canvas.locator('.react-flow__edge')).toHaveCount(0)
  await area.click({ button: 'right', position: { x: 15, y: 15 } })
  await page.getByRole('menuitem', { name: '解除分组', exact: true }).click()
  await expect(area).toHaveCount(0)
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  stored.lock = true
  await page.reload()
  await expect(page.getByText('拓扑已锁定，仅可查看')).toBeVisible()
  await people.first().click()
  await expect(page.getByRole('button', { name: /旋转|调整尺寸/ })).toHaveCount(
    0,
  )
  await expect(page.getByLabel('选中对象操作')).toHaveCount(0)
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await page.keyboard.press('Delete')
  await expect(people).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: '保存拓扑', exact: true }),
  ).toBeDisabled()
  expect(businessWrites).toEqual([])
  expect(errors).toEqual([])
})

test('复制粘贴设备创建新业务对象，保存重开不复用业务ID', async ({ page }) => {
  let stored: X6Graph = {
    cells: [
      {
        id: 'source',
        shape: 'custom-react-node',
        position: { x: 100, y: 100 },
        data: {
          name: '复制设备',
          data_id: 91,
          nodeType: 'node',
          nodeInfo: {
            id: 91,
            name: '复制设备',
            device_id: 'source',
            config_info: {
              node_id: 'source',
              base_info: { name: '复制设备' },
              ports: [{}],
            },
          },
        },
      },
    ],
  }
  const created: Record<string, unknown>[] = []
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) => {
    if (route.request().method() === 'POST')
      stored = route.request().postDataJSON().topo
    return route.fulfill({ json: stored })
  })
  await page.route('**/api/front/topo/topo-one/node/', (route) => {
    const body = route.request().postDataJSON()
    created.push(body)
    return route.fulfill({ json: { ...body, id: 100 + created.length } })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const canvas = page.getByLabel('场景拓扑画布')
  await canvas.locator('[data-id="source"]').click()
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+v')
  await expect(canvas.locator('.react-flow__node')).toHaveCount(2)
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  const copy = stored.cells.find((c) => c.id !== 'source')!
  expect(copy.data?.data_id).toBe(101)
  expect(copy.id).not.toBe('source')
  expect(copy.data?.nodeInfo).toMatchObject({
    device_id: copy.id,
    config_info: { node_id: copy.id },
  })
  expect(created).toHaveLength(1)
  await page.reload()
  await expect(canvas.locator('.react-flow__node')).toHaveCount(2)
})

test('画布多选分组移动与解组保存重开保持绝对坐标', async ({ page }) => {
  let stored = {
    lock: false,
    cells: [
      {
        id: 'person-a',
        shape: 'custom-react-node',
        position: { x: 100, y: 100 },
        size: { width: 80, height: 80 },
        data: {
          name: '人员甲',
          nodeType: 'base_element',
          nodeInfo: { type: 2 },
        },
        unknown: 'preserved',
      },
      {
        id: 'person-b',
        shape: 'custom-react-node',
        position: { x: 300, y: 100 },
        size: { width: 80, height: 80 },
        data: {
          name: '人员乙',
          nodeType: 'base_element',
          nodeInfo: { type: 2 },
        },
        unknown: 'preserved',
      },
    ],
  }
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) => {
    if (route.request().method() === 'POST')
      stored = route.request().postDataJSON().topo
    return route.fulfill({ json: stored })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const canvas = page.getByLabel('场景拓扑画布')
  await canvas.locator('[data-id="person-a"]').click()
  await canvas.locator('[data-id="person-b"]').click({ modifiers: ['Meta'] })
  await expect(canvas.locator('.react-flow__node.selected')).toHaveCount(2)
  await canvas.click({ position: { x: 20, y: 20 } })
  const first = (await canvas.locator('[data-id="person-a"]').boundingBox())!,
    last = (await canvas.locator('[data-id="person-b"]').boundingBox())!
  await page.mouse.move(first.x - 10, first.y - 10)
  await page.mouse.down()
  await page.mouse.move(last.x + last.width + 10, last.y + last.height + 10, {
    steps: 10,
  })
  await page.mouse.up()
  await expect(canvas.locator('.react-flow__node.selected')).toHaveCount(2)
  await page.getByRole('button', { name: '创建分组', exact: true }).click()
  await expect(canvas.locator('.react-flow__node-topologyGroup')).toHaveCount(1)
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(stored.cells.find((c) => c.id === 'person-a')).toMatchObject({
    position: { x: 100, y: 100 },
    unknown: 'preserved',
  })
  await page.reload()
  const group = canvas.locator('.react-flow__node-topologyGroup')
  await expect(group).toBeVisible()
  await group.click({ position: { x: 15, y: 15 } })
  await page.getByRole('button', { name: '解除分组', exact: true }).click()
  await expect(group).toHaveCount(0)
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  await page.reload()
  await expect(canvas.locator('[data-id="person-a"]')).toBeVisible()
  expect(stored.cells.find((c) => c.id === 'person-a')).not.toHaveProperty(
    'parent',
  )
  await canvas.focus()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await expect(canvas.locator('.react-flow__node')).toHaveCount(0)
})

test('旋转端口与连线端点一致，文本可编辑缩放，保存失败保留设计', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let stored: X6Graph = {
    cells: [
      {
        id: 'a',
        shape: 'custom-react-node',
        position: { x: 100, y: 100 },
        size: { width: 80, height: 80 },
        ports: { items: [{ id: 'a-right', group: 'right' }] },
        data: { name: '设备甲', data_id: 91, nodeInfo: { id: 91 } },
      },
      {
        id: 'b',
        shape: 'custom-react-node',
        position: { x: 400, y: 100 },
        ports: { items: [{ id: 'b-left', group: 'left' }] },
        data: { name: '设备乙', data_id: 92, nodeInfo: { id: 92 } },
      },
      {
        id: 't',
        shape: 'custom-react-text',
        position: { x: 100, y: 300 },
        size: { width: 180, height: 80 },
        data: { name: '注释', nodeType: 'base_element', nodeInfo: { type: 3 } },
      },
      {
        id: 'edge',
        shape: 'edge',
        source: { cell: 'a', port: 'a-right' },
        target: { cell: 'b', port: 'b-left' },
        data: { data_id: 93 },
      },
    ],
  }
  let fail = true
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) => {
    if (route.request().method() === 'POST') {
      if (fail) {
        fail = false
        return route.fulfill({ status: 500, json: { error: '保存失败' } })
      }
      stored = route.request().postDataJSON().topo
    }
    return route.fulfill({ json: stored })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const canvas = page.getByLabel('场景拓扑画布'),
    a = canvas.locator('[data-id="a"]')
  await a.click()
  await expect(
    page.getByRole('button', { name: '调整尺寸 设备甲' }),
  ).toHaveCount(0)
  const box = (await a.boundingBox())!,
    rotation = (await page
      .getByRole('button', { name: '旋转 设备甲' })
      .boundingBox())!
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2,
    sx = rotation.x + rotation.width / 2,
    sy = rotation.y + rotation.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(cx - (sy - cy), cy + (sx - cx), { steps: 8 })
  await page.mouse.up()
  const port = (await a.locator('[data-handleid="a-right"]').boundingBox())!
  expect(port.x + port.width / 2).toBeCloseTo(cx, 0)
  expect(port.y + port.height / 2).toBeCloseTo(box.y + box.height, 0)
  const start = await canvas
    .locator('[data-id="edge"] .react-flow__edge-path')
    .evaluate((path: SVGPathElement) => {
      const p = path.getPointAtLength(0)
      const m = path.getScreenCTM()!
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
    })
  expect(start.x).toBeCloseTo(port.x + port.width / 2, 0)
  expect(start.y).toBeCloseTo(port.y + port.height / 2, 0)
  await page.getByRole('textbox', { name: '文本 注释' }).fill('已修改说明')
  await page.getByRole('textbox', { name: '文本 注释' }).blur()
  const text = canvas.locator('[data-id="t"]')
  await text.click({ position: { x: 3, y: 3 } })
  const before = (await text.boundingBox())!,
    handle = (await page
      .getByRole('button', { name: '调整尺寸 已修改说明' })
      .boundingBox())!
  await page.mouse.move(
    handle.x + handle.width / 2,
    handle.y + handle.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    handle.x + handle.width / 2 + 30,
    handle.y + handle.height / 2 + 15,
    { steps: 6 },
  )
  await page.mouse.up()
  expect((await text.boundingBox())!.width).toBeGreaterThan(before.width + 40)
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('有未保存的修改')).toBeVisible()
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(stored.cells.find((c) => c.id === 'a')?.angle).toBeCloseTo(90, 3)
  expect(stored.cells.find((c) => c.id === 't')?.data?.name).toBe('已修改说明')
  await page.reload()
  await expect(
    page.getByRole('textbox', { name: '文本 已修改说明' }),
  ).toBeVisible()
  await page.screenshot({
    path: '/tmp/xueyuan-s06-notes.50KSb2/03-rotation-text.png',
    fullPage: true,
  })
  expect(errors).toEqual([])
})

test('分组移动携带成员，成员拖出和相交拖入同步双向关系', async ({ page }) => {
  let stored: X6Graph = {
    cells: [
      {
        id: 'area',
        shape: 'custom-rect',
        position: { x: 0, y: 0 },
        size: { width: 260, height: 220 },
        children: ['member'],
        data: { parent: true, name: '区域' },
      },
      {
        id: 'member',
        shape: 'custom-react-node',
        parent: 'area',
        position: { x: 70, y: 70 },
        data: { name: '成员', nodeType: 'base_element', nodeInfo: { type: 2 } },
      },
      {
        id: 'other',
        shape: 'custom-react-node',
        position: { x: 430, y: 70 },
        data: { name: '其他', nodeType: 'base_element', nodeInfo: { type: 2 } },
      },
    ],
  }
  await page.route('**/api/front/topo/topo-one/draw/?task_type=6', (route) => {
    if (route.request().method() === 'POST')
      stored = route.request().postDataJSON().topo
    return route.fulfill({ json: stored })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  const canvas = page.getByLabel('场景拓扑画布'),
    group = canvas.locator('[data-id="area"]'),
    member = canvas.locator('[data-id="member"]')
  const gb = (await group.boundingBox())!,
    mb = (await member.boundingBox())!
  await page.mouse.move(gb.x + 15, gb.y + 15)
  await page.mouse.down()
  await page.mouse.move(gb.x + 45, gb.y + 35, { steps: 8 })
  await page.mouse.up()
  const groupDelta = (await group.boundingBox())!.x - gb.x
  expect(groupDelta).toBeGreaterThan(20)
  expect((await member.boundingBox())!.x - mb.x).toBeCloseTo(groupDelta, 1)
  let moved = (await member.boundingBox())!
  const cb = (await canvas.boundingBox())!
  const target = { x: cb.x + cb.width - 110, y: cb.y + cb.height - 110 }
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 10 })
  await page.mouse.up()
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(stored.cells.find((c) => c.id === 'member')).not.toHaveProperty(
    'parent',
  )
  expect(stored.cells.find((c) => c.id === 'area')?.children).toEqual([])
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, {
    timeout: 6000,
  })
  await member.scrollIntoViewIfNeeded()
  const area = (await group.boundingBox())!
  moved = (await member.boundingBox())!
  await page.mouse.move(moved.x + 15, moved.y + 15)
  await page.mouse.down()
  await page.mouse.move(moved.x + 22, moved.y + 15)
  await page.mouse.move(area.x + area.width - 10, area.y + area.height / 2, {
    steps: 10,
  })
  await page.mouse.up()
  await page.getByRole('button', { name: '保存拓扑', exact: true }).click()
  await expect(page.getByText('所有修改已保存')).toBeVisible()
  expect(stored.cells.find((c) => c.id === 'member')?.parent).toBe('area')
  expect(stored.cells.find((c) => c.id === 'area')?.children).toEqual([
    'member',
  ])
  await page.reload()
  await expect(member).toBeVisible()
})
