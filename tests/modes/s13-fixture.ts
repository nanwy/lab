import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
export const simulateURL = '/#/basic/user/bench/experiment/exp-a/simulate'
export const test = base.extend<{ shell: void }>({
  shell: [
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
            id: 's13',
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
        (route) => {
          const id = new URL(route.request().url()).pathname.split('/').at(-2)
          return route.fulfill({
            json: {
              id,
              name: `实验${id}`,
              desc: '',
              node_count: 0,
              user_name: '隔离学员',
              tags: [],
              overview: null,
              release_type: 2,
              max_duration: 2,
              tags_category: null,
              test_task: id === 'no-task' ? null : `task-${id}`,
            },
          })
        },
      )
      await use()
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})
export { expect }
