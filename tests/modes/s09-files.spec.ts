import { expect, test } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
const file = {
  id: 'f1',
  name: '讲义.txt',
  path: '/讲义.txt',
  attached: '/files/讲义-12345678.txt',
  is_file: 1,
  size: 2048,
  type: 'text/plain',
  altertime: '2026-10-24 09:00',
}
test.beforeEach(async ({ page }) => {
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (r) => r.fulfill({ json }))
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({
      json: {
        id: 's09',
        username: '模拟学员',
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
})
test('公开目录导航、直接获取和个人域隔离', async ({ page }) => {
  await page.route('**/api/front/open/resource_network_disk/?*', (r) =>
    r.fulfill({
      json:
        new URL(r.request().url()).searchParams.get('parent_path') === '/'
          ? [
              {
                ...file,
                id: 'dir',
                name: '资料 & #',
                path: '/资料 & #',
                is_file: 0,
                attached: null,
              },
              file,
            ]
          : [],
    }),
  )
  await page.route('**/api/front/learn/task/my_profile/files/?*', (r) =>
    r.fulfill({
      json: [
        {
          ...file,
          attached: '/files/讲义_server.txt',
          is_share: 1,
          is_shared_file: 1,
          source_info: '课程分享',
        },
      ],
    }),
  )
  await page.goto('/#/basic/user/file')
  await expect(
    page.getByRole('heading', { name: '资源网盘', exact: true }),
  ).toBeVisible()
  await page.getByLabel('选择 讲义.txt', { exact: true }).check()
  await expect(page.getByText('已选择 1 项', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: '下载 讲义.txt', exact: true }),
  ).toHaveAttribute('download', '讲义.txt')
  await page.getByRole('button', { name: '资料 & #', exact: true }).click()
  await expect(page.getByText('此目录暂无文件', { exact: true })).toBeVisible()
  await expect(page.getByText('已选择 1 项', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '返回上级', exact: true }).click()
  await page.getByRole('tab', { name: '个人资料', exact: true }).click()
  await expect(
    page.getByRole('cell', { name: '课程分享', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: '下载 讲义.txt', exact: true }),
  ).toHaveAttribute('download', '讲义.txt')
  await page.screenshot({
    path: test.info().outputPath('files-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('files-mobile.png'),
    fullPage: true,
  })
})

test('目录契约失败可重试、加载与空目录反馈，播放器切域清理', async ({
  page,
}) => {
  let state: 'error' | 'loading' | 'video' = 'error'
  let release!: () => void
  await page.route('**/api/front/open/resource_network_disk/?*', async (r) => {
    if (state === 'error') return r.fulfill({ json: { results: [] } })
    if (state === 'loading')
      await new Promise<void>((resolve) => {
        release = resolve
      })
    return r.fulfill({
      json: [
        {
          ...file,
          name: '课程.mp4',
          type: 'video/mp4',
          attached: '/fixture/video.mp4',
        },
      ],
    })
  })
  await page.route('**/api/front/learn/task/my_profile/files/?*', (r) =>
    r.fulfill({ json: [] }),
  )
  await page.route('**/fixture/video.mp4', (r) =>
    r.fulfill({ body: '', contentType: 'video/mp4' }),
  )
  await page.goto('/#/basic/user/file')
  await expect(
    page.getByText('文件列表响应不符合契约', { exact: true }),
  ).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('files-error.png'),
    fullPage: true,
  })
  state = 'loading'
  await page.getByRole('button', { name: '重试目录', exact: true }).click()
  await expect(page.getByText('正在读取目录…', { exact: true })).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('files-loading.png'),
    fullPage: true,
  })
  state = 'video'
  release()
  await page.getByRole('button', { name: '课程.mp4', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: '课程.mp4', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Close', exact: true })
    .click()
  await expect(page.locator('video')).toHaveCount(0)
  await page.getByRole('tab', { name: '个人资料', exact: true }).click()
  await expect(page.getByText('此目录暂无文件', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: test.info().outputPath('files-empty-mobile.png'),
    fullPage: true,
  })
})

test('主导航使用已注册网盘路由，点击后无路由匹配警告', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text())
  })
  await page.route('**/api/front/open/resource_network_disk/?*', (route) =>
    route.fulfill({ json: [file] }),
  )
  await page.goto('/#/basic/user/file')
  const nav = page.getByRole('navigation', { name: '学员主导航' })
  await nav.getByText('我的导航', { exact: true }).click()
  await nav.getByRole('link', { name: '资源网盘', exact: true }).click()
  await expect(page).toHaveURL(/#\/basic\/user\/file$/)
  await expect(
    page.getByRole('heading', { name: '资源网盘', exact: true }),
  ).toBeVisible()
  expect(warnings.filter((message) => /route|match/i.test(message))).toEqual([])
})

