import { expect, test as base } from '@playwright/test'
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 's10',
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
  await page.route('**/api/front/learn/task/my_notes/folders/**', (route) => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({
      json: path.endsWith('/folders/')
        ? [
            {
              id: 1,
              name: '默认课程',
              type: 1,
              courses: [{ id: 10, name: '训练课程' }],
            },
            { id: 5, name: '自定义', type: 5, courses: [] },
          ]
        : path.includes('shared_notes')
          ? [
              { id: 7, name: '共享研究' },
              { id: 8, name: '另一个共享' },
            ]
          : [{ id: 2, name: '我的研究' }],
    })
  })
  await page.route('**/api/front/user/note/2/', (route) =>
    route.fulfill({
      json: {
        id: 2,
        name: '我的研究',
        content: '<p>个人正文</p>',
        share: false,
        extend: null,
      },
    }),
  )
})
test('共享笔记只读，独立评分成功后更新推荐度且不暴露编辑与导出', async ({
  page,
}) => {
  let score = 2
  await page.route('**/api/front/share/note/7/', (route) =>
    route.fulfill({
      json: {
        id: 7,
        content: '<p><strong>共享正文</strong></p>',
        synthesis_score: score,
        extend: null,
      },
    }),
  )
  await page.route('**/api/front/share/note/7/score/', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().postDataJSON()).toEqual({ note_score: 4 })
      score = 4
      return route.fulfill({ json: { status: 1 } })
    }
    return route.fulfill({ json: { data: { note_score: score } } })
  })
  await page.goto('/#/basic/user/note')
  await page.getByRole('tab', { name: '共享笔记', exact: true }).click()
  await expect(page.getByText('共享正文', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '导出 Word' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '保存笔记' })).toHaveCount(0)
  await expect(page.locator('.ql-toolbar')).toHaveCount(0)
  await expect(page.locator('.ql-editor')).toHaveAttribute(
    'contenteditable',
    'false',
  )
  await page.getByRole('button', { name: '评4星', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '评4星', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('推荐度')).toHaveText('4 / 5')
  await page.screenshot({
    path: '/tmp/s10-04-results/shared-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true)
  await page.screenshot({
    path: '/tmp/s10-04-results/shared-mobile.png',
    fullPage: true,
  })
})
test('评分失败保持已确认分值，独立读取失败可恢复，快速换笔记不串正文及评分', async ({
  page,
}) => {
  let deny = false
  await page.route('**/api/front/share/note/*/', async (route) => {
    const noteId = new URL(route.request().url()).pathname.split('/').at(-2)
    if (noteId === '7') await new Promise((resolve) => setTimeout(resolve, 250))
    return route.fulfill({
      json: {
        id: Number(noteId),
        content: `<p>正文${noteId}</p>`,
        synthesis_score: 3,
        extend: null,
      },
    })
  })
  await page.route('**/api/front/share/note/*/score/', async (route) => {
    const noteId = new URL(route.request().url()).pathname.split('/').at(-3)
    if (route.request().method() === 'POST')
      return route.fulfill({ json: { status: 2, message: '拒绝评分' } })
    if (noteId === '7') await new Promise((resolve) => setTimeout(resolve, 300))
    if (deny && noteId === '8')
      return route.fulfill({ status: 403, json: { message: '不可读取评分' } })
    return route.fulfill({
      json: { data: { note_score: noteId === '7' ? 1 : 3 } },
    })
  })
  await page.goto('/#/basic/user/note')
  await page.getByRole('tab', { name: '共享笔记', exact: true }).click()
  await page.getByRole('button', { name: '另一个共享', exact: true }).click()
  await expect(page.getByText('正文8', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '评3星', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '评5星', exact: true }).click()
  await expect(page.getByText('拒绝评分', { exact: true })).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: '评3星', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(350)
  await expect(page.getByText('正文7', { exact: true })).toHaveCount(0)
  // 目录切换清除共享页签状态和筛选；自定义目录不提供分享能力。
  await page.getByRole('button', { name: '自定义', exact: true }).click()
  await expect(
    page.getByRole('tab', { name: '共享笔记', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('switch', { name: '分享笔记' })).toHaveCount(0)
  deny = true
  await page.getByRole('button', { name: '训练课程', exact: true }).click()
  await expect(
    page.getByRole('tab', { name: '我的笔记', exact: true }),
  ).toHaveAttribute('data-state', 'active')
  await page.getByRole('tab', { name: '共享笔记', exact: true }).click()
  await page.getByRole('button', { name: '另一个共享', exact: true }).click()
  await expect(
    page.getByText('个人评分读取失败', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /评[1-5]星/ })).toHaveCount(0)
  deny = false
  await page.getByRole('button', { name: '重试个人评分', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '评3星', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
})
test('共享驻点沿原课程与章节上下文检查进入权限，仍保持只读', async ({
  page,
}) => {
  await page.route('**/api/front/share/note/7/', (route) =>
    route.fulfill({
      json: {
        id: 7,
        content: '<p>驻点共享正文</p>',
        synthesis_score: 4,
        extend: { breakpoint_time: 62 },
        section_id: 20,
      },
    }),
  )
  await page.route('**/api/front/share/note/7/score/', (route) =>
    route.fulfill({ json: { data: { note_score: 2 } } }),
  )
  await page.route(
    '**/api/front/learn/task/self_study/open_courses/10/can_enter/',
    (route) => route.fulfill({ json: { can_enter: false } }),
  )
  await page.goto('/#/basic/user/note')
  await page.getByRole('tab', { name: '共享笔记', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '跳转到驻点 01:02', exact: true }),
  ).toBeVisible({ timeout: 2000 })
  await page
    .getByRole('button', { name: '跳转到驻点 01:02', exact: true })
    .click()
  await expect(
    page.getByText('该专题已下线，无法查看！', { exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(/#\/basic\/user\/note$/)
})
test('分享失败保留草稿和确认状态，成功保存正文，取消后重进共享不泄露缓存', async ({
  page,
}) => {
  let share = true
  let content = '<p>已共享正文</p>'
  let attempts = 0
  let releaseShare = () => {}
  await page.route('**/api/front/user/note/2/', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      expect(Object.keys(body).sort()).toEqual(['content', 'share'])
      if (++attempts === 1)
        return route.fulfill({ json: { status: 2, message: '合成分享拒绝' } })
      if (attempts === 2)
        await new Promise<void>((resolve) => {
          releaseShare = resolve
        })
      share = body.share
      content = body.content
      return route.fulfill({ json: { id: 2 } })
    }
    return route.fulfill({
      json: { id: 2, name: '我的研究', share, content, extend: null },
    })
  })
  await page.route(
    '**/api/front/learn/task/my_notes/folders/1/courses/10/shared_notes/?*',
    (route) =>
      route.fulfill({ json: share ? [{ id: 7, name: '共享研究' }] : [] }),
  )
  await page.route('**/api/front/share/note/7/', (route) =>
    route.fulfill({
      json: { id: 7, content, synthesis_score: 4, extend: null },
    }),
  )
  await page.route('**/api/front/share/note/7/score/', (route) =>
    route.fulfill({ json: { data: { note_score: 2 } } }),
  )
  await page.goto('/#/basic/user/note')
  await page.getByRole('tab', { name: '共享笔记', exact: true }).click()
  await expect(page.getByText('已共享正文', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '我的笔记', exact: true }).click()
  const editor = page.getByRole('textbox', { name: '富文本正文', exact: true })
  const toggle = page.getByRole('switch', { name: '分享笔记', exact: true })
  await editor.fill('分享也保存草稿')
  await toggle.click()
  await expect(page.getByText('合成分享拒绝', { exact: true })).toBeVisible()
  await expect(toggle).toBeChecked()
  await expect(editor).toContainText('分享也保存草稿')
  await toggle.click()
  await expect(
    page.getByRole('button', { name: '保存笔记', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '导出 Word', exact: true }),
  ).toBeDisabled()
  releaseShare()
  await expect(toggle).not.toBeChecked()
  expect(content).toContain('分享也保存草稿')
  await page.getByRole('tab', { name: '共享笔记', exact: true }).click()
  await expect(page.getByText('暂无共享笔记', { exact: true })).toBeVisible()
  await expect(page.getByText('已共享正文', { exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '我的笔记', exact: true }).click()
  await expect(editor).toContainText('分享也保存草稿')
  await toggle.click()
  await expect(toggle).toBeChecked()
  await page.getByRole('tab', { name: '共享笔记', exact: true }).click()
  await expect(page.getByText('分享也保存草稿', { exact: true })).toBeVisible()
})
