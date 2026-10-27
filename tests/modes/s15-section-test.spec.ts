import { expect, test as baseTest } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
const test = baseTest.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, provide) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await provide(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})
const base = '/api/front/learn/task/self_study/open_courses/one/'
const endpoint = `${base}section/lesson/test/`
const question = {
  id: 'q1',
  name: '单选题',
  option_type: 1,
  content: { A: '协议A', B: '协议B' },
  user_option: ['B'],
}
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 's15-test',
        username: '隔离学员',
        extend_info: { first_entry: true, position: [2] },
      },
    }),
  )
  await page.route(`**${base}`, (route) =>
    route.fulfill({
      json: {
        id: 'one',
        name: '测试课程',
        mode: 2,
        is_collect: false,
        course_direction_list: [],
      },
    }),
  )
  await page.route(`**${base}catalog/`, (route) =>
    route.fulfill({
      json: [
        {
          id: 'chapter',
          name: '第一章',
          section: [
            { id: 'lesson', name: '第一节', type: 1, test: true },
            { id: 'other', name: '第二节', type: 1, test: true },
            { id: 'lab', name: '实验节', type: 2, test: true },
            { id: 'none', name: '无测试节', type: 1, test: false },
          ],
        },
      ],
    }),
  )
  await page.route(`**${base}catalog/*/play/`, (route) =>
    route.fulfill({ json: { status: 1 } }),
  )
})

test('打开本节测试读取真实章节并保存单选，失败保留原答案', async ({ page }) => {
  let saved = false
  let failing = true
  await page.route(`**${endpoint}?*`, (route) => {
    expect(new URL(route.request().url()).searchParams.get('size')).toBe('1000')
    return route.fulfill({ json: { done: false, results: [question] } })
  })
  await page.route(`**${endpoint}q1/`, (route) => {
    expect(route.request().method()).toBe('POST')
    expect(route.request().postDataJSON()).toEqual({ option: ['A'] })
    if (failing)
      return route.fulfill({ json: { status: 2, message: '隔离作答失败' } })
    saved = true
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  await expect(dialog.getByRole('radio', { name: 'B：协议B' })).toBeChecked()
  await dialog.getByRole('radio', { name: 'A：协议A' }).click()
  await expect(page.getByText('隔离作答失败', { exact: true })).toHaveCount(1)
  await expect(dialog.getByRole('radio', { name: 'B：协议B' })).toBeChecked()
  failing = false
  await dialog.getByRole('radio', { name: 'A：协议A' }).click()
  await expect.poll(() => saved).toBe(true)
  await expect(dialog.getByRole('radio', { name: 'A：协议A' })).toBeChecked()
})

test('三种题型逐题保存、未答可提交，服务端结果禁选并可重新测试', async ({
  page,
}, info) => {
  let done = false
  let failFinish = true
  let failReset = true
  const writes: { path: string; body: unknown }[] = []
  const options: Record<string, string[]> = { q1: ['B'], multi: [], judge: [] }
  const questions = [
    question,
    {
      id: 'multi',
      name: '多选题',
      option_type: 2,
      content: { A: '网络', B: '主机' },
      user_option: [],
    },
    {
      id: 'judge',
      name: '判断题',
      option_type: 3,
      content: { T: '正确描述', F: '错误描述' },
      user_option: [],
    },
  ]
  await page.route(`**${endpoint}**`, (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (request.method() === 'GET')
      return route.fulfill({
        json: {
          done,
          results: questions.map((q, i) => ({
            ...q,
            user_option: options[q.id],
            ...(done
              ? {
                  status: [1, 2, 0][i],
                  answer: i === 1 ? ['A', 'B'] : ['T'],
                  parse: `解析${i + 1}`,
                }
              : {}),
          })),
        },
      })
    writes.push({
      path: url.pathname,
      body: request.postData() ? request.postDataJSON() : null,
    })
    if (url.pathname.endsWith('/finish/')) {
      if (failFinish)
        return route.fulfill({ json: { status: 2, message: '隔离提交失败' } })
      done = true
    } else if (url.pathname.endsWith('/reset/')) {
      if (failReset)
        return route.fulfill({ json: { status: 2, message: '隔离重置失败' } })
      done = false
      for (const key of Object.keys(options)) options[key] = []
    } else
      options[url.pathname.split('/').at(-2)!] = request.postDataJSON().option
    return route.fulfill({ json: { status: 1, message: '重新测试成功' } })
  })
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  const multi = dialog.getByRole('region', { name: '第2题', exact: true })
  await multi.getByRole('checkbox', { name: 'A：网络', exact: true }).click()
  await expect(
    multi.getByRole('checkbox', { name: 'A：网络', exact: true }),
  ).toBeChecked()
  await multi.getByRole('checkbox', { name: 'B：主机', exact: true }).click()
  await expect(
    multi.getByRole('checkbox', { name: 'B：主机', exact: true }),
  ).toBeChecked()
  await multi.getByRole('checkbox', { name: 'A：网络', exact: true }).click()
  await expect(
    multi.getByRole('checkbox', { name: 'A：网络', exact: true }),
  ).not.toBeChecked()
  expect(writes.slice(0, 3).map((w) => w.body)).toEqual([
    { option: ['A'] },
    { option: ['A', 'B'] },
    { option: ['B'] },
  ])
  const judge = dialog.getByRole('region', { name: '第3题', exact: true })
  await judge.getByRole('radio', { name: 'T：正确描述', exact: true }).click()
  await expect(
    judge.getByRole('radio', { name: 'T：正确描述', exact: true }),
  ).toBeChecked()
  await dialog.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(page.getByText('隔离提交失败', { exact: true })).toHaveCount(1)
  await expect(
    judge.getByRole('radio', { name: 'T：正确描述', exact: true }),
  ).toBeEnabled()
  failFinish = false
  await dialog.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '重新测试', exact: true }),
  ).toBeVisible()
  await expect(dialog.getByText('正确', { exact: true })).toBeVisible()
  await expect(dialog.getByText('错误', { exact: true })).toBeVisible()
  await expect(dialog.getByText('未答', { exact: true })).toBeVisible()
  await expect(multi.getByText('正确答案：A、B', { exact: true })).toBeVisible()
  await expect(dialog.getByText('解析：解析1', { exact: true })).toBeVisible()
  await expect(
    judge.getByRole('radio', { name: 'T：正确描述', exact: true }),
  ).toBeDisabled()
  await expect(
    multi.getByRole('checkbox', { name: 'B：主机', exact: true }),
  ).toBeDisabled()
  await page.screenshot({ path: info.outputPath('section-results.png') })
  await dialog.getByRole('button', { name: '重新测试', exact: true }).click()
  await expect(page.getByText('隔离重置失败', { exact: true })).toHaveCount(1)
  await expect(
    judge.getByRole('radio', { name: 'T：正确描述', exact: true }),
  ).toBeDisabled()
  failReset = false
  await dialog.getByRole('button', { name: '重新测试', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '提交答案', exact: true }),
  ).toBeVisible()
  await expect(
    judge.getByRole('radio', { name: 'T：正确描述', exact: true }),
  ).not.toBeChecked()
  await expect(
    judge.getByRole('radio', { name: 'T：正确描述', exact: true }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '重新测试', exact: true }),
  ).toBeVisible()
  expect(
    writes.filter((w) => w.path.endsWith('/finish/')).at(-1)?.body,
  ).toBeNull()
  expect(
    writes.filter((w) => w.path.endsWith('/reset/')).at(-1)?.body,
  ).toBeNull()
})

