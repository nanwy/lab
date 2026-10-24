import { createServer } from 'node:http'
import { expect, test as base } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
const test = base.extend<{ errors: string[]; artifacts: string }>({
  artifacts: async ({ browserName }, provide) => {
    void browserName
    const server = createServer((request, response) => {
      const zip = request.url === '/export.zip'
      response.writeHead(200, {
        'Content-Type': zip ? 'application/zip' : 'text/plain',
        'Content-Disposition': `attachment; filename=${zip ? 'download.zip' : 'manual.txt'}`,
      })
      response.end(zip ? zipBytes : 'S11 single file')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('artifact server unavailable')
    try {
      await provide(`http://127.0.0.1:${address.port}`)
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    }
  },
  errors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        const text = message.text()
        if (
          /^Failed to load resource: the server responded with a status of (500 \(Internal Server Error\)|403 \(Forbidden\))$/.test(
            text,
          ) &&
          /\/api\/front\/wqzb\/detection_front\/tools\/[^/]+\/materials\//.test(
            message.location().url,
          )
        )
          return
        errors.push(text)
      })
      await use(errors)
      expect(errors).toEqual([])
    },
    { auto: true },
  ],
})
const root = '/#/basic/user/bench/experiment/one/detection/'
const detail = (id: string) => ({
  id,
  name: `工具${id}`,
  tags: ['检测'],
  tool_carrier: id === 'first' ? 1 : 2,
  carrier_path: '/media/tool.zip',
  image_info: { name: '隔离镜像' },
  account: 'learner / example',
  description: '用途说明',
  user_manual: '<h2>工具使用步骤</h2><p><strong>只读格式</strong></p>',
})
test.beforeEach(async ({ page }) => {
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 's11',
        username: '隔离学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.route('**/api/front/user/notice/count/', (route) =>
    route.fulfill({ json: { status: 1, data: 0 } }),
  )
  await page.route('**/api/front/user/todo/count/', (route) =>
    route.fulfill({ json: { status: 1, data: { count: 0 } } }),
  )
  await page.route('**/api/front/simulation/experiment/*/?more=1', (route) =>
    route.fulfill({
      json: {
        id: new URL(route.request().url()).pathname.split('/').at(-2),
        name: '检测实验',
        desc: '',
        node_count: 0,
        user_name: '隔离学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: null,
      },
    }),
  )
  await page.route('**/api/front/wqzb/detection_front/tools/?*', (route) =>
    route.fulfill({
      json: {
        results: [
          { id: 'first', name: '工具first', tags: ['检测'] },
          { id: 'second', name: '工具second', tags: [] },
        ],
      },
    }),
  )
  await page.route('**/api/front/wqzb/detection_front/tools/*/', (route) =>
    route.fulfill({
      json: detail(new URL(route.request().url()).pathname.split('/').at(-2)!),
    }),
  )
})
const materials = [
  {
    id: 'dir',
    name: '目录',
    path: '/一级/二级/三级/四级',
    is_file: 0,
    attached: null,
    size: 0,
    type: '',
    create_time: '2020',
    altertime: '2030',
  },
  {
    id: 'txt',
    name: '说明.txt',
    path: '/说明.txt',
    is_file: 1,
    attached: '/media/manual_hash.txt',
    size: '120',
    type: 'text/plain',
    create_time: '展示时间',
    altertime: '2026',
  },
  {
    id: 'office',
    name: '办公.docx',
    path: '/办公.docx',
    is_file: 1,
    attached: '/media/office_hash.docx',
    size: 1024,
    type: '',
    create_time: '早期展示',
    altertime: '2000',
  },
  {
    id: 'video',
    name: '演示.mp4',
    path: '/演示.mp4',
    is_file: 1,
    attached: '/media/video_hash.mp4',
    size: 4096,
    type: 'video/mp4',
    create_time: '中期展示',
    altertime: '2010',
  },
]
test('相关资料目录、选择、附带命名下载和视频/Office区别', async ({
  page,
}, info) => {
  await page.route(
    '**/api/front/wqzb/detection_front/tools/*/materials/?*',
    (route) =>
      route.fulfill({
        json: {
          results:
            new URL(route.request().url()).searchParams.get('parent_path') ===
            '/'
              ? materials
              : [],
        },
      }),
  )
  await page.goto(`${root}penetration`)
  await page.getByRole('tab', { name: '相关资料' }).click()
  await expect(page.getByRole('table', { name: '工具相关资料' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '批量导出', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('checkbox', { name: '选择 说明.txt', exact: true })
    .check()
  await expect(page.getByText('已选择 1 项', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('link', { name: '下载 说明.txt', exact: true }),
  ).toHaveAttribute('download', 'manual.txt')
  await expect(
    page.getByRole('link', { name: '办公.docx', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: '演示.mp4', exact: true }).click()
  await expect(page.locator('video')).toHaveAttribute(
    'src',
    '/media/video_hash.mp4',
  )
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('video')).toHaveCount(0)
  await page.getByRole('row').filter({ hasText: '目录' }).dblclick()
  await expect(page.getByText('此目录暂无资料', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: '批量导出', exact: true }),
  ).toBeDisabled()
  const nav = page.getByRole('navigation', { name: '资料路径' })
  await expect(nav).not.toContainText('一级')
  await nav.getByRole('button', { name: '二级', exact: true }).click()
  await expect(nav).toContainText('一级')
  await page.getByRole('button', { name: '返回上级', exact: true }).dblclick()
  await nav.getByRole('button', { name: '全部文件', exact: true }).click()
  await expect(
    page.getByRole('link', { name: '下载 说明.txt', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: '大小', exact: true }).click()
  await expect(page.getByRole('row').nth(2)).toContainText('说明.txt')
  await page.getByRole('button', { name: '名称', exact: true }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('说明.txt')
  await page.getByRole('button', { name: '修改时间', exact: true }).click()
  await expect(page.getByRole('row').nth(1)).toContainText('目录')
  await page.screenshot({
    path: info.outputPath('materials.png'),
    fullPage: true,
  })
})

test('读取失败、契约错误、拒绝访问和空目录可恢复，刷新与卸载清选择', async ({
  page,
}) => {
  let state = 'failed'
  await page.route(
    '**/api/front/wqzb/detection_front/tools/*/materials/?*',
    (route) => {
      if (state === 'failed')
        return route.fulfill({ status: 500, json: { error: '资料暂时失败' } })
      if (state === 'denied')
        return route.fulfill({ status: 403, json: { error: '资料禁止访问' } })
      if (state === 'invalid') return route.fulfill({ json: { data: [] } })
      return route.fulfill({
        json: { results: state === 'empty' ? [] : materials },
      })
    },
  )
  await page.goto(`${root}penetration`)
  await page.getByRole('tab', { name: '相关资料' }).click()
  await expect(page.getByText('资料读取失败', { exact: true })).toBeVisible()
  await expect(page.getByText('资料暂时失败', { exact: true })).toHaveCount(1)
  state = 'denied'
  await page.getByRole('button', { name: '重试资料', exact: true }).click()
  await expect(
    page.getByText('无权读取工具资料', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('资料禁止访问', { exact: true })).toHaveCount(1)
  state = 'invalid'
  await page.getByRole('button', { name: '重试资料', exact: true }).click()
  await expect(
    page.getByText('检测资料响应契约错误', { exact: true }),
  ).toBeVisible()
  state = 'empty'
  await page.getByRole('button', { name: '重试资料', exact: true }).click()
  await expect(page.getByText('此目录暂无资料', { exact: true })).toBeVisible()
  state = 'success'
  await page.getByRole('button', { name: '刷新资料', exact: true }).click()
  await page
    .getByRole('checkbox', { name: '选择 说明.txt', exact: true })
    .check()
  await page.getByRole('button', { name: '刷新资料', exact: true }).click()
  await expect(
    page.getByRole('checkbox', { name: '选择 说明.txt', exact: true }),
  ).not.toBeChecked()
  await page
    .getByRole('checkbox', { name: '选择 说明.txt', exact: true })
    .check()
  await page.getByRole('tab', { name: '使用手册' }).click()
  await page.getByRole('tab', { name: '相关资料' }).click()
  await expect(
    page.getByRole('checkbox', { name: '选择 说明.txt', exact: true }),
  ).not.toBeChecked()
})

test('切工具保持资料页签但回根目录，迟到资料和导出不能污染当前工具', async ({
  page,
}) => {
  let release!: () => void
  const slow = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route(
    '**/api/front/wqzb/detection_front/tools/*/materials/?*',
    async (route) => {
      const url = new URL(route.request().url())
      const id = url.searchParams.get('id')
      if (id === 'first') {
        requested = true
        await slow
        await route.fulfill({ json: { results: materials } }).catch(() => {})
        return
      }
      return route.fulfill({
        json: {
          results: [
            { ...materials[1], id: 'second-file', name: '新工具资料.txt' },
          ],
        },
      })
    },
  )
  await page.goto(`${root}penetration`)
  await page.getByRole('tab', { name: '相关资料' }).click()
  await expect(page.getByText('正在读取资料…', { exact: true })).toBeVisible()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: '工具second', exact: true }).click()
  await expect(page.getByRole('tab', { name: '相关资料' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(
    page.getByRole('link', { name: '新工具资料.txt', exact: true }),
  ).toBeVisible()
  release()
  await expect(
    page.getByRole('link', { name: '说明.txt', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('checkbox', { name: '选择 新工具资料.txt', exact: true })
    .check()
  let releaseExport!: () => void
  const slowExport = new Promise<void>((resolve) => {
    releaseExport = resolve
  })
  let started = false
  await page.route(
    '**/api/front/wqzb/detection_front/tools/second/materials/export_zip/',
    async (route) => {
      started = true
      await slowExport
      await route
        .fulfill({ json: { download_url: '/forbidden-late.zip' } })
        .catch(() => {})
    },
  )
  const downloads: string[] = []
  page.on('download', (download) => downloads.push(download.url()))
  await page.getByRole('button', { name: '批量导出', exact: true }).click()
  await expect.poll(() => started).toBe(true)
  await page.getByRole('button', { name: '工具first', exact: true }).click()
  await expect(
    page.getByRole('link', { name: '说明.txt', exact: true }),
  ).toBeVisible()
  releaseExport()
  await expect(
    page.getByRole('button', { name: '批量导出', exact: true }),
  ).toBeDisabled()
  await page.getByRole('tab', { name: '基本信息' }).click()
  expect(downloads).toEqual([])
})

const zipBytes = Buffer.from(
  'UEsDBBQAAAgAANWhWF1yVnUOEAAAABAAAAAKAAAA6K+05piOLnR4dFMxMSBpc29sYXRlZCBaSVBQSwECFAMUAAAIAADVoVhdclZ1DhAAAAAQAAAACgAAAAAAAAAAAAAAgAEAAAAA6K+05piOLnR4dFBLBQYAAAAAAQABADgAAAA4AAAAAAA=',
  'base64',
)
test('ZIP导出核对参数、重复提交、单下载及ZIP字节，失败保留选择可重试', async ({
  page,
  artifacts,
}) => {
  const { readFile } = await import('node:fs/promises')
  await page.route(
    '**/api/front/wqzb/detection_front/tools/*/materials/?*',
    (route) =>
      route.fulfill({
        json: {
          results: materials.map((file) =>
            file.id === 'txt'
              ? { ...file, attached: `${artifacts}/manual.txt` }
              : file,
          ),
        },
      }),
  )
  let state = 'invalid'
  const bodies: unknown[] = []
  let release!: () => void
  const slow = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/api/front/wqzb/detection_front/tools/first/materials/export_zip/',
    async (route) => {
      bodies.push(route.request().postDataJSON())
      if (state === 'invalid')
        return route.fulfill({ json: { url: '/media/export.zip' } })
      if (state === 'failed')
        return route.fulfill({ status: 500, json: { error: '导出暂时失败' } })
      await slow
      return route.fulfill({
        json: { download_url: `${artifacts}/export.zip` },
      })
    },
  )
  await page.goto(`${root}penetration`)
  await page.getByRole('tab', { name: '相关资料' }).click()
  const one = page.waitForEvent('download')
  await page.getByRole('link', { name: '下载 说明.txt', exact: true }).click()
  expect(await readFile((await (await one).path())!, 'utf8')).toBe(
    'S11 single file',
  )
  await page
    .getByRole('checkbox', { name: '选择 说明.txt', exact: true })
    .check()
  await page.getByRole('checkbox', { name: '选择 目录', exact: true }).check()
  await page.getByRole('button', { name: '批量导出', exact: true }).click()
  await expect(page.getByText(/检测资料导出响应契约错误/)).toHaveCount(1)
  state = 'failed'
  await page.getByRole('button', { name: '批量导出', exact: true }).click()
  await expect(page.getByText('导出暂时失败', { exact: true })).toHaveCount(1)
  state = 'success'
  await page.getByRole('button', { name: '批量导出', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '批量导出', exact: true }),
  ).toBeDisabled()
  expect(bodies).toEqual(Array(3).fill({ material_ids: ['dir', 'txt'] }))
  const download = page.waitForEvent('download')
  release()
  const zip = await download
  const bytes = await readFile((await zip.path())!)
  expect(bytes).toEqual(zipBytes)
  // ZIP central directory以及未压缩文件内容直接来自独立fixture。
  expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304')
  expect(bytes.includes(Buffer.from('S11 isolated ZIP'))).toBe(true)
  await expect(page.getByText('已选择 2 项', { exact: true })).toBeVisible()
})
