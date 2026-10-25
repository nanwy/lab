import { test, expect, teachingURL } from './s12-fixture'

test('考核按原顺序显示八题，答题卡标记已答并定位题目', async ({ page }) => {
  await page.goto(teachingURL)
  await page.getByRole('tab', { name: '考核评估', exact: true }).click()
  const questions = page.getByRole('tabpanel').getByRole('group')
  await expect(questions).toHaveCount(8)
  await expect(questions.first()).toContainText(
    '1、(1分) 【多选】威胁模拟部署前需要检查哪些？',
  )
  await expect(questions.last()).toContainText(
    '8、(1分) 【多选】威胁模拟分为哪些类型？',
  )
  const card = page.getByRole('button', { name: '第1题', exact: true })
  await expect(card).toHaveAttribute('aria-pressed', 'false')
  await questions.first().getByLabel('C：目标信息是否录入').check()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '第8题', exact: true }).click()
  await expect(questions.last()).toBeInViewport()
})

test('整卷允许未答交卷，按集合判定并锁定，显示统计和本地交卷时间', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-25T10:11:12'))
  await page.goto(teachingURL)
  await page.getByRole('tab', { name: '考核评估', exact: true }).click()
  const questions = page.getByRole('tabpanel').getByRole('group')
  for (const option of [
    'C：目标信息是否录入',
    'B：武器工具是否部署',
    'A：阵地是否接入',
  ])
    await questions.nth(0).getByLabel(option).check()
  await questions.nth(1).getByLabel('B：对', { exact: true }).check()
  await questions.nth(2).getByLabel('B：不对', { exact: true }).check()
  await questions.nth(3).getByLabel('A：对', { exact: true }).check()
  for (const option of [
    'A：防御有效性验证',
    'B：防御人员陪练',
    'C：应急响应痕迹产生',
    'D：攻击日志溯源',
  ])
    await questions.nth(4).getByLabel(option).check()
  await questions.nth(5).getByLabel('A：攻击流量在现').check()
  await questions.nth(7).getByLabel('B：流量样本重放').check()
  await questions.nth(7).getByLabel('A：真实攻击行为').check()
  await page.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(page.getByText('8道题', { exact: true })).toBeVisible()
  await expect(
    page.getByText('正确4道，错误3道，未答1道', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('2026-10-25 10:11:12', { exact: true }),
  ).toBeVisible()
  await expect(
    questions.nth(0).getByText('正确', { exact: true }),
  ).toBeVisible()
  await expect(questions.nth(0).getByText('正确答案：')).toHaveCount(0)
  await expect(
    questions.nth(4).getByText('错误', { exact: true }),
  ).toBeVisible()
  await expect(
    questions.nth(4).getByText('正确答案：A、B、C', { exact: true }),
  ).toBeVisible()
  await expect(
    questions.nth(5).getByText('错误', { exact: true }),
  ).toBeVisible()
  await expect(
    questions.nth(6).getByText('未答', { exact: true }),
  ).toBeVisible()
  await expect(
    questions.nth(6).getByText('正确答案：A', { exact: true }),
  ).toBeVisible()
  await expect(questions.getByText('解析：无', { exact: true })).toHaveCount(8)
  for (const input of await questions.getByRole('checkbox').all())
    await expect(input).toBeDisabled()
  for (const input of await questions.getByRole('radio').all())
    await expect(input).toBeDisabled()
})

test('跨页签及离页保留考核，重置后重新交卷并在刷新时清空', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-25T10:11:12'))
  await page.goto(teachingURL)
  const assessment = page.getByRole('tab', { name: '考核评估', exact: true })
  await assessment.click()
  const questions = page.getByRole('tabpanel').getByRole('group')
  await questions.nth(1).getByLabel('A：不对', { exact: true }).check()
  await page.getByRole('tab', { name: '习题练习', exact: true }).click()
  await expect(
    page.getByRole('tabpanel').getByRole('radio', { checked: true }),
  ).toHaveCount(0)
  await page
    .getByRole('tabpanel')
    .getByLabel('B：武器工具改造', { exact: true })
    .check()
  await assessment.click()
  await expect(
    questions.nth(1).getByLabel('A：不对', { exact: true }),
  ).toBeChecked()
  await page.getByRole('button', { name: '提交答案', exact: true }).click()
  await page.goto('/#/basic/user/bench/experiment/one/overview')
  await page.getByRole('link', { name: '攻击教学', exact: true }).click()
  await assessment.click()
  await expect(
    page.getByText('正确1道，错误0道，未答7道', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('2026-10-25 10:11:12', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '重置试卷', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '答题卡', exact: true }),
  ).toBeVisible()
  await expect(questions.getByText('解析：无', { exact: true })).toHaveCount(0)
  await expect(
    questions.nth(1).getByLabel('A：不对', { exact: true }),
  ).not.toBeChecked()
  await expect(
    questions.nth(1).getByLabel('A：不对', { exact: true }),
  ).toBeEnabled()
  await page.clock.setFixedTime(new Date('2026-10-25T11:12:13'))
  await page.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(
    page.getByText('正确0道，错误0道，未答8道', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('2026-10-25 11:12:13', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await assessment.click()
  await expect(
    page.getByRole('heading', { name: '答题卡', exact: true }),
  ).toBeVisible()
  await expect(page.getByText('交卷时间', { exact: true })).toHaveCount(0)
})
