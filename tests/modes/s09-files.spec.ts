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
          is_shared_file: true,
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
