import { afterEach, expect, it, vi } from 'vitest'
import { getSituationTopology } from './situation-topology'

afterEach(() => vi.unstubAllGlobals())
it('独立拓扑使用原顶层cells与字符串任务类型，保留坐标及顺序层级', async () => {
  const requests: string[] = []
  vi.stubGlobal('fetch', async (input: URL | string, init: RequestInit) => {
    requests.push(
      `${init.method} ${new URL(String(input)).pathname}${new URL(String(input)).search}`,
    )
    return Response.json({
      cells: [
        {
          id: 'a',
          shape: 'custom-react-node',
          position: { x: 900, y: 500 },
          data: { name: '甲' },
        },
        {
          id: 'b',
          shape: 'custom-react-node',
          position: { x: 1100, y: 700 },
          data: { name: '乙', level: 0 },
        },
        {
          id: 'ab',
          shape: 'edge',
          source: { cell: 'a' },
          target: { cell: 'b' },
        },
        {
          id: 'text',
          shape: 'custom-react-text',
          position: { x: 0, y: 0 },
          data: { name: '不进入原3D图' },
        },
      ],
    })
  })
  await expect(getSituationTopology('场景甲', '14', 'scene')).resolves.toEqual({
    nodes: [
      { id: 'a', name: '甲', x: -300, y: -300, z: 400 },
      { id: 'b', name: '乙', x: 300, y: 300, z: 200 },
    ],
    links: [{ source: 'a', target: 'b' }],
  })
  await getSituationTopology('topo-a', '6', 'anything')
  expect(requests).toEqual([
    'GET /api/front/scene/%E5%9C%BA%E6%99%AF%E7%94%B2/draw/?task_type=14',
    'GET /api/front/topo/topo-a/draw/?task_type=6',
  ])
})
it('原可空cells形成空图，错误类型及无效引用明确拒绝', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ cells: null }))
  await expect(getSituationTopology('a', '6', 'topo')).resolves.toEqual({
    nodes: [],
    links: [],
  })
  vi.stubGlobal('fetch', async () =>
    Response.json({
      cells: [{ shape: 'edge', source: { cell: 'a' }, target: { cell: 'b' } }],
    }),
  )
  await expect(getSituationTopology('a', '6', 'topo')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  vi.stubGlobal('fetch', async () => Response.json({ cells: {} }))
  await expect(getSituationTopology('a', '6', 'topo')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
it('HTTP失败保持服务消息和状态，不转为空图', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({ error: '拓扑不可用' }, { status: 503 }),
  )
  await expect(getSituationTopology('a', '6', 'topo')).rejects.toMatchObject({
    kind: 'http',
    status: 503,
    message: '拓扑不可用',
    handled: true,
  })
})
