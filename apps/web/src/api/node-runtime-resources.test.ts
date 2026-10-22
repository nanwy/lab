import { afterEach, expect, it, vi } from 'vitest'
import {
  getSnapshots,
  createSnapshot,
  changeSnapshot,
  getNatRules,
  createNatRule,
  deleteNatRule,
  setNetworkEntrance,
  uploadRuntimeFile,
  getRuntimeImage,
} from './node-runtime-resources'

afterEach(() => vi.unstubAllGlobals())
it('快照/NAT使用画布UUID，保留resume删除路径及有副作用GET入口设置', async () => {
  const requests: Array<{ path: string; method: string; body: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, request: RequestInit) => {
      requests.push({
        path: url.pathname + url.search,
        method: request.method!,
        body: request.body ? JSON.parse(String(request.body)) : null,
      })
      return Response.json(
        request.method === 'GET' && !url.pathname.includes('/network/')
          ? { count: 0, results: [] }
          : { status: 1 },
      )
    }),
  )
  await getSnapshots('topo', 'uuid/a', {
    page: 2,
    search: '快照',
    ordering: '-create_time',
  })
  await createSnapshot('topo', 'uuid/a', '')
  await changeSnapshot('topo', 'uuid/a', 7, false)
  await changeSnapshot('topo', 'uuid/a', 7, true)
  await getNatRules('topo', 'uuid/a', { page: 1, search: '' })
  await createNatRule('topo', 'uuid/a', {
    nat_type: 'snat',
    external_ip: '192.0.2.1',
    logical_ip: '10.0.0.1',
  })
  await deleteNatRule('topo', 'uuid/a', 8)
  await setNetworkEntrance('topo', 'uuid/a')
  expect(requests[0]?.path).toBe(
    '/api/front/topo/topo/node/uuid%2Fa/snapshot/?page=2&size=10&search=%E5%BF%AB%E7%85%A7&ordering=-create_time&task_type=6',
  )
  expect(requests[1]).toMatchObject({
    path: '/api/front/topo/topo/node/uuid%2Fa/snapshot/?task_type=6',
    method: 'POST',
    body: { name: '' },
  })
  expect(requests[2]).toMatchObject({
    path: '/api/front/topo/topo/node/uuid%2Fa/snapshot/7/resume/?task_type=6',
    method: 'POST',
    body: {},
  })
  expect(requests[3]).toMatchObject({
    path: '/api/front/topo/topo/node/uuid%2Fa/snapshot/7/resume/?task_type=6',
    method: 'DELETE',
    body: {},
  })
  expect(requests[6]).toMatchObject({
    path: '/api/front/topo/topo/node/uuid%2Fa/nat/8/?task_type=6',
    method: 'DELETE',
    body: {},
  })
  expect(requests[7]).toEqual({
    path: '/api/front/topo/topo/network/uuid%2Fa/',
    method: 'GET',
    body: null,
  })
})
it('文件上传使用当前运行节点和multipart，不接受业务拒绝为成功', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, request: RequestInit) => {
      expect(url.pathname).toBe('/api/front/topo/node_run/a/upload_file/')
      expect(request.body).toBeInstanceOf(FormData)
      expect((request.body as FormData).get('file')).toBeInstanceOf(File)
      return Response.json({ status: 2, message: '上传失败' })
    }),
  )
  await expect(
    uploadRuntimeFile('a', new File(['test'], 'test.txt')),
  ).rejects.toMatchObject({ kind: 'business', message: '上传失败' })
})
it('损坏资源响应明确失败，关闭资源时取消请求', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ count: 1, results: [{ id: 7, enable: 'false' }] }),
    ),
  )
  await expect(
    getSnapshots('topo', 'a', { page: 1, search: '' }),
  ).rejects.toMatchObject({ kind: 'invalid-response' })
  await expect(getRuntimeImage(7)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  const controller = new AbortController()
  controller.abort()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, request: RequestInit) => {
      expect(request.signal?.aborted).toBe(true)
      throw new DOMException('Aborted', 'AbortError')
    }),
  )
  await expect(
    getNatRules('topo', 'a', { page: 1, search: '' }, controller.signal),
  ).rejects.toMatchObject({ kind: 'cancelled' })
})
