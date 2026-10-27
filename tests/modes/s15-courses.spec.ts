import { expect, test as baseTest } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
import { randomUUID } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'

const test = baseTest.extend<{ runtimeErrors: string[]; singleFile: string }>({
  singleFile: async ({ browserName }, provide) => {
    void browserName
    const name = `s15single${randomUUID().replaceAll('-', '')}.txt`
    const path = resolve('apps/web/public', name)
    await writeFile(path, '课程单文件测试')
    try {
      await provide(`/${name}`)
    } finally {
      await unlink(path)
    }
  },
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

const base = '/api/front/learn/task/self_study/open_courses/'
const root = '/#/basic/training/course'
const course = {
  id: 'one',
  name: '网络基础',
  type: 3,
  image: '',
  progress: '25%',
  difficulty: 2,
  grade: 1,
  tag_list: ['网络'],
  mode: 2,
  is_collect: false,
  course_direction_list: ['网络安全'],
}
const section = {
  id: 'lesson',
  name: '协议分析',
  type: 1,
  finish: false,
  video_length: '10:00',
  attachment: {
    lecture: '/media/lecture.pdf',
    section_attachment: '/media/attachment.txt',
  },
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
        id: 's15',
        username: '隔离学员',
        extend_info: { first_entry: true, position: [2] },
      },
    }),
  )
  await page.route('**/api/front/position/?*', (route) =>
    route.fulfill({ json: [{ id: 2, name: '运维' }] }),
  )
  await page.route('**/api/front/user/notice/count/', (route) =>
    route.fulfill({ json: { status: 1, data: 0 } }),
  )
  await page.route('**/api/front/user/todo/count/', (route) =>
    route.fulfill({ json: { status: 1, data: { count: 0 } } }),
  )
  await page.route(`**${base}filter/`, (route) =>
    route.fulfill({
      json: {
        category_lists: ['网络'],
        course_direction_lists: ['网络安全'],
        system_lists: [],
      },
    }),
  )
  await page.route(`**${base}list/?*`, (route) =>
    route.fulfill({ json: { count: 25, results: [course] } }),
  )
  await page.route(`**${base}*/brief/`, (route) =>
    route.fulfill({ json: { is_open: true } }),
  )
  await page.route(`**${base}one/`, (route) => route.fulfill({ json: course }))
  await page.route(`**${base}one/catalog/`, (route) =>
    route.fulfill({
      json: [{ id: 'chapter', name: '网络协议', section: [section] }],
    }),
  )
  await page.route('**/media/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/plain' }),
  )
})

