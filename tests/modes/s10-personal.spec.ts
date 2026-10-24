import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})
const folders = [
  { id: 1, name: '课程归档', type: 1, courses: [{ id: 10, name: '课程甲' }] },
  { id: 9, name: '研究', type: 5, courses: [] },
]
const note = {
  id: 'n1',
  name: '观察记录',
  content: '<p><strong>原始正文</strong></p>',
  share: false,
  extend: null,
}
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/(front|admin|captcha)\//, (r) =>
    r.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (r) => r.fulfill({ json }))
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({
      json: {
        id: 's10-personal',
        username: '学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.route('**/api/front/user/notice/count/', (r) =>
    r.fulfill({ json: { status: 1, data: 0 } }),
  )
  await page.route('**/api/front/user/todo/count/', (r) =>
    r.fulfill({ json: { status: 1, data: { count: 0 } } }),
  )
  await page.route('**/api/front/learn/task/my_notes/folders/?*', (r) =>
    r.fulfill({ json: folders }),
  )
  await page.route(
    '**/api/front/learn/task/my_notes/folders/*/courses/*/notes/?*',
    (r) => r.fulfill({ json: [{ id: note.id, name: note.name }] }),
  )
  await page.route('**/api/front/user/note/n1/', (r) =>
    r.fulfill({ json: note }),
  )
})
test('默认归档只展开，选课读取首个笔记；自定义目录才允许新建', async ({
  page,
}) => {
  await page.goto('/#/basic/user/note')
  await expect(
    page.getByRole('heading', { name: '我的笔记', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: '富文本正文', exact: true }),
  ).toContainText('原始正文')
  await expect(
    page.getByRole('button', { name: '新建笔记', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('switch', { name: '分享笔记', exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: '/tmp/s10-notes/screenshots/03-personal-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: '/tmp/s10-notes/screenshots/03-personal-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '研究', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '新建笔记', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('switch', { name: '分享笔记', exact: true }),
  ).toHaveCount(0)
})
test('目录新建校验、保留原名称，改名及删除需明确级联确认', async ({ page }) => {
  let directories = [...folders]
  await page.route('**/api/front/learn/task/my_notes/folders/?*', (r) =>
    r.fulfill({ json: directories }),
  )
  await page.route('**/api/front/learn/task/my_notes/folders/create/', (r) => {
    expect(r.request().postDataJSON()).toEqual({ name: ' /研究? ' })
    directories = [
      ...directories,
      { id: 11, name: ' /研究? ', type: 5, courses: [] },
    ]
    return r.fulfill({ json: { id: 11 } })
  })
  await page.route(
    '**/api/front/learn/task/my_notes/folders/11/rename/',
    (r) => {
      expect(r.request().postDataJSON()).toEqual({ id: 11, name: '新研究' })
      directories = directories.map((f) =>
        f.id === 11 ? { ...f, name: '新研究' } : f,
      )
      return r.fulfill({ json: { id: 11 } })
    },
  )
  let deleted = false
  await page.route(
    '**/api/front/learn/task/my_notes/folders/11/delete/',
    (r) => {
      deleted = true
      directories = directories.filter((f) => f.id !== 11)
      return r.fulfill({ json: { id: 11 } })
    },
  )
  await page.goto('/#/basic/user/note')
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('请输入名称', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(dialog.getByText('请输入名称', { exact: true })).toBeVisible()
  await dialog.getByLabel('名称', { exact: true }).fill(' /研究? ')
  await dialog.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(
    page.getByRole('button', { name: ' /研究? ', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: '重命名文件夹  /研究? ', exact: true })
    .click()
  await dialog.getByLabel('名称', { exact: true }).fill('新研究')
  await dialog.getByRole('button', { name: '保存名称', exact: true }).click()
  await page
    .getByRole('button', { name: '删除文件夹 新研究', exact: true })
    .click()
  await expect(page.getByRole('alertdialog')).toContainText(
    /文件夹.*及其下笔记/,
  )
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(deleted).toBe(false)
  await page
    .getByRole('button', { name: '删除文件夹 新研究', exact: true })
    .click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '新研究', exact: true }),
  ).toHaveCount(0)
})
test('自定义目录新建笔记、改名和删除，失败保留弹窗且不报告成功', async ({
  page,
}) => {
  let items = [{ id: 'n1', name: '观察记录' }]
  await page.route(
    '**/api/front/learn/task/my_notes/folders/9/courses/0/notes/?*',
    (r) => r.fulfill({ json: items }),
  )
  await page.route(
    '**/api/front/learn/task/my_notes/folders/9/courses/0/notes/',
    (r) => {
      expect(r.request().postDataJSON()).toEqual({
        name: '新增记录',
        share: false,
        extend: { breakpoint_time: '' },
      })
      items = [...items, { id: 'n2', name: '新增记录' }]
      return r.fulfill({ json: { id: 'n2' } })
    },
  )
  await page.route('**/api/front/user/note/n2/', (r) =>
    r.fulfill({
      json: {
        ...note,
        id: 'n2',
        name: items.find((i) => i.id === 'n2')?.name,
        extend: { opaque: '保留' },
      },
    }),
  )
  await page.route(
    '**/api/front/learn/task/my_notes/folders/9/courses/0/notes/n2/',
    (r) => {
      expect(r.request().postDataJSON()).toEqual({
        name: '改后记录',
        share: false,
        extend: { opaque: '保留' },
      })
      items = items.map((i) => (i.id === 'n2' ? { ...i, name: '改后记录' } : i))
      return r.fulfill({ json: { id: 'n2' } })
    },
  )
  let attempts = 0
  await page.route('**/api/front/user/note/delete/', (r) => {
    expect(r.request().postDataJSON()).toEqual({ ids: ['n2'] })
    if (++attempts === 1)
      return r.fulfill({ json: { status: 2, message: '合成删除拒绝' } })
    items = items.filter((i) => i.id !== 'n2')
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/user/note')
  await page.getByRole('button', { name: '研究', exact: true }).click()
  await page.getByRole('button', { name: '新建笔记', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByLabel('名称', { exact: true })
    .fill('新增记录')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存名称', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: '新增记录', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: '重命名笔记 新增记录', exact: true })
    .click()
  await page
    .getByRole('dialog')
    .getByLabel('名称', { exact: true })
    .fill('改后记录')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '保存名称', exact: true })
    .click()
  await page
    .getByRole('button', { name: '删除笔记 改后记录', exact: true })
    .click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByText('合成删除拒绝', { exact: true })).toBeVisible()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '改后记录', exact: true }),
  ).toHaveCount(0)
})
test('正文失败保留草稿，保存后重开格式一致；Word导出已有版本不偷偷保存草稿', async ({
  page,
}) => {
  let content = note.content
  let patches = 0
  await page.route('**/api/front/user/note/n1/', (r) => {
    if (r.request().method() === 'PATCH') {
      expect(Object.keys(r.request().postDataJSON())).toEqual(['content'])
      if (++patches === 1)
        return r.fulfill({ status: 500, json: { error: '合成正文保存失败' } })
      content = r.request().postDataJSON().content
      return r.fulfill({ json: { id: 'n1' } })
    }
    return r.fulfill({ json: { ...note, content } })
  })
  await page.route('**/api/front/user/note/n1/export/', (r) => {
    expect(r.request().method()).toBe('POST')
    expect(r.request().postData()).toBeNull()
    return r.fulfill({
      json: { status: 1, data: { file_path: '/files/n.docx' } },
    })
  })
  await page.route('**/files/n.docx?*', (r) =>
    r.fulfill({
      headers: {
        'content-type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'content-disposition': 'attachment; filename=n.docx',
      },
      body: 'isolated-word-fixture',
    }),
  )
  await page.goto('/#/basic/user/note')
  const editor = page.getByRole('textbox', { name: '富文本正文', exact: true })
  await editor.fill('保存的新正文')
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(
    page.getByText('合成正文保存失败', { exact: true }),
  ).toBeVisible()
  await expect(editor).toContainText('保存的新正文')
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(page.getByText('笔记已保存', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '研究', exact: true }).click()
  await expect(editor).toContainText('保存的新正文')
  await editor.fill('尚未保存的草稿')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 Word', exact: true }).click()
  expect((await downloaded).suggestedFilename()).toBe('n.docx')
  expect(patches).toBe(2)
  await expect(editor).toContainText('尚未保存的草稿')
})
test('已有驻点按原can_enter门控并携带课程章节和时间导航', async ({ page }) => {
  await page.route('**/api/front/user/note/n1/', (r) =>
    r.fulfill({
      json: { ...note, section_id: 30, extend: { breakpoint_time: 75 } },
    }),
  )
  let permitted = false
  await page.route(
    '**/api/front/learn/task/self_study/open_courses/10/can_enter/',
    (r) => r.fulfill({ json: { can_enter: permitted } }),
  )
  await page.goto('/#/basic/user/note')
  const checkpoint = page.getByRole('button', {
    name: '跳转到驻点 01:15',
    exact: true,
  })
  await expect(checkpoint).toBeVisible()
  await checkpoint.click()
  await expect(
    page.getByText('该专题已下线，无法查看！', { exact: true }),
  ).toBeVisible()
  permitted = true
  await checkpoint.click()
  await expect(page).toHaveURL(/#\/basic\/training\/course\/10/)
  expect(
    await page.evaluate(() => ({
      section_id: history.state.section_id,
      breakpoint_time: history.state.breakpoint_time,
    })),
  ).toEqual({ section_id: 30, breakpoint_time: 75 })
})
test('未保存内容切目录可取消，路由离开需确认；接受后新目录不继承草稿', async ({
  page,
}) => {
  await page.goto('/#/basic/user/note')
  const editor = page.getByRole('textbox', { name: '富文本正文', exact: true })
  await editor.fill('私有草稿')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: '研究', exact: true }).click()
  await expect(editor).toContainText('私有草稿')
  await page.getByRole('link', { name: '首页', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '继续编辑', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(editor).toContainText('私有草稿')
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '研究', exact: true }).click()
  await expect(editor).toContainText('原始正文')
  await expect(editor).not.toContainText('私有草稿')
})

