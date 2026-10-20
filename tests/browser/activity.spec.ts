import { expect, test } from '@playwright/test'

test('MSW 通知已读与待办新增完成删除可刷新重开', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+08:00'))
  await page.goto('/#/overview')
  await page.evaluate(() => localStorage.setItem('token', 'mock-session'))
  await page.goto('/#/basic/personal/message')
  await page.getByRole('button', { name: '模拟通知 1', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: '通知详情' })
      .getByText('这是本地模拟通知，不代表原服务数据。'),
  ).toBeVisible()
  await page
    .getByRole('dialog', { name: '通知详情' })
    .getByRole('button', { name: 'Close' })
    .click()
  await page.reload()
  await expect(
    page.getByRole('button', { name: '通知 11', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '全部已读', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '通知 0', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '待办 0', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '待办事项', exact: true })
  await dialog.getByLabel('待办内容').fill('MSW 模拟事项')
  await dialog.getByLabel('待办时间').fill('2026-10-20T15:00')
  await dialog.getByRole('button', { name: '保存待办' }).click()
  await expect(
    dialog.getByRole('cell', { name: 'MSW 模拟事项', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await page.getByRole('button', { name: '待办 1', exact: true }).click()
  await dialog.getByRole('button', { name: '标注完成' }).click()
  await expect(
    dialog.getByRole('button', { name: '已完成', exact: true }),
  ).toBeDisabled()
  await dialog.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认删除' })
    .click()
  await expect(dialog.getByText('暂无任务', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(
    page.getByRole('button', { name: '待办 0', exact: true }),
  ).toBeVisible()
  await page.goto('/#/basic/personal/enshrine')
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(
    page.getByRole('link', { name: '模拟收藏 22', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
