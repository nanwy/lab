import { test, expect, simulateURL } from './s13-fixture'
import type { Page } from '@playwright/test'
const root =
  '/api/front/wqzb/simulated_blue_team/intelligent/list/901/force_allocation/'
async function fixture(page: Page, empty = false) {
  const state = {
    roles: empty
      ? []
      : [
          { id: 71, name: '侦察角色' },
          { id: 72, name: '行动角色' },
        ],
    terminals: [
      {
        id: 81,
        system: 'Linux',
        tool_list: [{ tool_name: '采集工具', version_name: 'v2' }],
      },
    ],
    selected: [11],
    failAbility: false,
    terminalCount: null as number | null,
    roleReads: [] as string[],
    writes: [] as { url: string; method: string; body: unknown }[],
  }
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/?nopage=1',
    (r) =>
      r.fulfill({
        json: [
          { id: 501, name: '智能蓝军', scenario_type: 2, intelligent: 901 },
        ],
      }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/intelligent/list/901/',
    (r) =>
      r.fulfill({
        json: {
          id: 901,
          name: '智能蓝军',
          ability_scenario_names: [],
          description: '',
        },
      }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/intelligent/list/901/data_statistics/',
    (r) =>
      r.fulfill({
        json: {
          data: {
            tactics_count: 1,
            technologies_count: 2,
            attack_tendency: 1,
            force_count: state.roles.length,
            enabled_engines_count: 0,
            ability_styles: [],
          },
        },
      }),
  )
  await page.route(
    '**/api/front/wqzb/simulated_blue_team/intelligent/list/901/ability_action/',
    (r) => r.fulfill({ json: { status: 1, data: [] } }),
  )
  await page.route(`**${root}**`, async (r) => {
    const req = r.request(),
      url = new URL(req.url()),
      tail = url.pathname.slice(root.length),
      method = req.method()
    if (method === 'GET' && tail) state.roleReads.push(tail)
    if (method !== 'GET')
      state.writes.push({ url: url.pathname, method, body: req.postDataJSON() })
    let json: unknown
    if (!tail) {
      if (method === 'POST') {
        const b = req.postDataJSON()
        state.roles.push({ id: 73, name: b.name })
        json = { id: 73 }
      } else json = { status: 1, data: { items: state.roles } }
    } else if (/^\d+\/$/.test(tail)) {
      const id = Number(tail.split('/')[0])
      if (method === 'PUT') {
        const role = state.roles.find((x) => x.id === id)!
        role.name = req.postDataJSON().name
        json = { id }
      } else {
        state.roles = state.roles.filter((x) => x.id !== id)
        json = { status: 1 }
      }
    } else if (tail.endsWith('instruction/terminal/common/')) {
      state.terminals = [
        {
          id: 82,
          system: 'Ubuntu',
          tool_list: [{ tool_name: '提取工具', version_name: 'v3' }],
        },
      ]
      json = { status: 1 }
    } else if (tail.endsWith('instruction/terminal/'))
      json = { data: ['Linux', 'Windows'] }
    else if (tail.endsWith('ability_configuration/')) {
      if (method === 'POST') {
        if (state.failAbility) json = { status: 2, message: '能力保存失败' }
        else {
          state.selected = req.postDataJSON().dimension_ids
          json = { status: 1 }
        }
      } else
        json = {
          status: 1,
          data: {
            dimensions: [
              {
                id: 11,
                name: '信息收集',
                count: 2,
                is_configured: state.selected.includes(11),
              },
              {
                id: 12,
                name: '权限提升',
                count: 3,
                is_configured: state.selected.includes(12),
              },
              { id: 13, name: '空维度', count: 0, is_configured: false },
            ],
          },
        }
    } else if (tail.endsWith('/terminal/')) {
      expect(url.search).toBe('')
      json = {
        count: state.terminalCount ?? state.terminals.length,
        results: state.terminals,
      }
    } else if (/terminal\/\d+\/$/.test(tail)) {
      state.terminals = []
      state.terminalCount = 0
      json = { status: 1 }
    } else throw new Error(`未知兵力请求${method} ${tail}`)
    await r.fulfill({ json })
  })
  return state
}
test('兵力角色新增、改名、删除使用智能与角色标识，空态不读取角色域', async ({
  page,
}) => {
  const s = await fixture(page, true)
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '兵力数量', exact: true }).click()
  await expect(page.getByText('请添加兵力', { exact: true })).toBeVisible()
  expect(s.roleReads).toEqual([])
  await page.getByRole('button', { name: '添加兵力', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByText('请输入兵力角色名称', { exact: true }),
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    dialog.getByText('请输入兵力角色名称', { exact: true }),
  ).toBeVisible()
  await dialog.getByLabel('兵力角色').fill('新兵力')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '选择角色：新兵力' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '编辑角色：新兵力' }).click()
  await dialog.getByLabel('兵力角色').fill('修改角色')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '选择角色：修改角色' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '删除角色：修改角色' }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByText('请添加兵力', { exact: true })).toBeVisible()
  expect(s.writes).toEqual([
    { url: root, method: 'POST', body: { name: '新兵力' } },
    { url: `${root}73/`, method: 'PUT', body: { name: '修改角色' } },
    { url: `${root}73/`, method: 'DELETE', body: null },
  ])
})
test('角色节点提取与删除终端保留原无query请求，工具字段独立', async ({
  page,
}) => {
  const s = await fixture(page)
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '兵力数量', exact: true }).click()
  await expect(page.getByText('Linux、Windows', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('cell', { name: '采集工具 v2', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '编辑终端' })).toHaveCount(0)
  await page.getByRole('button', { name: '提取共性终端', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: '提取工具 v3', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '删除终端：Ubuntu' }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(s.terminals).toHaveLength(1)
  await page.getByRole('button', { name: '删除终端：Ubuntu' }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(
    page.getByText('暂无共性终端，可尝试重新提取', { exact: true }),
  ).toBeVisible()
  expect(s.writes).toEqual([
    {
      url: `${root}71/instruction/terminal/common/`,
      method: 'POST',
      body: null,
    },
    { url: `${root}71/terminal/82/`, method: 'DELETE', body: null },
  ])
})
test('角色能力禁选空维度，保存失败保留草稿，切角色回节点配置', async ({
  page,
}) => {
  const s = await fixture(page)
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '兵力数量', exact: true }).click()
  await page.getByRole('tab', { name: '能力配置', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: '空维度 (0个能力)' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('checkbox', { name: '信息收集 (2个能力)' }),
  ).toBeChecked()
  await page.getByRole('checkbox', { name: '权限提升 (3个能力)' }).check()
  s.failAbility = true
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(page.getByText('能力保存失败', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('checkbox', { name: '权限提升 (3个能力)' }),
  ).toBeChecked()
  s.failAbility = false
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => s.selected).toEqual([11, 12])
  await page.getByRole('button', { name: '选择角色：行动角色' }).click()
  await expect(
    page.getByRole('tab', { name: '节点配置', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  expect(
    s.writes.filter((w) => w.url.endsWith('ability_configuration/')),
  ).toEqual([
    {
      url: `${root}71/ability_configuration/`,
      method: 'POST',
      body: { dimension_ids: [11, 12] },
    },
    {
      url: `${root}71/ability_configuration/`,
      method: 'POST',
      body: { dimension_ids: [11, 12] },
    },
  ])
})

test('智能终端末页唯一行删除后退页，分页请求仍不携带query', async ({
  page,
}) => {
  const s = await fixture(page)
  s.terminalCount = 11
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '兵力数量', exact: true }).click()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(page.getByText('第2页，共11条', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除终端：Linux' }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(
    page.getByText('暂无共性终端，可尝试重新提取', { exact: true }),
  ).toBeVisible()
  expect(s.roleReads.filter((p) => p.endsWith('/terminal/'))).toEqual([
    '71/instruction/terminal/',
    '71/terminal/',
    '71/terminal/',
    '71/terminal/',
  ])
})

test('角色能力未保存勾选在断线恢复后保留，不被后台错误卸载', async ({
  page,
}) => {
  await fixture(page)
  let reads = 0
  await page.route(`**${root}71/ability_configuration/`, (r) => {
    reads++
    return r.fulfill({
      json:
        reads === 1
          ? {
              status: 1,
              data: {
                dimensions: [
                  { id: 11, name: '信息收集', count: 2, is_configured: true },
                  { id: 12, name: '权限提升', count: 3, is_configured: false },
                ],
              },
            }
          : { status: 2, message: '后台读取失败' },
    })
  })
  await page.goto(simulateURL)
  await page.getByRole('tab', { name: '兵力数量', exact: true }).click()
  await page.getByRole('tab', { name: '能力配置', exact: true }).click()
  await page
    .getByRole('checkbox', { name: '权限提升 (3个能力)', exact: true })
    .check()
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
  })
  await page.waitForLoadState('networkidle')
  await expect(
    page.getByRole('checkbox', { name: '权限提升 (3个能力)', exact: true }),
  ).toBeChecked()
})
