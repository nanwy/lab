import type { Page } from '@playwright/test'
export { test, expect, simulateURL } from './s13-fixture'
export const intBase =
  '/api/front/wqzb/simulated_blue_team/intelligent/list/int-a'
export async function intelligentFixture(page: Page) {
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
        ],
      }),
  )
  await page.route(`**${intBase}/`, (r) =>
    r.fulfill({
      json: {
        id: 'int-a',
        name: '深度智能蓝军',
        ability_scenario_names: ['训练场景'],
        description: '原版智能配置',
      },
    }),
  )
  await page.route(`**${intBase}/data_statistics/`, (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: {
          tactics_count: 2,
          technologies_count: 3,
          attack_tendency: 1,
          force_count: 2,
          enabled_engines_count: 1,
          ability_styles: [
            { name: '数据获取', abilities_count: 4 },
            { name: '权限提升', abilities_count: 2 },
            { name: '安装部署', abilities_count: 3 },
          ],
        },
      },
    }),
  )
  let abilities = [
    {
      id: 1,
      name: '数据获取',
      color: { r: 0, g: 100, b: 200, a: 0.5 },
      abilities: [{ id: 11, name: '现有能力', instruction_count: 2 }],
    },
  ]
  await page.route(`**${intBase}/ability_action/`, (r) =>
    r.fulfill({ json: { status: 1, data: abilities } }),
  )
  await page.route(`**${intBase}/ability_action/clear/`, (r) => {
    abilities = []
    return r.fulfill({ json: { status: 1 } })
  })
}
