import { expect, test as baseTest } from '@playwright/test'
import { readFile, copyFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'

const test = baseTest.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [
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
const sections = [
  {
    id: 'first',
    name: '第一节',
    type: 1,
    finish: false,
    m3u8: '/s15-hls/stream.m3u8',
  },
  {
    id: 'second',
    name: '第二节',
    type: 1,
    finish: true,
    m3u8: '/s15-hls/stream.m3u8',
  },
]
test.beforeEach(async ({ page }) => {
  await page.route('**/s15-hls/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!
    await route.fulfill({
      body: await readFile(resolve('tests/fixtures/s15-hls', name)),
      contentType: name.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t',
    })
  })
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 's15',
        username: '隔离学员',
        extend_info: { first_entry: true, position: [2] },
      },
    }),
  )
  await page.route(`**${base}`, (route) =>
    route.fulfill({
      json: {
        id: 'one',
        name: '视频课程',
        mode: 2,
        is_collect: false,
        course_direction_list: [],
      },
    }),
  )
  await page.route(`**${base}catalog/`, (route) =>
    route.fulfill({
      json: [{ id: 'chapter', name: '嵌套章', section: sections }],
    }),
  )
})

test('真实HLS分片加载、原生播放和章节点击计数', async ({ page }) => {
  const counts: string[] = []
  await page.route(`**${base}catalog/*/play/`, (route) => {
    counts.push(route.request().url())
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  const video = page.locator('video')
  await expect(video).toHaveCount(1)
  await expect(video).toHaveJSProperty('controls', true)
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(0)
  expect(counts).toHaveLength(0)
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 9
  })
  await page.getByRole('button', { name: /第一节/ }).click()
  await expect.poll(() => counts.length).toBe(1)
  await expect(video).toHaveJSProperty('currentTime', 9)
  await page.getByRole('button', { name: /第二节/ }).click()
  await expect.poll(() => counts.length).toBe(2)
  expect(counts[1]).toContain('/catalog/second/play/')
  await expect(video).toHaveCount(1)
})

test('课程笔记使用课程列表与元数据，保存正文后重开', async ({ page }) => {
  const requests: { method: string; body: unknown; path: string }[] = []
  let note = {
    id: 'n1',
    name: '原笔记',
    content: '<p>课程正文</p>',
    share: false,
    extend: { breakpoint_time: '' },
    section_id: 'first',
  }
  await page.route('**/api/front/user/note/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET') {
      return route.fulfill({
        json: url.pathname.endsWith('/note/')
          ? [{ id: note.id, name: note.name }]
          : note,
      })
    }
    const body = request.postDataJSON()
    requests.push({ method: request.method(), body, path: url.pathname })
    note = { ...note, ...body }
    return route.fulfill({ json: { id: note.id } })
  })
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '课程笔记', exact: true })
  await expect(dialog.getByText('课程正文', { exact: true })).toBeVisible()
  const editor = dialog.locator('.ql-editor[contenteditable=true]')
  await editor.fill('修改正文')
  await dialog.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({
    method: 'PATCH',
    body: { content: '<p>修改正文</p>' },
    path: '/api/front/user/note/n1/',
  })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  await expect(dialog.getByText('修改正文', { exact: true })).toBeVisible()
})

