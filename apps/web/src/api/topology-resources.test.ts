import { afterEach, expect, it, vi } from 'vitest'
import {
  getTopologyResources,
  getNodeImages,
  createTopologyNode,
  updateTopologyNode,
  createTopologyEdge,
  deleteTopologyObjects,
} from './topology-resources'
afterEach(() => vi.unstubAllGlobals())

it('资源数组按原查询参数读取，最近十项且拒绝分页包装；镜像为详情对象', async () => {
  const paths: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      paths.push(url.pathname + url.search)
      return Response.json(
        url.pathname.includes('/image/')
          ? { name: '原镜像', unknown: true }
          : url.pathname.includes('last_operat')
            ? Array.from({ length: 12 }, (_, id) => ({ id, name: `设备${id}` }))
            : [],
      )
    }),
  )
  expect((await getTopologyResources('路 由')).recent).toHaveLength(10)
  expect(paths).toEqual(
    expect.arrayContaining([
      '/api/front/node/last_operat/?search=%E8%B7%AF+%E7%94%B1&nopage=1',
      '/api/front/node/template/?search=%E8%B7%AF+%E7%94%B1&nopage=1',
      '/api/front/node/list/?nopage=0',
    ]),
  )
  expect(await getNodeImages(8)).toEqual({ name: '原镜像', unknown: true })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ results: [] })),
  )
  await expect(getTopologyResources('')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('节点UUID、资源ID、业务行ID分离，链路src/dst反向且NIC零有效，删除使用业务行ID', async () => {
  const calls: Array<{ path: string; method: string; body: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      const body = JSON.parse(String(options.body))
      calls.push({ path: url.pathname, method: options.method!, body })
      return Response.json(
        url.pathname.includes('/edge_node/')
          ? { status: 1 }
          : { ...body, id: 101 },
      )
    }),
  )
  const resource = {
    id: 7,
    name: '路由',
    config_info: { node_id: 'old', ports: [{}] },
    device_id: 'old',
    private_extension: { preserve: 1 },
  }
  const created = await createTopologyNode('topo/one', resource, 'uuid-one')
  expect(created.id).toBe(101)
  expect(calls[0]).toEqual({
    path: '/api/front/topo/topo%2Fone/node/',
    method: 'POST',
    body: {
      ...resource,
      status: 0,
      device_id: 'uuid-one',
      config_info: { node_id: 'uuid-one', ports: [{}] },
    },
  })
  expect(resource.config_info.node_id).toBe('old')
  await updateTopologyNode('topo/one', 'uuid-one', {
    ...created,
    config_info: { node_id: 'wrong', ports: [{ ip: '1' }] },
  })
  expect(calls[1]).toMatchObject({
    path: '/api/front/topo/topo%2Fone/node/uuid-one/',
    method: 'PATCH',
    body: {
      id: 101,
      config_info: { node_id: 'uuid-one' },
      private_extension: { preserve: 1 },
    },
  })
  await createTopologyEdge(
    3,
    'edge-uuid',
    { id: 'uuid-one', rowId: 101, name: '甲', port: 0 },
    { id: 'uuid-two', rowId: 102, name: '乙', port: 1 },
  )
  expect(calls[2]?.body).toEqual({
    device_id: 'edge-uuid',
    config_info: {
      dst: { name: '甲', port: 0, node_id: 'uuid-one' },
      src: { name: '乙', port: 1, node_id: 'uuid-two' },
    },
    topo_nodea: 101,
    topo_nodez: 102,
  })
  await deleteTopologyObjects(3, [101], [201])
  expect(calls[3]?.body).toEqual({ node_list: [101], edge_list: [201] })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 0 })),
  )
  await expect(deleteTopologyObjects(3, [101], [])).rejects.toMatchObject({
    kind: 'business',
  })
  await expect(createTopologyNode(3, resource, 'uuid')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
