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
        id: new URL(route.request().url()).pathname.split('/').at(-2)!,
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
  let noteId = 7
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/',
    async (route) => {
      if (route.request().method() === 'POST') {
        if (++attempts === 1)
          return route.fulfill({ status: 500, json: { error: '笔记保存失败' } })
        expect(Object.keys(route.request().postDataJSON())).toEqual(['content'])
        noteId = 42
        saved = route.request().postDataJSON().content
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({ json: { id: noteId, content: saved } })
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
  await expect(page.getByRole('button', { name: '导出 Word' })).toBeEnabled()
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

test('图片选择、拖入和base64粘贴均上传后插入，支持预览和图片尺寸重开', async ({
  page,
  errors,
}) => {
  let saved = '<p>图片笔记</p>'
  let uploads = 0
  let failedUpload = false
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/',
    (route) => {
      if (route.request().method() === 'POST') {
        saved = route.request().postDataJSON().content
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({ json: { id: 9, content: saved } })
    },
  )
  await page.route('**/api/front/upload_image/', (route) => {
    if (!failedUpload) {
      failedUpload = true
      return route.fulfill({ status: 500, json: { error: '图片上传失败' } })
    }
    expect(route.request().headers()['authorization']).toBeUndefined()
    const body = route.request().postDataBuffer()!.toString()
    expect(body).toContain('name="image"')
    expect(body).toContain('name="mode"\r\n\r\nscene')
    expect(body).not.toContain('name="uuid"')
    return route.fulfill({
      json: { data: { url: `/uploads/image-${++uploads}.png` } },
    })
  })
  await page.route('**/uploads/*.png', (route) =>
    route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="blue"/></svg>',
      contentType: 'image/svg+xml',
    }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/notes')
  const editor = page.getByRole('textbox', { name: '富文本正文' })
  await expect(editor).toContainText('图片笔记')
  await page.locator('input[type=file]').setInputFiles({
    name: 'selected.png',
    mimeType: 'image/png',
    buffer: Buffer.from('image'),
  })
  await expect(page.getByText('图片上传失败', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: '保存笔记' })).toBeEnabled()
  await page.locator('input[type=file]').setInputFiles({
    name: 'selected.png',
    mimeType: 'image/png',
    buffer: Buffer.from('image'),
  })
  await expect(editor.locator('img')).toHaveCount(1)
  await editor.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['drop'], 'drop.png', { type: 'image/png' }))
    element.dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  })
  await expect(editor.locator('img')).toHaveCount(2)
  await editor.evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.setData(
      'text/html',
      '<p>粘贴</p><img src="data:image/png;base64,aW1hZ2U=">',
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: transfer,
      }),
    )
  })
  await expect(editor.locator('img')).toHaveCount(3)
  await editor.locator('img').first().click()
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '全屏编辑' }).click()
  await expect(page.getByRole('button', { name: '退出全屏' })).toBeVisible()
  const resizedImage = editor.locator('img').first()
  await resizedImage.click()
  await expect(page.getByRole('dialog', { name: '图片预览' })).toHaveCount(0)
  const handle = page.locator(
    '.blot-formatter__resize-handle[data-position="bottom-right"]',
  )
  await expect(handle).toBeVisible()
  const bounds = await handle.boundingBox()
  if (!bounds) throw new Error('图片缩放控件不可见')
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  )
  await page.mouse.down()
  await page.mouse.move(bounds.x - 50, bounds.y - 30, { steps: 5 })
  await page.mouse.up()
  await editor.locator('p').last().click()
  await expect(resizedImage).toHaveAttribute('width', /\d/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '全屏编辑' })).toBeVisible()
  await page.getByRole('button', { name: '保存笔记' }).click()
  await expect(page.getByRole('button', { name: '导出 Word' })).toBeEnabled()
  expect(saved).not.toContain('data:image')
  expect(uploads).toBe(3)
  await page.reload()
  await expect(editor.locator('img')).toHaveCount(3)
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
  ])
  errors.length = 0
})

