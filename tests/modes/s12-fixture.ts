import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'

export const teachingURL = '/#/basic/user/bench/experiment/one/attackteaching'
export const test = base.extend<{ teaching: void }>({
  teaching: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
        route.fulfill({ json: {} }),
      )
      for (const [path, json] of Object.entries(portalFixtures))
        await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
      await page.route('**/api/front/user/info/', (route) =>
        route.fulfill({
          json: {
            id: 's12',
            username: '隔离学员',
            extend_info: { first_entry: true },
          },
        }),
      )
      await page.route('**/api/front/user/notice/count/', (route) =>
        route.fulfill({ json: { status: 1, data: 0 } }),
      )
      await page.route('**/api/front/user/todo/count/', (route) =>
        route.fulfill({ json: { status: 1, data: { count: 0 } } }),
      )
      await page.route(
        '**/api/front/simulation/experiment/*/?more=1',
        (route) =>
          route.fulfill({
            json: {
              id: 'one',
              name: '攻击教学实验',
              desc: '',
              node_count: 0,
              user_name: '隔离学员',
              tags: [],
              overview: null,
              release_type: 2,
              max_duration: 2,
              tags_category: null,
            },
          }),
      )
      // 只验证原地址接入；隔离响应不是原媒体播放验证。
      await page.route('**/media/**', (route) =>
        route.fulfill({
          status: 200,
          body: '',
          contentType: 'application/octet-stream',
        }),
      )
      await use()
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})
export { expect }
