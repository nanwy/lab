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
})

test('说明可阅读、编辑取消不写入，失败保留草稿后保存刷新重开', async ({
  page,
  errors,
}) => {
  let saved = '<h2>已有说明</h2><p><strong>历史格式</strong></p>'
  let attempts = 0
  let reads = 0
  await page.route(
    '**/api/front/simulation/experiment/one/?more=1',
    async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON()
        expect(Object.keys(body)).toEqual(['overview'])
        if (++attempts === 1)
          return route.fulfill({ status: 500, json: { error: '说明保存失败' } })
        saved = body.overview
        return route.fulfill({ json: { id: 'one' } })
      }
      ++reads
      return route.fulfill({
        json: {
          id: 'one',
          name: '内容实验',
          desc: '并行编辑的基本信息',
          node_count: 0,
          user_name: '学员',
          tags: [],
          overview: saved,
          release_type: 2,
          max_duration: 2,
          tags_category: null,
        },
      })
    },
  )
  await page.goto('/#/basic/user/bench/experiment/one/explain')
  await expect(
    page.getByRole('heading', { name: '场景说明', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '编辑说明' }).click()
  const editor = page.getByRole('textbox', { name: '富文本正文' })
  await editor.fill('取消的内容')
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('heading', { name: '已有说明' })).toBeVisible()
  expect(attempts).toBe(0)
  await page.getByRole('button', { name: '编辑说明' }).click()
  await expect(editor).toContainText('历史格式')
  await editor.press('ControlOrMeta+End')
  await editor.press('Enter')
  await editor.pressSequentially('修改的说明')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('说明保存失败', { exact: true })).toHaveCount(1)
  await expect(editor).toContainText('修改的说明')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('button', { name: '编辑说明' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '富文本阅读' })).toContainText(
    '修改的说明',
  )
  expect(reads).toBeGreaterThan(1)
  await page.reload()
  await expect(page.getByRole('textbox', { name: '富文本阅读' })).toContainText(
    '修改的说明',
  )
  await page.getByRole('link', { name: '场景信息', exact: true }).click()
  await expect(
    page.getByText('并行编辑的基本信息', { exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
  ])
  errors.length = 0
})

test('说明图片按scene上传保存重开，后台刷新保留草稿，取消丢弃迟到上传', async ({
  page,
}) => {
  let saved = '<h2>图片说明</h2>'
  let reads = 0
  let patches = 0
  let uploadAttempts = 0
  let releaseUpload: () => void = () => {}
  const slowUpload = new Promise<void>((resolve) => {
    releaseUpload = resolve
  })
  let finishUpload: () => void = () => {}
  const uploadFinished = new Promise<void>((resolve) => {
    finishUpload = resolve
  })
  await page.route(
    '**/api/front/simulation/experiment/*/?more=1',
    async (route) => {
      const id = new URL(route.request().url()).pathname.split('/').at(-2)
      if (route.request().method() === 'PATCH') {
        ++patches
        const body = route.request().postDataJSON()
        expect(Object.keys(body)).toEqual(['overview'])
        saved = body.overview
        return route.fulfill({ json: { id } })
      }
      ++reads
      return route.fulfill({
        json: {
          id,
          name: `实验${id}`,
          desc: '',
          node_count: 0,
          user_name: '学员',
          tags: [],
          overview: id === 'two' ? '' : saved,
          release_type: 2,
          max_duration: 2,
          tags_category: null,
        },
      })
    },
  )
  await page.route('**/api/front/upload_image/', async (route) => {
    expect(route.request().method()).toBe('POST')
    const data = route.request().postDataBuffer()!.toString()
    expect(data).toContain('name="image"')
    expect(data).toContain('name="mode"\r\n\r\nscene')
    expect(data).not.toContain('name="uuid"')
    const attempt = ++uploadAttempts
    if (attempt === 2) await slowUpload
    await route
      .fulfill({ json: { data: { url: '/uploads/overview.png' } } })
      .catch(() => {})
    if (attempt === 2) finishUpload()
  })
  await page.route('**/uploads/overview.png', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGNQ6NhNU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULAFiAjEx1W99+AAAAAElFTkSuQmCC',
        'base64',
      ),
    }),
  )
  const image = {
    name: 'overview.png',
    mimeType: 'image/png',
    buffer: Buffer.from('isolated image upload'),
  }
  await page.goto('/#/basic/user/bench/experiment/one/explain')
  await page.getByRole('button', { name: '编辑说明' }).click()
  const editor = page.getByRole('textbox', { name: '富文本正文' })
  await editor.press('ControlOrMeta+End')
  await editor.press('Enter')
  await editor.pressSequentially('未保存草稿')
  saved = '<p>后台刷新内容</p>'
  const beforeReads = reads
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect.poll(() => reads).toBeGreaterThan(beforeReads)
  await expect(editor).toContainText('未保存草稿')
  await page.getByRole('button', { name: '全屏编辑' }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.fullscreenElement?.classList.contains('rich-content'),
      ),
    )
    .toBe(true)
  expect(patches).toBe(0)
  await page.getByRole('button', { name: '退出全屏' }).click()
  await page
    .locator('input[type=file][aria-label="选择正文图片"]')
    .setInputFiles(image)
  await expect(editor.locator('img')).toHaveAttribute(
    'src',
    '/uploads/overview.png',
  )
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: '富文本阅读' }).locator('img'),
  ).toHaveAttribute('src', '/uploads/overview.png')
  await page.reload()
  await expect(page.getByRole('textbox', { name: '富文本阅读' })).toContainText(
    '未保存草稿',
  )
  await page.getByRole('textbox', { name: '富文本阅读' }).locator('img').click()
  await expect(page.getByRole('dialog', { name: '图片预览' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '编辑说明' }).click()
  await page
    .locator('input[type=file][aria-label="选择正文图片"]')
    .setInputFiles(image)
  await expect(page.getByText('正在上传图片…')).toBeVisible()
  await expect.poll(() => uploadAttempts).toBe(2)
  await expect(
    page.getByRole('button', { name: '确定', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '编辑说明' }).click()
  releaseUpload()
  await uploadFinished
  await expect(editor.locator('img')).toHaveCount(1)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.goto('/#/basic/user/bench/experiment/two/explain')
  await expect(page.getByText('暂无场景说明')).toBeVisible()
  await page.getByRole('button', { name: '编辑说明' }).click()
  await expect(editor).toHaveText('')
  await expect(editor.locator('img')).toHaveCount(0)
  expect(patches).toBe(1)
})

