import { afterEach, expect, it, vi } from 'vitest'
import {
  getCaptureConfig,
  setCapture,
  getCaptureMarks,
  getCaptureRecords,
  deleteCaptureRecords,
  clearCaptureRecords,
} from './traffic-capture'

afterEach(() => vi.unstubAllGlobals())
it('捕获保留链路业务 ID、原始过滤字段与启停方法，业务拒绝不是成功', async () => {
  const requests: Array<{ path: string; method: string; body: unknown }> = []
  let response: unknown = { status: 1, pcap_size: null, pcap_filter: null }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      requests.push({
        path: url.pathname + url.search,
        method: options.method!,
        body: options.body ? JSON.parse(String(options.body)) : null,
      })
      return Response.json(response)
    }),
  )
  expect(await getCaptureConfig('topo/one', 501)).toEqual({
    status: 1,
    pcap_size: 5,
    pcap_filter: { proto: '', host: '', port: '' },
  })
  await setCapture('topo/one', 501, {
    pcap_size: '8',
    pcap_filter: { proto: 'tcp', host: '192.0.2.1', port: '80' },
  })
  await setCapture('topo/one', 501, undefined)
  expect(requests).toEqual([
    {
      path: '/api/front/topo/topo%2Fone/edge/501/capture_pcap_status/',
      method: 'GET',
      body: null,
    },
    {
      path: '/api/front/topo/topo%2Fone/edge/501/start_capture_pcap/',
      method: 'POST',
      body: {
        pcap_size: '8',
        pcap_filter: { proto: 'tcp', host: '192.0.2.1', port: '80' },
      },
    },
    {
      path: '/api/front/topo/topo%2Fone/edge/501/stop_capture_pcap/',
      method: 'POST',
      body: null,
    },
  ])
  response = { status: 2, message: '启动失败' }
  await expect(setCapture('topo/one', 501, undefined)).rejects.toMatchObject({
    kind: 'business',
    message: '启动失败',
  })
  response = { status: '2' }
  await expect(getCaptureConfig('topo/one', 501)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('记录查询按原范围传递分页/搜索/排序，删除与清空使用原文件名和方法', async () => {
  const requests: Array<{ path: string; method: string; body: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      requests.push({
        path: url.pathname + url.search,
        method: options.method!,
        body: options.body ? JSON.parse(String(options.body)) : null,
      })
      return Response.json(
        options.method === 'GET' ? { count: 0, results: [] } : { status: 1 },
      )
    }),
  )
  await getCaptureMarks('topo', { page: 2, size: 5 })
  await getCaptureRecords('topo', undefined, {
    page: 3,
    size: 5,
    search: 'tcp',
  })
  await getCaptureRecords('topo', 501, {
    page: 1,
    size: 5,
    search: '',
    ordering: '-size',
  })
  await deleteCaptureRecords(['one.pcap', 'two.pcap'])
  await clearCaptureRecords('topo')
  expect(requests).toEqual([
    {
      path: '/api/front/topo/topo/capture_situation/?page=2&size=5',
      method: 'GET',
      body: null,
    },
    {
      path: '/api/front/topo/topo/capture_pcap_list/?page=3&size=5&search=tcp',
      method: 'GET',
      body: null,
    },
    {
      path: '/api/front/topo/topo/edge/501/capture_pcap_list/?page=1&size=5&ordering=-size',
      method: 'GET',
      body: null,
    },
    {
      path: '/api/front/topo/capture_pcap_delete/',
      method: 'POST',
      body: { file_list: ['one.pcap', 'two.pcap'] },
    },
    {
      path: '/api/front/topo/topo/all_pcap_delete/',
      method: 'DELETE',
      body: null,
    },
  ])
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ results: [], count: '0' })),
  )
  await expect(
    getCaptureRecords('topo', undefined, { page: 1, size: 5 }),
  ).rejects.toMatchObject({ kind: 'invalid-response' })
})
