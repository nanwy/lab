import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
import type { Todo } from '../../apps/web/src/api/activity'

const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})
test('未读末页打开最后一条后回第一页，全部已读也重置页码', async ({ page }) => {
  let remaining = 11
  await page.route('**/api/front/user/notice/?*', (route) => {
    const page = Number(new URL(route.request().url()).searchParams.get('page'))
    return route.fulfill({
      json: {
        count: remaining,
        results:
          remaining === 0 || page > Math.ceil(remaining / 10)
            ? []
            : [
                {
                  id: 'last',
                  title: `未读第${page}页`,
                  pub_time: '2026-10-20',
                  is_read: false,
                },
              ],
      },
    })
  })
  await page.route('**/api/front/user/notice/last/', (route) => {
    remaining = 10
    return route.fulfill({
      json: {
        id: 'last',
        title: '末页通知',
        pub_time: '2026-10-20',
        content: '模拟正文',
      },
    })
  })
  await page.route('**/api/front/user/notice/read/', (route) => {
    remaining = 0
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/personal/message')
  await page.getByRole('tab', { name: '未读消息', exact: true }).click()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByRole('button', { name: '未读第2页', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('模拟正文')).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: '未读第1页', exact: true }),
  ).toBeVisible()
  remaining = 11
  await page.reload()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await page.getByRole('button', { name: '全部已读', exact: true }).click()
  await expect(page.getByText('暂无消息', { exact: true })).toBeVisible()
  await expect(
    page.getByText('第 1 / 1 页，共 0 项', { exact: true }),
  ).toBeVisible()
})

test.beforeEach(async ({ page }) => {
  await page.route(
    '**/api/front/exam/ability_appraisa/study_situation/',
    (route) =>
      route.fulfill({
        json: {
          status: 1,
          data: {
            login_day: 1,
            study_length: 2,
            finished_course: 3,
            finished_subject_scene: 4,
            finished_assessment: 5,
          },
        },
      }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 's04',
        username: '模拟学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.route('**/api/front/user/notice/count/', (route) =>
    route.fulfill({ json: { status: 1, data: 1 } }),
  )
  await page.route('**/api/front/user/todo/count/', (route) =>
    route.fulfill({ json: { status: 1, data: { count: 0 } } }),
  )
})

test('消息页切换筛选重置分页；读取和全部已读失败可恢复', async ({ page }) => {
  let attempts = 0
  let allAttempts = 0
  await page.route('**/api/front/user/notice/?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    if (++attempts === 1) return route.fulfill({ json: {} })
    const page = Number(query.get('page'))
    const isRead = query.get('is_read')
    if (isRead) expect(page).toBe(1)
    return route.fulfill({
      json: {
        count: isRead ? 1 : 11,
        results: [
          {
            id: `n-${page}`,
            title: `第${page}页通知`,
            pub_time: '2026-10-20 10:00:00',
            is_read: isRead === '1',
          },
        ],
      },
    })
  })
  await page.route('**/api/front/user/notice/read/', (route) =>
    route.fulfill({ json: { status: ++allAttempts === 1 ? 2 : 1 } }),
  )
  await page.goto('/#/basic/personal/message')
  await page.getByRole('button', { name: '重试消息', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '第1页通知', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '第2页通知', exact: true }),
  ).toBeVisible()
  await page.getByRole('tab', { name: '未读消息', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '第1页通知', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '全部已读', exact: true }).click()
  await expect(
    page.getByText('全部已读失败，请重试。', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '全部已读', exact: true }).click()
  await expect(
    page.getByText('全部已读失败，请重试。', { exact: true }),
  ).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle('dark', dark),
      dark,
    )
    const foreground = await page
      .getByRole('heading', { name: '个人中心', exact: true })
      .evaluate((element) => getComputedStyle(element).color)
    await expect(
      page.getByRole('cell', { name: '2026-10-20 10:00:00', exact: true }),
    ).toHaveCSS('color', foreground)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: test.info().outputPath(`notices-${dark ? 'dark' : 'light'}.png`),
      fullPage: true,
    })
  }
})

