import { expect, test } from '@playwright/test'

test('MSW 实验新建校验、编辑、标签和导入可刷新重开，删除后深链404', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/#/overview')
  await page.evaluate(() => localStorage.setItem('token', 'mock-session'))
  await page.goto('/#/basic/personal/message')
  await page.getByText('攻防实操', { exact: true }).click()
  await page.getByRole('link', { name: '我的实验台', exact: true }).click()
  await page.getByRole('button', { name: '新建实验', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新建实验' })
  await expect(
    dialog.getByText('请输入实验名称', { exact: true }),
  ).not.toBeVisible()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    dialog.getByText('请输入实验名称', { exact: true }),
  ).toBeVisible()
  await expect(dialog.getByLabel('实验名称', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await dialog.getByLabel('实验名称', { exact: true }).fill('MSW 实验')
  await dialog.getByLabel('实验概述', { exact: true }).fill('持久化概述')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await page.getByRole('link', { name: 'MSW 实验', exact: true }).click()
  const detailURL = page.url()
  await expect(page.getByText('持久化概述', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑基本信息' }).click()
  await page.getByLabel('实验名称', { exact: true }).fill('MSW 已编辑实验')
  await page.getByRole('combobox', { name: '场景标签' }).click()
  for (const name of ['网络', '安全', '基础', '攻防', '设备', '路由'])
    await page.getByRole('option', { name, exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.getByText('最多添加五个标签', { exact: true }),
  ).toBeVisible()
  await page.getByRole('combobox', { name: '场景标签' }).click()
  await page.getByRole('option', { name: '路由', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'MSW 已编辑实验' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'MSW 已编辑实验' }),
  ).toBeVisible()
  await expect(page.getByText('网络', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '返回实验列表' }).click()
  const row = page.getByRole('row').filter({
    has: page.getByRole('link', { name: 'MSW 已编辑实验', exact: true }),
  })
  await row.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认删除' })
    .click()
  await expect(
    page.getByRole('link', { name: 'MSW 已编辑实验', exact: true }),
  ).not.toBeVisible()
  await page.getByRole('button', { name: '场景库选择' }).click()
  const scenes = page.getByRole('dialog', { name: '从场景库选择' })
  await scenes
    .getByRole('radio', { name: '选择模拟场景 1', exact: true })
    .click()
  await scenes.getByRole('button', { name: '保存', exact: true }).click()
  await expect(scenes).not.toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('link', { name: '模拟场景 1', exact: true }),
  ).toBeVisible()
  await page.goto(detailURL)
  await expect(
    page.getByRole('heading', { name: '该实验已被删除或不存在' }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
