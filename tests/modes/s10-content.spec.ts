import { expect, test as base } from '@playwright/test'
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
  await page.route('**/api/front/simulation/experiment/*/?more=1', (route) =>
    route.fulfill({
      json: {
        id: 'one',
        name: '内容实验',
        desc: '',
        node_count: 0,
        user_name: '学员',
        tags: [],
        overview: '',
        release_type: 2,
        max_duration: 2,
        tags_category: null,
      },
    }),
  )
})
test('场景笔记支持历史格式、保存重开、失败保留草稿与首次有效ID后Word导出', async ({
  page,
  errors,
}) => {
  let saved =
    '<h2>已有笔记</h2><p><strong>格式</strong><img src="/uploads/a.png" width="240" height="120"></p>'
  let attempts = 0
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/',
    async (route) => {
      if (route.request().method() === 'POST') {
        if (++attempts === 1)
          return route.fulfill({ status: 500, json: { error: '笔记保存失败' } })
        expect(Object.keys(route.request().postDataJSON())).toEqual(['content'])
        saved = route.request().postDataJSON().content
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({ json: { id: 42, content: saved } })
    },
  )
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/42/export/',
    (route) => {
      expect(route.request().method()).toBe('POST')
      expect(route.request().postData()).toBeNull()
      return route.fulfill({
        json: { status: 1, data: { file_path: '/downloads/note_abcd.docx' } },
      })
    },
  )
  await page.route('**/downloads/note_abcd.docx', (route) =>
    route.fulfill({
      body: 'isolated artifact',
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/notes')
  await expect(page.getByRole('heading', { name: '已有笔记' })).toBeVisible()
  await expect(page.locator('.ql-editor img')).toHaveAttribute('width', '240')
  const editor = page.getByRole('textbox', { name: '富文本正文' })
  await editor.press('End')
  await editor.press('Enter')
  await editor.pressSequentially('新内容')
  await expect(page.getByRole('button', { name: '导出 Word' })).toBeDisabled()
  await page.getByRole('button', { name: '保存笔记' }).click()
  await expect(page.getByText('笔记保存失败', { exact: true })).toHaveCount(1)
  await expect(editor).toContainText('新内容')
  await page.getByRole('button', { name: '保存笔记' }).click()
  await expect(page.getByRole('button', { name: '导出 Word' })).toBeEnabled()
  await page.reload()
  await expect(editor).toContainText('新内容')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 Word' }).click()
  expect((await download).suggestedFilename()).toBe('note.docx')
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
  ])
  errors.length = 0
})