test('40秒日志失败保留分片，暂停不补报，成功仅清本次快照', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  const logs: {
    video_log: Record<string, number>
    sum_duration: number
    timestamp: number
    token: string
  }[] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**${base}section/first/video/log/`, async (route) => {
    logs.push(route.request().postDataJSON())
    if (logs.length === 1)
      return route.fulfill({ json: { status: 2, message: '隔离日志失败' } })
    if (logs.length === 2) await gate
    await route.fulfill({ json: { status: 1 } }).catch(() => {})
  })
  await page.goto('/#/basic/training/course/one')
  const video = page.locator('video')
  await expect
    .poll(() =>
      video.evaluate((v: HTMLVideoElement) =>
        v.buffered.length ? v.buffered.end(0) : 0,
      ),
    )
    .toBeGreaterThan(20)
  await video.dispatchEvent('pointerdown')
  await video.evaluate((v: HTMLVideoElement) => v.pause())
  expect(logs).toHaveLength(0)
  await page.clock.fastForward(40_000)
  await expect.poll(() => logs.length).toBe(1)
  await expect(page.getByText('隔离日志失败', { exact: true })).toHaveCount(1)
  expect(logs[0]!.sum_duration).toBe(64)
  expect(logs[0]!.video_log['segment00.mpegts']).toBe(2)
  expect(logs[0]!.token).toMatch(/^[0-9a-f]{32}$/)
  await page.clock.fastForward(40_000)
  await expect.poll(() => logs.length).toBe(2)
  expect(logs[1]!.video_log).toMatchObject(logs[0]!.video_log)
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 56
  })
  await expect
    .poll(() =>
      video.evaluate((v: HTMLVideoElement) =>
        v.buffered.end(v.buffered.length - 1),
      ),
    )
    .toBeGreaterThan(63.9)
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/section/first/video/log/') && r.status() === 200,
  )
  release()
  await (await response).finished()
  await page.clock.fastForward(40_000)
  await expect.poll(() => logs.length).toBe(3)
  expect(logs[2]!.video_log['segment28.mpegts']).toBe(2)
  expect(logs[2]!.video_log['segment00.mpegts']).toBeUndefined()
  await page.clock.fastForward(40_000)
  expect(logs).toHaveLength(3)
})

test('已完成章节不周期上报，结束仍上报，切节和离页清理旧媒体', async ({
  page,
}) => {
  await page.clock.install()
  const logs: string[] = []
  await page.route(`**${base}catalog/*/play/`, (route) =>
    route.fulfill({ json: { status: 1 } }),
  )
  await page.route(`**${base}section/*/video/log/`, (route) => {
    logs.push(route.request().url())
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/training/course/one')
  const video = page.locator('video')
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: /第二节/ }).click()
  await expect
    .poll(() =>
      video.evaluate((v: HTMLVideoElement) =>
        v.buffered.length ? v.buffered.end(0) : 0,
      ),
    )
    .toBeGreaterThan(20)
  await page.clock.fastForward(80_000)
  expect(logs).toHaveLength(0)
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 63.8
    return v.play()
  })
  await expect.poll(() => logs.length).toBe(1)
  expect(logs[0]).toContain('/section/second/video/log/')
  await page.evaluate(() => {
    location.hash = '/basic/home'
  })
  await expect(video).toHaveCount(0)
  await page.clock.fastForward(80_000)
  expect(logs).toHaveLength(1)
})

test('新建驻点拒绝0秒，课程元数据、改名、分享与删除保持原协议', async ({
  page,
}) => {
  let note: {
    id: string
    name: string
    content: string
    share: boolean
    extend: { breakpoint_time: number | string }
    section_id: string
  } | null = null
  const writes: { method: string; body: Record<string, unknown> }[] = []
  const searches: string[] = []
  await page.route('**/api/front/user/note/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() === 'GET') {
      if (url.pathname.endsWith('/note/')) {
        expect(url.searchParams.get('course_id')).toBe('one')
        expect(url.searchParams.get('section_id')).toBe('first')
        searches.push(url.searchParams.get('search')!)
        return route.fulfill({
          json:
            note && note.name.includes(url.searchParams.get('search')!)
              ? [{ id: note.id, name: note.name }]
              : [],
        })
      }
      return route.fulfill({ json: note })
    }
    const body = request.postDataJSON()
    writes.push({ method: request.method(), body })
    if (url.pathname.endsWith('/delete/')) {
      note = null
      return route.fulfill({ json: { status: 1 } })
    }
    note = {
      ...(note ?? {
        id: 'new',
        content: '',
        share: false,
        section_id: 'first',
      }),
      ...body,
    }
    return route.fulfill({ json: { id: 'new' } })
  })
  await page.goto('/#/basic/training/course/one')
  const video = page.locator('video')
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(0)
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '课程笔记', exact: true })
  await expect(dialog.getByText('暂无课程笔记', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '新建笔记', exact: true }).click()
  const create = page.getByRole('dialog', { name: '新建课程笔记', exact: true })
  await create.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(create.getByText('请输入名称', { exact: true })).toBeVisible()
  await create.getByRole('checkbox', { name: '记录视频驻点' }).click()
  await expect(
    page.getByText('视频未开始播放或者异常，请稍后！', { exact: true }),
  ).toBeVisible()
  await expect(create.getByRole('checkbox')).not.toBeChecked()
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 12
  })
  await create.getByRole('checkbox', { name: '记录视频驻点' }).check()
  await create.getByLabel('名称', { exact: true }).fill('带驻点笔记')
  await create.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '带驻点笔记', exact: true }),
  ).toBeVisible()
  expect(writes[0]).toEqual({
    method: 'POST',
    body: {
      name: '带驻点笔记',
      share: false,
      extend: { breakpoint_time: 12 },
      type: 1,
      course_id: 'one',
      section_id: 'first',
    },
  })
  await dialog.getByRole('button', { name: '改名', exact: true }).click()
  const rename = page.getByRole('dialog', { name: '修改课程笔记', exact: true })
  await expect(rename.getByRole('checkbox')).toBeChecked()
  await rename.getByLabel('名称', { exact: true }).fill('改名笔记')
  await rename.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(
    dialog.getByRole('button', { name: '改名笔记', exact: true }),
  ).toBeVisible()
  await dialog.getByRole('switch', { name: '分享笔记', exact: true }).click()
  await expect(
    dialog.getByRole('switch', { name: '分享笔记', exact: true }),
  ).toBeChecked()
  expect(writes[2]).toEqual({ method: 'PATCH', body: { share: true } })
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 2
  })
  await dialog
    .getByRole('button', { name: '跳转到驻点 00:12', exact: true })
    .click()
  await expect(video).toHaveJSProperty('currentTime', 12)
  await dialog.getByRole('textbox', { name: '搜索课程笔记' }).fill('不存在')
  await expect(dialog.getByText('暂无课程笔记', { exact: true })).toBeVisible()
  await dialog.getByRole('textbox', { name: '搜索课程笔记' }).fill('')
  await dialog.getByRole('button', { name: '删除笔记', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确认删除', exact: true })
    .click()
  await expect(dialog.getByText('暂无课程笔记', { exact: true })).toBeVisible()
  expect(writes.at(-1)).toEqual({ method: 'POST', body: { ids: ['new'] } })
  expect(searches).toContain('不存在')
})

test('课程共享笔记评分、拖动和局部全屏，驻点不请求跨页准入', async ({
  page,
}, info) => {
  let score = 2
  const listQueries: URLSearchParams[] = []
  await page.route('**/api/front/user/note/?*', (route) =>
    route.fulfill({ json: [] }),
  )
  await page.route('**/api/front/share/note/?*', (route) => {
    listQueries.push(new URL(route.request().url()).searchParams)
    return route.fulfill({ json: [{ id: 'shared', name: '共享记录' }] })
  })
  await page.route('**/api/front/share/note/shared/', (route) =>
    route.fulfill({
      json: {
        id: 'shared',
        content: '<p>共享课程内容</p>',
        synthesis_score: score,
        extend: { breakpoint_time: 8 },
        section_id: 'first',
      },
    }),
  )
  await page.route('**/api/front/share/note/shared/score/', (route) => {
    if (route.request().method() === 'POST') {
      score = route.request().postDataJSON().note_score
      return route.fulfill({ json: { status: 1 } })
    }
    return route.fulfill({ json: { data: { note_score: score } } })
  })
  const canEnter: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('can_enter')) canEnter.push(request.url())
  })
  await page.goto('/#/basic/training/course/one')
  await page.getByRole('button', { name: '笔记', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '课程笔记', exact: true })
  await dialog.getByRole('tab', { name: '共享笔记', exact: true }).click()
  await expect(dialog.getByText('共享课程内容', { exact: true })).toBeVisible()
  await expect(dialog.locator('.ql-editor')).toHaveAttribute(
    'contenteditable',
    'false',
  )
  await dialog.getByRole('button', { name: '评4星', exact: true }).click()
  await expect(dialog.getByLabel('推荐度', { exact: true })).toHaveText('4 / 5')
  await expect(
    dialog.getByRole('button', { name: '评4星', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await dialog
    .getByRole('button', { name: '跳转到驻点 00:08', exact: true })
    .click()
  await expect(page.locator('video')).toHaveJSProperty('currentTime', 8)
  expect(canEnter).toEqual([])
  expect(Object.fromEntries(listQueries[0]!)).toEqual({
    course_id: 'one',
    section_id: 'first',
    nopage: '1',
    search: '',
  })
  const before = (await dialog.boundingBox())!
  const title = (await dialog
    .getByRole('heading', { name: '课程笔记', exact: true })
    .boundingBox())!
  await page.mouse.move(title.x + 20, title.y + 10)
  await page.mouse.down()
  await page.mouse.move(title.x + 60, title.y + 45, { steps: 5 })
  await page.mouse.up()
  await expect
    .poll(async () => Math.round((await dialog.boundingBox())!.x - before.x))
    .toBe(40)
  const movedTitle = (await dialog
    .getByRole('heading', { name: '课程笔记', exact: true })
    .boundingBox())!
  await page.mouse.move(movedTitle.x + 20, movedTitle.y + 10)
  await page.mouse.down()
  await page.mouse.move(1200, 700, { steps: 5 })
  await page.mouse.up()
  const bounded = (await dialog.boundingBox())!
  expect(bounded.x + bounded.width).toBeLessThanOrEqual(1281)
  expect(bounded.y + bounded.height).toBeLessThanOrEqual(721)
  await dialog.getByRole('button', { name: '全屏', exact: true }).click()
  await expect
    .poll(async () => (await dialog.boundingBox())!.width)
    .toBeGreaterThan(1100)
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(
    true,
  )
  await page.screenshot({ path: info.outputPath('course-notes-full.png') })
  await dialog.getByRole('button', { name: '缩小', exact: true }).click()
})

test('个人归档驻点跨页准入后定位嵌套小节及播放时间', async ({ page }) => {
  await page.route('**/api/front/learn/task/my_notes/folders/?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 1,
          name: '课程归档',
          type: 1,
          courses: [{ id: 'one', name: '视频课程' }],
        },
      ],
    }),
  )
  await page.route(
    '**/api/front/learn/task/my_notes/folders/*/courses/*/notes/?*',
    (route) =>
      route.fulfill({ json: [{ id: 'checkpoint', name: '跨页驻点' }] }),
  )
  await page.route('**/api/front/user/note/checkpoint/', (route) =>
    route.fulfill({
      json: {
        id: 'checkpoint',
        name: '跨页驻点',
        content: '<p>嵌套驻点</p>',
        share: false,
        extend: { breakpoint_time: 18 },
        section_id: 'second',
      },
    }),
  )
  await page.route(`**${base}can_enter/`, (route) =>
    route.fulfill({ json: { can_enter: true } }),
  )
  await page.goto('/#/basic/user/note')
  await page
    .getByRole('button', { name: '跳转到驻点 00:18', exact: true })
    .click()
  await expect(page).toHaveURL(/#\/basic\/training\/course\/one/)
  await expect(page.getByRole('button', { name: /第二节/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await expect(page.locator('video')).toHaveJSProperty('currentTime', 18)
})

test('周期请求未返回时结束事件仍提交新分片，旧成功不串到新章节', async ({
  page,
}) => {
  await page.clock.install()
  const logs: { path: string; body: { video_log: Record<string, number> } }[] =
    []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**${base}catalog/*/play/`, (route) =>
    route.fulfill({ json: { status: 1 } }),
  )
  await page.route(`**${base}section/*/video/log/`, async (route) => {
    logs.push({
      path: route.request().url(),
      body: route.request().postDataJSON(),
    })
    if (logs.length === 1) await gate
    await route.fulfill({ json: { status: 1 } }).catch(() => {})
  })
  await page.goto('/#/basic/training/course/one')
  const video = page.locator('video')
  await expect
    .poll(() =>
      video.evaluate((v: HTMLVideoElement) =>
        v.buffered.length ? v.buffered.end(0) : 0,
      ),
    )
    .toBeGreaterThan(20)
  await page.clock.fastForward(40_000)
  await expect.poll(() => logs.length).toBe(1)
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 63.8
    return v.play()
  })
  await expect.poll(() => logs.length).toBe(2)
  expect(logs[1]!.body.video_log['segment31.mpegts']).toBe(2)
  await page.getByRole('button', { name: /第二节/ }).click()
  await expect
    .poll(() =>
      video.evaluate((v: HTMLVideoElement) =>
        v.buffered.length ? v.buffered.end(0) : 0,
      ),
    )
    .toBeGreaterThan(20)
  release()
  await video.evaluate((v: HTMLVideoElement) => {
    v.currentTime = 63.8
    return v.play()
  })
  await expect.poll(() => logs.length).toBe(3)
  expect(logs[2]!.path).toContain('/section/second/video/log/')
  expect(logs[2]!.body.video_log['segment00.mpegts']).toBe(2)
})

