import { expect, test } from '@playwright/test'

test('MSW 资料、头像刷新往返及改密后用新密码重新登录', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/#/overview')
  await page.evaluate(() => localStorage.setItem('token', 'mock-session'))
  await page.goto('/#/basic/personal/info')
  await page.getByLabel('姓名', { exact: true }).fill('模拟新姓名')
  await page.getByLabel('修改头像', { exact: true }).setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByText('头像已更新。')).toBeVisible()
  await page.getByRole('button', { name: '保存基本信息' }).click()
  await expect(page.getByText('基本信息已保存。')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue(
    '模拟新姓名',
  )
  await expect(page.getByRole('img', { name: '用户头像' })).toBeVisible()
  await page.getByText('用户菜单', { exact: true }).click()
  await page.getByRole('button', { name: '修改密码', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('原密码', { exact: true }).fill('wrong-fixture')
  await dialog.getByLabel('新密码', { exact: true }).fill('new-fixture')
  await dialog.getByLabel('确认密码', { exact: true }).fill('new-fixture')
  await dialog.getByRole('button', { name: '确定修改' }).click()
  await expect(dialog.getByText('原密码错误', { exact: true })).toBeVisible()
  await dialog.getByLabel('原密码', { exact: true }).fill('xueyuan123')
  await dialog.getByRole('button', { name: '确定修改' }).click()
  await expect(
    page.getByText('密码修改成功，请使用新密码重新登录。'),
  ).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
  await page.getByLabel('用户名', { exact: true }).fill('learner')
  await page.getByLabel('密码', { exact: true }).fill('new-fixture')
  await page.getByLabel('验证码', { exact: true }).fill('2468')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '首页', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([
    'Failed to load resource: the server responded with a status of 400 (Bad Request)',
  ])
})
