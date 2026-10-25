import { test, expect, simulateURL, scriptFixture } from './s13-script-fixture'

test('剧本画布按原图读取、保存重开并保留未知字段', async ({ page }) => {
  const fixture = await scriptFixture(page)
  await page.goto(simulateURL)
  await expect(
    page.getByRole('tab', { name: '剧本指令', exact: true }),
  ).toBeVisible()
  await expect(
    page.locator('.react-flow__node[data-id="start-ui"]'),
  ).toContainText('开始')
  await page.getByRole('button', { name: '保存剧本', exact: true }).click()
  expect(fixture.writes).toHaveLength(1)
  expect(fixture.getGraph()).toMatchObject({
    custom_graph_field: 'keep-graph',
    nodes: expect.arrayContaining([
      expect.objectContaining({
        id: 'start-ui',
        data: expect.objectContaining({ keep_node: 'keep', id: 101 }),
      }),
    ]),
    edges: expect.arrayContaining([
      expect.objectContaining({
        id: 'edge-ui',
        data: { id: 606, keep_edge: 'keep' },
      }),
    ]),
  })
  await page.reload()
  await expect(
    page.locator('.react-flow__node[data-id="behavior-ui"]'),
  ).toContainText('原模拟节点')
})

test('连线配置允许0权重并按业务ID保存，失败保留输入', async ({ page }) => {
  await scriptFixture(page)
  const saved: unknown[] = []
  let fail = true
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/line/606/',
    (route) => {
      if (route.request().method() === 'POST') {
        saved.push(route.request().postDataJSON())
        if (fail) {
          fail = false
          return route.fulfill({ json: { status: 2, message: '连线保存失败' } })
        }
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({
        json: { status: 1, data: { weight: 50, sign: 1, brief: '' } },
      })
    },
  )
  await page.goto(simulateURL)
  await page
    .locator('.react-flow__edge[data-id="edge-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置连线', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '连线配置' })
  await dialog.getByLabel('连线权重').fill('0')
  await dialog.getByLabel('连线备注').fill('零权重')
  await dialog.getByRole('button', { name: '保存连线', exact: true }).click()
  await expect(page.getByText('连线保存失败', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('连线权重')).toHaveValue('0')
  await dialog.getByRole('button', { name: '保存连线', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(saved[1]).toEqual({ weight: 0, sign: 1, brief: '零权重' })
  await expect(page.locator('.react-flow__edge-text')).toContainText('零权重')
})

test('判断与数据分支按业务节点保存，分支失败不关闭表单', async ({ page }) => {
  await scriptFixture(page)
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/*/last_variate/',
    (route) => route.fulfill({ json: [{ id: 11, variable: '上一步IP' }] }),
  )
  const decisions: unknown[] = []
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/303/decision/',
    (route) => {
      if (route.request().method() === 'POST') {
        decisions.push(route.request().postDataJSON())
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({
        json: [{ id: 1, data_define_id: 11, value: '原结果' }],
      })
    },
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/202/branch/action/',
    (route) => route.fulfill({ json: [{ id: 404, name: '下步扫描' }] }),
  )
  await page.route(
    '**/api/front/wqzb/basic_resources/inouput/?nopage=1',
    (route) => route.fulfill({ json: [{ id: 51, variable: '组合IP' }] }),
  )
  const branches: unknown[] = []
  let fail = true
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/202/branch/',
    (route) => {
      if (route.request().method() === 'POST') {
        branches.push(route.request().postDataJSON())
        if (fail) {
          fail = false
          return route.fulfill({ json: { status: 2, message: '分支保存失败' } })
        }
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({ json: { data_list: [], transform_list: [] } })
    },
  )
  await page.goto(simulateURL)
  await page
    .locator('.react-flow__node[data-id="decision-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置判断', exact: true }).click()
  const decision = page.getByRole('dialog', { name: '判断配置' })
  await decision.getByLabel('判断1结果数据').fill('成功')
  await decision.getByRole('button', { name: '添加判断', exact: true }).click()
  await decision.getByLabel('判断2结果数据').fill('附加结果')
  await decision
    .getByRole('combobox', { name: '判断2上一步输出变量' })
    .fill('IP')
  await decision.getByRole('option', { name: '上一步IP', exact: true }).click()
  await decision.getByRole('button', { name: '保存判断', exact: true }).click()
  expect(decisions[0]).toEqual({
    data_list: [
      { id: 1, define_id: '11', data: '成功' },
      { define_id: '11', data: '附加结果' },
    ],
  })
  await page
    .locator('.react-flow__node[data-id="branch-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置数据分支', exact: true }).click()
  const branch = page.getByRole('dialog', { name: '数据分支', exact: true })
  await branch.getByRole('button', { name: '添加条件判断' }).click()
  await branch.getByRole('combobox', { name: '条件1上一步输出参数' }).fill('IP')
  await branch.getByRole('option', { name: '上一步IP', exact: true }).click()
  await branch.getByLabel('条件1结果数据').fill('匹配')
  await branch
    .getByRole('combobox', { name: '条件1下一步能力动作' })
    .fill('扫描')
  await branch.getByRole('option', { name: '下步扫描', exact: true }).click()
  await branch.getByRole('button', { name: '添加参数组合' }).click()
  await branch.getByRole('combobox', { name: '组合1历史参数' }).fill('IP')
  await branch.getByRole('option', { name: '组合IP', exact: true }).click()
  await branch.getByLabel('组合1规则').fill('https://{ip}/')
  await branch.getByRole('combobox', { name: '组合1下一步输入参数' }).fill('IP')
  await branch.getByRole('option', { name: '组合IP', exact: true }).click()
  await branch.getByLabel('组合IP', { exact: true }).check()
  await branch.getByRole('button', { name: '保存分支', exact: true }).click()
  await expect(page.getByText('分支保存失败', { exact: true })).toBeVisible()
  await expect(branch.getByLabel('条件1结果数据')).toHaveValue('匹配')
  await branch.getByRole('button', { name: '保存分支', exact: true }).click()
  await expect(branch).toHaveCount(0)
  expect(branches[1]).toEqual({
    data_list: [{ define_id: 11, value: '匹配', next_node: 404 }],
    transform_list: [
      {
        define_id: 51,
        value: '',
        next_define_id: 51,
        select_defines: [51],
        rule: 'https://{ip}/',
      },
    ],
  })
})

