import type { Locator } from '@playwright/test'
import { test, expect, simulateURL } from './s13-fixture'

test('空态导入与列表内导入分别保留原请求体并选择蓝军', async ({ page }) => {
  const blues: object[] = []
  const submitted: unknown[] = []
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/**',
    (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON()
        submitted.push(body)
        blues.push({
          id: `blue-${submitted.length}`,
          name: submitted.length === 1 ? '剧本甲' : '智能乙',
          scenario_type: body.scenario_type,
          scenario: body.scenario ?? null,
          intelligent: body.intelligent ?? null,
        })
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({ json: blues })
    },
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/?nopage=1&status=3',
    (route) => route.fulfill({ json: [{ id: 31, name: '剧本甲' }] }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/intelligent/list/?nopage=1&status=2',
    (route) => route.fulfill({ json: [{ id: 81, name: '智能乙' }] }),
  )
  await page.goto(simulateURL)
  await page.getByRole('button', { name: '导入模拟蓝军', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入模拟蓝军' })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.getByText('请选择蓝军', { exact: true })).toBeVisible()
  await dialog.getByRole('combobox', { name: '选择蓝军' }).fill('剧本')
  await page.getByRole('option', { name: '剧本甲', exact: true }).click()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '选择蓝军：剧本甲', exact: true }),
  ).toBeVisible()
  expect(submitted[0]).toEqual({ scenario_type: 1, scenario: 31, source: 1 })
  await page.getByRole('button', { name: '导入', exact: true }).click()
  await dialog.getByLabel('蓝军类型').selectOption('2')
  await dialog.getByRole('combobox', { name: '选择蓝军' }).fill('智能')
  await page.getByRole('option', { name: '智能乙', exact: true }).click()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '选择蓝军：智能乙', exact: true }),
  ).toBeVisible()
  expect(submitted[1]).toEqual({
    scenario_type: 2,
    intelligent: 81,
    source: 1,
    test_task: 'exp-a',
  })
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await page.getByRole('tab', { name: '执行过程', exact: true }).click()
  await page
    .getByRole('button', { name: '选择蓝军：智能乙', exact: true })
    .click()
  await expect(
    page.getByRole('tab', { name: '运行控制', exact: true }),
  ).toHaveAttribute('data-state', 'active')
  await expect(
    page.getByRole('tab', { name: '蓝军控制', exact: true }),
  ).toHaveAttribute('data-state', 'active')
  await page.reload()
  await expect(
    page.getByRole('button', { name: '选择蓝军：剧本甲', exact: true }),
  ).toBeVisible()
})

test('初始态势节点数据新增编辑与父子删除使用任务域', async ({ page }) => {
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/**',
    (route) =>
      route.fulfill({
        json: [
          {
            id: 'blue-a',
            name: '剧本甲',
            scenario_type: 1,
            scenario: 'scenario-31',
          },
        ],
      }),
  )
  await page.route(
    '**/api/front/wqzb/basic_resources/inouput/?nopage=1',
    (route) =>
      route.fulfill({
        json: [
          { id: 1, datatype: 'IP', desc: '地址' },
          { id: 2, datatype: '主机', desc: '块' },
        ],
      }),
  )
  let nodes: object[] = []
  const writes: { method: string; body: Record<string, unknown> }[] = []
  await page.route(
    '**/api/front/wqzb/test_task/task-exp-a/init_situation_node/**',
    (route) => {
      const request = route.request(),
        method = request.method()
      expect(new URL(request.url()).search).toBe('')
      if (method === 'GET')
        return route.fulfill({ json: { status: 1, data: nodes } })
      const body = method === 'DELETE' ? {} : request.postDataJSON()
      writes.push({ method, body })
      if (method === 'POST')
        nodes = [
          {
            id: 'node-1',
            data_type: 1,
            data_define: 1,
            define_name: 'IP',
            define_value: '10.0.0.1',
            child: [],
          },
        ]
      if (method === 'PATCH')
        nodes = [
          {
            id: 'node-1',
            data_type: 1,
            data_define: 1,
            define_name: 'IP',
            define_value: '10.0.0.2',
            child: [],
          },
        ]
      if (method === 'DELETE') nodes = []
      return route.fulfill({ json: { status: 1 } })
    },
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '初始态势', exact: true }).click()
  await expect(page.getByText('暂无态势数据')).toBeVisible()
  await page.getByRole('button', { name: '新增节点', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '数据录入' })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    dialog.getByRole('alert').filter({ hasText: /^请选择数据类型$/ }),
  ).toBeVisible()
  await selectDataType(dialog, '字段1数据类型', 'IP（地址）')
  await dialog.getByLabel('字段1数据值').fill('10.0.0.1')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('10.0.0.1', { exact: true })).toBeVisible()
  expect(writes[0]).toEqual({
    method: 'POST',
    body: {
      parent: null,
      data_type: 1,
      kind: 2,
      data_define: '',
      data: [{ data_define: 1, define_value: '10.0.0.1' }],
      define_value: [{ data_define: '', define_value: '' }],
      array_value: [{ data_define: '', define_value: [''] }],
    },
  })
  await page.getByText('10.0.0.1', { exact: true }).click({ button: 'right' })
  await page.getByRole('button', { name: '编辑节点', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑数据' })
  await edit.getByLabel('字段1数据值').fill('10.0.0.2')
  await edit.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('10.0.0.2', { exact: true })).toBeVisible()
  expect(writes[1].body).toMatchObject({
    id: 'node-1',
    data_type: 1,
    data_define: 1,
    define_value: '10.0.0.2',
    name: 'node-1',
  })
  await page.getByText('10.0.0.2', { exact: true }).click({ button: 'right' })
  await page.getByRole('button', { name: '删除节点', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toContainText(
    '附带的子节点全部删除',
  )
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(writes).toHaveLength(2)
  await page.getByText('10.0.0.2', { exact: true }).click({ button: 'right' })
  await page.getByRole('button', { name: '删除节点', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByText('暂无态势数据')).toBeVisible()
  expect(writes.at(-1)?.method).toBe('DELETE')
})

test('块数据与块数组支持子节点录入和编辑，失败保留输入', async ({ page }) => {
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/**',
    (route) =>
      route.fulfill({
        json: [
          { id: 'blue-a', name: '剧本甲', scenario_type: 1, scenario: 31 },
        ],
      }),
  )
  await page.route(
    '**/api/front/wqzb/basic_resources/inouput/?nopage=1',
    (route) =>
      route.fulfill({
        json: [
          { id: 1, datatype: 'IP', desc: '地址' },
          { id: 2, datatype: '主机', desc: '块' },
        ],
      }),
  )
  let nodes: object[] = [],
    fail = true
  const writes: Record<string, unknown>[] = []
  await page.route(
    '**/api/front/wqzb/test_task/task-exp-a/init_situation_node/**',
    (route) => {
      const method = route.request().method()
      if (method === 'GET')
        return route.fulfill({ json: { status: 1, data: nodes } })
      const body = route.request().postDataJSON()
      writes.push(body)
      if (fail) {
        fail = false
        return route.fulfill({ json: { status: 2, message: '隔离保存失败' } })
      }
      if (body.data_type === 2)
        nodes = [
          {
            id: 'block',
            data_type: 2,
            data_define: 2,
            define_name: '主机',
            define_value: [
              {
                data_define: 1,
                define_name: 'IP',
                define_value: body.define_value[0].define_value,
              },
            ],
            child: [],
          },
        ]
      else
        nodes = [
          {
            id: 'block',
            data_type: 2,
            data_define: 2,
            define_name: '主机',
            define_value: [
              {
                data_define: 1,
                define_name: 'IP',
                define_value: 'block-value',
              },
            ],
            child: [
              {
                id: 'array',
                data_type: 3,
                data_define: 2,
                define_name: '主机数组',
                define_value: [
                  {
                    data_define: 2,
                    define_value:
                      body.array_value?.[0]?.define_value ??
                      body.define_value[0].define_value,
                  },
                ],
              },
            ],
          },
        ]
      return route.fulfill({ json: { status: 1 } })
    },
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '初始态势', exact: true }).click()
  await page.getByRole('button', { name: '新增节点', exact: true }).click()
  const add = page.getByRole('dialog', { name: '数据录入' })
  await add.getByLabel('数据类型', { exact: true }).selectOption('2')
  await selectDataType(add, '数据块类型', '主机（块）')
  await selectDataType(add, '字段1数据类型', 'IP（地址）')
  await add.getByLabel('字段1数据值').fill('block-value')
  await add.getByRole('button', { name: '添加字段', exact: true }).click()
  await add.getByRole('button', { name: '删除字段2', exact: true }).click()
  await add.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('隔离保存失败', { exact: true })).toBeVisible()
  await expect(add.getByLabel('字段1数据值')).toHaveValue('block-value')
  await add.getByRole('button', { name: '保存', exact: true }).click()
  await expect(add).toHaveCount(0)
  expect(writes[1]).toMatchObject({
    data_type: 2,
    data_define: 2,
    kind: 2,
    parent: null,
    define_value: [{ data_define: 1, define_value: 'block-value' }],
  })
  await page
    .getByText('IP：block-value', { exact: true })
    .click({ button: 'right' })
  await page.getByRole('button', { name: '编辑节点', exact: true }).click()
  const editBlock = page.getByRole('dialog', { name: '编辑数据' })
  await editBlock.getByLabel('字段1数据值').fill('edited-block-value')
  await editBlock.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.getByText('IP：edited-block-value', { exact: true }),
  ).toBeVisible()
  expect(writes[2]).toMatchObject({
    id: 'block',
    data_type: 2,
    define_value: [
      { data_define: 1, define_name: 'IP', define_value: 'edited-block-value' },
    ],
  })
  await page
    .getByText('IP：edited-block-value', { exact: true })
    .click({ button: 'right' })
  await page.getByRole('button', { name: '新增数据', exact: true }).click()
  await add.getByLabel('数据类型', { exact: true }).selectOption('3')
  await selectDataType(add, '数据块类型', '主机（块）')
  await add.getByLabel('数组值1').fill('first-value')
  await add.getByRole('button', { name: '添加数组值', exact: true }).click()
  await add.getByLabel('数组值2').fill('second-value')
  await add.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('second-value', { exact: true })).toBeVisible()
  expect(writes[3]).toMatchObject({
    parent: 'block',
    data_type: 3,
    data_define: 2,
    kind: 2,
    array_value: [
      { data_define: 2, define_value: ['first-value', 'second-value'] },
    ],
  })
  await page
    .getByText('second-value', { exact: true })
    .click({ button: 'right' })
  await page.getByRole('button', { name: '编辑节点', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑数据' })
  await expect(edit.getByLabel('数据类型', { exact: true })).toHaveCount(0)
  await edit.getByRole('button', { name: '删除数组值2', exact: true }).click()
  await edit.getByLabel('数组值1').fill('edited-value')
  await edit.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('edited-value', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/s13-01-situation.png', fullPage: true })
  expect(writes[4]).toMatchObject({
    id: 'array',
    data_type: 3,
    data_define: 2,
    define_value: [{ data_define: 2, define_value: ['edited-value'] }],
  })
})

test('删除蓝军使用测试任务标识并从任务域重读，失败不关闭确认', async ({
  page,
}) => {
  const blue = { id: 'blue-a', name: '剧本甲', scenario_type: 1, scenario: 31 }
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/**',
    (route) => route.fulfill({ json: [blue] }),
  )
  let removed = false,
    fail = true,
    taskReads = 0
  await page.route(
    '**/api/front/wqzb/test_task/task-exp-a/blue_team/**',
    (route) => {
      if (route.request().method() === 'DELETE') {
        expect(new URL(route.request().url()).pathname).toBe(
          '/api/front/wqzb/test_task/task-exp-a/blue_team/blue-a/',
        )
        if (fail) {
          fail = false
          return route.fulfill({ json: { status: 2, message: '删除被拒绝' } })
        }
        removed = true
        return route.fulfill({ json: { status: 1 } })
      }
      taskReads++
      return route.fulfill({ json: removed ? [] : [blue] })
    },
  )
  await page.goto(simulateURL)
  await page
    .getByRole('button', { name: '删除蓝军：剧本甲', exact: true })
    .click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByText('删除被拒绝', { exact: true })).toBeVisible()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '导入模拟蓝军', exact: true }),
  ).toBeVisible()
  expect(taskReads).toBe(1)
})

test('缺测试任务保留导入入口，任务操作不可用', async ({ page }) => {
  const taskRequests: string[] = []
  await page.route(
    '**/api/front/simulation/experiment/no-task/blue_team/**',
    (route) =>
      route.fulfill({
        json: [
          {
            id: 'blue-no-task',
            name: '无任务蓝军',
            scenario_type: 1,
            scenario: 31,
          },
        ],
      }),
  )
  await page.route('**/api/front/wqzb/test_task/**', (route) => {
    taskRequests.push(route.request().url())
    return route.fulfill({ json: {} })
  })
  await page.goto('/#/basic/user/bench/experiment/no-task/simulate')
  await expect(
    page.getByRole('button', { name: '导入', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: '删除蓝军：无任务蓝军' }),
  ).toBeDisabled()
  await page.getByRole('tab', { name: '初始态势', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    '当前实验尚未绑定测试任务，无法读取或维护初始态势。',
  )
  await page.getByRole('tab', { name: '运行控制', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText(
    '当前实验尚未绑定测试任务，无法执行任务域操作。',
  )
  expect(taskRequests).toEqual([])
})

test('导入业务失败保留已选候选，关闭后重新打开清空表单', async ({ page }) => {
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/**',
    (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ json: { status: 2, message: '导入被拒绝' } })
        : route.fulfill({ json: [] }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/scenario/?nopage=1&status=3',
    (route) => route.fulfill({ json: [{ id: 31, name: '失败剧本' }] }),
  )
  await page.goto(simulateURL)
  await page.getByRole('button', { name: '导入模拟蓝军', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入模拟蓝军' })
  await dialog.getByRole('combobox', { name: '选择蓝军' }).fill('失败')
  await page.getByRole('option', { name: '失败剧本', exact: true }).click()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByText('导入被拒绝', { exact: true })).toHaveCount(1)
  await expect(dialog.getByRole('combobox', { name: '选择蓝军' })).toHaveValue(
    '失败剧本',
  )
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '导入模拟蓝军', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: '选择蓝军' })).toHaveValue(
    '',
  )
})

test('切实验时迟到的蓝军列表不能覆盖新上下文', async ({ page }) => {
  let release: (() => void) | undefined
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/**',
    async (route) => {
      requested = true
      await delayed
      await route
        .fulfill({
          json: [
            { id: 'old-blue', name: '旧蓝军', scenario_type: 1, scenario: 31 },
          ],
        })
        .catch(() => {})
    },
  )
  await page.route(
    '**/api/front/simulation/experiment/exp-b/blue_team/**',
    (route) =>
      route.fulfill({
        json: [
          { id: 'new-blue', name: '新蓝军', scenario_type: 1, scenario: 32 },
        ],
      }),
  )
  await page.route(
    '**/api/front/wqzb/test_task/task-exp-b/init_situation_node/**',
    (route) => route.fulfill({ json: { status: 1, data: [] } }),
  )
  await page.goto(simulateURL)
  await expect.poll(() => requested).toBe(true)
  await page.evaluate(() => {
    window.location.hash = '/basic/user/bench/experiment/exp-b/simulate'
  })
  await expect(
    page.getByRole('heading', { name: '实验exp-b', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '选择蓝军：新蓝军' }),
  ).toBeVisible()
  release?.()
  await page.getByRole('tab', { name: '初始态势', exact: true }).click()
  await expect(page.getByText('暂无态势数据')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '选择蓝军：旧蓝军' }),
  ).toHaveCount(0)
})

async function selectDataType(scope: Locator, label: string, name: string) {
  await scope.getByRole('combobox', { name: label, exact: true }).fill(name)
  await scope.getByRole('option', { name, exact: true }).click()
}
