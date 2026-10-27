import { expect, test as baseTest } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
const test = baseTest.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, provide) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await provide(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})
const course = '/api/front/learn/task/self_study/open_courses/one/'
const operate = `${course}section/lab/operate/`
const section = { id: 'lab', name: '实验小节', type: 2 }
const practice = {
  id: 'op',
  test_type: 'through',
  name: '课程闯关',
  desc: '原描述',
  score: 10,
  write_up: '<p>普通手册</p>',
  write_up_option: 2,
  extended_content: { stage_mode: true },
  test_environment: { shared: false },
}
const checkpoints = [
  {
    id: 'flag',
    mode: 1,
    task_type: 4,
    desc: '第一关',
    done: false,
    score: 5,
    write_up: '<p>关卡手册</p>',
  },
  { id: 'next', mode: 2, task_type: 4, desc: '第二关', done: false },
]
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/(front|admin|captcha)\//, (r) =>
    r.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (r) => r.fulfill({ json }))
  await page.route('**/api/front/user/info/', (r) =>
    r.fulfill({
      json: {
        id: 's15',
        username: '隔离学员',
        extend_info: { first_entry: true, position: [2] },
      },
    }),
  )
  await page.route(`**${course}`, (r) =>
    r.fulfill({
      json: {
        id: 'one',
        name: '课程实验',
        mode: 2,
        is_collect: false,
        course_direction_list: [],
      },
    }),
  )
  await page.route(`**${course}catalog/`, (r) =>
    r.fulfill({
      json: [
        {
          id: 'chapter',
          name: '实验章',
          section: [
            section,
            { id: 'video', name: '视频小节', type: 1, experiment: true },
          ],
        },
      ],
    }),
  )
  await page.route(`**${course}catalog/*/play/`, (r) =>
    r.fulfill({ json: { status: 1 } }),
  )
  await page.route(`**${course}section/*/operate/?*`, (r) =>
    r.fulfill({
      json: [
        { id: 'op', name: '首个项目' },
        { id: 'ignored', name: '不应创建选择器' },
      ],
    }),
  )
  await page.route(`**${course}section/*/operate/op/`, (r) =>
    r.fulfill({ json: practice }),
  )
  await page.route(`**${course}section/*/operate/op/checkpoint/?*`, (r) =>
    r.fulfill({ json: checkpoints }),
  )
})
test('实验正文和视频弹窗使用首项操作项目，Flag成功重读并禁用', async ({
  page,
}) => {
  let finished = false
  const flags: unknown[] = []
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({ json: [{ ...checkpoints[0], done: finished }] }),
  )
  await page.route(`**${operate}op/checkpoint/flag/flag/finish/`, (r) => {
    flags.push(r.request().postDataJSON())
    finished = true
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  await expect(page.getByText('课程闯关', { exact: true })).toBeVisible()
  await page.getByLabel('Flag', { exact: true }).fill('隔离答案')
  await page.getByRole('button', { name: '提交Flag', exact: true }).click()
  await expect(page.getByLabel('Flag', { exact: true })).toBeDisabled()
  expect(flags).toEqual([{ flag: '隔离答案' }])
  await page.getByRole('button', { name: /视频小节/ }).click()
  await page.getByRole('button', { name: '本节实验', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本节实验', exact: true })
  await expect(dialog.getByText('课程闯关', { exact: true })).toBeVisible()
  await expect(dialog.getByText('不应创建选择器', { exact: true })).toHaveCount(
    0,
  )
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('关卡顺序门控与解答手册可打开和关闭，失败Flag不清输入', async ({
  page,
}) => {
  let done = false
  let failing = true
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({
      json: checkpoints.map((c, i) => (i === 0 ? { ...c, done } : c)),
    }),
  )
  await page.route(`**${operate}op/checkpoint/flag/flag/finish/`, (r) => {
    if (failing) return r.fulfill({ json: { status: 2, message: 'Flag错误' } })
    done = true
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '关卡2', exact: true }).click()
  await expect(
    page.getByText('请先完成上一关卡！', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('第一关', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '实验手册', exact: true }).click()
  const manual = page.getByRole('dialog', { name: '关卡解答', exact: true })
  await expect(manual.getByText('关卡手册', { exact: true })).toBeVisible()
  await manual.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(manual).toHaveCount(0)
  await page.getByLabel('Flag', { exact: true }).fill('错误答案')
  await page.getByRole('button', { name: '提交Flag', exact: true }).click()
  await expect(page.getByText('Flag错误', { exact: true })).toHaveCount(1)
  await expect(page.getByLabel('Flag', { exact: true })).toHaveValue('错误答案')
  failing = false
  await page.getByRole('button', { name: '提交Flag', exact: true }).click()
  await expect(page.getByLabel('Flag', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '关卡2', exact: true }).click()
  await expect(page.getByText('第二关', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Flag', { exact: true })).toHaveValue('')
})

test('检查点题目使用专属保存完成重置，原失败草稿保留并重读服务端答案', async ({
  page,
}) => {
  let done = false
  let choice = ['B']
  let failing = true
  const writes: { path: string; body: unknown }[] = []
  await page.route(`**${operate}op/`, (r) =>
    r.fulfill({ json: { ...practice, test_type: 'ctf' } }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({ json: [{ id: 'topic-check', mode: 4, task_type: 4, done }] }),
  )
  await page.route(`**${operate}op/checkpoint/topic/topic-check/**`, (r) => {
    const request = r.request(),
      path = new URL(request.url()).pathname
    if (request.method() === 'GET')
      return r.fulfill({
        json: {
          id: 'topic-data',
          name: '检查点多选题',
          option_type: 2,
          content: { A: '网络', B: '主机' },
          user_option: choice,
          done,
          ...(done ? { status: 2, answer: ['A'], parse: '独立解析' } : {}),
        },
      })
    writes.push({
      path,
      body: request.postData() ? request.postDataJSON() : null,
    })
    if (path.endsWith('answer/')) {
      if (failing)
        return r.fulfill({ json: { status: 2, message: '作答失败' } })
      choice = request.postDataJSON().option
    }
    if (path.endsWith('finish/')) done = true
    if (path.endsWith('reset/')) {
      done = false
      choice = []
    }
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  const topic = page.getByRole('region', { name: '检查点题目', exact: true })
  await topic.getByRole('checkbox', { name: 'A：网络', exact: true }).click()
  await expect(page.getByText('作答失败', { exact: true })).toHaveCount(1)
  await expect(
    topic.getByRole('checkbox', { name: 'A：网络', exact: true }),
  ).toBeChecked()
  failing = false
  await topic.getByRole('checkbox', { name: 'B：主机', exact: true }).click()
  await expect.poll(() => choice).toEqual(['A'])
  await page.getByRole('button', { name: '提交答案', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '重新测试', exact: true }),
  ).toBeVisible()
  await expect(topic.getByText('错误', { exact: true })).toBeVisible()
  await expect(topic.getByText('解析：独立解析', { exact: true })).toBeVisible()
  await expect(
    topic.getByRole('checkbox', { name: 'A：网络', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: '重新测试', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '提交答案', exact: true }),
  ).toBeVisible()
  await expect(
    topic.getByRole('checkbox', { name: 'A：网络', exact: true }),
  ).not.toBeChecked()
  expect(writes.map((w) => w.path)).toEqual([
    `${operate}op/checkpoint/topic/topic-check/answer/`,
    `${operate}op/checkpoint/topic/topic-check/answer/`,
    `${operate}op/checkpoint/topic/topic-check/finish/`,
    `${operate}op/checkpoint/topic/topic-check/reset/`,
  ])
})

test('环境启动轮询、节点参数、延时与释放保留课程资源类型和共享来源', async ({
  page,
}, info) => {
  await page.clock.install()
  let state = 1
  let times = 3600
  const bodies: { path: string; body: Record<string, unknown> }[] = []
  await page.addInitScript(() => {
    Object.assign(window, { openedConsoles: [] })
    window.open = (url) => {
      ;(Reflect.get(window, 'openedConsoles') as string[]).push(String(url))
      return null
    }
  })
  await page.route(`**${operate}op/`, (r) =>
    r.fulfill({
      json: {
        ...practice,
        shared: true,
        test_environment: { shared: false, sec_type: 3 },
        protocol_ports: [
          { service: 'web', protocol: 'https', port: 443, path: 'learn' },
        ],
      },
    }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({ json: [{ ...checkpoints[0], task_type: 1, env: 'template' }] }),
  )
  await page.route('**/api/front/env/runs/?*', (r) => r.fulfill({ json: [] }))
  await page.route('**/api/front/env/**', (r) => {
    const path = new URL(r.request().url()).pathname
    if (path.endsWith('/runs/')) return r.fulfill({ json: [] })
    const body = r.request().postDataJSON()
    bodies.push({ path, body })
    if (path.endsWith('/status/'))
      return r.fulfill({
        json: {
          status: 1,
          data: {
            status: state,
            ...(state === 3
              ? {
                  run_id: 'run',
                  times,
                  ext_ip: [{ name: '入口', ext_ip: ['10.0.0.2'], port: 443 }],
                }
              : {}),
          },
        },
      })
    if (path.endsWith('/start/')) state = 2
    if (path.includes('/delay/')) times = 7200
    if (path.includes('/stop/')) state = 5
    return r.fulfill({ json: { status: 1 } })
  })
  await page.route('**/api/front/scene/run/status/?task_type=16', (r) =>
    r.fulfill({
      json: {
        nodes: {
          docker: {
            type: 'docker',
            name: '容器',
            float_ip: '10.0.0.2',
            system_user: [{ username: 'student', password: 'isolated' }],
          },
          lib: { type: 'libvirt', name: '图形节点', console_type: 'vnc' },
          wire: { type: 'bridge_net', name: '不展示' },
        },
      },
    }),
  )
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '启动', exact: true }).click()
  await expect(page.getByText('启动中…', { exact: true })).toBeVisible()
  state = 3
  await page.clock.fastForward(2000)
  await expect(page.getByRole('table', { name: '环境资源' })).toBeVisible()
  await expect(
    page.getByText('web- https://10.0.0.2:443/learn', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('账号：student 密码：isolated', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('不展示', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '释放', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'VNC控制台', exact: true })
    .nth(0)
    .click()
  await page
    .getByRole('button', { name: 'VNC控制台', exact: true })
    .nth(1)
    .click()
  expect(
    await page.evaluate(() => Reflect.get(window, 'openedConsoles')),
  ).toEqual([
    '/#/vnccontrol/docker/docker',
    '/#/kvmvnc/vnc/lib/%E5%9B%BE%E5%BD%A2%E8%8A%82%E7%82%B9',
  ])
  await page.getByRole('button', { name: '延时', exact: true }).click()
  await expect(page.getByRole('timer')).toHaveText('02:00:00')
  const start = bodies.find((b) => b.path.endsWith('/start/'))!.body
  const status = bodies.find((b) => b.path.endsWith('/status/'))!.body
  expect(start).toEqual({
    resource_type: 16,
    resource_id: 'op',
    env_type: 1,
    env_id: 'template',
    start_type: 2,
    share: false,
    assist: { start_new_type: 1, check_id: 'flag' },
  })
  expect(status).toEqual({ ...start, share: true })
  expect(bodies.find((b) => b.path.includes('/delay/'))!.body).toEqual({
    run_id: 'run',
    resource_type: 16,
  })
  await page.screenshot({ path: info.outputPath('course-environment.png') })
  await page.clock.fastForward(7200_000)
  await expect
    .poll(() => bodies.filter((b) => b.path.includes('/stop/')).length)
    .toBe(1)
  await page.clock.fastForward(500)
  await expect(page.getByText('释放中…', { exact: true })).toBeVisible()
  state = 1
  await page.clock.fastForward(2000)
  await expect(
    page.getByRole('button', { name: '启动', exact: true }),
  ).toBeVisible()
})

test('普通手册倒计时后重读开放，关闭视频实验清理手册延迟而不释放环境', async ({
  page,
}) => {
  await page.clock.install()
  let opened = false
  let reads = 0
  let stops = 0
  await page.route(`**${course}section/*/operate/op/`, (r) => {
    reads++
    return r.fulfill({
      json: { ...practice, write_up_option: 1, write_up_time: opened ? 0 : 2 },
    })
  })
  page.on('request', (r) => {
    if (r.url().includes('/env/stop/')) stops++
  })
  await page.goto('/#/basic/training/course/one')
  await expect(
    page.getByText('手册开放倒计时：', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '实验手册', exact: true }),
  ).toHaveCount(0)
  opened = true
  await page.clock.fastForward(2000)
  await page.clock.fastForward(1100)
  await page.getByRole('button', { name: '实验手册', exact: true }).click()
  const manual = page.getByRole('dialog', { name: '实验手册', exact: true })
  await expect(manual.getByText('普通手册', { exact: true })).toBeVisible()
  await manual.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(
    manual.getByRole('button', { name: '缩小', exact: true }),
  ).toBeVisible()
  await manual.getByRole('button', { name: 'Close', exact: true }).click()
  opened = false
  await page.getByRole('button', { name: /视频小节/ }).click()
  await page.getByRole('button', { name: '本节实验', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本节实验', exact: true })
  await expect(
    dialog.getByText('手册开放倒计时：', { exact: false }),
  ).toBeVisible()
  const before = reads
  await page.clock.fastForward(2000)
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.clock.fastForward(10_000)
  expect(reads).toBe(before)
  expect(stops).toBe(0)
})

test('缺协议的对抗检查、防御上传和购买明确不可用，无候选端点写入', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST') requests.push(r.url())
  })
  await page.route(`**${operate}op/`, (r) =>
    r.fulfill({
      json: {
        ...practice,
        test_type: 'confront',
        write_up: '',
        allow_buy: true,
        test_environment: { in_check: true },
      },
    }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({ json: [{ id: 'attack', mode: 3, task_type: 4 }] }),
  )
  await page.goto('/#/basic/training/course/one')
  await expect(
    page.getByRole('button', { name: 'check', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: '上传防御文件', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByText('原课程缺少防御上传地址及检查回调，暂不可用。', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '购买实验手册', exact: true }),
  ).toBeDisabled()
  expect(requests).toEqual([])
})

for (const kind of ['experiment', 'loophole', 'scene'])
  test(`${kind}保留检查点导航与原手册入口条件`, async ({ page }) => {
    await page.route(`**${operate}op/`, (r) =>
      r.fulfill({ json: { ...practice, test_type: kind } }),
    )
    await page.goto('/#/basic/training/course/one')
    const prefix = kind === 'experiment' ? '实验' : '关卡'
    await page.getByRole('button', { name: `${prefix}2`, exact: true }).click()
    await expect(page.getByText('第二关', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: `${prefix}1`, exact: true }).click()
    await expect(
      page.getByRole('button', { name: '实验手册', exact: true }),
    ).toHaveCount(kind === 'experiment' ? 0 : 1)
  })

test('切检查点取消迟到状态，关闭清理自动释放计时且不远端释放', async ({
  page,
}) => {
  await page.clock.install()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const states: string[] = []
  let stops = 0
  await page.route(`**${operate}op/`, (r) =>
    r.fulfill({
      json: { ...practice, extended_content: { stage_mode: false } },
    }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({
      json: [
        { ...checkpoints[0], task_type: 1, env: 'old' },
        { ...checkpoints[1], task_type: 1, env: 'new' },
      ],
    }),
  )
  await page.route('**/api/front/env/runs/?*', (r) => r.fulfill({ json: [] }))
  await page.route('**/api/front/env/status/', async (r) => {
    const env = r.request().postDataJSON().env_id
    states.push(env)
    if (env === 'old') await gate
    await r
      .fulfill({
        json: {
          status: 1,
          data:
            env === 'old'
              ? { status: 3, run_id: 'old-run', times: 1 }
              : { status: 1 },
        },
      })
      .catch(() => {})
  })
  await page.route('**/api/front/env/stop/**', (r) => {
    stops++
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  await expect.poll(() => states).toContain('old')
  await page.getByRole('button', { name: '关卡2', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '启动', exact: true }),
  ).toBeVisible()
  release()
  await page.clock.fastForward(10_000)
  await expect(
    page.getByRole('button', { name: '启动', exact: true }),
  ).toBeVisible()
  expect(stops).toBe(0)
  await page.getByRole('button', { name: /视频小节/ }).click()
  await page.clock.fastForward(10_000)
  expect(stops).toBe(0)
  expect(states.filter((v) => v === 'old')).toHaveLength(1)
})

test('环境状态失败停止轮询，手动释放等待500ms刷新，节点失败可重试', async ({
  page,
}) => {
  await page.clock.install()
  let fail = true
  let state = 2
  let queries = 0
  let stopped = 0
  let nodeFailure = true
  await page.route(`**${operate}op/`, (r) =>
    r.fulfill({ json: { ...practice, shared: false } }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({
      json: [{ ...checkpoints[0], task_type: 2, topo: 'topology' }],
    }),
  )
  await page.route('**/api/front/env/runs/?*', (r) => r.fulfill({ json: [] }))
  await page.route('**/api/front/env/status/', (r) => {
    queries++
    return fail
      ? r.fulfill({ status: 500, json: { error: '状态服务失败' } })
      : r.fulfill({
          json: {
            status: 1,
            data: {
              status: state,
              ...(state === 3 ? { run_id: 'run', times: 300 } : {}),
            },
          },
        })
  })
  await page.route('**/api/front/scene/run/status/?*', (r) =>
    nodeFailure
      ? r.fulfill({ status: 500, json: { error: '节点服务失败' } })
      : r.fulfill({ json: { nodes: {} } }),
  )
  await page.route('**/api/front/env/stop/run/', (r) => {
    expect(r.request().postDataJSON()).toEqual({
      run_id: 'run',
      resource_type: 16,
    })
    stopped++
    state = 1
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  await expect(
    page.getByText('课程环境状态读取失败', { exact: true }),
  ).toBeVisible()
  const initial = queries
  await page.clock.fastForward(10_000)
  expect(queries).toBe(initial)
  fail = false
  state = 3
  await page
    .getByRole('alert')
    .filter({ hasText: '课程环境状态读取失败' })
    .getByRole('button', { name: '重试', exact: true })
    .click()
  await expect(
    page.getByText('运行节点读取失败', { exact: true }),
  ).toBeVisible()
  nodeFailure = false
  await page
    .getByRole('alert')
    .filter({ hasText: '运行节点读取失败' })
    .getByRole('button', { name: '重试', exact: true })
    .click()
  await expect(page.getByText('暂无运行节点', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '释放', exact: true }).click()
  await expect.poll(() => stopped).toBe(1)
  await page.clock.fastForward(500)
  await expect(
    page.getByRole('button', { name: '启动', exact: true }),
  ).toBeVisible()
})

test('检查点按容器分页，空操作项目和失败读取可恢复', async ({ page }) => {
  let failing = true
  let empty = true
  await page.route(`**${course}section/lab/operate/?*`, (r) =>
    failing
      ? r.fulfill({ status: 500, json: { error: '操作项目失败' } })
      : r.fulfill({ json: empty ? [] : [{ id: 'op' }] }),
  )
  await page.route(`**${operate}op/`, (r) =>
    r.fulfill({
      json: { ...practice, extended_content: { stage_mode: false } },
    }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({
      json: Array.from({ length: 13 }, (_, i) => ({
        id: `c${i}`,
        mode: 1,
        task_type: 4,
        desc: `第${i + 1}关`,
      })),
    }),
  )
  await page.goto('/#/basic/training/course/one')
  await expect(
    page.getByText('课程实验读取失败', { exact: true }),
  ).toBeVisible()
  failing = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(page.getByText('本节暂无实验', { exact: true })).toBeVisible()
  empty = false
  await page.getByRole('button', { name: /视频小节/ }).click()
  await page.getByRole('button', { name: /实验小节/ }).click()
  const next = page.getByRole('button', { name: '下一组检查点', exact: true })
  await expect(next).toBeVisible()
  while (await next.count()) await next.click()
  await page.getByRole('button', { name: '关卡13', exact: true }).click()
  await expect(page.getByText('第13关', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '上一组检查点', exact: true }),
  ).toBeVisible()
})

test('运行后手册、检查点和状态重读失败保留旧面板及自动释放截止时间', async ({
  page,
}) => {
  await page.clock.install()
  let failDetail = false,
    failChecks = false,
    failStatus = false,
    stops = 0
  await page.route(`**${operate}op/`, (r) =>
    failDetail
      ? r.fulfill({ status: 500, json: { error: '手册重读失败' } })
      : r.fulfill({
          json: { ...practice, write_up_option: 1, write_up_time: 1 },
        }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    failChecks
      ? r.fulfill({ status: 500, json: { error: '检查点重读失败' } })
      : r.fulfill({
          json: [{ ...checkpoints[0], task_type: 1, env: 'template' }],
        }),
  )
  await page.route('**/api/front/env/runs/?*', (r) => r.fulfill({ json: [] }))
  await page.route('**/api/front/env/status/', (r) =>
    failStatus
      ? r.fulfill({ status: 500, json: { error: '延时后状态读取失败' } })
      : r.fulfill({
          json: {
            status: 1,
            data: { status: 3, run_id: 'running', times: 10 },
          },
        }),
  )
  await page.route('**/api/front/scene/running/status/?*', (r) =>
    r.fulfill({ json: { nodes: {} } }),
  )
  await page.route('**/api/front/env/delay/running/', (r) => {
    failStatus = true
    return r.fulfill({ json: { status: 1 } })
  })
  await page.route('**/api/front/env/stop/running/', (r) => {
    stops++
    return r.fulfill({ json: { status: 1 } })
  })
  await page.route(`**${operate}op/checkpoint/flag/flag/finish/`, (r) => {
    failChecks = true
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  await expect(
    page.getByRole('region', { name: '课程环境', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '延时', exact: true }),
  ).toBeVisible()
  failDetail = true
  await page.clock.fastForward(1000)
  await page.clock.fastForward(1100)
  await expect(
    page.getByText('实验详情读取失败', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '延时', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '提交Flag', exact: true }).click()
  await expect(page.getByText('检查点读取失败', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '延时', exact: true }).click()
  await expect(
    page.getByText('课程环境状态读取失败', { exact: true }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: '课程环境', exact: true })
      .getByRole('timer'),
  ).toBeVisible()
  await page.clock.fastForward(10_000)
  await expect.poll(() => stops).toBe(1)
})

test('实验与整节测试同时打开时同题ID的标签只修改所属答案', async ({ page }) => {
  let practiceWrites = 0,
    sectionWrites = 0
  const q = {
    id: 'shared-question',
    name: '复用题目',
    option_type: 1,
    content: { A: '实验选项A', B: '实验选项B' },
    user_option: [],
  }
  await page.route(`**${course}catalog/`, (r) =>
    r.fulfill({ json: [{ ...section, test: true }] }),
  )
  await page.route(`**${operate}op/`, (r) =>
    r.fulfill({ json: { ...practice, test_type: 'ctf' } }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({ json: [{ id: 'topic', mode: 4, task_type: 4 }] }),
  )
  await page.route(`**${operate}op/checkpoint/topic/topic/**`, (r) => {
    if (r.request().method() === 'POST') {
      practiceWrites++
      return r.fulfill({ json: { status: 1 } })
    }
    return r.fulfill({ json: q })
  })
  await page.route(`**${course}section/lab/test/**`, (r) => {
    if (r.request().method() === 'POST') {
      sectionWrites++
      return r.fulfill({ json: { status: 1 } })
    }
    return r.fulfill({
      json: {
        done: false,
        results: [{ ...q, content: { A: '章节选项A', B: '章节选项B' } }],
      },
    })
  })
  await page.goto('/#/basic/training/course/one')
  await expect(
    page.getByRole('region', { name: '检查点题目', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '本节测试', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '本节测试', exact: true })
  await dialog.getByText('A：章节选项A', { exact: true }).click()
  await expect.poll(() => sectionWrites).toBe(1)
  expect(practiceWrites).toBe(0)
  await expect(
    dialog.getByRole('radio', { name: 'A：章节选项A', exact: true }),
  ).toBeChecked()
})

test('选择实验节刷新目录完成标识且不增加视频播放次数', async ({ page }) => {
  let catalogReads = 0,
    plays = 0
  await page.route(`**${course}catalog/`, (r) => {
    catalogReads++
    return r.fulfill({
      json: [
        {
          id: 'chapter',
          name: '实验章',
          section: [{ ...section, finish: catalogReads > 1 }],
        },
      ],
    })
  })
  await page.route(`**${course}catalog/*/play/`, (r) => {
    plays++
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  const lesson = page.getByRole('button', { name: /实验小节/ })
  await expect(lesson).toContainText('未完成')
  await lesson.click()
  await expect.poll(() => catalogReads).toBe(2)
  await expect(lesson).not.toContainText('未完成')
  await expect(lesson).toContainText('完成')
  expect(plays).toBe(0)
})

test('宿主目录重读失败保留运行环境的自动释放截止时间', async ({ page }) => {
  await page.clock.install()
  let failCatalog = false,
    stops = 0
  await page.route(`**${course}catalog/`, (r) =>
    failCatalog
      ? r.fulfill({ status: 500, json: { error: '目录重读失败' } })
      : r.fulfill({
          json: [{ id: 'chapter', name: '实验章', section: [section] }],
        }),
  )
  await page.route(`**${operate}op/checkpoint/?*`, (r) =>
    r.fulfill({
      json: [{ ...checkpoints[0], task_type: 1, env: 'template' }],
    }),
  )
  await page.route('**/api/front/env/runs/?*', (r) => r.fulfill({ json: [] }))
  await page.route('**/api/front/env/status/', (r) =>
    r.fulfill({
      json: { status: 1, data: { status: 3, run_id: 'running', times: 10 } },
    }),
  )
  await page.route('**/api/front/scene/running/status/?*', (r) =>
    r.fulfill({ json: { nodes: {} } }),
  )
  await page.route('**/api/front/env/stop/running/', (r) => {
    stops++
    return r.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  const timer = page
    .getByRole('region', { name: '课程环境', exact: true })
    .getByRole('timer')
  await expect(timer).toBeVisible()
  await page.clock.fastForward(4000)
  failCatalog = true
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
  })
  await expect(
    page.getByText('课程目录读取失败', { exact: true }),
  ).toBeVisible()
  await expect(timer).toBeVisible()
  await page.clock.fastForward(6000)
  await expect.poll(() => stops).toBe(1)
})
