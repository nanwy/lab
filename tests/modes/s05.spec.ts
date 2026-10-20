import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'

const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 's05',
        username: '模拟学员',
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
})

test('今日与历史实验使用独立服务端分页，搜索重置两组页码', async ({ page }) => {
  await page.route('**/api/front/simulation/experiment/**', (route) => {
    const url = new URL(route.request().url())
    const current = Number(url.searchParams.get('page'))
    const search = url.searchParams.get('search')
    if (search) expect(current).toBe(1)
    const period = url.pathname.endsWith('more/') ? '历史' : '今日'
    return route.fulfill({
      json: {
        count: search ? 0 : 11,
        results: search
          ? []
          : [
              {
                id: `${period}-${current}`,
                name: `${period}实验第${current}页`,
                desc: '模拟实验',
                node_count: 2,
                start_status: false,
                create_time: '2026-10-20',
                source: 1,
              },
            ],
      },
    })
  })
  await page.goto('/#/basic/user/bench')
  const today = page.getByRole('region', { name: '今天', exact: true })
  const before = page.getByRole('region', { name: '更早', exact: true })
  await expect(today.getByRole('link', { name: '今日实验第1页' })).toBeVisible()
  await today.getByRole('button', { name: '下一页' }).click()
  await expect(today.getByRole('link', { name: '今日实验第2页' })).toBeVisible()
  await expect(
    before.getByRole('link', { name: '历史实验第1页' }),
  ).toBeVisible()
  await before.getByRole('button', { name: '下一页' }).click()
  await page.getByRole('textbox', { name: '搜索实验记录' }).fill('没有的实验')
  await expect(today.getByText('暂无实验记录')).toBeVisible()
  await expect(before.getByText('暂无实验记录')).toBeVisible()
})

test('深链概述编辑失败保留输入，保存重开一致，说明不执行脚本', async ({
  page,
}) => {
  let detail = {
    id: 'one',
    name: '网络实验',
    desc: '原始概述',
    node_count: 2,
    user_name: '模拟学员',
    tags: [{ name: '网络' }],
    release_type: 2,
    max_duration: 4,
    tags_category: null,
    overview:
      '<h2>场景说明正文</h2><script>parent.document.title="恶意修改"</script>',
  }
  let attempts = 0
  await page.route(
    '**/api/front/simulation/experiment/one/?more=1',
    async (route) => {
      if (route.request().method() === 'PATCH') {
        const data = route.request().postDataJSON()
        if (++attempts === 1)
          return route.fulfill({
            status: 500,
            json: { error: '实验暂时无法保存' },
          })
        expect(data).toEqual({
          name: '修改后的实验',
          desc: '原始概述',
          tag: ['网络'],
          release_type: 2,
          max_duration: 2,
          category: null,
        })
        detail = { ...detail, name: data.name, max_duration: data.max_duration }
      }
      return route.fulfill({ json: detail })
    },
  )
  await page.route('**/api/front/base/tag/?*', (route) =>
    route.fulfill({ json: [{ name: '网络' }, { name: '安全' }] }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/overview')
  await expect(page.getByRole('heading', { name: '网络实验' })).toBeVisible()
  await page.getByRole('button', { name: '编辑基本信息' }).click()
  await page
    .getByRole('textbox', { name: '实验名称', exact: true })
    .fill('修改后的实验')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '实验暂时无法保存' }),
  ).toBeVisible()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '实验暂时无法保存' }),
  ).toHaveCount(1)
  await expect(
    page.getByRole('textbox', { name: '实验名称', exact: true }),
  ).toHaveValue('修改后的实验')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '修改后的实验' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '修改后的实验' }),
  ).toBeVisible()
  await page.getByRole('link', { name: '场景说明', exact: true }).click()
  await expect(
    page
      .frameLocator('iframe[title="场景说明正文"]')
      .getByRole('heading', { name: '场景说明正文' }),
  ).toBeVisible()
  await expect(page).not.toHaveTitle('恶意修改')
})

