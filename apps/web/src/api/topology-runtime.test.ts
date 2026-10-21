import { afterEach, expect, it, vi } from 'vitest'
import { getTopologyRuntime, runTopology } from './topology-runtime'

afterEach(() => vi.unstubAllGlobals())

it('运行接口区分拓扑、节点UUID及批量列表，保留原POST/DELETE和请求体', async () => {
  const requests: Array<{ path: string; method: string; body: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, request: RequestInit) => {
      requests.push({
        path: url.pathname + url.search,
        method: request.method!,
        body: request.body ? JSON.parse(String(request.body)) : null,
      })
      return Response.json({ status: 1 })
    }),
  )
  await runTopology('topo/one', 'start', undefined)
  await runTopology('topo/one', 'stop', undefined)
  for (const action of ['start', 'stop', 'restart', 'shutdown'] as const)
    await runTopology('topo/one', action, 'node/a')
  await runTopology('topo/one', 'start', ['a', 'b'])
  await runTopology('topo/one', 'stop', ['a', 'b'])
  expect(requests).toEqual([
    {
      path: '/api/front/topo/topo%2Fone/start/?task_type=6',
      method: 'POST',
      body: null,
    },
    {
      path: '/api/front/topo/topo%2Fone/stop/?task_type=6',
      method: 'POST',
      body: null,
    },
    ...['start', 'stop', 'restart', 'shutdown'].map((action) => ({
      path: `/api/front/topo/topo%2Fone/node/node%2Fa/${action}/?task_type=6`,
      method: 'POST',
      body: {},
    })),
    {
      path: '/api/front/topo/topo%2Fone/node/start/?task_type=6',
      method: 'POST',
      body: { node_list: ['a', 'b'] },
    },
    {
      path: '/api/front/topo/topo%2Fone/node/start/?task_type=6',
      method: 'DELETE',
      body: { node_list: ['a', 'b'] },
    },
  ])
})

it('状态按UUID与边业务ID读取，损坏响应不能伪装成空状态', async () => {
  const status = {
    nodes: { a: { status: 2, console_type: 'vnc', console_port: 1234 } },
    edges: { '501': { status: 3, error_msg: '边异常' } },
  }
  let response: unknown = status
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      expect(url.pathname + url.search).toBe(
        '/api/front/topo/topo/status/?task_type=6',
      )
      return Response.json(response)
    }),
  )
  expect(await getTopologyRuntime('topo')).toEqual(status)
  response = { nodes: [], edges: {} }
  await expect(getTopologyRuntime('topo')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  response = { nodes: { a: { status: '2' } }, edges: {} }
  await expect(getTopologyRuntime('topo')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('业务拒绝不当成功，读取与写入沿统一客户端取消', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 2, message: '资源不足' })),
  )
  await expect(runTopology('topo', 'start', 'a')).rejects.toMatchObject({
    kind: 'business',
    message: '资源不足',
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
    getTopologyRuntime('topo', controller.signal),
  ).rejects.toMatchObject({ kind: 'cancelled' })
  await expect(
    runTopology('topo', 'stop', ['a'], controller.signal),
  ).rejects.toMatchObject({ kind: 'cancelled' })
})
