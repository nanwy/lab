import { afterEach, expect, it, vi } from 'vitest'
import {
  getTopologyResources,
  getNodeImages,
  createTopologyNode,
  updateTopologyNode,
  createTopologyEdge,
  deleteTopologyObjects,
  normalizeNodeConfiguration,
  saveNodeTemplate,
  deletePersonalNode,
} from './topology-resources'
afterEach(() => vi.unstubAllGlobals())

it('节点模板沿完整nodeInfo保存，删除沿资源ID，业务失败和缺ID不伪报成功', async () => {
  const calls: Array<{ path: string; method: string; body: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      calls.push({
        path: url.pathname,
        method: options.method!,
        body: JSON.parse(String(options.body)),
      })
      return Response.json(
        options.method === 'DELETE' ? { status: 1 } : { id: 707 },
      )
    }),
  )
  const info = {
    id: 91,
    name: '旧名字',
    logo: '/logo.svg',
    device_id: 'uuid',
    engin: 1,
    extension: { preserved: true },
    config_info: {
      node_id: 'uuid',
      base_info: { name: '模板名字' },
      ports: [{ name: 'eth0' }],
    },
  }
  expect(await saveNodeTemplate(info)).toEqual({ id: 707 })
  expect(calls[0]).toEqual({
    path: '/api/front/node/template/',
    method: 'POST',
    body: { ...info, name: '模板名字' },
  })
  expect(info.name).toBe('旧名字')
  await deletePersonalNode(707)
  expect(calls[1]).toEqual({
    path: '/api/front/node/list/',
    method: 'DELETE',
    body: { id_list: [707] },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 0 })),
  )
  await expect(saveNodeTemplate(info)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  await expect(deletePersonalNode(707)).rejects.toMatchObject({
    kind: 'business',
  })
})

it('节点配置只对合法缺失应用默认，损坏对象/数组/数组项拒绝且输入不变', () => {
  const schema = {
    properties: {
      base_info: {
        type: 'object',
        properties: { name: { type: 'string', default: '默认设备' } },
      },
      ports: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string', default: 'eth' } },
        },
      },
      _config: { port_numbers: { default: 1 } },
    },
  }
  const source = { extension: { preserve: true } }
  expect(normalizeNodeConfiguration(source, schema)).toEqual({
    extension: { preserve: true },
    base_info: { name: '默认设备' },
    ports: [{ name: 'eth' }],
  })
  expect(source).toEqual({ extension: { preserve: true } })
  for (const config of [
    { base_info: 'bad' },
    { ports: 'bad' },
    { ports: [null] },
    { ports: ['bad'] },
    { ports: [[]] },
  ]) {
    const original = structuredClone(config)
    expect(() => normalizeNodeConfiguration(config, schema)).toThrow(
      '节点配置契约错误',
    )
    expect(config).toEqual(original)
  }
  expect(
    normalizeNodeConfiguration(
      {
        base_info: { name: '', unknown: 5 },
        ports: [{ name: 'eth0', unknown: { id: 2 } }],
      },
      schema,
    ),
  ).toEqual({
    base_info: { name: '', unknown: 5 },
    ports: [{ name: 'eth0', unknown: { id: 2 } }],
  })
})

it('缺失普通数组与无数量定义的网卡初始化一行，已有空数组与显式数量保留', () => {
  const row = {
    type: 'array',
    items: { properties: { name: { default: '默认行' } } },
  }
  const schema = { properties: { ports: row, disks: row } }
  expect(normalizeNodeConfiguration({}, schema)).toEqual({
    ports: [{ name: '默认行' }],
    disks: [{ name: '默认行' }],
  })
  expect(normalizeNodeConfiguration({ ports: [], disks: [] }, schema)).toEqual({
    ports: [],
    disks: [],
  })
  expect(
    normalizeNodeConfiguration(
      {},
      {
        properties: {
          ...schema.properties,
          _config: { port_numbers: { default: 2 } },
        },
      },
    ),
  ).toEqual({
    ports: [{ name: '默认行' }, { name: '默认行' }],
    disks: [{ name: '默认行' }],
  })
  expect(
    normalizeNodeConfiguration(
      {},
      { properties: { ports: row, _config: { port_numbers: { default: 0 } } } },
    ),
  ).toEqual({ ports: [] })
  expect(
    normalizeNodeConfiguration(
      {},
      { properties: { ports: row, _config: { port_numbers: {} } } },
    ),
  ).toEqual({ ports: [] })
})

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