test('场景库跨页保留单选，仅确认时导入，失败可重试', async ({ page }) => {
  let imports = 0
  await page.route('**/api/front/simulation/experiment/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/select/')) {
      expect(url.pathname).toContain('/select/scene-1/')
      expect(route.request().method()).toBe('GET')
      return route.fulfill({ json: { status: ++imports === 1 ? 2 : 1 } })
    }
    if (url.pathname.includes('/expreiment_scene/')) {
      const current = url.searchParams.get('page')
      return route.fulfill({
        json: {
          count: 11,
          results: [
            {
              id: `scene-${current}`,
              name: `场景${current}`,
              sub_user: '学员',
              create_time: '2026-10-20',
            },
          ],
        },
      })
    }
    return route.fulfill({ json: { count: 0, results: [] } })
  })
  await page.goto('/#/basic/user/bench')
  await page.getByRole('button', { name: '场景库选择' }).click()
  const dialog = page.getByRole('dialog', { name: '从场景库选择' })
  await dialog.getByRole('radio', { name: '选择场景1' }).click()
  await dialog.getByRole('button', { name: '下一页' }).click()
  await expect(
    dialog.getByRole('cell', { name: '场景2', exact: true }),
  ).toBeVisible()
  expect(imports).toBe(0)
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '业务请求失败' }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(imports).toBe(2)
})

test('删除失败保留记录，末页最后一条删除后回上一页', async ({ page }) => {
  let deleted = false
  let attempts = 0
  await page.route('**/api/front/simulation/experiment/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/delete/')) {
      expect(request.method()).toBe('POST')
      expect(request.postDataJSON()).toEqual({ ids: ['last'] })
      deleted = ++attempts > 1
      return route.fulfill({ json: { status: deleted ? 1 : 2 } })
    }
    const current = Number(url.searchParams.get('page'))
    if (url.pathname.endsWith('/more/'))
      return route.fulfill({ json: { count: 0, results: [] } })
    return route.fulfill({
      json: {
        count: deleted ? 10 : 11,
        results:
          deleted && current > 1
            ? []
            : [
                {
                  id: 'last',
                  name: `实验第${current}页`,
                  desc: '',
                  node_count: 0,
                  start_status: false,
                  create_time: '2026-10-20',
                  source: 1,
                },
              ],
      },
    })
  })
  await page.goto('/#/basic/user/bench')
  const today = page.getByRole('region', { name: '今天', exact: true })
  await today.getByRole('button', { name: '下一页' }).click()
  await expect(today.getByRole('link', { name: '实验第2页' })).toBeVisible()
  await today.getByRole('button', { name: '删除', exact: true }).click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: '确认删除' }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '业务请求失败' }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: '确认删除' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(today.getByRole('link', { name: '实验第1页' })).toBeVisible()
})

test('实验详情切换隔离迟到响应，支持空说明、404和拒绝访问', async ({
  page,
}) => {
  let releaseSlow: () => void = () => {}
  const slow = new Promise<void>((resolve) => {
    releaseSlow = resolve
  })
  await page.route(
    '**/api/front/simulation/experiment/*/?more=1',
    async (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.includes('/missing/'))
        return route.fulfill({ status: 404, json: {} })
      if (path.includes('/forbidden/'))
        return route.fulfill({ status: 403, json: { error: '您无权访问' } })
      const isSlow = path.includes('/slow/')
      if (isSlow) await slow
      return route
        .fulfill({
          json: {
            id: isSlow ? 'slow' : 'fast',
            name: isSlow ? '旧实验' : '当前实验',
            desc: '',
            node_count: 0,
            user_name: '学员',
            tags: [],
            overview: '',
            release_type: 2,
            max_duration: 2,
            tags_category: null,
          },
        })
        .catch(() => {})
    },
  )
  await page.goto('/#/basic/user/bench/experiment/slow/overview')
  await expect(page.getByText('正在加载实验…')).toBeVisible()
  await page.goto('/#/basic/user/bench/experiment/fast/explain')
  await expect(page.getByText('暂无场景说明')).toBeVisible()
  releaseSlow()
  await expect(page.getByRole('heading', { name: '当前实验' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '旧实验' })).not.toBeVisible()
  await page.goto('/#/basic/user/bench/experiment/missing/overview')
  await expect(
    page.getByRole('heading', { name: '该实验已被删除或不存在' }),
  ).toBeVisible()
  await page.goto('/#/basic/user/bench/experiment/forbidden/overview')
  await expect(page.getByRole('heading', { name: '您无权访问' })).toBeVisible()
})
