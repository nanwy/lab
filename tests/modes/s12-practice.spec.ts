import { test, expect, teachingURL } from './s12-fixture'

test('练习按原顺序展示八题，空答提交显示答案和解析并锁定选项', async ({
  page,
}) => {
  await page.goto(teachingURL)
  await page.getByRole('tab', { name: '习题练习', exact: true }).click()
  const questions = page.getByRole('group', { name: /^\d+、/ })
  await expect(questions).toHaveCount(8)
  await expect(questions.first()).toHaveAccessibleName(
    '1、(1分) 【多选】威胁模拟分为哪些类型？',
  )
  await expect(questions.nth(6)).toHaveAccessibleName(
    '7、(1分) 【单选】威胁模拟工具不需要部署，对吗？',
  )
  await expect(questions.nth(7)).toHaveAccessibleName(
    '8、(1分) 【多选】威胁模拟部署前需要检查哪些？',
  )
  await questions
    .first()
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await expect(
    questions.first().getByText('未答', { exact: true }),
  ).toBeVisible()
  await expect(questions.first().getByText('正确答案：A、B')).toBeVisible()
  await expect(questions.first().getByText('解析：无')).toBeVisible()
  await expect(questions.first().getByRole('checkbox').first()).toBeDisabled()
})

test('重答只清空并解锁本题，答题跨页签及离页保留而刷新清空', async ({
  page,
}) => {
  await page.goto(teachingURL)
  await page.getByRole('tab', { name: '习题练习', exact: true }).click()
  const questions = page.getByRole('group', { name: /^\d+、/ })
  await questions
    .first()
    .getByRole('checkbox', { name: 'A：真实攻击行为' })
    .check()
  await questions
    .first()
    .getByRole('checkbox', { name: 'A：真实攻击行为' })
    .uncheck()
  await questions
    .first()
    .getByRole('checkbox', { name: 'B：流量样本重放' })
    .check()
  await questions
    .first()
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await questions
    .nth(1)
    .getByRole('radio', { name: 'A：武器工具原子化' })
    .check()
  await questions
    .nth(1)
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await page.getByRole('tab', { name: '考核评估', exact: true }).click()
  await page.getByRole('tab', { name: '习题练习', exact: true }).click()
  await expect(
    questions.first().getByText('错误', { exact: true }),
  ).toBeVisible()
  await expect(
    questions.first().getByRole('checkbox', { name: 'B：流量样本重放' }),
  ).toBeChecked()
  await questions
    .first()
    .getByRole('button', { name: '重答', exact: true })
    .click()
  await expect(questions.first().getByRole('checkbox').first()).toBeEnabled()
  await expect(
    questions.first().getByRole('checkbox', { name: 'B：流量样本重放' }),
  ).not.toBeChecked()
  await expect(
    questions.first().getByText('错误', { exact: true }),
  ).toHaveCount(0)
  await expect(questions.first().getByText('解析：无')).toHaveCount(0)
  await expect(
    questions.nth(1).getByText('正确', { exact: true }),
  ).toBeVisible()
  await page.goto('/#/basic/user/bench/experiment/one/overview')
  await page.getByRole('link', { name: '攻击教学', exact: true }).click()
  await page.getByRole('tab', { name: '习题练习', exact: true }).click()
  await expect(
    questions.nth(1).getByText('正确', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await page.getByRole('tab', { name: '习题练习', exact: true }).click()
  await expect(
    questions.nth(1).getByRole('radio', { name: 'A：武器工具原子化' }),
  ).not.toBeChecked()
  await expect(questions.nth(1).getByRole('radio').first()).toBeEnabled()
  await expect(questions.nth(1).getByText('解析：无')).toHaveCount(0)
})

test('单选、判断及多选按原答案判定，多选不受选择顺序影响且不能漏选多选', async ({
  page,
}) => {
  await page.goto(teachingURL)
  await page.getByRole('tab', { name: '习题练习', exact: true }).click()
  const questions = page.getByRole('group', { name: /^\d+、/ })
  await questions
    .first()
    .getByRole('checkbox', { name: 'B：流量样本重放' })
    .check()
  await questions
    .first()
    .getByRole('checkbox', { name: 'A：真实攻击行为' })
    .check()
  await questions
    .first()
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await expect(
    questions.first().getByText('正确', { exact: true }),
  ).toBeVisible()
  await expect(questions.first().getByText(/正确答案/)).toHaveCount(0)
  await questions.nth(1).getByRole('radio', { name: 'B：武器工具改造' }).check()
  await questions
    .nth(1)
    .getByRole('radio', { name: 'A：武器工具原子化' })
    .check()
  await questions
    .nth(1)
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await expect(
    questions.nth(1).getByText('正确', { exact: true }),
  ).toBeVisible()
  await expect(questions.nth(1).getByRole('radio').first()).toBeDisabled()
  await questions
    .nth(2)
    .getByRole('checkbox', { name: 'A：攻击流量在现' })
    .check()
  await questions
    .nth(2)
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await expect(
    questions.nth(2).getByText('错误', { exact: true }),
  ).toBeVisible()
  await expect(questions.nth(2).getByText('正确答案：A、B')).toBeVisible()
  for (const option of [
    'A：防御有效性验证',
    'B：防御人员陪练',
    'C：应急响应痕迹产生',
    'D：攻击日志溯源',
  ]) {
    await questions.nth(3).getByRole('checkbox', { name: option }).check()
  }
  await questions
    .nth(3)
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await expect(
    questions.nth(3).getByText('错误', { exact: true }),
  ).toBeVisible()
  await questions.nth(4).getByRole('radio', { name: 'A：对' }).check()
  await questions
    .nth(4)
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await expect(
    questions.nth(4).getByText('正确', { exact: true }),
  ).toBeVisible()
  await questions.nth(6).getByRole('radio', { name: 'A：不对' }).check()
  await questions
    .nth(6)
    .getByRole('button', { name: '提交', exact: true })
    .click()
  await expect(
    questions.nth(6).getByText('正确', { exact: true }),
  ).toBeVisible()
  await expect(questions.nth(7).getByRole('checkbox').first()).not.toBeChecked()
  await expect(questions.nth(7).getByRole('checkbox').first()).toBeEnabled()
})
