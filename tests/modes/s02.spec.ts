import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'

base.beforeEach(async ({ page }) => {
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
})

const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text())
      })
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})

test('未激活深链进入激活页，在线与本地表单校验、失败恢复、成功回入口', async ({
  page,
  errors,
}) => {
  let active = false
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({
      status: active ? 200 : 403,
      json: active
        ? { id: 's02', extend_info: { first_entry: true } }
        : { error: '未激活' },
    }),
  )
  await page.route('**/api/admin/system/active/status/', (r) =>
    r.fulfill({
      json: {
        status: 0,
        url: 'https://license.test',
        device_id: 'local-device',
        expire_time: '',
      },
    }),
  )
  await page.route('**/api/captcha/**', (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
  )
  let attempts = 0
  await page.route('**/api/admin/system/active/online/', (r) => {
    expect(r.request().postDataJSON()).toEqual({
      url: 'https://license.test',
      activate_code: 'sample',
      code: '2468',
    })
    attempts++
    return r.fulfill({ json: { status: 2 } })
  })
  await page.route('**/api/admin/system/active/offline/', async (r) => {
    expect(await r.request().headerValue('content-type')).toContain(
      'multipart/form-data',
    )
    active = true
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/home')
  await expect(page).toHaveURL(/#\/activate/)
  await expect(page.getByText('系统尚未激活', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '激活', exact: true }).click()
  await expect(page.getByText('请输入激活码', { exact: true })).toBeVisible()
  await page.getByLabel('激活码', { exact: true }).fill('sample')
  await page.getByLabel('验证码', { exact: true }).fill('2468')
  await page.getByRole('button', { name: '激活', exact: true }).click()
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: '业务请求失败' }),
  ).toBeVisible()
  expect(attempts).toBe(1)
  await page.getByRole('button', { name: '本地激活', exact: true }).click()
  await expect(page.getByText('当前机器码：local-device')).toBeVisible()
  await page.getByLabel('License 文件').setInputFiles({
    name: 'license.lic',
    mimeType: 'text/plain',
    buffer: Buffer.from('sample'),
  })
  await page.getByRole('button', { name: '激活', exact: true }).click()
  await expect(page).toHaveURL(/#\/basic\/home/)
  // 只有最初的未激活 403 是预期浏览器日志。
  expect(errors.splice(0)).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
  ])
})

