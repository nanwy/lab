import { afterEach, expect, it, vi } from 'vitest'
import {
  getMirrorNodes,
  getMirrorRules,
  createMirrorRule,
  runMirrorRule,
} from './traffic-mirroring'

afterEach(() => vi.unstubAllGlobals())
it('镜像节点沿原Number(id)归一化并只读取node_tap_list，协议损坏明确失败', async () => {
  let response: unknown = [{ id: '91', name: '节点', node_tap_list: ['tap-a'] }]
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      expect(url.pathname + url.search).toBe(
        '/api/front/topo/topo%2Fone/node_list/?nopage=1',
      )
      return Response.json(response)
    }),
  )
  await expect(getMirrorNodes('topo/one')).resolves.toEqual([
    { id: 91, name: '节点', node_tap_list: ['tap-a'] },
  ])
  response = [{ id: 91, name: '节点', node_tap_list: 2 }]
  await expect(getMirrorNodes('topo/one')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
it('镜像动作保留原拼写和无请求体，业务拒绝与取消不伪报成功', async () => {
  const requests: Array<{ path: string; method: string; body: unknown }> = []
  let response: unknown = { status: 1 }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, request: RequestInit) => {
      requests.push({
        path: url.pathname + url.search,
        method: request.method!,
        body: request.body ? JSON.parse(String(request.body)) : null,
      })
      return Response.json(response)
    }),
  )
  await runMirrorRule('topo/one', 'rule/one', 'start')
  await runMirrorRule('topo/one', 'rule/one', 'stop')
  await runMirrorRule('topo/one', 'rule/one', 'delete')
  expect(requests).toEqual([
    {
      path: '/api/front/topo/topo%2Fone/mirror_start/rule%2Fone/',
      method: 'POST',
      body: null,
    },
    {
      path: '/api/front/topo/topo%2Fone/mirror_stop/rule%2Fone/',
      method: 'POST',
      body: null,
    },
    {
      path: '/api/front/topo/topo%2Fone/mirror_del/rule%2Fone/',
      method: 'DELETE',
      body: null,
    },
  ])
  response = { status: 2, message: '镜像失败' }
  await expect(runMirrorRule('topo/one', 71, 'start')).rejects.toMatchObject({
    kind: 'business',
    message: '镜像失败',
  })
  await expect(
    createMirrorRule('topo/one', {
      src_node: 91,
      dst_node: 91,
      src_tap: 'tap-a',
      dst_tap: 'tap-b',
    }),
  ).rejects.toMatchObject({ kind: 'business' })
  response = { results: [] }
  await expect(
    getMirrorRules('topo/one', { page: 1, size: 10, search: '' }),
  ).rejects.toMatchObject({ kind: 'invalid-response' })
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
    getMirrorNodes('topo/one', controller.signal),
  ).rejects.toMatchObject({ kind: 'cancelled' })
})