test('正式网盘多文件上传成功后刷新，取消与切域清理，完整工具栏适配窄屏', async ({
  page,
}) => {
  let items: (typeof file)[] = []
  let uploads = 0
  let lists = 0
  let releaseInitial!: () => void
  const initial = new Promise<void>((resolve) => {
    releaseInitial = resolve
  })
  let aborted = 0
  const pending: import('@playwright/test').Route[] = []
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/files/upload/')) aborted++
  })
  await page.route('**/api/front/open/resource_network_disk/?*', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route(
    '**/api/front/learn/task/my_profile/files/?*',
    async (route) => {
      if (++lists === 1) {
        await initial
        return route.fulfill({ json: [] }).catch(() => {})
      }
      return route.fulfill({ json: items })
    },
  )
  await page.route(
    '**/api/front/learn/task/my_profile/files/upload/',
    async (route) => {
      uploads++
      const body = route.request().postData() ?? ''
      expect(body).toContain('filename="first.txt"')
      expect(body).toContain('filename="second.txt"')
      expect(body).toContain('name="parent_path"')
      if (uploads === 1) {
        items = [
          { ...file, name: 'first.txt' },
          { ...file, id: 'f2', name: 'second.txt' },
        ]
        return route.fulfill({ json: { message: '上传成功' } })
      }
      pending.push(route)
    },
  )
  const files = [
    { name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.from('first') },
    {
      name: 'second.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('second'),
    },
  ]
  await page.goto('/#/basic/user/file')
  await page.getByRole('tab', { name: '个人资料', exact: true }).click()
  const picker = page.getByLabel('选择上传文件', { exact: true })
  await expect(picker).toBeAttached()
  await picker.setInputFiles(files)
  await expect(
    page.getByRole('progressbar', { name: '上传进度' }),
  ).toHaveAttribute('aria-valuenow', '100')
  await expect(
    page.getByRole('link', { name: 'first.txt', exact: true }),
  ).toBeVisible()
  releaseInitial()
  await expect.poll(() => lists).toBe(2)
  await page.screenshot({
    path: test.info().outputPath('workspace-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: '收起', exact: true }).click()
  for (const width of [700, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: test.info().outputPath(`workspace-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  }
  await picker.setInputFiles(files)
  await expect.poll(() => pending.length).toBe(1)
  await page.getByRole('button', { name: '取消上传', exact: true }).click()
  await expect(page.getByText('已取消上传', { exact: true })).toBeVisible()
  await expect.poll(() => aborted).toBe(1)
  await picker.setInputFiles(files)
  await expect.poll(() => pending.length).toBe(2)
  await page.getByRole('tab', { name: '公开资料', exact: true }).click()
  await expect.poll(() => aborted).toBe(2)
  for (const route of pending)
    await route.fulfill({ json: { message: '迟到响应' } }).catch(() => {})
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByText('迟到响应', { exact: true })).toHaveCount(0)
  await expect(page.getByText('此目录暂无文件', { exact: true })).toBeVisible()
})

test('公开与个人目录名称遵循原站 localeCompare 排序', async ({ page }) => {
  const entries = [
    { ...file, id: 'beta', name: 'Beta.txt', path: '/Beta.txt' },
    { ...file, id: 'alpha', name: 'alpha.txt', path: '/alpha.txt' },
  ]
  await page.route('**/api/front/open/resource_network_disk/?*', (route) =>
    route.fulfill({ json: entries }),
  )
  await page.route('**/api/front/learn/task/my_profile/files/?*', (route) =>
    route.fulfill({
      json: entries.map((entry) => ({
        ...entry,
        is_share: 0,
        is_shared_file: 0,
      })),
    }),
  )
  await page.goto('/#/basic/user/file')
  const names = page.locator('tbody .file-name a')
  for (const scope of ['公开资料', '个人资料']) {
    await page.getByRole('tab', { name: scope, exact: true }).click()
    await expect(names).toHaveText(['Beta.txt', 'alpha.txt'])
    await page.getByRole('button', { name: '名称', exact: true }).click()
    await expect(names).toHaveText(['alpha.txt', 'Beta.txt'])
    await page.getByRole('button', { name: '名称', exact: true }).click()
    await expect(names).toHaveText(['Beta.txt', 'alpha.txt'])
  }
})

for (const scope of ['public', 'personal'] as const) {
  test(`${scope} 文件与目录打包、失败重试和切域，不触发迟到下载`, async ({
    page,
  }) => {
    const endpoint =
      scope === 'public'
        ? '/front/open/resource_network_disk/'
        : '/front/learn/task/my_profile/files/'
    const entries = [
      file,
      {
        ...file,
        id: 'dir',
        name: '资料夹',
        path: '/资料夹',
        is_file: 0,
        attached: null,
      },
    ]
    for (const path of [
      '/front/open/resource_network_disk/',
      '/front/learn/task/my_profile/files/',
    ])
      await page.route(`**/api${path}?*`, (r) =>
        r.fulfill({
          json: entries.map((entry) => ({
            ...entry,
            is_shared_file: path.includes('my_profile') ? 0 : false,
          })),
        }),
      )
    let mode: 'error' | 'success' | 'pending' = 'error'
    let pending: import('@playwright/test').Route | undefined
    await page.route(`**/api${endpoint}export_zip/`, (r) => {
      expect(r.request().method()).toBe('POST')
      expect(r.request().postDataJSON()).toEqual(
        scope === 'public'
          ? { resource_ids: ['f1', 'dir'] }
          : { file_ids: ['f1', 'dir'] },
      )
      if (mode === 'pending') {
        pending = r
        return
      }
      return r.fulfill({
        json:
          mode === 'error'
            ? { status: 1, message: '假成功' }
            : {
                status: 1,
                message: '完成',
                download_url: '/fixture/archive.zip',
              },
      })
    })
    await page.route('**/fixture/archive.zip', (r) =>
      r.fulfill({
        body: Buffer.from('PK\x03\x04sample'),
        contentType: 'application/zip',
        headers: {
          'Content-Disposition': 'attachment; filename="archive.zip"',
        },
      }),
    )
    const downloads: string[] = []
    page.on('download', (download) =>
      downloads.push(download.suggestedFilename()),
    )
    await page.goto('/#/basic/user/file')
    if (scope === 'personal')
      await page.getByRole('tab', { name: '个人资料', exact: true }).click()
    const button = page.getByRole('button', {
      name: scope === 'public' ? '打包下载' : '批量导出',
      exact: true,
    })
    await expect(button).toBeDisabled()
    await page.getByLabel('选择全部文件', { exact: true }).check()
    await expect(button).toBeEnabled()
    await button.click()
    await expect(
      page.getByText('打包响应不符合契约', { exact: true }),
    ).toBeVisible()
    expect(downloads).toEqual([])
    mode = 'success'
    const download = page.waitForEvent('download')
    await button.click()
    expect((await download).suggestedFilename()).toBe('download.zip')
    await expect(button).toBeEnabled()
    mode = 'pending'
    await button.click()
    await expect(button).toBeDisabled()
    await expect.poll(() => Boolean(pending)).toBe(true)
    await page
      .getByRole('tab', {
        name: scope === 'public' ? '个人资料' : '公开资料',
        exact: true,
      })
      .click()
    await pending!
      .fulfill({
        json: {
          status: 1,
          message: '迟到',
          download_url: '/fixture/archive.zip',
        },
      })
      .catch(() => {})
    await expect(
      page.getByRole('button', {
        name: scope === 'public' ? '批量导出' : '打包下载',
        exact: true,
      }),
    ).toBeDisabled()
    expect(downloads).toEqual(['download.zip'])
    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: test.info().outputPath(`export-${scope}-mobile.png`),
      fullPage: true,
    })
  })
}

for (const scope of ['public', 'personal'] as const) {
  test(`${scope} 打包响应未指定文件名时使用原 download.zip 默认值`, async ({
    page,
  }) => {
    const endpoint =
      scope === 'public'
        ? '/front/open/resource_network_disk/'
        : '/front/learn/task/my_profile/files/'
    await page.route(`**/api${endpoint}?*`, (route) =>
      route.fulfill({
        json: [{ ...file, is_shared_file: scope === 'public' ? false : 0 }],
      }),
    )
    await page.route(`**/api${endpoint}export_zip/`, (route) =>
      route.fulfill({
        json: {
          status: 1,
          message: '完成',
          download_url: '/fixture/server-generated-name.zip',
        },
      }),
    )
    await page.route('**/fixture/server-generated-name.zip', (route) =>
      route.fulfill({
        body: Buffer.from('PK\x03\x04sample'),
        contentType: 'application/zip',
      }),
    )
    await page.goto('/#/basic/user/file')
    if (scope === 'personal')
      await page.getByRole('tab', { name: '个人资料', exact: true }).click()
    await page.getByLabel('选择 讲义.txt', { exact: true }).check()
    const download = page.waitForEvent('download')
    await page
      .getByRole('button', {
        name: scope === 'public' ? '打包下载' : '批量导出',
        exact: true,
      })
      .click()
    expect((await download).suggestedFilename()).toBe('download.zip')
  })
}