test('公开课筛选合并方向到标签，分页与开放课程进入', async ({ page }, info) => {
  const queries: URLSearchParams[] = []
  page.on('request', (r) => {
    if (r.url().includes(`${base}list/?`))
      queries.push(new URL(r.url()).searchParams)
  })
  await page.goto(root)
  await expect(
    page.getByRole('button', { name: '网络基础', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '下一页', exact: true }).click()
  await expect.poll(() => queries.at(-1)?.get('page')).toBe('2')
  await page
    .getByRole('group', { name: '课程方向' })
    .getByRole('button', { name: '网络安全', exact: true })
    .click()
  await page
    .getByRole('group', { name: '课程分类' })
    .getByRole('button', { name: '网络', exact: true })
    .click()
  await expect
    .poll(() => queries.at(-1)?.getAll('tag'))
    .toEqual(['网络', '网络安全'])
  expect(queries.at(-1)?.get('page')).toBe('1')
  expect(queries.at(-1)?.has('course_direction')).toBe(false)
  await page.screenshot({
    path: info.outputPath('course-list.png'),
    fullPage: true,
  })
  await page.getByRole('button', { name: '网络基础', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '网络基础', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /协议分析/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
  await page.getByRole('button', { name: '返回公开课程', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '网络基础', exact: true }),
  ).toBeVisible()
})

test('课程资料目录、讲义与文件类型行为保持原分支', async ({
  page,
  singleFile,
}, info) => {
  const paths: string[] = []
  await page.route(`**${base}one/resource/?*`, (route) => {
    const path = new URL(route.request().url()).searchParams.get('parent_path')!
    paths.push(path)
    return route.fulfill({
      json:
        path === '/'
          ? [
              {
                id: 'dir',
                name: '一级',
                path: '/一级',
                is_file: 0,
                attached: null,
                size: 0,
                type: '',
                altertime: '2026',
              },
              {
                id: 'txt',
                name: '说明.txt',
                path: '/说明.txt',
                is_file: 1,
                attached: singleFile,
                size: 12,
                type: 'text/plain',
              },
              {
                id: 'doc',
                name: '办公.docx',
                path: '/办公.docx',
                is_file: 1,
                attached: '/media/doc.docx',
                size: 100,
                type: '',
                altertime: null,
              },
              {
                id: 'mp4',
                name: '演示.mp4',
                path: '/演示.mp4',
                is_file: 1,
                attached: '/media/demo.mp4',
                size: 42,
                type: 'video/mp4',
                altertime: '2025',
              },
            ]
          : [],
    })
  })
  await page.goto(`${root}/one`)
  await page.getByRole('button', { name: '本节讲义', exact: true }).click()
  const lecture = page.getByRole('dialog', { name: '本节讲义', exact: true })
  await expect(lecture.locator('iframe')).toHaveAttribute(
    'src',
    '/media/lecture.pdf',
  )
  await lecture.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(
    lecture.getByRole('button', { name: '缩小', exact: true }),
  ).toBeVisible()
  await lecture.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '资料', exact: true }).click()
  const files = page.getByRole('dialog', { name: '学习资料', exact: true })
  await expect(
    files.getByRole('link', { name: '下载 说明.txt', exact: true }),
  ).toHaveAttribute('href', singleFile)
  const downloading = page.waitForEvent('download')
  await files.getByRole('link', { name: '下载 说明.txt', exact: true }).click()
  const download = await downloading
  expect(download.suggestedFilename()).toBe(singleFile.slice(1))
  const { readFile } = await import('node:fs/promises')
  expect(await readFile((await download.path())!, 'utf8')).toBe(
    '课程单文件测试',
  )
  await expect(
    files.getByRole('link', { name: '办公.docx', exact: true }),
  ).toHaveCount(0)
  await files
    .getByRole('checkbox', { name: '选择 说明.txt', exact: true })
    .check()
  await expect(
    files.getByRole('button', { name: '批量导出', exact: true }),
  ).toBeDisabled()
  await expect(
    files.getByText('批量导出暂不可用，请使用单文件下载。'),
  ).toBeVisible()
  await files.getByRole('button', { name: '演示.mp4', exact: true }).click()
  const video = page.getByRole('dialog', { name: '视频播放', exact: true })
  await expect(video.locator('video')).toHaveAttribute('src', '/media/demo.mp4')
  await video.getByRole('button', { name: 'Close', exact: true }).click()
  await files.getByRole('row').filter({ hasText: '一级' }).dblclick()
  await expect(files.getByText('此目录暂无资料')).toBeVisible()
  expect(paths).toContain('/一级')
  await files
    .getByRole('navigation', { name: '资料路径' })
    .getByRole('button', { name: '全部文件', exact: true })
    .click()
  await expect(
    files.getByRole('checkbox', { name: '选择 说明.txt', exact: true }),
  ).not.toBeChecked()
  await page.screenshot({
    path: info.outputPath('course-materials.png'),
    fullPage: true,
  })
})