test('首页品牌、14 个导航入口、推荐设置与课程关闭门禁可用', async ({
  page,
}) => {
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({
      json: { id: 's02', username: '学员', extend_info: { first_entry: true } },
    }),
  )
  await page.route('**/api/admin/system/logo/default/', (r) =>
    r.fulfill({
      json: { platform_name: '测试训练平台', front_logo: '', icon: '' },
    }),
  )
  await page.route('**/api/front/simulation/experiment/**', (r) =>
    r.fulfill({ json: { count: 0, results: [] } }),
  )
  await page.route(
    '**/api/front/learn/task/self_study/open_courses/*/brief/',
    (r) => r.fulfill({ json: { is_open: false } }),
  )
  let saved = false
  await page.route('**/api/front/user/recommend/config/', (r) => {
    if (r.request().method() === 'POST') {
      expect(r.request().postDataJSON().data.position).toBe(8)
      saved = true
      return r.fulfill({ json: { status: 1 } })
    }
    return r.fulfill({ json: portalFixtures['/front/user/recommend/config/'] })
  })
  await page.goto('/')
  await expect(page).toHaveURL(/#\/basic\/home/)
  await expect(page).toHaveTitle('测试训练平台')
  await expect(
    page.getByRole('navigation', { name: '系统导航' }).getByRole('link'),
  ).toHaveCount(14)
  await page.getByRole('button', { name: '学习指南', exact: true }).click()
  await expect(
    page.getByText('模拟安全学习路线', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: /模拟网络基础/ }).click()
  await expect(page.getByText('该课程已被关闭')).toBeVisible()
  await expect(page).toHaveURL(/#\/basic\/home/)
  await page.getByRole('button', { name: '推荐设置', exact: true }).click()
  await page.getByLabel('岗位', { exact: true }).fill('8')
  await page.getByRole('button', { name: '保存设置' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(saved).toBe(true)
  await page.getByRole('button', { name: '系统导航', exact: true }).click()
  await page
    .getByRole('navigation', { name: '系统导航' })
    .getByRole('link', { name: '我的实验台' })
    .click()
  await expect(page).toHaveURL(/#\/basic\/user\/bench/)
  await page.reload()
  await expect(page.getByRole('heading', { name: '我的工作台' })).toBeVisible()
  await expect(
    page.getByText('此业务页面属于后续实施切片', { exact: false }),
  ).not.toBeVisible()
})

test('首次进入选择岗位后保存账号扩展资料，刷新不重复提示', async ({ page }) => {
  let firstEntry = false
  await page.route('**/api/front/position/?nopage=1', (r) =>
    r.fulfill({ json: [{ id: 7, name: '网络安全岗位' }] }),
  )
  await page.route('**/api/front/user/info/', (r) => {
    if (r.request().method() === 'PATCH') {
      expect(r.request().postDataJSON()).toEqual({
        extend_info: { ai_app: '', position: [7], first_entry: true },
        editType: 1,
      })
      firstEntry = true
    }
    return r.fulfill({
      json: {
        id: 's02',
        extend_info: {
          first_entry: firstEntry,
          position: firstEntry ? [7] : [],
          ai_app: '',
        },
      },
    })
  })
  await page.goto('/#/basic/home')
  await page.getByRole('button', { name: '网络安全岗位' }).click()
  await page.getByRole('button', { name: '保存信息' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('离开登录页取消提交，迟到结果不能更新会话或跳转', async ({
  page,
  errors,
}) => {
  let release!: () => void
  await page.route('**/api/admin/system/background/', (r) =>
    r.fulfill({ json: { front_background: '' } }),
  )
  await page.route('**/api/captcha/**', (r) =>
    r.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
  )
  let userReads = 0
  await page.route('**/api/front/user/info/', (r) => {
    userReads++
    return r.fulfill({ status: 403, json: { error: '未登录' } })
  })
  await page.route('**/api/front/login/', async (r) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/login')
  await page.getByLabel('用户名', { exact: true }).fill('test')
  await page.getByLabel('密码', { exact: true }).fill('test')
  await page.getByLabel('验证码', { exact: true }).fill('2468')
  const submitted = page.waitForRequest('**/api/front/login/')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await submitted
  await expect.poll(() => Boolean(release)).toBe(true)
  const cancelled = page.waitForEvent('requestfailed', (r) =>
    r.url().endsWith('/api/front/login/'),
  )
  await page.evaluate(() => {
    location.hash = '/overview'
  })
  await expect(
    page.getByRole('heading', { name: '工程概览', exact: true }),
  ).toBeVisible()
  await cancelled
  release()
  // 一个后续已完成请求作为事件循环屏障，不使用任意 sleep 判断迟到行为。
  await page.evaluate(() => fetch('/api/admin/system/logo/default/'))
  expect(userReads).toBe(1)
  await expect(page).toHaveURL(/#\/overview/)
  expect(errors.splice(0)).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
  ])
})

test('会话读取失败可重试，未知 403 不清凭据，业务查询的拒绝与失效走全局分支', async ({
  page,
  errors,
}) => {
  await page.addInitScript(() => localStorage.setItem('token', 'test-session'))
  let available = false
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({
      status: available ? 200 : 403,
      json: available
        ? { id: 's02', extend_info: { first_entry: true } }
        : { error: 'unknown' },
    }),
  )
  await page.goto('/#/basic/home')
  await expect(
    page.getByRole('heading', { name: '无法恢复会话' }),
  ).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe(
    'test-session',
  )
  available = true
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()
  await page.route('**/api/front/user/recommend/resource/', (r) =>
    r.fulfill({ status: 403, json: { error: '您无权访问' } }),
  )
  await page.getByRole('button', { name: '学习指南', exact: true }).click()
  await expect(page).toHaveURL(/#\/forbidden/)
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe(
    'test-session',
  )
  await page.unroute('**/api/front/user/recommend/resource/')
  await page.route('**/api/front/user/recommend/resource/', (r) =>
    r.fulfill({ status: 403, json: { error: '未登录' } }),
  )
  await page.getByRole('link', { name: '返回首页', exact: true }).click()
  await page.getByRole('button', { name: '学习指南', exact: true }).click()
  await expect(page.getByText('会话已失效，请重新登录。')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
  expect(errors.splice(0)).toEqual(
    Array(3).fill(
      'Failed to load resource: the server responded with a status of 403 (Forbidden)',
    ),
  )
})

test('学习指南支持空态、读取失败重试及待办收藏投影，窄屏不溢出', async ({
  page,
  errors,
}, info) => {
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({ json: { id: 's02', extend_info: { first_entry: true } } }),
  )
  let failed = true
  await page.route('**/api/front/user/recommend/resource/', (r) =>
    r.fulfill(
      failed
        ? { status: 503, json: {} }
        : {
            json: {
              status: 1,
              data: {
                learning_route: [],
                practical_operation: null,
                course: [],
              },
            },
          },
    ),
  )
  await page.route('**/api/front/user/todo/?nopage=1', (r) =>
    r.fulfill({
      json: [
        {
          id: 1,
          content: '完成模拟任务',
          set_time: '2026-10-19 12:00:00',
          if_finish: false,
        },
      ],
    }),
  )
  await page.route('**/api/front/user/collect/?nopage=1', (r) =>
    r.fulfill({
      json: [
        {
          id: 1,
          attribute: 1,
          object_id: 9,
          is_status: false,
          extend_info: { name: '下线课程' },
        },
      ],
    }),
  )
  await page.goto('/#/basic/home')
  await page.getByRole('button', { name: '学习指南', exact: true }).click()
  await expect(page.getByText('推荐资源读取失败。')).toBeVisible()
  failed = false
  await page.getByRole('button', { name: '重试推荐' }).click()
  await expect(page.getByText('暂无推荐路线')).toBeVisible()
  await expect(page.getByText('暂无实操推荐')).toBeVisible()
  await expect(page.getByText('暂无推荐课程')).toBeVisible()
  await page.getByRole('button', { name: '年视图' }).click()
  await page.getByLabel('年份').fill('2026')
  await expect(page.getByText('完成模拟任务 · 未完成')).toBeVisible()
  await expect(
    page.getByRole('group', { name: '年度待办' }).getByRole('button'),
  ).toHaveCount(12)
  await page.getByRole('button', { name: /10 月.*完成模拟任务/ }).click()
  await expect(page.getByRole('button', { name: '月视图' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '2026-10-19', exact: true }).click()
  await expect(page.getByText('完成模拟任务 · 未完成')).toBeVisible()
  await page.getByRole('button', { name: '下线课程', exact: true }).click()
  await expect(page.getByText('该资源已被下线无法查看！')).toBeVisible()
  await page.screenshot({
    path: info.outputPath('home-guide-desktop.png'),
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: info.outputPath('home-guide-mobile.png'),
    fullPage: true,
  })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await expect(
    page.getByRole('button', { name: '2026-10-20', exact: true }),
  ).toHaveCSS('color', 'rgb(250, 250, 250)')
  await page.screenshot({
    path: info.outputPath('home-guide-mobile-dark.png'),
    fullPage: true,
    animations: 'disabled',
  })
  expect(errors.splice(0)).toEqual([
    'Failed to load resource: the server responded with a status of 503 (Service Unavailable)',
  ])
})

test('离开首页取消进行中的概览读取，404 可返回首页', async ({ page }) => {
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({ json: { id: 's02', extend_info: { first_entry: true } } }),
  )
  let release!: () => void
  await page.route(
    '**/api/front/user/learning_guide/statistics/',
    async (r) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      await r.fulfill({
        json: portalFixtures['/front/user/learning_guide/statistics/'],
      })
    },
  )
  await page.goto('/#/basic/home')
  await expect(page.getByText('正在读取学习概览…')).toBeVisible()
  await expect.poll(() => Boolean(release)).toBe(true)
  const cancelled = page.waitForEvent('requestfailed', (r) =>
    r.url().endsWith('/learning_guide/statistics/'),
  )
  await page.evaluate(() => {
    location.hash = '/no-such-page'
  })
  await expect(
    page.getByRole('heading', { name: '没有找到这个入口' }),
  ).toBeVisible()
  await cancelled
  release()
  await page.unroute('**/api/front/user/learning_guide/statistics/')
  await page.route('**/api/front/user/learning_guide/statistics/', (r) =>
    r.fulfill({
      json: portalFixtures['/front/user/learning_guide/statistics/'],
    }),
  )
  await page.getByRole('link', { name: '返回首页' }).click()
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()
})

test('选择另一门课程会取消旧检查，迟到课程不能覆盖最新选择', async ({
  page,
}) => {
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({ json: { id: 's02', extend_info: { first_entry: true } } }),
  )
  await page.route('**/api/front/user/recommend/resource/', (r) =>
    r.fulfill({
      json: {
        status: 1,
        data: {
          learning_route: [],
          practical_operation: null,
          course: [
            {
              id: 'a',
              name: '先选课程',
              image: '',
              type: 1,
              progress: '0%',
              difficulty: 1,
            },
            {
              id: 'b',
              name: '后选课程',
              image: '',
              type: 1,
              progress: '0%',
              difficulty: 1,
            },
          ],
        },
      },
    }),
  )
  let release!: () => void
  let cancelled = false
  page.on('requestfailed', (r) => {
    if (r.url().endsWith('/a/brief/')) cancelled = true
  })
  await page.route(
    '**/api/front/learn/task/self_study/open_courses/a/brief/',
    async (r) => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      await r.fulfill({ json: { is_open: true } })
    },
  )
  await page.route(
    '**/api/front/learn/task/self_study/open_courses/b/brief/',
    (r) => r.fulfill({ json: { is_open: false } }),
  )
  await page.goto('/#/basic/home')
  await page.getByRole('button', { name: '学习指南', exact: true }).click()
  await page.getByRole('button', { name: /先选课程/ }).click()
  await expect.poll(() => Boolean(release)).toBe(true)
  try {
    await page.getByRole('button', { name: /后选课程/ }).click()
    await expect(page.getByText('该课程已被关闭')).toBeVisible()
    await expect.poll(() => cancelled, { timeout: 1500 }).toBe(true)
    await expect(page).toHaveURL(/#\/basic\/home/)
  } finally {
    release()
  }
})
