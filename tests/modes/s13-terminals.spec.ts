import {
  test,
  expect,
  simulateURL,
  scriptFixture,
  scriptPath,
} from './s13-script-fixture'

test('剧本终端展示适配系统和工具，提取后重读列表', async ({ page }) => {
  await scriptFixture(page)
  await page.route(`**${scriptPath}/instruction/terminal/`, (route) =>
    route.fulfill({ json: { status: 1, data: ['Windows', 'Linux'] } }),
  )
  let extracted = false
  await page.route(`**${scriptPath}/terminal/?*`, (route) =>
    route.fulfill({
      json: {
        count: extracted ? 1 : 0,
        results: extracted
          ? [
              {
                id: 71,
                system: 'Linux',
                tool_list: [{ tool__name: '观察工具', version__name: 'v2' }],
              },
            ]
          : [],
      },
    }),
  )
  await page.route(`**${scriptPath}/instruction/terminal/common/`, (route) => {
    expect(route.request().method()).toBe('POST')
    extracted = true
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '蓝军终端', exact: true }).click()
  await expect(page.getByText('Windows、Linux')).toBeVisible()
  await expect(page.getByText('暂无共性终端，可尝试重新提取')).toBeVisible()
  await page.getByRole('button', { name: '提取共性终端', exact: true }).click()
  await expect(
    page.getByRole('row').filter({ hasText: '观察工具 v2' }),
  ).toContainText('Linux')
  expect(extracted).toBe(true)
  await expect(
    page.getByRole('button', { name: '编辑', exact: true }),
  ).toHaveCount(0)
})

test('终端分页删除末页唯一行会退页，失败保留确认且取消不发请求', async ({
  page,
}) => {
  await scriptFixture(page)
  await page.route(`**${scriptPath}/instruction/terminal/`, (route) =>
    route.fulfill({ json: { status: 1, data: [] } }),
  )
  let removed = false,
    fail = true,
    deletes = 0
  const pages: string[] = []
  await page.route(`**${scriptPath}/terminal/?*`, (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('size')).toBe('10')
    const current = url.searchParams.get('page')!
    pages.push(current)
    return route.fulfill({
      json: {
        count: removed ? 10 : 11,
        results: [
          {
            id: current === '1' ? 10 : 11,
            system: current === '1' ? '首页系统' : '末页系统',
            tool_list: [],
          },
        ],
      },
    })
  })
  await page.route(`**${scriptPath}/terminal/11/`, (route) => {
    expect(route.request().method()).toBe('DELETE')
    deletes++
    if (fail) {
      fail = false
      return route.fulfill({ json: { status: 2, message: '隔离删除失败' } })
    }
    removed = true
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '蓝军终端', exact: true }).click()
  await expect(page.getByText('当前指令和工具集暂无可运行终端')).toBeVisible()
  await expect(
    page.getByRole('button', { name: '提取共性终端', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(
    page.getByRole('row').filter({ hasText: '末页系统' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: '删除终端：末页系统', exact: true })
    .click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(deletes).toBe(0)
  await page
    .getByRole('button', { name: '删除终端：末页系统', exact: true })
    .click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByText('隔离删除失败', { exact: true })).toBeVisible()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(
    page.locator('tbody tr').filter({ hasText: '末页系统' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(
    page.getByRole('row').filter({ hasText: '首页系统' }),
  ).toBeVisible()
  expect(pages.at(-1)).toBe('1')
  expect(deletes).toBe(2)
  await expect(
    page.getByRole('button', { name: '下一页', exact: true }),
  ).toHaveCount(0)
})

test('终端读取失败可重试，提取失败保留列表且不误报成功', async ({ page }) => {
  await scriptFixture(page)
  await page.route(`**${scriptPath}/instruction/terminal/`, (route) =>
    route.fulfill({ json: { status: 1, data: ['Linux'] } }),
  )
  let failed = true,
    reads = 0
  await page.route(`**${scriptPath}/terminal/?*`, (route) => {
    reads++
    if (failed) {
      failed = false
      return route.fulfill({ status: 500, json: { error: '隔离终端读取失败' } })
    }
    return route.fulfill({
      json: {
        count: 1,
        results: [{ id: 18, system: '保留系统', tool_list: [] }],
      },
    })
  })
  await page.route(`**${scriptPath}/instruction/terminal/common/`, (route) =>
    route.fulfill({ json: { status: 2, message: '隔离提取失败' } }),
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '蓝军终端', exact: true }).click()
  await page.getByRole('button', { name: '重试蓝军终端', exact: true }).click()
  await expect(
    page.getByRole('row').filter({ hasText: '保留系统' }),
  ).toBeVisible()
  const before = reads
  await page.getByRole('button', { name: '提取共性终端', exact: true }).click()
  await expect(page.getByText('隔离提取失败', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('row').filter({ hasText: '保留系统' }),
  ).toBeVisible()
  expect(reads).toBe(before)
  await expect(page.getByText('提取成功！', { exact: true })).toHaveCount(0)
})

test('切蓝军后终端页使用新剧本，迟到列表不覆盖当前终端', async ({ page }) => {
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
    '**/api/front/wqzb/simulated_blue_team/scenario/*/instruction/terminal/',
    (route) => route.fulfill({ json: { status: 1, data: [] } }),
  )
  let release: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  let started: (() => void) | undefined
  const begun = new Promise<void>((resolve) => {
    started = resolve
  })
  await page.route(`**${scriptPath}/terminal/?*`, async (route) => {
    started?.()
    await waiting
    await route
      .fulfill({
        json: {
          count: 1,
          results: [{ id: 19, system: '旧剧本迟到系统', tool_list: [] }],
        },
      })
      .catch(() => {})
  })
  const other = '/api/front/wqzb/simulated_blue_team/scenario/scenario-b'
  await page.route(`**${other}/?source=2`, (route) =>
    route.fulfill({ json: { id: 'scenario-b', name: '剧本乙' } }),
  )
  await page.route(`**${other}/draw/`, (route) =>
    route.fulfill({ json: { topo_json: { nodes: [], edges: [] } } }),
  )
  await page.route(`**${other}/terminal/?*`, (route) =>
    route.fulfill({
      json: {
        count: 1,
        results: [{ id: 20, system: '新剧本系统', tool_list: [] }],
      },
    }),
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '蓝军终端', exact: true }).click()
  await begun
  await page
    .getByRole('button', { name: '选择蓝军：剧本乙', exact: true })
    .click()
  await page.getByRole('tab', { name: '蓝军终端', exact: true }).click()
  await expect(
    page.getByRole('row').filter({ hasText: '新剧本系统' }),
  ).toBeVisible()
  release?.()
  await expect(page.getByText('旧剧本迟到系统', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('row').filter({ hasText: '新剧本系统' }),
  ).toBeVisible()
})