test('动作能力选择指令启用优先级次数及递归样例', async ({ page }) => {
  const fixture = await scriptFixture(page)
  const writes: { method: string; body: unknown }[] = []
  await page.route(
    '**/api/front/wqzb/test_task/instruction/cascade/',
    (route) =>
      route.fulfill({
        json: [
          {
            id: 1,
            name: '侦察',
            background: { r: 20, g: 80, b: 120, a: 1 },
            children: [
              { id: 2, name: '扫描', children: [{ id: 3, name: '端口发现' }] },
            ],
          },
        ],
      }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/404/action/',
    (route) => {
      if (route.request().method() !== 'GET') {
        writes.push({
          method: route.request().method(),
          body: route.request().postDataJSON(),
        })
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({
        json: {
          status: 1,
          data: { tactics: null, technology: null, sub_technology: null },
        },
      })
    },
  )
  await page.route('**/api/front/wqzb/basic_resources/subtolgy/3/', (route) =>
    route.fulfill({
      json: {
        id: 3,
        name: '端口发现',
        input_params: [
          {
            param_name: 'target',
            required: true,
            field_type: 4,
            child: [
              {
                param_name: 'ports',
                required: false,
                field_type: 3,
                child: [{ param_name: 'port', required: true, field_type: 2 }],
              },
            ],
          },
        ],
        output_params: [
          { param_name: 'result', required: false, field_type: 1 },
        ],
      },
    }),
  )
  let use = false,
    weight = 10
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/404/action/instruct/**',
    (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON()
        writes.push({ method: 'PATCH', body })
        if ('use' in body) use = body.use
        if ('weight' in body) weight = body.weight
        return route.fulfill({ json: { id: 91 } })
      }
      return route.fulfill({
        json: {
          count: 11,
          results: [
            {
              id: 91,
              name: '端口扫描指令',
              tool_name: '扫描工具',
              operating_system: ['Linux'],
              use,
              weight,
            },
          ],
        },
      })
    },
  )
  await page.goto(simulateURL)
  await page
    .locator('.react-flow__node[data-id="action-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置能力动作', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '动作能力', exact: true })
  await dialog.getByRole('combobox', { name: '当前能力' }).fill('端口')
  await dialog
    .getByRole('option', { name: '侦察 / 扫描 / 端口发现', exact: true })
    .click()
  await dialog.getByRole('button', { name: '保存能力', exact: true }).click()
  await expect(dialog.getByText('端口扫描指令', { exact: true })).toBeVisible()
  expect(
    fixture.getGraph().nodes.find((node) => node.id === 'action-ui')?.data,
  ).toMatchObject({ name: '端口发现' })
  await dialog.getByLabel('启用指令：端口扫描指令').check()
  await dialog.getByRole('button', { name: '优先级：端口扫描指令' }).dblclick()
  await dialog.getByLabel('指令优先级').fill('0')
  await dialog.getByLabel('指令优先级').press('Enter')
  await expect(
    dialog.getByRole('button', { name: '优先级：端口扫描指令' }),
  ).toBeVisible()
  await dialog.getByLabel('执行次数').fill('4')
  await dialog.getByRole('button', { name: '保存执行次数' }).click()
  await dialog.getByRole('button', { name: '下一页指令' }).click()
  await expect(dialog.getByText('第 2 页', { exact: true })).toBeVisible()
  await expect(dialog.getByText('target', { exact: true })).toBeVisible()
  await expect(dialog.getByText('ports', { exact: true })).toBeVisible()
  expect(writes).toEqual(
    expect.arrayContaining([
      { method: 'POST', body: { action_id: 3 } },
      { method: 'PATCH', body: { use: true } },
      { method: 'PATCH', body: { weight: 0 } },
      { method: 'PATCH', body: { retry_count: 4 } },
    ]),
  )
})

test('已有模拟节点按当前剧本重命名，工具多版本与文件上传保存', async ({
  page,
}) => {
  const fixture = await scriptFixture(page)
  let behavior = {
    id: 8808,
    topo_node: null,
    tool_type: 1,
    tool_detail: [] as object[],
    interpreter: 2,
    content: '',
  }
  const writes: unknown[] = [],
    names: unknown[] = []
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/808/behavior_simulate/',
    (route) => {
      if (route.request().method() === 'POST') {
        behavior = route.request().postDataJSON()
        writes.push(behavior)
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({ json: behavior })
    },
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/808/rename/',
    (route) => {
      names.push(route.request().postDataJSON())
      return route.fulfill({ json: { status: 1 } })
    },
  )
  await page.route('**/api/front/wqzb/tool/version/cascade/', (route) =>
    route.fulfill({
      json: [
        {
          value: 50,
          label: '模拟工具',
          children: [
            { value: 501, label: 'v1' },
            { value: 502, label: 'v2' },
          ],
        },
      ],
    }),
  )
  let uploaded = ''
  await page.route(
    '**/api/front/wqzb/basic_resources/upload_file/',
    (route) => {
      const raw = route.request().postDataBuffer()?.toString() ?? ''
      expect(raw).toContain('name="mode"')
      expect(raw).toContain('behavior_simulate')
      expect(raw).toContain('test-tool-bytes')
      uploaded = raw
      return route.fulfill({
        json: { status: 1, data: { url: '/media/isolated-tool.bin' } },
      })
    },
  )
  await page.goto(simulateURL)
  await page
    .locator('.react-flow__node[data-id="behavior-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置模拟节点', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '模拟节点配置' })
  await dialog.getByLabel('模拟节点名称').fill('新模拟名')
  await dialog.getByRole('button', { name: '保存名称' }).click()
  await expect(
    page.locator('.react-flow__node[data-id="behavior-ui"]'),
  ).toContainText('新模拟名')
  expect(names[0]).toEqual({ name: '新模拟名' })
  await dialog.getByLabel('模拟工具全部版本').check()
  await page.screenshot({ path: '/tmp/s13-02-behavior.png', fullPage: true })
  await dialog.getByRole('button', { name: '保存模拟配置' }).click()
  await expect(dialog).toHaveCount(0)
  expect(writes[0]).toMatchObject({
    tool_type: 1,
    tool_detail: [{ tool_id: 50, version_ids: [501, 502] }],
    content: '',
    interpreter: 2,
  })
  expect(
    fixture.getGraph().nodes.find((node) => node.id === 'behavior-ui')?.data
      .name,
  ).toBe('新模拟名')
  await page
    .locator('.react-flow__node[data-id="behavior-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置模拟节点', exact: true }).click()
  await dialog.getByLabel('工具来源').selectOption('2')
  await dialog.getByLabel('工具文件').setInputFiles({
    name: 'tool.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('test-tool-bytes'),
  })
  await expect(dialog.getByText('tool.bin', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '移除文件' }).click()
  await dialog.getByRole('button', { name: '保存模拟配置' }).click()
  await expect(
    dialog.getByText('请上传工具文件', { exact: true }),
  ).toBeVisible()
  await dialog.getByLabel('工具文件').setInputFiles({
    name: 'tool.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('test-tool-bytes'),
  })
  await expect(dialog.getByText('tool.bin', { exact: true })).toBeVisible()
  await dialog.getByLabel('解释器').selectOption('3')
  await dialog.getByLabel('执行命令').fill('print("isolated")')
  await dialog.getByRole('button', { name: '保存模拟配置' }).click()
  await expect(dialog).toHaveCount(0)
  expect(writes[1]).toMatchObject({
    tool_type: 2,
    tool_detail: [{ file: '/media/isolated-tool.bin' }],
    interpreter: 3,
    content: 'print("isolated")',
  })
  expect(uploaded).toContain('filename="tool.bin"')
})

