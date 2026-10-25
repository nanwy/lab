import {
  test,
  expect,
  simulateURL,
  intBase,
  intelligentFixture,
} from './s13-intelligent-fixture'

test('智能概览保留能力雷达图，导入跨维度分页选择并清空', async ({ page }) => {
  await intelligentFixture(page)
  await page.route(
    '**/api/front/base/tag/?otype_plus=category&otype=attack_style&nopage=1',
    (r) =>
      r.fulfill({
        json: [
          { id: 1, name: '数据获取' },
          { id: 2, name: '权限提升' },
        ],
      }),
  )
  await page.route(
    `**${intBase}/ability_action/import/dimensions/*/?*`,
    (r) => {
      const u = new URL(r.request().url()),
        dim = u.pathname.split('/').at(-2),
        p = Number(u.searchParams.get('page'))
      return r.fulfill({
        json: {
          status: 1,
          data: {
            abilities: [
              {
                id: dim === '1' ? (p === 1 ? 11 : 12) : 21,
                code: 'A1',
                name:
                  dim === '1'
                    ? p === 1
                      ? '第一页能力'
                      : '第二页能力'
                    : '权限能力',
                dimension_name: dim === '1' ? '数据获取' : '权限提升',
                instruction_count: 3,
              },
            ],
            total: 11,
          },
        },
      })
    },
  )
  const writes: unknown[] = []
  let fail = true
  await page.route(`**${intBase}/ability_action/import/`, (r) => {
    writes.push(r.request().postDataJSON())
    if (fail) {
      fail = false
      return r.fulfill({ json: { status: 2, message: '导入失败保留选择' } })
    }
    return r.fulfill({ json: { imported: 3 } })
  })
  await page.goto(simulateURL)
  await expect(page.getByText('深度智能蓝军', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: '能力维度雷达图' })).toBeVisible()
  await expect(page.getByText('深度优先', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/s13-03-overview.png', fullPage: true })
  await page.getByRole('button', { name: '导入能力', exact: true }).click()
  const d = page.getByRole('dialog', { name: '导入能力', exact: true })
  await d.getByRole('button', { name: '保存所选 (0)', exact: true }).click()
  await expect(d.getByText('请至少选择一项能力')).toBeVisible()
  await d.getByRole('checkbox', { name: '选择能力：第一页能力' }).check()
  await d.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(
    d.getByRole('button', { name: '全选', exact: true }),
  ).toBeVisible()
  await d.getByRole('button', { name: '全选', exact: true }).click()
  await d.getByRole('button', { name: '维度：权限提升' }).click()
  await d.getByLabel('搜索能力').fill('权限')
  await d.getByRole('checkbox', { name: '选择能力：权限能力' }).check()
  await d.getByRole('button', { name: '保存所选 (3)', exact: true }).click()
  await expect(
    page.getByText('导入失败保留选择', { exact: true }),
  ).toBeVisible()
  await expect(
    d.getByRole('checkbox', { name: '选择能力：权限能力' }),
  ).toBeChecked()
  await d.getByRole('button', { name: '保存所选 (3)', exact: true }).click()
  await expect(d).toHaveCount(0)
  expect(writes[1]).toEqual({
    dimensions: [
      { dimension_id: 1, ability_ids: [11, 12] },
      { dimension_id: 2, ability_ids: [21] },
    ],
  })
  await page.getByRole('button', { name: '导入能力', exact: true }).click()
  await expect(
    d.getByRole('button', { name: '保存所选 (0)', exact: true }),
  ).toBeVisible()
  const resized = page.waitForRequest((r) =>
    r.url().includes('/dimensions/1/?search=&page=1&size=20'),
  )
  await d.getByLabel('每页', { exact: true }).selectOption('20')
  await resized
  await d.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '清空能力', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认清空', exact: true })
    .click()
  await expect(page.getByText('暂无能力数据', { exact: true })).toBeVisible()
})

test('技战术只读展开及递归样例，引擎仅校验启用权重并保留失败草稿', async ({
  page,
}) => {
  await intelligentFixture(page)
  await page.route(`**${intBase}/tactics/`, (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: [
          {
            name: '战术甲',
            child: [
              {
                name: '技术甲',
                child: [
                  {
                    id: 31,
                    name: '嵌套能力',
                    instruction_count: 4,
                    is_exists: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
  )
  await page.route('**/api/front/wqzb/basic_resources/subtolgy/31/', (r) =>
    r.fulfill({
      json: {
        id: 31,
        name: '嵌套能力',
        sign: 'T-31',
        desc: '能力描述',
        tactics_name: '战术甲',
        technology_name: '技术甲',
        attack_style_display: '数据获取',
        input_params: [
          {
            param_name: 'items',
            field_type: 3,
            child: [
              { param_name: 'host', field_type: 1 },
              { param_name: 'count', field_type: 2 },
              {
                param_name: 'meta',
                field_type: 4,
                child: [{ param_name: 'status', field_type: 1 }],
              },
            ],
          },
        ],
        output_params: [],
      },
    }),
  )
  const engines = [
    {
      id: 4,
      engine_type: '4',
      engine_type_name: '人工干预',
      is_enabled: false,
      weight: null,
    },
    {
      id: 2,
      engine_type: '2',
      engine_type_name: '技战术决策',
      is_enabled: true,
      weight: 0.8,
    },
    {
      id: 1,
      engine_type: '1',
      engine_type_name: '数据决策',
      is_enabled: true,
      weight: 0.8,
    },
    {
      id: 3,
      engine_type: '3',
      engine_type_name: '对抗图谱',
      is_enabled: false,
      weight: 0.5,
    },
  ]
  const writes: unknown[] = []
  let fail = true
  await page.route(`**${intBase}/decision_engine/`, (r) => {
    if (r.request().method() === 'POST') {
      writes.push(r.request().postDataJSON())
      if (fail) {
        fail = false
        return r.fulfill({ json: { status: 2, message: '引擎保存失败' } })
      }
      return r.fulfill({ json: { status: 1 } })
    }
    return r.fulfill({ json: { status: 1, data: engines } })
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '技战术', exact: true }).click()
  await expect(page.getByText('1个技术', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: '技术甲 (已导入1个)', exact: true })
    .click()
  await page
    .getByRole('button', { name: '嵌套能力 (4条指令)', exact: true })
    .click()
  const detail = page.getByRole('dialog', { name: '能力动作详情', exact: true })
  await expect(detail.getByText('T-31', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/s13-03-ability.png', fullPage: true })
  await expect(detail.locator('pre').first()).toHaveText(
    '{\n  "items": [\n    {\n      "host": "",\n      "count": 1,\n      "meta": {\n        "status": ""\n      }\n    }\n  ]\n}',
  )
  await detail.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('tab', { name: '决策引擎', exact: true }).click()
  await expect(page.getByLabel('人工干预权重', { exact: true })).toBeDisabled()
  await page.getByLabel('数据决策权重', { exact: true }).fill('1.1')
  await page.getByRole('button', { name: '保存引擎配置', exact: true }).click()
  await expect(
    page.getByText('权重值必须在0–1之间', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('数据决策权重', { exact: true }).fill('0.9')
  await page.getByRole('button', { name: '保存引擎配置', exact: true }).click()
  await expect(page.getByText('引擎保存失败', { exact: true })).toBeVisible()
  await expect(page.getByLabel('数据决策权重', { exact: true })).toHaveValue(
    '0.9',
  )
  await page.getByRole('button', { name: '保存引擎配置', exact: true }).click()
  expect(writes[1]).toEqual({
    configs: [
      { engine_type: '1', is_enabled: true, weight: 0.9 },
      { engine_type: '2', is_enabled: true, weight: 0.8 },
      { engine_type: '3', is_enabled: false, weight: 0.5 },
      { engine_type: '4', is_enabled: false, weight: null },
    ],
  })
})

test('切换智能蓝军清页签与旧统计响应，空能力不生成假图', async ({ page }) => {
  await intelligentFixture(page)
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/?nopage=1',
    (r) =>
      r.fulfill({
        json: [
          {
            id: 'blue-i',
            name: '智能实例',
            scenario_type: 2,
            intelligent: 'int-a',
          },
          {
            id: 'blue-j',
            name: '第二智能实例',
            scenario_type: 2,
            intelligent: 'int-b',
          },
        ],
      }),
  )
  let finish!: () => void
  const gate = new Promise<void>((resolve) => {
    finish = resolve
  })
  await page.route(`**${intBase}/data_statistics/`, async (r) => {
    await gate
    await r
      .fulfill({
        json: {
          data: {
            ability_styles: [{ name: '旧统计不应显示', abilities_count: 9 }],
          },
        },
      })
      .catch(() => {})
  })
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/intelligent/list/int-b/',
    (r) =>
      r.fulfill({
        json: {
          id: 'int-b',
          name: '第二智能详情',
          ability_scenario_names: [],
          description: '',
        },
      }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/intelligent/list/int-b/data_statistics/',
    (r) => r.fulfill({ json: { data: { ability_styles: [] } } }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/intelligent/list/int-b/ability_action/',
    (r) => r.fulfill({ json: { status: 1, data: [] } }),
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '技战术', exact: true }).click()
  await page
    .getByRole('button', { name: '选择蓝军：第二智能实例', exact: true })
    .click()
  finish()
  await expect(page.getByText('第二智能详情', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('tab', { name: '能力动作', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(
    page.getByText('暂无能力维度数据', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: '能力维度雷达图' })).toHaveCount(0)
  await expect(page.getByText('旧统计不应显示', { exact: true })).toHaveCount(0)
})

test('原能力与技战术允许缺失或null的空子列表，错误类型仍拒绝', async ({
  page,
}) => {
  await intelligentFixture(page)
  await page.route(`**${intBase}/ability_action/`, (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: [
          { id: 1, name: '缺省能力维度' },
          { id: 2, name: '空值能力维度', abilities: null },
        ],
      },
    }),
  )
  await page.route(`**${intBase}/tactics/`, (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: [
          { name: '缺省技术战术' },
          { name: '空值技术战术', child: null },
          {
            name: '有技术战术',
            child: [
              { name: '缺省能力技术' },
              { name: '空值能力技术', child: null },
            ],
          },
        ],
      },
    }),
  )
  await page.goto(simulateURL)
  await expect(
    page.getByText('缺省能力维度（0个能力）', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('空值能力维度（0个能力）', { exact: true }),
  ).toBeVisible()
  await page.getByRole('tab', { name: '技战术', exact: true }).click()
  await expect(page.getByText('缺省技术战术', { exact: true })).toBeVisible()
  await expect(page.getByText('空值技术战术', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '缺省能力技术', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '空值能力技术', exact: true }),
  ).toBeDisabled()
  await page.route(`**${intBase}/ability_action/`, (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: [{ id: 1, name: '错误能力维度', abilities: {} }],
      },
    }),
  )
  await page.reload()
  await expect(
    page.getByRole('alert').filter({ hasText: '能力读取失败' }),
  ).toBeVisible()
})

test('引擎未保存权重在浏览器断线恢复后保留', async ({ page }) => {
  await intelligentFixture(page)
  await page.route(`**${intBase}/decision_engine/`, (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: [
          {
            engine_type: 1,
            engine_type_name: '数据决策',
            is_enabled: true,
            weight: 0.2,
          },
        ],
      },
    }),
  )
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '决策引擎', exact: true }).click()
  await page.getByLabel('数据决策权重', { exact: true }).fill('0.9')
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
  })
  await page.waitForLoadState('networkidle')
  await expect(page.getByLabel('数据决策权重', { exact: true })).toHaveValue(
    '0.9',
  )
})
