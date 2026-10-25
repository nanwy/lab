import { test, expect, teachingURL } from './s12-fixture'

test('实验入口和深链可打开教学视频，并切换原视频', async ({ page }) => {
  await page.goto('/#/basic/user/bench/experiment/one/overview')
  await page.getByRole('link', { name: '攻击教学', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveText([
    '教学视频',
    '教学课件',
    '习题练习',
    '实验操作',
    '考核评估',
  ])
  await expect(page.locator('video')).toHaveAttribute(
    'src',
    '/media/monilanjun/1_zngfdkjs.mp4',
  )
  await expect(page.locator('video')).toHaveAttribute('controls', '')
  await expect(page.locator('video')).toHaveAttribute('autoplay', '')
  await page
    .getByRole('button', { name: '7、智能攻防对抗使用流程', exact: true })
    .click()
  await expect(page.locator('video')).toHaveAttribute(
    'src',
    '/media/monilanjun/7_sylc.mp4',
  )
  await page.goto(teachingURL)
  await page.reload()
  await expect(page.locator('video')).toHaveAttribute(
    'src',
    '/media/monilanjun/1_zngfdkjs.mp4',
  )
})

test('课件与手册按原内容阅读，离开页签销毁媒体并回到首项', async ({ page }) => {
  await page.goto(teachingURL)
  await page.getByRole('tab', { name: '教学课件', exact: true }).click()
  await expect(page.locator('video')).toHaveCount(0)
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    '/media/monilanjun/1_zngfdkjs.pdf',
  )
  await page
    .getByRole('button', { name: '4、智能攻防对抗指令编写', exact: true })
    .click()
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    '/media/monilanjun/4_zngfdkzlbx.pdf',
  )
  await page.getByRole('tab', { name: '实验操作', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '1、威胁模拟使用手册', exact: true }),
  ).toBeVisible()
  const reader = page.getByRole('textbox', { name: '富文本阅读' })
  await expect(reader).toHaveAttribute('contenteditable', 'false')
  await expect(reader.getByRole('heading')).toHaveText([
    '1、新建测试任务',
    '2、绘制测试拓扑场景',
    '3、选择模拟蓝军',
    '4、阵地初始化',
    '5、启动网络场景',
    '6、启动模拟蓝军',
  ])
  await expect(reader.locator('img')).toHaveCount(7)
  await expect(reader.locator('img').first()).toHaveAttribute(
    'src',
    '/media/equip/images/20250317/1742216205573-zubAWFJO.png',
  )
  await page.getByRole('tab', { name: '教学课件', exact: true }).click()
  await expect(page.locator('iframe')).toHaveAttribute(
    'src',
    '/media/monilanjun/1_zngfdkjs.pdf',
  )
  await page.getByRole('tab', { name: '教学视频', exact: true }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.locator('video')).toHaveAttribute(
    'src',
    '/media/monilanjun/1_zngfdkjs.mp4',
  )
})