test('空题与读取失败可恢复；仅按章节test标记显示，实验节也可打开', async ({
  page,
}) => {
  let failed = true
  await page.route(`**${endpoint}?*`, (route) =>
    failed
      ? route.fulfill({ status: 500, json: { error: '隔离取题失败' } })
      : route.fulfill({ json: { done: false, results: [] } }),
  )
  await page.route(`**${base}section/lab/test/?*`, (route) =>
    route.fulfill({ json: { done: false, results: [] } }),
  )
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  await expect(
    dialog.getByText('章节测试读取失败', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('隔离取题失败', { exact: true })).toHaveCount(1)
  failed = false
  await dialog.getByRole('button', { name: '重试', exact: true }).click()
  await expect(
    dialog.getByText('该小节暂无自测题', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: '提交答案', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: /实验节/ }).click()
  dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  await expect(
    dialog.getByText('该小节暂无自测题', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: /无测试节/ }).click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '本节测试', exact: true }),
  ).toHaveCount(0)
})

test('切换小节及关闭取消旧题读取，重开不串题，拖动保留视口边界', async ({
  page,
}, info) => {
  let release!: () => void
  let requested = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**${endpoint}?*`, async (route) => {
    requested = true
    await gate
    await route
      .fulfill({ json: { done: false, results: [question] } })
      .catch(() => {})
  })
  await page.route(`**${base}section/other/test/?*`, (route) =>
    route.fulfill({
      json: {
        done: false,
        results: [{ ...question, id: 'other-q', name: '第二节独有题' }],
      },
    }),
  )
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  let dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  await expect(dialog.locator('[data-slot=loading]')).toBeVisible()
  await page.getByRole('button', { name: /第二节/ }).click()
  await expect(dialog.getByText(/第二节独有题/)).toBeVisible()
  release()
  await expect(dialog.getByText(/单选题/)).toHaveCount(0)
  const header = (await dialog
    .getByRole('heading', { name: '本节测试', exact: true })
    .boundingBox())!
  await page.mouse.move(header.x + 20, header.y + 10)
  await page.mouse.down()
  await page.mouse.move(1200, 700, { steps: 5 })
  await page.mouse.up()
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1281)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(721)
  await page.screenshot({ path: info.outputPath('section-drag.png') })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: /第一节/ }).click()
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  await expect(dialog.getByText(/单选题/)).toBeVisible()
  await expect(dialog.getByText(/第二节独有题/)).toHaveCount(0)
})

test('关闭未完成的保存后旧成功不覆盖新章节答案，提交重读失败只重读不重复写入', async ({
  page,
}) => {
  let savedStarted = false
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let done = false
  let failRead = false
  let finishes = 0
  await page.route(`**${endpoint}**`, async (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (request.method() === 'GET')
      return route.fulfill({ json: { done: false, results: [question] } })
    if (url.pathname.endsWith('/q1/')) {
      savedStarted = true
      await gate
    }
    await route.fulfill({ json: { status: 1 } }).catch(() => {})
  })
  await page.route(`**${base}section/other/test/**`, (route) => {
    if (route.request().method() === 'POST') {
      finishes++
      done = true
      failRead = true
      return route.fulfill({ json: { status: 1 } })
    }
    if (failRead)
      return route.fulfill({ status: 500, json: { error: '提交后重读失败' } })
    return route.fulfill({
      json: {
        done,
        results: [
          {
            ...question,
            id: 'different',
            name: '新章节答案',
            ...(done ? { status: 1, parse: '新解析' } : {}),
          },
        ],
      },
    })
  })
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  await dialog.getByRole('radio', { name: 'A：协议A', exact: true }).click()
  await expect.poll(() => savedStarted).toBe(true)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: /第二节/ }).click()
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  await expect(
    dialog.getByRole('radio', { name: 'B：协议B', exact: true }),
  ).toBeChecked()
  release()
  await expect(
    dialog.getByRole('radio', { name: 'B：协议B', exact: true }),
  ).toBeChecked()
  await dialog.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(
    dialog.getByText('章节测试读取失败', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('提交后重读失败', { exact: true })).toHaveCount(1)
  await expect(
    dialog.getByRole('button', { name: '提交答案', exact: true }),
  ).toHaveCount(0)
  failRead = false
  await dialog.getByRole('button', { name: '重试', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '重新测试', exact: true }),
  ).toBeVisible()
  expect(finishes).toBe(1)
})

test('同题同完成态重读后使用服务端新答案，多选不带回旧选项', async ({
  page,
}) => {
  let option: string[] = []
  let reads = 0
  const saves: unknown[] = []
  await page.route(`**${endpoint}**`, (route) => {
    if (route.request().method() === 'POST') {
      option = route.request().postDataJSON().option
      saves.push(option)
      return route.fulfill({ json: { status: 1 } })
    }
    reads++
    return route.fulfill({
      json: {
        done: false,
        results: [
          {
            id: 'q1',
            name: '重读多选',
            option_type: 2,
            content: { A: '旧选择', B: '服务端选择', C: '后来选择' },
            user_option: option,
          },
        ],
      },
    })
  })
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  await dialog.getByRole('checkbox', { name: 'A：旧选择', exact: true }).click()
  await expect(
    dialog.getByRole('checkbox', { name: 'A：旧选择', exact: true }),
  ).toBeChecked()
  option = ['B']
  const previous = reads
  await page.context().setOffline(true)
  await page.context().setOffline(false)
  await expect.poll(() => reads).toBeGreaterThan(previous)
  await expect(
    dialog.getByRole('checkbox', { name: 'B：服务端选择', exact: true }),
  ).toBeChecked()
  await expect(
    dialog.getByRole('checkbox', { name: 'A：旧选择', exact: true }),
  ).not.toBeChecked()
  await dialog
    .getByRole('checkbox', { name: 'C：后来选择', exact: true })
    .click()
  await expect.poll(() => saves.at(-1)).toEqual(['B', 'C'])
})
