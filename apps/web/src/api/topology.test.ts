import { afterEach, expect, it, vi } from 'vitest'
import { getExperimentTopology, saveExperimentTopology } from './topology'

afterEach(() => vi.unstubAllGlobals())

it('实验图通过 topo_id 读取，保存后重新读取恢复 X6 全部语义', async () => {
  let stored: unknown = { lock: false, cells: [] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      expect(url.pathname + url.search).toBe(
        '/api/front/topo/topo%2Fone/draw/?task_type=6',
      )
      if (options.method === 'POST') {
        stored = JSON.parse(String(options.body)).topo
        return Response.json({ saved: true })
      }
      return Response.json(stored)
    }),
  )
  const graph = {
    lock: false,
    custom: { preserved: true },
    cells: [
      {
        id: 'group',
        shape: 'custom-parent',
        position: { x: 100, y: 50 },
        size: { width: 400, height: 300 },
        data: { parent: true },
        attrs: { label: { text: '区域' } },
        children: ['device'],
      },
      {
        id: 'device',
        shape: 'custom-react-node',
        position: { x: 140, y: 100 },
        parent: 'group',
        angle: 20,
        data: { name: '路由器', data_id: 81, nodeInfo: { id: 81 } },
        ports: { items: [{ id: 'p', group: 'right' }] },
      },
      {
        id: 'edge',
        shape: 'edge',
        source: { cell: 'device', port: 'p' },
        target: { cell: 'device', port: 'p' },
        vertices: [{ x: 300, y: 150 }],
        router: { name: 'manhattan' },
        connector: { name: 'rounded' },
        attrs: { line: { stroke: '#f00' } },
      },
    ],
  }
  stored = graph
  const opened = await getExperimentTopology('topo/one')
  expect(opened.nodes.find((node) => node.id === 'device')?.position).toEqual({
    x: 40,
    y: 50,
  })
  opened.nodes.find((node) => node.id === 'device')!.position = { x: 60, y: 70 }
  await saveExperimentTopology('topo/one', opened)
  const reopened = await getExperimentTopology('topo/one')
  expect(reopened.nodes.find((node) => node.id === 'device')?.position).toEqual(
    { x: 60, y: 70 },
  )
  expect(stored).toEqual({
    ...graph,
    cells: [
      graph.cells[0],
      { ...graph.cells[1], position: { x: 160, y: 120 } },
      graph.cells[2],
    ],
  })
})

it('原图字段与未知图元保留，缺失端口引用明确报告，重复端口拒绝读取', async () => {
  const raw = {
    lock: false,
    cells: [
      {
        id: 'one',
        shape: 'custom-react-node',
        position: { x: 0, y: 0 },
        data: { name: '设备' },
        ports: { items: [{ id: 'p' }] },
      },
      {
        id: 'two',
        shape: 'custom-react-node',
        position: { x: 100, y: 100 },
        data: { name: '设备二' },
      },
      {
        id: 'link',
        shape: 'edge',
        source: { cell: 'one' },
        target: { cell: 'two' },
      },
      { id: 'unknown', shape: 'future-shape', metadata: { preserve: 1 } },
      {
        id: 'invalid-link',
        shape: 'edge',
        source: { cell: 'one', port: 'missing' },
        target: { cell: 'two' },
      },
    ],
  }
  let saved: unknown
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, options: RequestInit) => {
      if (options.method === 'POST') {
        saved = JSON.parse(String(options.body)).topo
        return Response.json(true)
      }
      return Response.json(raw)
    }),
  )
  const opened = await getExperimentTopology('one')
  expect(opened.issues.map((issue) => issue.code)).toEqual([
    'unsupported-cell-shape',
    'invalid-edge-endpoint',
  ])
  await saveExperimentTopology('one', opened)
  expect(saved).toEqual(raw)
  raw.cells[0]!.ports!.items.push({ id: 'p' })
  await expect(getExperimentTopology('one')).rejects.toMatchObject({
    kind: 'invalid-response',
    message: expect.stringContaining('ports'),
  })
})

it('锁定图禁止写入，取消读取沿统一客户端返回取消错误', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ lock: true, cells: [] })),
  )
  const graph = await getExperimentTopology('locked')
  await expect(saveExperimentTopology('locked', graph)).rejects.toMatchObject({
    kind: 'business',
  })
  expect(fetch).toHaveBeenCalledTimes(1)
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
    getExperimentTopology('one', controller.signal),
  ).rejects.toMatchObject({ kind: 'cancelled' })
})

it('无效分组 children 关系保留原始图元并明确报告，不进入可编辑图', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        lock: false,
        cells: [
          {
            id: 'group',
            shape: 'custom-parent',
            position: { x: 0, y: 0 },
            children: ['missing'],
            data: { parent: true },
          },
          {
            id: 'child',
            shape: 'custom-react-node',
            position: { x: 10, y: 10 },
            parent: 'group',
            data: { name: '设备' },
          },
        ],
      }),
    ),
  )
  const opened = await getExperimentTopology('one')
  expect(opened.nodes).toEqual([])
  expect(opened.issues.map((issue) => issue.cellId)).toEqual(['group', 'child'])
  expect(opened.passthroughCells).toHaveLength(2)
})
