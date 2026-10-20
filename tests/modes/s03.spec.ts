import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'

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

test('头像失败可重试，离开后上传被取消且迟到结果不更新头像', async ({
  page,
}) => {
  let uploads = 0
  let release!: () => void
  let aborted = false
  page.on('requestfailed', (request) => {
    if (request.method() === 'PATCH') aborted = true
  })
  await page.route('**/api/front/user/info/', async (route) => {
    if (route.request().method() !== 'PATCH')
      return route.fulfill({ json: initial })
    if (++uploads === 1) return route.fulfill({ json: {} })
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route
      .fulfill({ json: { ...initial, logo: '/late-avatar.png' } })
      .catch(() => {})
  })
  await page.goto('/#/basic/personal/info')
  const avatar = page.getByLabel('修改头像', { exact: true })
  const file = { name: 'avatar.png', mimeType: 'image/png', buffer: png }
  await avatar.setInputFiles(file)
  await expect(page.getByText('头像上传失败，请重试。')).toBeVisible()
  await avatar.setInputFiles(file)
  await expect.poll(() => Boolean(release)).toBe(true)
  await page.getByRole('link', { name: '我的收藏', exact: true }).click()
  await expect.poll(() => aborted).toBe(true)
  release()
  await page.getByRole('link', { name: '个人信息', exact: true }).click()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue(
    initial.realname,
  )
  await expect(page.getByRole('img', { name: '用户头像' })).toHaveCount(0)
})

test.beforeEach(async ({ page }) => {
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route(
    '**/api/front/exam/ability_appraisa/study_situation/',
    (route) =>
      route.fulfill({
        json: {
          status: 1,
          data: {
            login_day: 1,
            study_length: 2,
            finished_course: 3,
            finished_subject_scene: 4,
            finished_assessment: 5,
          },
        },
      }),
  )
})
const initial = {
  id: 's03',
  username: '模拟学员',
  realname: '原姓名',
  unit: '原单位',
  phone: '',
  email: '',
  logo: '',
  extend_info: { first_entry: true, position: [7], retained: 'keep' },
}
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
)

