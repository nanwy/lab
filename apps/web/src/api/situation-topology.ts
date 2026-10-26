import { z } from 'zod'
import { apiClient, ApiError } from './index'

const nodeSchema = z.object({
  id: z.string(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }),
  data: z.object({
    name: z.string(),
    logo: z.string().nullish(),
    level: z.number().nullish(),
  }),
})
const edgeSchema = z.object({
  source: z.object({ cell: z.string() }),
  target: z.object({ cell: z.string() }),
})
export type SituationTopology = {
  nodes: {
    id: string
    name: string
    logo?: string | null
    x: number
    y: number
    z: number
  }[]
  links: { source: string; target: string }[]
}

/** 原 WWs 只展示设备图元和设备之间的边；不扩入文本、区域或编辑能力。 */
function parseTopology(raw: unknown): SituationTopology {
  const graph = z
    .object({ cells: z.array(z.looseObject({ shape: z.string() })).nullish() })
    .parse(raw)
  const cells = graph.cells ?? []
  const nodes = cells
    .filter((cell) => cell.shape === 'custom-react-node')
    .map((cell) => nodeSchema.parse(cell))
  const edges = cells
    .filter((cell) => cell.shape === 'edge')
    .map((cell) => edgeSchema.parse(cell))
  const levels = new Map(nodes.map((node) => [node.id, node.data.level || 0]))
  for (const edge of edges) {
    const source = levels.get(edge.source.cell),
      target = levels.get(edge.target.cell)
    if (source !== undefined && target === 0)
      levels.set(edge.target.cell, source + 1)
  }
  if (
    edges.some(
      (edge) => !levels.has(edge.source.cell) || !levels.has(edge.target.cell),
    )
  )
    throw new Error('连线节点不存在')
  const max = Math.max(0, ...levels.values())
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.data.name,
      logo: node.data.logo,
      x: (node.position.x - 1000) * 3,
      y: (node.position.y - 600) * 3,
      z: 200 + (max - levels.get(node.id)!) * 200,
    })),
    links: edges.map((edge) => ({
      source: edge.source.cell,
      target: edge.target.cell,
    })),
  }
}

export async function getSituationTopology(
  sceneId: string,
  resourceType: string,
  sceneType: string,
  signal?: AbortSignal,
) {
  // 原 t9n 的特殊 POST 使用 numeric 14，深链参数为 string，不会进入该分支。
  const model = sceneType === 'scene' ? 'scene' : 'topo'
  const path = `/front/${model}/${encodeURIComponent(sceneId)}/draw/?task_type=${encodeURIComponent(resourceType)}`
  const raw = await apiClient.request(path, { signal })
  try {
    return parseTopology(raw)
  } catch {
    throw new ApiError(
      'invalid-response',
      `防御态势拓扑响应格式错误：${path.split('?')[0]}`,
    )
  }
}
