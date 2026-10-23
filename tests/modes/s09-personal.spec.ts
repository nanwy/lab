import { expect, test } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
const file = {
  id: 'file-1',
  name: '资料.txt',
  path: '/资料.txt',
  attached: '/files/资料_id.txt',
  is_file: 1,
  size: 200,
  type: 'text/plain',
  altertime: '2026-10-24',
  is_share: 0,
  is_shared_file: false,
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
  await page.route('**/api/front/open/resource_network_disk/?*', (r) =>
    r.fulfill({ json: [] }),
  )
})
test('个人新建校验、失败保留输入并修正重提', async ({ page }) => {
  let items = [file]
  let attempts = 0
  await page.route('**/api/front/learn/task/my_profile/files/?*', (r) =>
    r.fulfill({ json: items }),
  )
  await page.route('**/api/front/learn/task/my_profile/files/folder/', (r) => {
    expect(r.request().postDataJSON()).toEqual({
      name: '研究资料',
      parent_path: '/',
    })
    if (++attempts === 1)
      return r.fulfill({ json: { error: '合成创建失败' }, status: 400 })
    items = [
      ...items,
      {
        ...file,
        id: 'folder',
        name: '研究资料',
        path: '/研究资料',
        is_file: 0,
      },
    ]
    return r.fulfill({ json: {} })
  })
  await page.goto('/#/basic/user/file')
  await page.getByRole('tab', { name: '个人资料', exact: true }).click()
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '创建文件夹', exact: true })
  await expect(dialog.getByText('请输入名称', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await expect(dialog.getByText('请输入名称', { exact: true })).toBeVisible()
  await dialog.getByLabel('名称', { exact: true }).fill('研/究?资料')
  await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByText('合成创建失败', { exact: true })).toBeVisible()
  await expect(dialog.getByLabel('名称', { exact: true })).toHaveValue(
    '研究资料',
  )
  await dialog.getByRole('button', { name: '创建', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '研究资料', exact: true }),
  ).toBeVisible()
  await expect(dialog).toHaveCount(0)
})

test('重命名与分享读回；共享项单项禁用但批量可选，删除确认取消和失败恢复', async ({
  page,
}) => {
  let items = [
    file,
    {
      ...file,
      id: 'shared',
      name: '共享资料.txt',
      path: '/共享资料.txt',
      is_shared_file: true,
    },
  ]
  let deletions = 0
  await page.route('**/api/front/learn/task/my_profile/files/?*', (r) =>
    r.fulfill({ json: items }),
  )
  await page.route(
    '**/api/front/learn/task/my_profile/files/file-1/rename/',
    (r) => {
      expect(r.request().postDataJSON()).toEqual({ name: '新资料.txt' })
      items[0] = { ...items[0]!, name: '新资料.txt', path: '/新资料.txt' }
      return r.fulfill({ json: {} })
    },
  )
  await page.route(
    '**/api/front/learn/task/my_profile/files/file-1/share/',
    (r) => {
      expect(r.request().postDataJSON()).toEqual({ is_share: true })
      items[0] = { ...items[0]!, is_share: 1 }
      return r.fulfill({ json: {} })
    },
  )
  await page.route(
    '**/api/front/learn/task/my_profile/files/batch-delete/',
    (r) => {
      expect(r.request().postDataJSON()).toEqual({ id: ['file-1', 'shared'] })
      if (++deletions === 1)
        return r.fulfill({ status: 403, json: { error: '无权删除这些资料' } })
      items = []
      return r.fulfill({ json: {} })
    },
  )
  await page.goto('/#/basic/user/file')
  await page.getByRole('tab', { name: '个人资料', exact: true }).click()
  const shared = page
    .getByRole('row')
    .filter({ has: page.getByText('共享资料.txt', { exact: true }) })
  await expect(
    shared.getByRole('button', { name: '重命名', exact: true }),
  ).toBeDisabled()
  await expect(
    shared.getByRole('button', { name: '删除', exact: true }),
  ).toBeDisabled()
  await expect(shared.getByRole('switch')).toBeDisabled()
  const own = page
    .getByRole('row')
    .filter({ has: page.getByText('资料.txt', { exact: true }) })
  await own.getByRole('button', { name: '重命名', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByLabel('名称', { exact: true })
    .fill('新资料.txt')
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(page.getByText('新资料.txt', { exact: true })).toBeVisible()
  await page
    .getByRole('switch', { name: '共享 新资料.txt', exact: true })
    .click()
  await expect(
    page.getByRole('switch', { name: '共享 新资料.txt', exact: true }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.getByLabel('选择全部文件', { exact: true }).check()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await expect(
    page.getByText('确认删除选中的 2 个文件或文件夹？删除后无法恢复。', {
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '取消', exact: true })
    .click()
  expect(deletions).toBe(0)
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(
    page.getByText('无权删除这些资料', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({
    path: test.info().outputPath('personal-delete-error.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: test.info().outputPath('personal-delete-mobile.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByText('此目录暂无文件', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('切换资料域取消未完成分享，迟到响应不污染新目录', async ({ page }) => {
  let release!: () => void
  let cancelled = 0
  page.on('requestfailed', (r) => {
    if (r.url().endsWith('/file-1/share/')) cancelled++
  })
  await page.route('**/api/front/learn/task/my_profile/files/?*', (r) =>
    r.fulfill({ json: [file] }),
  )
  await page.route(
    '**/api/front/learn/task/my_profile/files/file-1/share/',
    async (r) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      await r.fulfill({ json: {} }).catch(() => {})
    },
  )
  await page.goto('/#/basic/user/file')
  await page.getByRole('tab', { name: '个人资料', exact: true }).click()
  await page.getByRole('switch', { name: '共享 资料.txt', exact: true }).click()
  await expect.poll(() => Boolean(release)).toBe(true)
  await page.getByRole('tab', { name: '公开资料', exact: true }).click()
  await expect.poll(() => cancelled).toBe(1)
  release()
  await expect(page.getByText('此目录暂无文件', { exact: true })).toBeVisible()
  await expect(page.getByText('资料.txt', { exact: true })).toHaveCount(0)
})

test('重命名提交期间后台刷新不卸载操作弹窗', async ({ page }) => {
  let release!: () => void
  await page.route('**/api/front/learn/task/my_profile/files/?*', (r) =>
    r.fulfill({ json: [file] }),
  )
  await page.route(
    '**/api/front/learn/task/my_profile/files/file-1/rename/',
    async (r) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      await r.fulfill({ json: {} }).catch(() => {})
    },
  )
  await page.goto('/#/basic/user/file')
  await page.getByRole('tab', { name: '个人资料', exact: true }).click()
  await page.getByRole('button', { name: '重命名', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '重命名', exact: true })
  await dialog.getByLabel('名称', { exact: true }).fill('新名称')
  await dialog.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect.poll(() => Boolean(release)).toBe(true)
  // 模拟弹窗期间的后台目录刷新，直接触发已有公共刷新按钮。
  await page
    .locator('.file-toolbar-actions button')
    .filter({ hasText: '刷新' })
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('名称', { exact: true })).toHaveValue('新名称')
  release()
  await expect(dialog).toHaveCount(0)
})
