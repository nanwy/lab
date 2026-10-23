import { afterEach, expect, it, vi } from 'vitest'
import { getFiles, fileDownloadName, isOfficeFile, exportFiles } from './files'
afterEach(() => vi.unstubAllGlobals())
it('公开与个人目录分别请求原端点，中文和特殊字符只编码一次', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json([]))
  vi.stubGlobal('fetch', fetch)
  await getFiles('public', '/资料 & #/100%')
  await getFiles('personal', '/')
  const first = new URL(String(fetch.mock.calls[0]?.[0]))
  expect(first.pathname).toBe('/api/front/open/resource_network_disk/')
  expect(first.searchParams.get('parent_path')).toBe('/资料 & #/100%')
  expect(first.searchParams.get('nopage')).toBe('1')
  expect(String(fetch.mock.calls[1]?.[0])).toContain(
    '/front/learn/task/my_profile/files/?parent_path=%2F&nopage=1',
  )
})

it('无效列表不伪装空目录，取消信号贯穿请求', async () => {
  const abort = new AbortController()
  const fetch = vi.fn(async (_url: URL, options: RequestInit) => {
    expect(options.signal).toBeDefined()
    return Response.json({ results: [] })
  })
  vi.stubGlobal('fetch', fetch)
  await expect(getFiles('personal', '/', abort.signal)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
it('保留个人下划线及公开八字符标识的两域命名，包括原多点缺陷', () => {
  expect(fileDownloadName('personal', '/files/课件_server.pdf', '显示名')).toBe(
    '课件.pdf',
  )
  expect(fileDownloadName('public', '/files/课件-12345678.pdf', '显示名')).toBe(
    '显示名.pdf',
  )
  expect(
    fileDownloadName('personal', '/files/archive.v2_server.pdf', '显示名'),
  ).toBe('archive.v2_server')
  expect(
    fileDownloadName('public', '/files/课件-12345678.pdf', '课件.pdf'),
  ).toBe('课件.pdf')
  expect(
    fileDownloadName('public', '/files/课件-12345678.pdf', '别名.pdf'),
  ).toBe('别名.pdf.pdf')
  expect(isOfficeFile('/files/课件.WPS')).toBe(true)
  expect(isOfficeFile('/files/课件.xlsx?signature=1')).toBe(false)
})

it('公开布尔与个人数值共享标记按数据域归一化，错误类型拒绝', async () => {
  const entry = {
    id: 1,
    name: 'test',
    path: '/test',
    is_file: 1,
    attached: '/test',
    size: 1,
    type: 'text/plain',
    altertime: '2026-10-24',
  }
  let flag: unknown = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([{ ...entry, is_shared_file: flag }])),
  )
  expect((await getFiles('personal', '/'))[0]?.is_shared_file).toBe(false)
  flag = 1
  expect((await getFiles('personal', '/'))[0]?.is_shared_file).toBe(true)
  flag = true
  expect((await getFiles('public', '/'))[0]?.is_shared_file).toBe(true)
  await expect(getFiles('personal', '/')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  flag = 0
  await expect(getFiles('public', '/')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('公开与个人打包提交各自 ID 并读取确认的 download_url', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(
      { status: 1, message: '完成', download_url: '/files/archive.zip' },
      { status: 201 },
    ),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await exportFiles('public', ['file', 'folder'])).toBe(
    '/files/archive.zip',
  )
  expect(await exportFiles('personal', [9])).toBe('/files/archive.zip')
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    '/front/open/resource_network_disk/export_zip/',
  )
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    resource_ids: ['file', 'folder'],
  })
  expect(String(fetch.mock.calls[1]?.[0])).toContain(
    '/front/learn/task/my_profile/files/export_zip/',
  )
  expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
    file_ids: [9],
  })
})

it('打包拒绝空选择、上级对象及缺产物的伪成功，不猜其他字段', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal('fetch', fetch)
  await expect(exportFiles('public', [])).rejects.toThrow('请选择有效文件')
  await expect(exportFiles('personal', ['..'])).rejects.toThrow(
    '请选择有效文件',
  )
  expect(fetch).not.toHaveBeenCalled()
  for (const response of [
    { status: 1, message: '完成' },
    { status: 1, message: '完成', url: '/archive.zip' },
    '/archive.zip',
    { status: 1, message: '完成', download_url: '' },
    { status: 1, message: '完成', download_url: 'javascript:alert(1)' },
    { status: 1, message: '完成', download_url: 'archive.zip' },
  ]) {
    fetch.mockResolvedValueOnce(Response.json(response))
    await expect(exportFiles('public', [1])).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})

it('打包业务失败不交付下载地址，取消信号终止请求', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        status: 0,
        message: '无权打包',
        download_url: '/archive.zip',
      }),
    ),
  )
  await expect(exportFiles('personal', [1])).rejects.toMatchObject({
    kind: 'business',
    message: '无权打包',
  })
  const controller = new AbortController()
  controller.abort()
  await expect(
    exportFiles('public', [1], controller.signal),
  ).rejects.toMatchObject({ kind: 'cancelled' })
})