test('关闭通知详情取消请求，路由切换清除函数式弹窗，迟到响应不串页', async ({
  page,
}) => {
  let release!: () => void
  let cancelled = 0
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/notice/slow/')) cancelled++
  })
  await page.route('**/api/front/user/notice/?*', (route) =>
    route.fulfill({
      json: {
        count: 1,
        results: [
          {
            id: 'slow',
            title: '慢通知',
            pub_time: '2026-10-20',
            is_read: false,
          },
        ],
      },
    }),
  )
  await page.route('**/api/front/user/notice/slow/', async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route
      .fulfill({
        json: {
          id: 'slow',
          title: '慢通知',
          pub_time: '2026-10-20',
          content: '迟到正文',
        },
      })
      .catch(() => {})
  })
  await page.goto('/#/basic/personal/message')
  await page.getByRole('button', { name: '慢通知', exact: true }).click()
  await expect.poll(() => Boolean(release)).toBe(true)
  await page
    .getByRole('dialog', { name: '通知详情' })
    .getByRole('button', { name: 'Close' })
    .click()
  await expect.poll(() => cancelled).toBe(1)
  release()
  await expect(page.getByText('迟到正文', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '通知 1', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '系统消息' })).toBeVisible()
  await page.evaluate(() => {
    location.hash = '/basic/home'
  })
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => {
    location.hash = '/basic/personal/message'
  })
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('公共通知函数式打开详情、刷新未读数量、全部已读和个人消息筛选', async ({
  page,
}) => {
  let read = false
  const notice = () => ({
    id: 'notice-1',
    title: '模拟通知',
    pub_time: '2026-10-20 10:00:00',
    is_read: read,
  })
  await page.route('**/api/front/user/notice/count/', (route) =>
    route.fulfill({ json: { status: 1, data: read ? 0 : 1 } }),
  )
  await page.route('**/api/front/user/notice/?*', (route) => {
    const url = new URL(route.request().url())
    const matches = url.searchParams.get('is_read') !== '2' || !read
    return route.fulfill({
      json: { count: matches ? 1 : 0, results: matches ? [notice()] : [] },
    })
  })
  await page.route('**/api/front/user/notice/notice-1/', (route) => {
    read = true
    return route.fulfill({
      json: { ...notice(), content: '<b>纯文本通知内容</b>' },
    })
  })
  await page.route('**/api/front/user/notice/read/', (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postData()).toBeNull()
    read = true
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/home')
  await page.getByRole('button', { name: '通知 1', exact: true }).click()
  await page.getByRole('button', { name: '模拟通知', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: '通知详情' })
      .getByText('<b>纯文本通知内容</b>', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('dialog', { name: '通知详情' })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: '系统消息' })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: '通知 0', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '通知 0', exact: true }).click()
  await page
    .getByRole('dialog', { name: '系统消息' })
    .getByRole('button', { name: '全部已读', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: '系统消息' })
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await page.goto('/#/basic/personal/message')
  await page.getByRole('tab', { name: '未读消息', exact: true }).click()
  await expect(page.getByText('暂无消息', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '已读消息', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '模拟通知', exact: true }),
  ).toBeVisible()
})