test('拖放立即回读业务ID，连线仅本地编辑，键盘与右键删除保存语义不同', async ({
  page,
}) => {
  const fixture = await scriptFixture(page)
  await page.goto(simulateURL)
  await expect(page.locator('.react-flow__node')).toHaveCount(7)
  await page
    .getByRole('button', { name: '拖入判断', exact: true })
    .dragTo(page.locator('.react-flow__pane'), {
      targetPosition: { x: 350, y: 80 },
    })
  await expect(page.locator('.react-flow__node')).toHaveCount(8)
  await expect.poll(() => fixture.writes.length).toBe(1)
  const added = fixture
    .getGraph()
    .nodes.find(
      (node) =>
        ![
          'start-ui',
          'branch-ui',
          'decision-ui',
          'action-ui',
          'custom-ui',
          'behavior-ui',
          'end-ui',
        ].includes(node.id),
    )
  expect(added?.data.id).toBeGreaterThan(900)
  await expect(
    page.getByRole('button', { name: '保存剧本', exact: true }),
  ).toBeEnabled()
  await page.locator('.react-flow').scrollIntoViewIfNeeded()
  const source = await page
    .locator('.react-flow__node[data-id="start-ui"] .source[data-handleid="2"]')
    .boundingBox()
  const target = await page
    .locator(
      '.react-flow__node[data-id="action-ui"] .target[data-handleid="1"]',
    )
    .boundingBox()
  if (!source || !target) throw new Error('连接端口不可见')
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  )
  await page.mouse.up()
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  expect(fixture.writes).toHaveLength(1)
  await page.locator('.react-flow__edge').last().click({ button: 'right' })
  await page.getByRole('button', { name: '配置连线', exact: true }).click()
  await expect(
    page.getByText('请先保存剧本以获取配置标识', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '保存剧本', exact: true }).click()
  await expect.poll(() => fixture.writes.length).toBe(2)
  // 真实点选标签打开边菜单；右键删除只改本地图。
  await page
    .locator('.react-flow__edge[data-id="edge-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '删除连线', exact: true }).click()
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
  expect(fixture.writes).toHaveLength(2)
  await page.getByRole('button', { name: '保存剧本', exact: true }).click()
  await expect.poll(() => fixture.writes.length).toBe(3)
  await expect(
    page.getByRole('button', { name: '保存剧本', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Fit View', exact: true }).click()
  await page.locator(`.react-flow__node[data-id="${added?.id}"]`).click()
  await page.keyboard.press('Delete')
  await expect(page.locator('.react-flow__node')).toHaveCount(7)
  await expect.poll(() => fixture.writes.length).toBe(4)
})

test('type7明确原链缺失，清除可取消，保存失败保留草稿', async ({ page }) => {
  const fixture = await scriptFixture(page)
  await page.goto(simulateURL)
  await page
    .locator('.react-flow__node[data-id="custom-ui"]')
    .click({ button: 'right' })
  await page
    .getByRole('button', { name: '配置自定义指令', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText('缺少有效接口')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '清除剧本', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(fixture.writes).toHaveLength(0)
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/',
    (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ json: { status: 2, message: '剧本保存失败' } })
        : route.fulfill({ json: { topo_json: fixture.getGraph() } }),
  )
  await page.getByRole('button', { name: '清除剧本', exact: true }).click()
  await page.getByRole('button', { name: '确认清除', exact: true }).click()
  await expect(page.getByText('剧本保存失败', { exact: true })).toBeVisible()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect(
    page.getByText('有未保存的剧本修改', { exact: true }),
  ).toBeVisible()
})

test('能力保存拒绝不改图，执行次数和优先级越界不发送', async ({ page }) => {
  const fixture = await scriptFixture(page)
  await page.route(
    '**/api/front/wqzb/test_task/instruction/cascade/',
    (route) =>
      route.fulfill({
        json: [
          {
            id: 1,
            name: '战术',
            children: [
              { id: 2, name: '技术', children: [{ id: 3, name: '拒绝能力' }] },
            ],
          },
        ],
      }),
  )
  let posts = 0,
    patches = 0
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/404/action/',
    (route) => {
      if (route.request().method() === 'POST') {
        posts++
        return route.fulfill({ json: { status: 2, message: '能力保存拒绝' } })
      }
      if (route.request().method() === 'PATCH') {
        patches++
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({
        json: {
          status: 1,
          data: { tactics: 1, technology: 2, sub_technology: 3 },
        },
      })
    },
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/404/action/instruct/**',
    (route) => {
      if (route.request().method() === 'PATCH') {
        patches++
        return route.fulfill({ json: { id: 91 } })
      }
      return route.fulfill({
        json: {
          count: 1,
          results: [
            {
              id: 91,
              name: '拒绝指令',
              tool_name: '工具',
              operating_system: ['Linux'],
              use: false,
              weight: 10,
            },
          ],
        },
      })
    },
  )
  await page.route('**/api/front/wqzb/basic_resources/subtolgy/3/', (route) =>
    route.fulfill({
      json: { id: 3, name: '拒绝能力', input_params: [], output_params: [] },
    }),
  )
  await page.goto(simulateURL)
  await page
    .locator('.react-flow__node[data-id="action-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置能力动作', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '动作能力' })
  await dialog.getByRole('button', { name: '保存能力', exact: true }).click()
  await expect(page.getByText('能力保存拒绝', { exact: true })).toBeVisible()
  expect(posts).toBe(1)
  expect(fixture.writes).toHaveLength(0)
  expect(
    fixture.getGraph().nodes.find((node) => node.id === 'action-ui')?.data.name,
  ).toBe('指令能力动作')
  await dialog.getByLabel('执行次数').fill('11')
  await dialog.getByRole('button', { name: '保存执行次数' }).click()
  expect(patches).toBe(0)
  await dialog.getByRole('button', { name: '优先级：拒绝指令' }).dblclick()
  await dialog.getByLabel('指令优先级').fill('100001')
  await dialog.getByLabel('指令优先级').press('Enter')
  expect(patches).toBe(0)
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('工具上传失败不可保存，模式切换清选择并可重试', async ({ page }) => {
  await scriptFixture(page)
  const saved: unknown[] = []
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/808/behavior_simulate/',
    (route) => {
      if (route.request().method() === 'POST') {
        saved.push(route.request().postDataJSON())
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({
        json: {
          id: 808,
          topo_node: null,
          tool_type: 1,
          tool_detail: [{ tool_id: 1, version_ids: [11] }],
          interpreter: 1,
          content: '',
        },
      })
    },
  )
  await page.route('**/api/front/wqzb/tool/version/cascade/', (route) =>
    route.fulfill({
      json: [
        { value: 1, label: '工具', children: [{ value: 11, label: '版本' }] },
      ],
    }),
  )
  let fail = true
  await page.route(
    '**/api/front/wqzb/basic_resources/upload_file/',
    (route) => {
      if (fail) {
        fail = false
        return route.fulfill({ json: { status: 2, message: '上传被拒绝' } })
      }
      return route.fulfill({
        json: { status: 1, data: { url: '/media/retry-tool' } },
      })
    },
  )
  await page.goto(simulateURL)
  await page
    .locator('.react-flow__node[data-id="behavior-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置模拟节点', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '模拟节点配置' })
  await dialog.getByLabel('工具来源').selectOption('2')
  await dialog.getByLabel('工具文件').setInputFiles({
    name: 'retry.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('retry'),
  })
  await expect(page.getByText('上传被拒绝', { exact: true })).toHaveCount(1)
  await dialog.getByRole('button', { name: '保存模拟配置' }).click()
  await expect(
    dialog.getByText('请上传工具文件', { exact: true }),
  ).toBeVisible()
  expect(saved).toHaveLength(0)
  await dialog.getByLabel('工具文件').setInputFiles({
    name: 'retry.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('retry'),
  })
  await expect(dialog.getByText('retry.bin', { exact: true })).toBeVisible()
  await dialog.getByLabel('工具来源').selectOption('1')
  await expect(dialog.getByLabel('工具全部版本')).not.toBeChecked()
  await dialog.getByLabel('工具来源').selectOption('2')
  await expect(
    dialog.getByText('尚未上传工具文件', { exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
})

test('切换剧本后迟到的旧配置不能写入新图', async ({ page }) => {
  await scriptFixture(page)
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/**',
    (route) =>
      route.fulfill({
        json: [
          {
            id: 'blue-a',
            name: '剧本甲',
            scenario_type: 1,
            scenario: 'scenario-a',
          },
          {
            id: 'blue-b',
            name: '剧本乙',
            scenario_type: 1,
            scenario: 'scenario-b',
          },
        ],
      }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-b/?source=2',
    (route) => route.fulfill({ json: { id: 'scenario-b' } }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-b/draw/',
    (route) => route.fulfill({ json: { topo_json: { nodes: [], edges: [] } } }),
  )
  let release: () => void = () => {}
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/303/decision/',
    async (route) => {
      requested = true
      await wait
      await route
        .fulfill({ json: [{ id: 1, data_define_id: 11, value: '旧判断' }] })
        .catch(() => {})
    },
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/scenario-a/draw/node/303/last_variate/',
    (route) => route.fulfill({ json: [{ id: 11, variable: '旧变量' }] }),
  )
  await page.goto(simulateURL)
  await page
    .locator('.react-flow__node[data-id="decision-ui"]')
    .click({ button: 'right' })
  await page.getByRole('button', { name: '配置判断', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  await page
    .getByRole('dialog', { name: '判断配置' })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await page
    .getByRole('button', { name: '选择蓝军：剧本乙', exact: true })
    .click()
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  release()
  await expect(page.getByText('旧判断', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '保存剧本', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: '/tmp/s13-02-empty-script.png',
    fullPage: true,
  })
})

test('判断侧端口生成失败折线并保存原端口编号', async ({ page }) => {
  const fixture = await scriptFixture(page)
  await page.goto(simulateURL)
  await expect(page.locator('.react-flow__node')).toHaveCount(7)
  await page.locator('.react-flow').scrollIntoViewIfNeeded()
  const source = await page
    .locator(
      '.react-flow__node[data-id="decision-ui"] .source[data-handleid="3"]',
    )
    .boundingBox()
  const target = await page
    .locator(
      '.react-flow__node[data-id="action-ui"] .target[data-handleid="5"]',
    )
    .boundingBox()
  if (!source || !target) throw new Error('条件端口不可见')
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
  await expect(page.locator('.react-flow__edge')).toHaveCount(2)
  expect(fixture.writes).toHaveLength(0)
  await page.getByRole('button', { name: '保存剧本', exact: true }).click()
  await expect.poll(() => fixture.writes.length).toBe(1)
  expect(fixture.getGraph().edges.at(-1)).toMatchObject({
    source: 'decision-ui',
    target: 'action-ui',
    sourceHandle: '3',
    targetHandle: '5',
    type: 'step',
    label: '失败',
  })
})