test('保存回读旧正文时保留提交草稿且允许重试', async ({ page }) => {
  let saved = note.content
  let stale = true
  await page.route('**/api/front/user/note/n1/', (r) => {
    if (r.request().method() === 'PATCH') {
      if (!stale) saved = r.request().postDataJSON().content
      return r.fulfill({ json: { id: 'n1' } })
    }
    return r.fulfill({ json: { ...note, content: saved } })
  })
  await page.goto('/#/basic/user/note')
  const editor = page.getByRole('textbox', { name: '富文本正文', exact: true })
  await editor.fill('需要保存的草稿')
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(
    page.getByText('保存后读取的笔记正文与提交内容不一致，草稿已保留', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(editor).toContainText('需要保存的草稿')
  await expect(page.getByText('笔记已保存', { exact: true })).toHaveCount(0)
  stale = false
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(page.getByText('笔记已保存', { exact: true })).toBeVisible()
  await page.reload()
  await expect(editor).toContainText('需要保存的草稿')
})

test('新建刷新重排和活动笔记移出列表均保留当前草稿', async ({ page }) => {
  let items = [{ id: 'n1', name: note.name }]
  let created = 0
  await page.route(
    '**/api/front/learn/task/my_notes/folders/9/courses/0/notes/?*',
    (r) => r.fulfill({ json: items }),
  )
  await page.route(
    '**/api/front/learn/task/my_notes/folders/9/courses/0/notes/',
    (r) => {
      created++
      items =
        created === 1
          ? [{ id: 'n2', name: '新记录' }, ...items]
          : [{ id: 'n3', name: '另一记录' }]
      return r.fulfill({ json: { id: created === 1 ? 'n2' : 'n3' } })
    },
  )
  await page.route('**/api/front/user/note/n2/', (r) =>
    r.fulfill({
      json: { ...note, id: 'n2', name: '新记录', content: '<p>另一本正文</p>' },
    }),
  )
  await page.goto('/#/basic/user/note')
  await page.getByRole('button', { name: '研究', exact: true }).click()
  const editor = page.getByRole('textbox', { name: '富文本正文', exact: true })
  await editor.fill('不能被刷新丢掉的草稿')
  for (const name of ['新记录', '另一记录']) {
    await page.getByRole('button', { name: '新建笔记', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('名称', { exact: true }).fill(name)
    await dialog.getByRole('button', { name: '保存名称', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(editor).toContainText('不能被刷新丢掉的草稿')
    await expect(
      page.getByRole('heading', { name: note.name, exact: true }),
    ).toBeVisible()
  }
  await expect(
    page.getByText(
      '当前笔记已不在列表中，草稿仍保留；选择其他笔记前会确认离开。',
      { exact: true },
    ),
  ).toBeVisible()
  page.once('dialog', (d) => d.dismiss())
  await page.getByRole('button', { name: '另一记录', exact: true }).click()
  await expect(editor).toContainText('不能被刷新丢掉的草稿')
})

for (const action of ['保存', '分享'] as const) {
  test(`${action}结果不会被迟到的旧详情覆盖`, async ({ page }) => {
    let saved = { ...note }
    let reads = 0
    let release!: () => void
    let started!: () => void
    const pending = new Promise<void>((r) => {
      release = r
    })
    const start = new Promise<void>((r) => {
      started = r
    })
    await page.route(
      '**/api/front/learn/task/my_notes/folders/*/courses/*/notes/?*',
      (r) =>
        r.fulfill({
          json: [
            { id: 'n1', name: note.name },
            { id: 'n2', name: '备用记录' },
          ],
        }),
    )
    await page.route('**/api/front/user/note/n2/', (r) =>
      r.fulfill({ json: { ...note, id: 'n2' } }),
    )
    await page.route('**/api/front/user/note/n1/', async (r) => {
      if (r.request().method() === 'PATCH') {
        saved = { ...saved, ...r.request().postDataJSON() }
        return r.fulfill({ json: { id: 'n1' } })
      }
      const snapshot = { ...saved }
      if (++reads === 2) {
        started()
        await pending
      }
      await r.fulfill({ json: snapshot }).catch(() => {})
    })
    await page.goto('/#/basic/user/note')
    const editor = page.getByRole('textbox', {
      name: '富文本正文',
      exact: true,
    })
    await expect(editor).toContainText('原始正文')
    await page.getByRole('button', { name: '备用记录', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: '观察记录', exact: true }),
    ).toBeVisible()
    await page.getByRole('button', { name: note.name, exact: true }).click()
    await start
    await editor.fill('刚刚持久化的新正文')
    if (action === '保存')
      await page.getByRole('button', { name: '保存笔记', exact: true }).click()
    else
      await page.getByRole('switch', { name: '分享笔记', exact: true }).click()
    await expect(
      page.getByText(action === '保存' ? '笔记已保存' : '已分享笔记', {
        exact: true,
      }),
    ).toBeVisible()
    release()
    // 让已经返回的旧网络响应获得消费机会，再通过页面检查当前内容。
    await page.waitForTimeout(200)
    await expect(editor).toContainText('刚刚持久化的新正文')
    if (action === '分享')
      await expect(
        page.getByRole('switch', { name: '分享笔记', exact: true }),
      ).toBeChecked()
    await page.reload()
    await expect(editor).toContainText('刚刚持久化的新正文')
  })
}

test('无草稿搜索无结果时清理旧详情，恢复列表后选择合法笔记', async ({
  page,
}) => {
  await page.route(
    '**/api/front/learn/task/my_notes/folders/*/courses/*/notes/?*',
    (r) =>
      r.fulfill({
        json: new URL(r.request().url()).searchParams.get('search')
          ? []
          : [{ id: note.id, name: note.name }],
      }),
  )
  await page.goto('/#/basic/user/note')
  const editor = page.getByRole('textbox', { name: '富文本正文', exact: true })
  await expect(editor).toContainText('原始正文')
  await page
    .getByRole('textbox', { name: '搜索笔记', exact: true })
    .fill('无匹配内容')
  await expect(page.getByText('暂无笔记', { exact: true })).toBeVisible()
  await expect(editor).toHaveCount(0)
  await expect(page.getByText('暂无详情', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索笔记', exact: true }).clear()
  await expect(editor).toContainText('原始正文')
})