test('评论创建回复与删除末页回退，收藏和推荐课程跳转', async ({ page }) => {
  const posts: { path: string; body: unknown }[] = []
  let count = 11
  await page.route(`**${base}one/comment/**`, (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() === 'POST') {
      posts.push({ path: url.pathname, body: route.request().postDataJSON() })
      if (url.pathname.endsWith('delete/')) {
        count = 10
        return route.fulfill({ json: { status: 1 } })
      }
      return route.fulfill({
        json: { content: route.request().postDataJSON().content },
      })
    }
    const second = url.searchParams.get('page') === '2'
    return route.fulfill({
      json: {
        count,
        results:
          second && count === 10
            ? []
            : [
                {
                  id: second ? 'last' : 'first',
                  username: second ? '隔离学员' : '其他学员',
                  role: 1,
                  logo: '',
                  created: '2026-10-27',
                  content: second ? '末页评论' : '第一页评论',
                  comment: [
                    {
                      username: '教员',
                      role: 2,
                      created: '2026-10-27',
                      content: '现有回复',
                    },
                  ],
                },
              ],
      },
    })
  })
  await page.route('**/api/front/user/collect/**', (route) => {
    posts.push({
      path: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON(),
    })
    return route.fulfill({ json: { status: 1 } })
  })
  await page.route(`**${base}one/recommend/`, (route) =>
    route.fulfill({
      json: { status: 1, data: [{ ...course, id: 'two', name: '进阶课程' }] },
    }),
  )
  await page.route(`**${base}two/`, (route) =>
    route.fulfill({ json: { ...course, id: 'two', name: '进阶课程' } }),
  )
  await page.route(`**${base}two/catalog/`, (route) =>
    route.fulfill({ json: [] }),
  )
  await page.goto(`${root}/one`)
  await page.getByRole('button', { name: '收藏', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '取消收藏', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '取消收藏', exact: true }).click()
  expect(posts.slice(0, 2).map((p) => p.body)).toEqual([
    { attribute: 1, object_id: 'one' },
    { attribute: 1, ids: ['one'] },
  ])
  await page.getByRole('button', { name: '评论', exact: true }).click()
  const comments = page.getByRole('dialog', { name: '评论', exact: true })
  await expect(comments.getByText('第一页评论')).toBeVisible()
  await expect(comments.getByText('现有回复')).toBeVisible()
  await expect(
    comments.getByRole('button', { name: '删除', exact: true }),
  ).toHaveCount(0)
  await comments.getByLabel('评论内容', { exact: true }).fill('新评论')
  await comments.getByRole('button', { name: '提交', exact: true }).click()
  await expect(comments.getByLabel('评论内容', { exact: true })).toHaveValue('')
  await comments.getByRole('button', { name: '回复', exact: true }).click()
  await comments.getByLabel('回复内容', { exact: true }).fill('新回复')
  await comments.getByRole('button', { name: '回答', exact: true }).click()
  await expect(comments.getByLabel('回复内容', { exact: true })).toHaveValue('')
  await comments.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(comments.getByText('末页评论')).toBeVisible()
  await comments.getByRole('button', { name: '删除', exact: true }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: '确定删除', exact: true })
    .click()
  await expect(comments.getByText('第一页评论')).toBeVisible()
  await expect(comments.getByText('第 1 / 1 页，共 10 项')).toBeVisible()
  expect(posts.slice(2).map((p) => p.body)).toEqual([
    { content: '新评论' },
    { content: '新回复' },
    { level1: ['last'] },
  ])
  await comments.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: '相关课程', exact: true }).click()
  await page.getByRole('button', { name: '进阶课程', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: '进阶课程', exact: true }),
  ).toBeVisible()
})