test('课程Word导出复用原接口并下载服务端文件，失败保存保留草稿', async ({
  page,
}) => {
  const file = `s15note${randomUUID().replaceAll('-', '')}.docx`
  const path = resolve('apps/web/public', file)
  await copyFile(resolve('tests/fixtures/s11-preview.docx'), path)
  try {
    let failing = true
    let detailReads = 0
    let stored = '<p>旧正文</p>'
    await page.route('**/api/front/user/note/?*', (route) =>
      route.fulfill({ json: [{ id: 'export', name: '导出笔记' }] }),
    )
    await page.route('**/api/front/user/note/export/', (route) => {
      if (route.request().method() === 'PATCH') {
        if (failing)
          return route.fulfill({ status: 500, json: { error: '隔离保存失败' } })
        stored = route.request().postDataJSON().content
        return route.fulfill({ json: { id: 'export' } })
      }
      detailReads++
      return route.fulfill({
        json: {
          id: 'export',
          name: '导出笔记',
          content: stored,
          share: false,
          extend: null,
        },
      })
    })
    await page.route('**/api/front/user/note/export/export/', (route) => {
      expect(route.request().method()).toBe('POST')
      return route.fulfill({
        json: { status: 1, data: { file_path: `/${file}` } },
      })
    })
    await page.goto('/#/basic/training/course/one')
    await page.getByRole('button', { name: '笔记', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '课程笔记', exact: true })
    const editor = dialog.locator('.ql-editor[contenteditable=true]')
    await editor.fill('待保存正文')
    await dialog.getByRole('button', { name: '保存笔记', exact: true }).click()
    await expect(page.getByText('隔离保存失败', { exact: true })).toHaveCount(1)
    await expect(editor).toHaveText('待保存正文')
    failing = false
    await dialog.getByRole('button', { name: '保存笔记', exact: true }).click()
    await expect.poll(() => stored).toBe('<p>待保存正文</p>')
    expect(detailReads).toBe(1)
    const downloading = page.waitForEvent('download')
    await dialog.getByRole('button', { name: '导出Word', exact: true }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe(file)
    expect(await readFile((await download.path())!)).toEqual(
      await readFile(path),
    )
  } finally {
    await unlink(path)
  }
})

test('异常暂停只自动恢复一次，主动操作后重置保护', async ({ page }) => {
  await page.goto('/#/basic/training/course/one')
  const video = page.locator('video')
  await expect
    .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(0)
  await video.evaluate((v: HTMLVideoElement) => v.play())
  await video.evaluate((v: HTMLVideoElement) => v.pause())
  await expect(video).toHaveJSProperty('paused', false)
  await video.evaluate((v: HTMLVideoElement) => v.pause())
  await expect(video).toHaveJSProperty('paused', true)
  await video.dispatchEvent('pointerdown')
  await video.evaluate((v: HTMLVideoElement) => v.play())
  await video.evaluate((v: HTMLVideoElement) => v.pause())
  await expect(video).toHaveJSProperty('paused', true)
})
