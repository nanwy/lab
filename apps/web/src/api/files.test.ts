import { afterEach, expect, it, vi } from 'vitest'
import { getFiles, fileDownloadName, isOfficeFile } from './files'
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