test('资料保存失败保留编辑，头像不覆盖未保存内容，多岗位和刷新往返', async ({
  page,
}) => {
  let user = { ...initial }
  let saves = 0
  let uploads = 0
  let release!: () => void
  await page.route('**/api/front/position/?nopage=1', (route) =>
    route.fulfill({
      json: [
        { id: 7, name: '岗位一' },
        { id: 8, name: '岗位二' },
      ],
    }),
  )
  await page.route('**/api/front/user/info/', async (route) => {
    if (route.request().method() !== 'PATCH')
      return route.fulfill({ json: user })
    if (
      route.request().headers()['content-type'].includes('multipart/form-data')
    ) {
      uploads++
      expect(route.request().postDataBuffer()?.toString()).toContain(
        'name="logo"',
      )
      await new Promise<void>((resolve) => {
        release = resolve
      })
      user = { ...user, logo: '/s03-avatar.png' }
    } else {
      saves++
      if (saves === 1) return route.fulfill({ json: { status: 2 } })
      expect(route.request().postDataJSON().extend_info).toEqual({
        first_entry: true,
        position: [7, 8],
        retained: 'keep',
      })
      user = { ...user, ...route.request().postDataJSON() }
    }
    return route.fulfill({ json: user })
  })
  await page.route('**/s03-avatar.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: png }),
  )
  await page.goto('/#/basic/personal/info')
  await page.getByLabel('姓名', { exact: true }).fill('未保存姓名')
  await page.getByLabel('所属单位', { exact: true }).fill('新单位')
  await page.getByLabel('手机号', { exact: true }).fill('12345678901')
  await page.getByLabel('邮箱', { exact: true }).fill('fixture@example.test')
  await page.getByLabel('岗位二', { exact: true }).check()
  const avatar = page.getByLabel('修改头像', { exact: true })
  await avatar.setInputFiles({
    name: 'bad.gif',
    mimeType: 'image/gif',
    buffer: png,
  })
  await expect(
    page.getByText('只支持JPG、PNG、JPEG图片', { exact: true }),
  ).toBeVisible()
  expect(uploads).toBe(0)
  await avatar.setInputFiles({
    name: 'big.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  })
  await expect(
    page.getByText('图片大小不能超过5M', { exact: true }),
  ).toBeVisible()
  expect(uploads).toBe(0)
  await avatar.setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect.poll(() => uploads).toBe(1)
  await expect(
    page.getByRole('button', { name: '保存基本信息' }),
  ).toBeDisabled()
  release()
  await expect(page.getByText('头像已更新。')).toBeVisible()
  await expect(page.getByRole('img', { name: '用户头像' })).toBeVisible()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue(
    '未保存姓名',
  )
  await page.getByRole('button', { name: '保存基本信息' }).click()
  await expect(
    page.getByText('基本信息保存失败，编辑内容已保留，请重试。'),
  ).toBeVisible()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue(
    '未保存姓名',
  )
  await page.getByRole('button', { name: '保存基本信息' }).click()
  await expect(page.getByText('基本信息已保存。')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue(
    '未保存姓名',
  )
  await expect(page.getByLabel('所属单位', { exact: true })).toHaveValue(
    '新单位',
  )
  await expect(page.getByLabel('手机号', { exact: true })).toHaveValue(
    '12345678901',
  )
  await expect(page.getByLabel('邮箱', { exact: true })).toHaveValue(
    'fixture@example.test',
  )
  await expect(page.getByLabel('岗位二', { exact: true })).toBeChecked()
  await page.setViewportSize({ width: 390, height: 844 })
  for (const dark of [false, true]) {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle('dark', dark),
      dark,
    )
    const colors = await page
      .getByLabel('姓名', { exact: true })
      .evaluate((input) => ({
        input: getComputedStyle(input).color,
        parent: getComputedStyle(input.closest('section')!).color,
      }))
    await expect(page.getByLabel('姓名', { exact: true })).toHaveCSS(
      'color',
      colors.parent,
    )
    await expect(page.getByLabel('岗位二', { exact: true })).toHaveCSS(
      'height',
      '16px',
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: test.info().outputPath(`personal-${dark ? 'dark' : 'light'}.png`),
      fullPage: true,
    })
  }
})

test('未保存确认保留编辑；离开时取消保存和弹窗请求，旧响应不导航', async ({
  page,
}) => {
  let cancelled = 0
  page.on('requestfailed', (request) => {
    if (
      request.url().endsWith('/front/user/info/') ||
      request.url().endsWith('/front/user/password/')
    )
      cancelled++
  })
  let releaseSave!: () => void
  let releasePassword!: () => void
  await page.route('**/api/front/user/info/', async (route) => {
    if (route.request().method() === 'PATCH')
      await new Promise<void>((resolve) => {
        releaseSave = resolve
      })
    await route.fulfill({ json: initial }).catch(() => {})
  })
  await page.route('**/api/front/user/password/', async (route) => {
    await new Promise<void>((resolve) => {
      releasePassword = resolve
    })
    await route.fulfill({ json: { status: 1 } }).catch(() => {})
  })
  let logouts = 0
  await page.route('**/api/front/logout/', (route) => {
    logouts++
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/personal/info')
  await page.getByLabel('姓名', { exact: true }).fill('未保存')
  await page.getByRole('link', { name: '我的收藏', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑' }).click()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('未保存')
  await page.getByRole('button', { name: '保存基本信息' }).click()
  await expect.poll(() => Boolean(releaseSave)).toBe(true)
  await page.getByRole('link', { name: '我的收藏', exact: true }).click()
  await page.getByRole('button', { name: '放弃并离开' }).click()
  await expect.poll(() => cancelled).toBe(1)
  releaseSave()
  await expect(page).toHaveURL(/personal\/enshrine/)
  await page.getByText('用户菜单', { exact: true }).click()
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  await page.getByLabel('原密码', { exact: true }).fill('old-fixture')
  await page.getByLabel('新密码', { exact: true }).fill('new-fixture')
  await page.getByLabel('确认密码', { exact: true }).fill('new-fixture')
  await page.getByRole('button', { name: '确定修改' }).click()
  await expect.poll(() => Boolean(releasePassword)).toBe(true)
  await page.evaluate(() => {
    location.hash = '/basic/home'
  })
  await expect(page).toHaveURL(/basic\/home/)
  await expect.poll(() => cancelled).toBe(2)
  releasePassword()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()
  expect(logouts).toBe(0)
  await page.evaluate(() => {
    location.hash = '/basic/personal/enshrine'
  })
  await expect(page).toHaveURL(/personal\/enshrine/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('统计失败可恢复、页签边界清楚、非法类型 404、写入无权访问走公共分支', async ({
  page,
  errors,
}) => {
  await page.route('**/api/front/user/info/', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({ status: 403, json: { error: '您无权访问' } })
      : route.fulfill({ json: initial }),
  )
  let attempts = 0
  await page.route(
    '**/api/front/exam/ability_appraisa/study_situation/',
    (route) =>
      route.fulfill({
        json:
          ++attempts === 1
            ? { status: 2 }
            : {
                status: 1,
                data: {
                  login_day: 1,
                  study_length: 2,
                  finished_course: 3,
                  finished_subject_scene: 4,
                  finished_assessment: 5,
                },
              },
      }),
  )
  await page.goto('/#/basic/personal/info')
  await page.getByRole('button', { name: '重试统计' }).click()
  await expect(page.getByText('登录天数', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '系统消息', exact: true }).click()
  await expect(page.getByText('暂无消息', { exact: true })).toBeVisible()
  await page.goto('/#/basic/personal/unknown')
  await expect(
    page.getByRole('heading', { name: '没有找到这个入口' }),
  ).toBeVisible()
  await page.goto('/#/basic/personal/info')
  await page.getByLabel('姓名', { exact: true }).fill('权限测试')
  await page.getByRole('button', { name: '保存基本信息' }).click()
  // 全局权限跳转也受未保存保护约束，明确放弃后进入 403。
  await page.getByRole('button', { name: '放弃并离开' }).click()
  await expect(page).toHaveURL(/forbidden/)
  expect(errors.splice(0)).toEqual([
    'Failed to load resource: the server responded with a status of 403 (Forbidden)',
  ])
})
