import { expect, test } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'

test('改密后复用原表单，退出等待期间禁用按钮，失败只重试退出', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: { id: 'password-retry', extend_info: { first_entry: true } },
    }),
  )
  let passwordRequests = 0
  let logoutRequests = 0
  let release!: () => void
  await page.route('**/api/front/user/password/', (route) => {
    passwordRequests++
    return route.fulfill({ json: { status: 1 } })
  })
  await page.route('**/api/front/logout/', async (route) => {
    const attempt = ++logoutRequests
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fulfill({ json: { status: attempt === 1 ? 2 : 1 } })
  })
  await page.goto('/#/basic/home')
  await page.getByText('用户菜单', { exact: true }).click()
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('原密码', { exact: true }).fill('old-fixture')
  await dialog.getByLabel('新密码', { exact: true }).fill('new-fixture')
  await dialog.getByLabel('确认密码', { exact: true }).fill('new-fixture')
  await dialog.getByRole('button', { name: '确定修改', exact: true }).click()
  await expect.poll(() => logoutRequests).toBe(1)
  const retry = dialog.getByRole('button', { name: '重试退出', exact: true })
  await expect(retry).toBeDisabled()
  await expect(dialog.getByLabel('原密码', { exact: true })).toBeDisabled()
  await expect(dialog.getByLabel('新密码', { exact: true })).toBeDisabled()
  await expect(dialog.getByLabel('确认密码', { exact: true })).toBeDisabled()
  release()
  await expect(
    dialog.getByText('密码已修改，但退出失败。请重试退出，无需再次修改密码。'),
  ).toBeVisible()
  await expect(retry).toBeEnabled()
  await expect(dialog.getByLabel('原密码', { exact: true })).toHaveValue('')
  await retry.click()
  await expect.poll(() => logoutRequests).toBe(2)
  await expect(retry).toBeDisabled()
  expect(passwordRequests).toBe(1)
  release()
  await expect(page).toHaveURL(/#\/login\?reason=password-changed/)
  await expect(
    page.getByText('密码修改成功，请使用新密码重新登录。'),
  ).toBeVisible()
  expect(passwordRequests).toBe(1)
  expect(logoutRequests).toBe(2)
  expect(errors).toEqual([])
})

test('个人资料与改密使用可关联的标签和字段错误，修正后可提交', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  let user = {
    id: 'form-fixture',
    username: '模拟学员',
    realname: '原姓名',
    unit: '',
    phone: '',
    email: '',
    extend_info: { first_entry: true, position: [7] },
  }
  let saves = 0
  await page.route('**/api/front/user/info/', (route) => {
    if (route.request().method() === 'PATCH') {
      user = { ...user, ...route.request().postDataJSON() }
      saves++
    }
    return route.fulfill({ json: user })
  })
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
  await page.goto('/#/basic/personal/info')
  await expect(
    page.getByRole('heading', { name: '个人中心', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('用户名', { exact: true })).toHaveAttribute(
    'readonly',
    '',
  )
  for (const label of ['姓名', '所属单位', '手机号', '邮箱'])
    await expect(page.getByLabel(label, { exact: true })).toBeVisible()
  await page.locator('label[for="realname"]').click()
  await expect(page.getByLabel('姓名', { exact: true })).toBeFocused()
  await page.getByLabel('姓名', { exact: true }).fill('新姓名')
  await page.getByRole('button', { name: '保存基本信息', exact: true }).click()
  await expect(page.getByText('基本信息已保存。')).toBeVisible()
  expect(saves).toBe(1)
  expect(user.realname).toBe('新姓名')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByText('用户菜单', { exact: true }).click()
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const submit = dialog.getByRole('button', { name: '确定修改', exact: true })
  await expect(dialog.getByLabel('原密码', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'false',
  )
  await expect(dialog.getByText('请输入原始密码', { exact: true })).toHaveCount(
    0,
  )
  await submit.click()
  await expect(dialog.getByLabel('原密码', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await expect(
    dialog.getByText('请输入原始密码', { exact: true }),
  ).toBeVisible()
  await dialog.getByLabel('原密码', { exact: true }).fill('old-fixture')
  await dialog.getByLabel('新密码', { exact: true }).fill('new-fixture')
  await dialog.getByLabel('确认密码', { exact: true }).fill('different')
  await submit.click()
  await expect(
    dialog.getByText('两次输入的密码不一致', { exact: true }),
  ).toBeVisible()
  let requests = 0
  await page.route('**/api/front/user/password/', (route) => {
    requests++
    expect(route.request().postDataJSON()).toEqual({
      cipher: 'old-fixture',
      password: 'new-fixture',
      confirm_password: 'new-fixture',
    })
    return route.fulfill({ json: { status: 2 } })
  })
  await dialog.getByLabel('确认密码', { exact: true }).fill('new-fixture')
  await submit.click()
  await expect(
    dialog.getByText('密码修改失败，请检查输入或稍后重试。'),
  ).toBeVisible()
  expect(requests).toBe(1)
  expect(errors).toEqual([])
})
