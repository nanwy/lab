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
const root = '/#/basic/user/bench/experiment/one/detection/'
const detail = (id: string) => ({
  id,
  name: `工具${id}`,
  tags: ['检测'],
  tool_carrier: id === 'first' ? 1 : 2,
  carrier_path: '/media/tool.zip',
  image_info: { name: '隔离镜像' },
  account: 'learner / example',
  description: '用途说明',
  user_manual: '<h2>工具使用步骤</h2><p><strong>只读格式</strong></p>',
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
        id: 's11',
        username: '隔离学员',
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
        id: new URL(route.request().url()).pathname.split('/').at(-2),
        name: '检测实验',
        desc: '',
        node_count: 0,
        user_name: '隔离学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: null,
      },
    }),
  )
  await page.route('**/api/front/wqzb/detection_front/tools/?*', (route) =>
    route.fulfill({
      json: {
        results: [
          { id: 'first', name: '工具first', tags: ['检测'] },
          { id: 'second', name: '工具second', tags: [] },
        ],
      },
    }),
  )
  await page.route('**/api/front/wqzb/detection_front/tools/*/', (route) =>
    route.fulfill({
      json: detail(new URL(route.request().url()).pathname.split('/').at(-2)!),
    }),
  )
})
test('五类深链、历史导航、首项选择和工具切换支持附件、镜像与只读手册', async ({
  page,
}, testInfo) => {
  const categories = [
    ['penetration', '渗透测试', '1'],
    ['defense', '防御验证', '2'],
    ['baseline', '基线检查', '3'],
    ['vulnerability', '漏洞扫描', '4'],
    ['riskAssessment', '风险评估', '5'],
  ]
  const reads: string[] = []
  await page.route('**/api/front/wqzb/detection_front/tools/?*', (route) => {
    const url = new URL(route.request().url())
    reads.push(url.search)
    return route.fulfill({
      json: {
        results: [
          { id: 'first', name: '工具first', tags: ['检测'] },
          { id: 'second', name: '工具second', tags: [] },
        ],
      },
    })
  })
  for (const [type, label] of categories) {
    await page.goto(`${root}${type}`)
    await expect(
      page
        .getByRole('navigation', { name: '检测分类' })
        .getByRole('link', { name: label, exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      page.getByRole('link', { name: 'tool.zip 附件' }),
    ).toHaveAttribute('href', '/media/tool.zip')
  }
  expect([...new Set(reads)]).toEqual([
    '?tool_type=1',
    '?tool_type=2',
    '?tool_type=3',
    '?tool_type=4',
    '?tool_type=5',
  ])
  await page.getByRole('link', { name: '渗透测试', exact: true }).click()
  await page.getByRole('button', { name: '工具second', exact: true }).click()
  await expect(page.getByText('隔离镜像 镜像', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('catalog.png'),
    fullPage: true,
  })
  await page.getByRole('tab', { name: '使用手册' }).click()
  const reader = page.getByRole('textbox', { name: '富文本阅读' })
  await expect(reader).toContainText('工具使用步骤')
  await expect(reader).toHaveAttribute('contenteditable', 'false')
  await page.screenshot({
    path: testInfo.outputPath('manual.png'),
    fullPage: true,
  })
  await expect(
    page.getByRole('button', { name: '保存', exact: true }),
  ).toHaveCount(0)
  await page.goBack()
  await expect(
    page.getByRole('link', { name: '风险评估', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await page.goForward()
  await expect(
    page.getByRole('link', { name: '渗透测试', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
})

test('空目录、列表与详情请求失败、契约错误和访问拒绝均可重读恢复', async ({
  page,
}) => {
  let state = 'empty'
  await page.route('**/api/front/wqzb/detection_front/tools/?*', (route) => {
    if (state === 'failed')
      return route.fulfill({ status: 500, json: { error: '目录暂时失败' } })
    if (state === 'invalid') return route.fulfill({ json: { data: [] } })
    return route.fulfill({
      json: {
        results:
          state === 'empty'
            ? []
            : [{ id: 'first', name: '工具first', tags: [] }],
      },
    })
  })
  await page.goto(`${root}penetration`)
  await expect(page.getByText('暂无检测工具', { exact: true })).toBeVisible()
  state = 'failed'
  await page.getByRole('link', { name: '防御验证', exact: true }).click()
  await expect(
    page.getByText('检测工具列表读取失败', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('目录暂时失败', { exact: true })).toHaveCount(1)
  state = 'invalid'
  await page.getByRole('button', { name: '重新读取' }).click()
  await expect(page.getByText(/检测工具响应契约错误/)).toBeVisible()
  state = 'success'
  let detailState = 'denied'
  await page.route(
    '**/api/front/wqzb/detection_front/tools/first/',
    (route) => {
      if (detailState === 'denied')
        return route.fulfill({ status: 403, json: { error: '工具禁止访问' } })
      if (detailState === 'failed')
        return route.fulfill({ status: 500, json: { error: '工具暂时失败' } })
      return route.fulfill({ json: detail('first') })
    },
  )
  await page.getByRole('button', { name: '重新读取' }).click()
  await expect(
    page.getByText('无权读取检测工具', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('工具禁止访问', { exact: true })).toHaveCount(1)
  detailState = 'failed'
  await page.getByRole('button', { name: '重新读取' }).click()
  await expect(
    page.getByText('检测工具详情读取失败', { exact: true }),
  ).toBeVisible()
  detailState = 'success'
  await page.getByRole('button', { name: '重新读取' }).click()
  await expect(page.getByRole('link', { name: 'tool.zip 附件' })).toBeVisible()
})

test('切换工具、分类和实验后迟到响应不覆盖当前选择，容器不自动跳转', async ({
  page,
}) => {
  let release!: () => void
  const slow = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route(
    '**/api/front/wqzb/detection_front/tools/first/',
    async (route) => {
      requested = true
      await slow
      await route.fulfill({ json: detail('first') }).catch(() => {})
    },
  )
  await page.goto(`${root}penetration`)
  await expect(
    page.getByText('正在加载工具详情…', { exact: true }),
  ).toBeVisible()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: '工具second', exact: true }).click()
  await expect(page.getByText('隔离镜像 镜像', { exact: true })).toBeVisible()
  release()
  await expect(
    page.getByRole('button', { name: '工具second', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('隔离镜像 镜像', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '防御验证', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '工具first', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '工具second', exact: true }).click()
  await page.goto('/#/basic/user/bench/experiment/two/detection/defense')
  await expect(
    page.getByRole('button', { name: '工具first', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/#/basic/user/bench/experiment/two/detection')
  await expect(page.getByText('请选择检测分类', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/two\/detection$/)
})

test('切类期间迟到目录不污染当前目录，退出后新账号不继承选择或详情', async ({
  page,
}) => {
  let release!: () => void
  const slow = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route(
    '**/api/front/wqzb/detection_front/tools/?tool_type=1',
    async (route) => {
      requested = true
      await slow
      await route
        .fulfill({
          json: { results: [{ id: 'old', name: '旧分类工具', tags: [] }] },
        })
        .catch(() => {})
    },
  )
  await page.goto(`${root}penetration`)
  await expect(
    page.getByText('正在加载检测工具…', { exact: true }),
  ).toBeVisible()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('link', { name: '防御验证', exact: true }).click()
  await expect(page.getByRole('link', { name: 'tool.zip 附件' })).toBeVisible()
  release()
  await expect(page.getByRole('button', { name: '旧分类工具' })).toHaveCount(0)
  await page.getByRole('button', { name: '工具second', exact: true }).click()
  await expect(page.getByText('隔离镜像 镜像', { exact: true })).toBeVisible()
  await page.route('**/api/front/logout/', (route) =>
    route.fulfill({ json: { status: 1 } }),
  )
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 'another',
        username: '另一学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.goto(`${root}defense`)
  await expect(
    page.getByRole('button', { name: '工具first', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('link', { name: 'tool.zip 附件' })).toBeVisible()
})