test('待办函数式打开，校验与失败保留，创建完成删除同步首页和数量', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+08:00'))
  let items: Todo[] = []
  let attempts = 0
  await page.route('**/api/front/user/todo/count/', (route) =>
    route.fulfill({
      json: {
        status: 1,
        data: { count: items.filter((item) => !item.if_finish).length },
      },
    }),
  )
  await page.route('**/api/front/user/todo/?*', (route) =>
    route.fulfill({ json: items }),
  )
  await page.route('**/api/front/user/todo/', (route) => {
    if (++attempts === 1) return route.fulfill({ json: {} })
    const body = route.request().postDataJSON()
    expect(body).toEqual({
      content: '模拟待办',
      set_time: '2026-10-20 15:00:00',
    })
    const item = { id: 'todo-1', ...body, if_finish: false }
    items = [item]
    return route.fulfill({ json: item })
  })
  await page.route('**/api/front/user/todo/batch/', (route) => {
    const body = route.request().postDataJSON()
    expect(body.ids).toEqual(['todo-1'])
    if (body.otype === 2)
      items = items.map((item) => ({ ...item, if_finish: true }))
    else {
      expect(body.otype).toBe(1)
      items = []
    }
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/home')
  await page.getByRole('button', { name: '学习指南', exact: true }).click()
  await page.getByRole('button', { name: '待办 0', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '待办事项', exact: true })
  await dialog.getByRole('button', { name: '保存待办' }).click()
  await expect(
    dialog.getByText('请输入事项内容', { exact: true }),
  ).toBeVisible()
  await dialog.getByLabel('待办内容', { exact: true }).fill('模拟待办')
  await dialog.getByLabel('待办时间', { exact: true }).fill('2026-10-20T15:00')
  await dialog.getByRole('button', { name: '保存待办' }).click()
  await expect(
    dialog.getByText('待办创建失败，输入内容已保留，请重试。'),
  ).toBeVisible()
  await expect(dialog.getByLabel('待办内容', { exact: true })).toHaveValue(
    '模拟待办',
  )
  await dialog.getByRole('button', { name: '保存待办' }).click()
  await expect(
    dialog.getByRole('cell', { name: '模拟待办', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '待办 1', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('模拟待办 · 未完成', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '年视图', exact: true }).click()
  await page.getByRole('button', { name: '管理待办', exact: true }).click()
  await dialog.getByRole('button', { name: '标注完成', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '已完成', exact: true }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('alertdialog', { name: '删除当前事项' })
    .getByRole('button', { name: '取消', exact: true })
    .click()
  await expect(
    dialog.getByRole('cell', { name: '模拟待办', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('alertdialog', { name: '删除当前事项' })
    .getByRole('button', { name: '确认删除', exact: true })
    .click()
  await expect(dialog.getByText('暂无任务', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '年视图', exact: true }).click()
  await expect(
    dialog.getByRole('group', { name: '年度待办' }).getByRole('button'),
  ).toHaveCount(12)
  await expect(dialog.getByText('当月任务', { exact: false })).toBeVisible()
  await dialog.locator('label').filter({ hasText: '年份' }).click()
  await expect(dialog.getByLabel('年份', { exact: true })).toBeFocused()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  await dialog.screenshot({ path: test.info().outputPath('todos-mobile.png') })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '待办 0', exact: true }),
  ).toBeVisible()
})

test('收藏服务端分页、下线提示与课程入口，不把一页当全量', async ({ page }) => {
  await page.route('**/api/front/user/collect/?*', (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.has('nopage')) return route.fulfill({ json: [] })
    const page = Number(url.searchParams.get('page'))
    expect(url.searchParams.get('size')).toBe('21')
    return route.fulfill({
      json: {
        count: 22,
        results:
          page === 1
            ? [
                {
                  id: 1,
                  object_id: 'course-1',
                  attribute: 1,
                  is_status: false,
                  extend_info: { name: '下线课程' },
                },
              ]
            : [
                {
                  id: 22,
                  object_id: 'course-22',
                  attribute: 1,
                  is_status: true,
                  extend_info: { name: '可用课程' },
                },
              ],
      },
    })
  })
  await page.goto('/#/basic/personal/enshrine')
  await page.getByRole('button', { name: '下线课程', exact: true }).click()
  await expect(page.getByText('该资源已被下线无法查看！')).toBeVisible()
  await expect(
    page.getByRole('link', { name: '可用课程', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(
    page.getByRole('link', { name: '可用课程', exact: true }),
  ).toHaveAttribute('href', '/#/basic/training/course/course-22')
  await expect(
    page.getByRole('button', { name: '下一页', exact: true }),
  ).toBeDisabled()
  await page.reload()
  await expect(
    page.getByRole('button', { name: '下线课程', exact: true }),
  ).toBeVisible()
})