test('列表失败仅提示一次，可恢复空态，关闭课程不进入详情', async ({ page }) => {
  let state: 'failed' | 'empty' | 'closed' = 'failed'
  await page.route(`**${base}list/?*`, (route) =>
    state === 'failed'
      ? route.fulfill({ status: 500, json: { error: '课程服务不可用' } })
      : route.fulfill({
          json: {
            count: state === 'empty' ? 0 : 1,
            results: state === 'empty' ? [] : [course],
          },
        }),
  )
  await page.route(`**${base}one/brief/`, (route) =>
    route.fulfill({ json: { is_open: false } }),
  )
  await page.goto(root)
  await expect(
    page.getByText('课程列表读取失败', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('课程服务不可用', { exact: true })).toHaveCount(1)
  state = 'empty'
  await page
    .getByRole('alert')
    .getByRole('button', { name: '重试', exact: true })
    .click()
  await expect(page.getByText('暂无公开课程', { exact: true })).toBeVisible()
  state = 'closed'
  await page.getByRole('textbox', { name: '搜索课程' }).fill('网络')
  await page.getByRole('button', { name: '网络基础', exact: true }).click()
  await expect(page.getByText('该课程已被关闭', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/#\/basic\/training\/course$/)
})

test('平铺目录百分比、实验工具视频与Office讲义保持区别', async ({
  page,
}, info) => {
  await page.route(`**${base}one/`, (route) =>
    route.fulfill({ json: { ...course, mode: 1 } }),
  )
  await page.route(`**${base}one/catalog/`, (route) =>
    route.fulfill({
      json: [
        {
          ...section,
          finish_rate: 0.4,
          play_count: 2,
          attachment: { lecture: '/media/lecture.docx' },
        },
        {
          id: 'lab',
          name: '实验章节',
          type: 2,
          finish_rate: 0,
          video_attachment: '/media/lab.mp4',
          attachment: {
            tool_attachment: '/media/tool.zip',
            section_attachment: '/media/lab.txt',
          },
        },
      ],
    }),
  )
  await page.goto(`${root}/one`)
  await expect(page.getByRole('button', { name: /协议分析/ })).toContainText(
    '进度：40%',
  )
  const lecture = page.getByRole('link', { name: '本节讲义', exact: true })
  const href = await lecture.getAttribute('href')
  const search = new URLSearchParams(href!.split('?')[1])
  expect(search.get('filePath')).toMatch(/\/media\/lecture.docx$/)
  expect(search.get('mode')).toBe('view')
  await page.getByRole('button', { name: /实验章节/ }).click()
  await expect(
    page.getByRole('link', { name: '本节工具', exact: true }),
  ).toHaveAttribute('href', '/media/tool.zip')
  await expect(
    page.getByRole('link', { name: '本节附件', exact: true }),
  ).toHaveAttribute('href', '/media/lab.txt')
  await expect(
    page.getByRole('link', { name: '本节讲义', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '实验视频', exact: true }).click()
  const video = page.getByRole('dialog', { name: '视频播放', exact: true })
  await expect(video.locator('video')).toHaveAttribute('src', '/media/lab.mp4')
  await expect(video.locator('video')).toHaveJSProperty('autoplay', false)
  await video.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('video')).toHaveCount(0)
  await page.setViewportSize({ width: 700, height: 900 })
  await page.screenshot({
    path: info.outputPath('course-detail-700.png'),
    fullPage: true,
  })
})

test('课程深链切换取消旧读取，迟到课程和目录不覆盖新课', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  await page.route(`**${base}one/`, async (route) => {
    started = true
    await gate
    await route.fulfill({ json: course }).catch(() => {})
  })
  await page.route(`**${base}two/`, (route) =>
    route.fulfill({ json: { ...course, id: 'two', name: '新课程' } }),
  )
  await page.route(`**${base}two/catalog/`, (route) =>
    route.fulfill({ json: [] }),
  )
  await page.goto(`${root}/one`)
  await expect.poll(() => started).toBe(true)
  await expect(page.locator('[data-slot="loading"]').first()).toBeVisible()
  await page.evaluate(() => {
    location.hash = '/basic/training/course/two'
  })
  await expect(
    page.getByRole('heading', { name: '新课程', exact: true }),
  ).toBeVisible()
  release()
  await expect(page.getByText('未关联小节', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '网络基础', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: /协议分析/ })).toHaveCount(0)
})