test('说明保存后的刷新失败仍保留草稿，恢复后可重提，离页须确认', async ({
  page,
  errors,
}) => {
  let saved = '<p>起始说明</p>'
  let failRefresh = false
  let patches = 0
  await page.route(
    '**/api/front/simulation/experiment/one/?more=1',
    (route) => {
      if (route.request().method() === 'PATCH') {
        ++patches
        saved = route.request().postDataJSON().overview
        failRefresh = patches === 1
        return route.fulfill({ json: { id: 'one' } })
      }
      if (failRefresh) {
        failRefresh = false
        return route.fulfill({ status: 500, json: { error: '说明刷新失败' } })
      }
      return route.fulfill({
        json: {
          id: 'one',
          name: '内容实验',
          desc: '',
          node_count: 0,
          user_name: '学员',
          tags: [],
          overview: saved,
          release_type: 2,
          max_duration: 2,
          tags_category: null,
        },
      })
    },
  )
  await page.goto('/#/basic/user/bench/experiment/one/explain')
  await page.getByRole('button', { name: '编辑说明' }).click()
  const editor = page.getByRole('textbox', { name: '富文本正文' })
  await editor.fill('保存后的刷新仍需恢复')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('说明刷新失败', { exact: true })).toHaveCount(1)
  await expect(editor).toContainText('保存后的刷新仍需恢复')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('button', { name: '编辑说明' })).toBeVisible()
  await page.getByRole('button', { name: '编辑说明' }).click()
  await editor.fill('离页草稿')
  await page.getByRole('link', { name: '场景信息', exact: true }).click()
  const confirm = page.getByRole('alertdialog', { name: '放弃未保存的说明？' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '留在这里' }).click()
  await expect(editor).toContainText('离页草稿')
  await page.getByRole('link', { name: '场景信息', exact: true }).click()
  await confirm.getByRole('button', { name: '继续离开' }).click()
  await expect(
    page.getByRole('heading', { name: '基本信息', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: '场景说明', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '富文本阅读' })).toContainText(
    '保存后的刷新仍需恢复',
  )
  expect(patches).toBe(2)
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 500 (Internal Server Error)',
  ])
  errors.length = 0
})

test('说明保存逐张检查图片来源，正文包含本站地址也不能放行外链', async ({
  page,
}) => {
  let patches = 0
  await page.route('https://outside.invalid/image.png', (route) =>
    route.fulfill({ status: 204 }),
  )
  await page.route(
    '**/api/front/simulation/experiment/one/?more=1',
    (route) => {
      if (route.request().method() === 'PATCH') {
        ++patches
        return route.fulfill({ json: { id: 'one' } })
      }
      return route.fulfill({
        json: {
          id: 'one',
          name: '来源检查实验',
          desc: '',
          node_count: 0,
          user_name: '学员',
          tags: [],
          overview: `<p>${new URL(route.request().url()).origin}</p><img src="https://outside.invalid/image.png">`,
          release_type: 2,
          max_duration: 2,
          tags_category: null,
        },
      })
    },
  )
  await page.goto('/#/basic/user/bench/experiment/one/explain')
  await page.getByRole('button', { name: '编辑说明' }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    page.getByText('含有外部图片，请先上传图片后再保存', { exact: true }),
  ).toHaveCount(1)
  await expect(
    page.getByRole('textbox', { name: '富文本正文' }).locator('img'),
  ).toHaveAttribute('src', 'https://outside.invalid/image.png')
  expect(patches).toBe(0)
  await page.getByRole('button', { name: '取消', exact: true }).click()
})
