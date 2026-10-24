import { afterEach, expect, it, vi } from 'vitest'
import { getDetectionMaterials } from './detection-materials'
afterEach(() => vi.unstubAllGlobals())
const file = {
  id: 7,
  name: '手册.txt',
  path: '/手册.txt',
  attached: '/media/manual_hash.txt',
  is_file: 1,
  size: '120',
  type: 'text/plain',
  create_time: '展示日期',
  altertime: '2026-01-01',
  isLink: 0,
}
it('资料独立域读取results，保留显示时间与排序时间并归一消费真值和数值字符串', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ results: [file] }),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await getDetectionMaterials('a/b', '/目录')).toEqual([
    { ...file, is_file: true, size: 120, isLink: false },
  ])
  const url = new URL(String(fetch.mock.calls[0]?.[0]))
  expect(url.pathname).toBe(
    '/api/front/wqzb/detection_front/tools/a%2Fb/materials/',
  )
  expect(Object.fromEntries(url.searchParams)).toEqual({
    id: 'a/b',
    parent_path: '/目录',
  })
})
it('ZIP只提交material_ids，返回download_url并拒绝候选地址与无地址响应', async () => {
  const { exportDetectionMaterials } = await import('./detection-materials')
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ download_url: '/media/export.zip' }),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await exportDetectionMaterials('a/b', [7, 'dir'])).toBe(
    '/media/export.zip',
  )
  expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe(
    '/api/front/wqzb/detection_front/tools/a%2Fb/materials/export_zip/',
  )
  expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({
    material_ids: [7, 'dir'],
  })
  for (const body of [
    { url: '/media/export.zip' },
    '/media/export.zip',
    {},
    { download_url: '' },
    { download_url: 'javascript:alert(1)' },
  ]) {
    fetch.mockResolvedValueOnce(Response.json(body))
    await expect(exportDetectionMaterials(1, [7])).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})
it('资料空目录合法；错误字段、哨兵ID、重复ID、无文件地址和可执行地址明确失败', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ results: [] }),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await getDetectionMaterials(1, '/')).toEqual([])
  for (const body of [
    [],
    { data: [] },
    { results: [{ ...file, id: '..' }] },
    { results: [file, file] },
    { results: [{ ...file, attached: null }] },
    { results: [{ ...file, attached: 'javascript:alert(1)' }] },
    { results: [{ ...file, size: 'NaN' }] },
    { results: [{ ...file, altertime: null }] },
    { results: [{ ...file, is_file: 'false' }] },
  ]) {
    fetch.mockResolvedValueOnce(Response.json(body))
    await expect(getDetectionMaterials(1, '/')).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})
it('ZIP空选择/无效项不发送请求，未知status不能转成下载地址', async () => {
  const { exportDetectionMaterials, detectionDownloadName } =
    await import('./detection-materials')
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      status: 0,
      message: '禁止导出',
      download_url: '/should-not-download.zip',
    }),
  )
  vi.stubGlobal('fetch', fetch)
  for (const ids of [[], ['..'], ['']])
    await expect(exportDetectionMaterials(1, ids)).rejects.toThrow(
      '请选择有效资料',
    )
  expect(fetch).not.toHaveBeenCalled()
  await expect(exportDetectionMaterials(1, [7])).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  expect(detectionDownloadName('/media/report_123.multi.zip')).toBe(
    'report.multi',
  )
})