test('历史HTML各类格式经Quill编辑、保存、重开仍可见', async ({ page }) => {
  let saved =
    '<h1>一级</h1><h2>二级</h2><h3>三级</h3><p><strong>粗体</strong><em>斜体</em><u>下划线</u><s>删除</s><sub>下标</sub><sup>上标</sup></p><blockquote>引用</blockquote><pre class="ql-syntax" spellcheck="false">代码</pre><ol><li>顺序</li></ol><ul><li>无序</li></ul><ul data-checked="true"><li>待办</li></ul><p class="ql-indent-2 ql-direction-rtl ql-align-right"><span style="color: rgb(255, 0, 0); background-color: rgb(255, 255, 0)">缩进颜色方向</span></p>'
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/',
    (route) => {
      if (route.request().method() === 'POST') {
        saved = route.request().postDataJSON().content
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({ json: { id: 9, content: saved } })
    },
  )
  await page.goto('/#/basic/user/bench/experiment/one/notes')
  const editor = page.getByRole('textbox', { name: '富文本正文' })
  await expect(editor.locator('h1')).toHaveText('一级')
  await expect(editor.locator('h2')).toHaveText('二级')
  await expect(editor.locator('h3')).toHaveText('三级')
  await expect(editor.locator('strong')).toHaveText('粗体')
  await expect(editor.locator('em')).toHaveText('斜体')
  await expect(editor.locator('u')).toHaveText('下划线')
  await expect(editor.locator('s')).toHaveText('删除')
  await expect(editor.locator('sub')).toHaveText('下标')
  await expect(editor.locator('sup')).toHaveText('上标')
  await expect(editor.locator('blockquote')).toHaveText('引用')
  await expect(editor.locator('.ql-code-block')).toHaveText('代码')
  await expect(editor.locator('[data-list=ordered]')).toContainText('顺序')
  await expect(editor.locator('[data-list=bullet]')).toContainText('无序')
  await expect(editor.locator('[data-list=checked]')).toContainText('待办')
  await expect(
    editor.locator('.ql-indent-2.ql-direction-rtl.ql-align-right'),
  ).toContainText('缩进颜色方向')
  await expect(editor.locator('span[style]')).toHaveCSS(
    'color',
    'rgb(255, 0, 0)',
  )
  await editor.press('End')
  await editor.pressSequentially('已编辑')
  await page.getByRole('button', { name: '保存笔记' }).click()
  await expect(page.getByRole('button', { name: '导出 Word' })).toBeEnabled()
  await page.reload()
  await expect(editor.locator('[data-list=checked]')).toContainText('待办')
  await expect(editor.locator('blockquote')).toHaveText('引用')
  await expect(editor.locator('sup')).toHaveText('上标')
  await expect(editor.locator('span[style]')).toHaveCSS(
    'background-color',
    'rgb(255, 255, 0)',
  )
})

test('离开编辑会话取消旧上传，切换实验后迟到响应不插入正文', async ({
  page,
}) => {
  let release: () => void = () => {}
  let started: () => void = () => {}
  const start = new Promise<void>((resolve) => {
    started = resolve
  })
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/admin/simulation/experiment/*/user/note/', (route) =>
    route.fulfill({
      json: {
        id: 1,
        content: `<p>实验${new URL(route.request().url()).pathname.split('/').at(-4)}正文</p>`,
      },
    }),
  )
  await page.route('**/api/front/upload_image/', async (route) => {
    started()
    await pending
    await route
      .fulfill({ json: { data: { url: '/uploads/old.png' } } })
      .catch(() => {})
  })
  await page.goto('/#/basic/user/bench/experiment/one/notes')
  await expect(page.getByRole('textbox', { name: '富文本正文' })).toContainText(
    '实验one正文',
  )
  await page.locator('input[type=file]').setInputFiles({
    name: 'slow.png',
    mimeType: 'image/png',
    buffer: Buffer.from('image'),
  })
  await start
  await page.getByRole('link', { name: '场景说明', exact: true }).click()
  await expect(
    page.getByRole('alertdialog', { name: '放弃未保存的笔记？' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '留在这里' }).click()
  await expect(page.getByRole('textbox', { name: '富文本正文' })).toBeVisible()
  await page.getByRole('link', { name: '场景说明', exact: true }).click()
  await page.getByRole('button', { name: '继续离开' }).click()
  await expect(page.getByRole('heading', { name: '场景说明' })).toBeVisible()
  release()
  await page.goto('/#/basic/user/bench/experiment/fast/notes')
  await expect(page.getByRole('textbox', { name: '富文本正文' })).toContainText(
    '实验fast正文',
  )
  await expect(page.locator('.ql-editor img')).toHaveCount(0)
})

test('无效详情明确报错，可重试读取有效ID的空正文，拒绝访问不伪装成功', async ({
  page,
  errors,
}) => {
  let response: object = {}
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/',
    (route) => route.fulfill({ json: response }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/notes')
  await expect(page.getByRole('alert')).toContainText(
    '需要有效笔记 ID 与字符串正文',
  )
  await expect(page.getByRole('button', { name: '保存笔记' })).toHaveCount(0)
  response = { id: 9, content: '' }
  await page.getByRole('button', { name: '重试笔记' }).click()
  await expect(page.getByRole('textbox', { name: '富文本正文' })).toBeEmpty()
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/',
    (route) => route.fulfill({ status: 403, json: { error: '您无权访问' } }),
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: '您无权访问' })).toBeVisible()
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
  ])
  errors.length = 0
})

test('工具栏可按名称操作行内格式和清格式', async ({ page }) => {
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/',
    (route) => route.fulfill({ json: { id: 1, content: '<p>可编辑文字</p>' } }),
  )
  await page.goto('/#/basic/user/bench/experiment/one/notes')
  const editor = page.getByRole('textbox', { name: '富文本正文' })
  await editor.click()
  await editor.press('ControlOrMeta+A')
  await page.getByRole('button', { name: '粗体', exact: true }).click()
  await expect(editor.locator('strong')).toHaveText('可编辑文字')
  await page.getByRole('button', { name: '清除格式', exact: true }).click()
  await expect(editor.locator('strong')).toHaveCount(0)
})

test('场景保存后迟到旧读取不污染重开的正文', async ({ page }) => {
  let saved = '<p>场景原正文</p>'
  let reads = 0
  let releaseOld!: () => void
  let oldStarted!: () => void
  let releaseReopen!: () => void
  let reopenStarted!: () => void
  const oldPending = new Promise<void>((r) => {
    releaseOld = r
  })
  const oldStart = new Promise<void>((r) => {
    oldStarted = r
  })
  const reopenPending = new Promise<void>((r) => {
    releaseReopen = r
  })
  const reopenStart = new Promise<void>((r) => {
    reopenStarted = r
  })
  await page.route(
    '**/api/admin/simulation/experiment/one/user/note/',
    async (r) => {
      if (r.request().method() === 'POST') {
        saved = r.request().postDataJSON().content
        return r.fulfill({ json: { status: 1 } })
      }
      const snapshot = saved
      reads++
      if (reads === 3) {
        oldStarted()
        await oldPending
      }
      if (reads >= 5) {
        reopenStarted()
        await reopenPending
      }
      await r.fulfill({ json: { id: 7, content: snapshot } }).catch(() => {})
    },
  )
  await page.goto('/#/basic/user/bench/experiment/one/notes')
  const editor = page.getByRole('textbox', { name: '富文本正文', exact: true })
  await expect(editor).toContainText('场景原正文')
  await page.getByRole('link', { name: '场景说明', exact: true }).click()
  await page.getByRole('link', { name: '场景笔记', exact: true }).click()
  await oldStart
  await editor.fill('场景已保存的新正文')
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(page.getByText('笔记已保存', { exact: true })).toBeVisible()
  releaseOld()
  await page.waitForTimeout(200)
  await page.getByRole('link', { name: '场景说明', exact: true }).click()
  await page.getByRole('link', { name: '场景笔记', exact: true }).click()
  await reopenStart
  try {
    await expect(editor).toContainText('场景已保存的新正文')
  } finally {
    releaseReopen()
  }
  await page.reload()
  await expect(editor).toContainText('场景已保存的新正文')
})
