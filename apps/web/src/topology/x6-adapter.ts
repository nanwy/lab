import { z } from 'zod'

export type JsonObject = Record<string, unknown>

export type X6Endpoint = {
  cell: string
  port?: string
  [key: string]: unknown
}

export type X6Cell = JsonObject & {
  id: string
  shape: string
  x?: number
  y?: number
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  width?: number
  height?: number
  angle?: number
  parent?: string
  children?: string[]
  source?: X6Endpoint
  target?: X6Endpoint
  vertices?: Array<JsonObject & { x: number; y: number }>
  data?: JsonObject
  attrs?: JsonObject
  ports?: {
    groups?: Record<string, JsonObject>
    items?: Array<JsonObject & { id: string; group?: string }>
  }
}

export type X6Graph = JsonObject & {
  cells: X6Cell[]
}

export type TopologyPort = {
  id: string
  group?: string
  raw: JsonObject
}

export type TopologyNodeData = JsonObject & {
  label: string
  deviceId?: string
  kind?: string
  rotation: number
  ports: TopologyPort[]
  style: JsonObject
  raw: X6Cell
}

export type TopologyNode = {
  id: string
  type: 'topologyNode' | 'topologyGroup'
  position: { x: number; y: number }
  parentId?: string
  extent?: 'parent'
  width?: number
  height?: number
  zIndex?: number
  data: TopologyNodeData
}

export type TopologyEdgeData = JsonObject & {
  vertices: Array<JsonObject & { x: number; y: number }>
  router?: unknown
  connector?: unknown
  style: JsonObject
  raw: X6Cell
}

export type TopologyEdge = {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type: 'topologyEdge'
  data: TopologyEdgeData
}

export type TopologyCompatibilityIssue = {
  code:
    'unsupported-cell-shape' | 'invalid-edge-endpoint' | 'invalid-node-parent'
  cellId: string
  message: string
}

export type EditorGraph = {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  issues: TopologyCompatibilityIssue[]
  passthroughCells: X6Cell[]
  rawGraph: X6Graph
}

const groupShapes = new Set(['group', 'custom-parent', 'custom-rect'])
const supportedNodeShapes = new Set([
  'device',
  ...groupShapes,
  'custom-react-node',
])
const isOriginalShape = (cell: X6Cell) => cell.shape.startsWith('custom-')
const coordinates = (cell: X6Cell) =>
  cell.position ?? { x: cell.x!, y: cell.y! }

function clone<T>(value: T): T {
  return structuredClone(value)
}

const objectSchema = z.record(z.string(), z.unknown())
const cellSchema = z
  .looseObject({
    id: z.string().min(1),
    shape: z.string().min(1),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    position: z
      .looseObject({ x: z.number().finite(), y: z.number().finite() })
      .optional(),
    size: z
      .looseObject({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    angle: z.number().finite().optional(),
    zIndex: z.number().finite().optional(),
    parent: z.string().min(1).optional(),
    children: z.array(z.string().min(1)).optional(),
    data: objectSchema.optional(),
    attrs: objectSchema.optional(),
    vertices: z
      .array(z.looseObject({ x: z.number().finite(), y: z.number().finite() }))
      .optional(),
    ports: z
      .looseObject({
        groups: z.record(z.string(), objectSchema).optional(),
        items: z.array(
          z.looseObject({
            id: z.string().min(1),
            group: z.string().optional(),
          }),
        ),
      })
      .optional(),
  })
  .superRefine((cell, context) => {
    if (!supportedNodeShapes.has(cell.shape)) return
    const ids = cell.ports?.items.map((port) => port.id) ?? []
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        path: ['ports'],
        message: '端口标识重复',
      })
    if (isOriginalShape(cell)) {
      if (!cell.position && (cell.x === undefined || cell.y === undefined))
        context.addIssue({
          code: 'custom',
          path: ['position'],
          message: '图元必须提供坐标',
        })
      if (
        cell.shape === 'custom-react-node' &&
        typeof cell.data?.name !== 'string'
      )
        context.addIssue({
          code: 'custom',
          path: ['data', 'name'],
          message: '设备缺少名称',
        })
      return
    }
    for (const coordinate of ['x', 'y'] as const) {
      if (cell[coordinate] === undefined)
        context.addIssue({
          code: 'custom',
          path: [coordinate],
          message: '模拟节点必须提供坐标',
        })
    }
    const data = z
      .object({
        label: z.string().min(1),
        deviceId: z.string().min(1).optional(),
        kind: z.string().optional(),
      })
      .safeParse(cell.data)
    if (!data.success)
      for (const issue of data.error.issues)
        context.addIssue({
          code: 'custom',
          path: ['data', ...issue.path],
          message: issue.message,
        })
  })

const graphSchema = z
  .looseObject({ cells: z.array(cellSchema), lock: z.boolean().optional() })
  .superRefine((graph, context) => {
    const ids = graph.cells.map((cell) => cell.id)
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: 'custom',
        path: ['cells'],
        message: '图元标识重复',
      })
  })

export function fromX6Graph(input: unknown): EditorGraph {
  // 原 X6 注册形状与工程初始化样本分别读取其已确认的字段。
  const graph = clone(graphSchema.parse(input)) as X6Graph
  const nodes: TopologyNode[] = []
  const edges: TopologyEdge[] = []
  const issues: TopologyCompatibilityIssue[] = []
  const passthroughCells: X6Cell[] = []
  const cellsById = new Map(graph.cells.map((cell) => [cell.id, cell]))
  const nodeDepths = new Map<string, number>()
  const invalidGroups = new Set<string>()
  for (const cell of graph.cells) {
    if (!groupShapes.has(cell.shape) || cell.children === undefined) continue
    const children = new Set(cell.children)
    if (
      children.size !== cell.children.length ||
      cell.children.some((id) => cellsById.get(id)?.parent !== cell.id) ||
      graph.cells.some(
        (child) => child.parent === cell.id && !children.has(child.id),
      )
    )
      invalidGroups.add(cell.id)
  }

  // Validate the entire ancestor chain so children of unsupported groups also
  // remain raw rather than reaching React Flow with a dangling parent.
  for (const cell of graph.cells) {
    if (!supportedNodeShapes.has(cell.shape)) continue
    const visited = new Set([cell.id])
    let ancestor = cell
    let valid = !invalidGroups.has(cell.id)
    let depth = 0
    while (ancestor.parent !== undefined) {
      const parent = cellsById.get(ancestor.parent)
      if (
        !parent ||
        !groupShapes.has(parent.shape) ||
        invalidGroups.has(parent.id) ||
        visited.has(parent.id)
      ) {
        valid = false
        break
      }
      visited.add(parent.id)
      ancestor = parent
      depth += 1
    }
    if (valid) nodeDepths.set(cell.id, depth)
  }

  function isUsableEndpoint(
    endpoint: X6Endpoint | undefined,
  ): endpoint is X6Endpoint {
    if (!endpoint || !nodeDepths.has(endpoint.cell)) return false
    if (endpoint.port === undefined) return true
    return (
      cellsById
        .get(endpoint.cell)
        ?.ports?.items?.some((port) => port.id === endpoint.port) ?? false
    )
  }

  for (const cell of graph.cells) {
    if (cell.shape === 'edge') {
      if (!isUsableEndpoint(cell.source) || !isUsableEndpoint(cell.target)) {
        issues.push({
          code: 'invalid-edge-endpoint',
          cellId: cell.id,
          message: `连线 ${cell.id} 引用了无法渲染的节点或端口，已原样保留。`,
        })
        passthroughCells.push(cell)
        continue
      }
      edges.push({
        id: cell.id,
        source: cell.source.cell,
        target: cell.target.cell,
        sourceHandle: cell.source.port,
        targetHandle: cell.target.port,
        type: 'topologyEdge',
        data: {
          vertices: clone(cell.vertices ?? []),
          router: clone(cell.router),
          connector: clone(cell.connector),
          style: clone(cell.attrs ?? {}),
          raw: cell,
        },
      })
      continue
    }

    if (supportedNodeShapes.has(cell.shape) && !nodeDepths.has(cell.id)) {
      issues.push({
        code: 'invalid-node-parent',
        cellId: cell.id,
        message: `图元 ${cell.id} 的分组父级或 children 引用无效、不受支持或形成循环，已原样保留。`,
      })
      passthroughCells.push(cell)
      continue
    }

    if (!supportedNodeShapes.has(cell.shape)) {
      issues.push({
        code: 'unsupported-cell-shape',
        cellId: cell.id,
        message: `图元 ${cell.id} 使用未支持的形状 ${cell.shape}，已原样保留但不在编辑器中渲染。`,
      })
      passthroughCells.push(cell)
      continue
    }

    const data = cell.data ?? {}
    nodes.push({
      id: cell.id,
      type: groupShapes.has(cell.shape) ? 'topologyGroup' : 'topologyNode',
      position:
        isOriginalShape(cell) && cell.parent
          ? {
              x:
                coordinates(cell).x -
                coordinates(cellsById.get(cell.parent)!).x,
              y:
                coordinates(cell).y -
                coordinates(cellsById.get(cell.parent)!).y,
            }
          : coordinates(cell),
      parentId: cell.parent,
      extent: cell.parent ? 'parent' : undefined,
      width:
        cell.size?.width ??
        cell.width ??
        (isOriginalShape(cell)
          ? cell.shape === 'custom-react-node'
            ? 80
            : cell.shape === 'custom-rect'
              ? 66
              : 70
          : undefined),
      height:
        cell.size?.height ??
        cell.height ??
        (isOriginalShape(cell)
          ? cell.shape === 'custom-react-node'
            ? 80
            : cell.shape === 'custom-rect'
              ? 36
              : 40
          : undefined),
      zIndex: typeof cell.zIndex === 'number' ? cell.zIndex : undefined,
      data: {
        label: isOriginalShape(cell)
          ? cell.shape === 'custom-react-node'
            ? (data.name as string)
            : String((cell.attrs?.label as JsonObject | undefined)?.text ?? '')
          : (data.label as string),
        deviceId: data.deviceId as string | undefined,
        kind: data.kind as string | undefined,
        rotation: cell.angle ?? 0,
        ports: (cell.ports?.items ?? []).map((port) => ({
          id: port.id,
          group: port.group,
          raw: clone(port),
        })),
        style: clone(cell.attrs ?? {}),
        raw: cell,
      },
    })
  }

  // React Flow requires parents to precede their children, regardless of input order.
  nodes.sort(
    (left, right) => nodeDepths.get(left.id)! - nodeDepths.get(right.id)!,
  )
  return { nodes, edges, issues, passthroughCells, rawGraph: graph }
}

export function toX6Graph(editor: EditorGraph): X6Graph {
  const cells: X6Cell[] = []
  const byId = new Map(editor.nodes.map((node) => [node.id, node]))
  function absolutePosition(node: TopologyNode): { x: number; y: number } {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (!parent) return node.position
    const origin = absolutePosition(parent)
    return { x: origin.x + node.position.x, y: origin.y + node.position.y }
  }

  for (const node of editor.nodes) {
    const data = node.data.raw.data ?? {}
    const raw = clone(node.data.raw)
    if (isOriginalShape(raw)) {
      const position = absolutePosition(node)
      if (raw.position) raw.position = { ...raw.position, ...position }
      else {
        raw.x = position.x
        raw.y = position.y
      }
      if (node.parentId !== raw.parent) raw.parent = node.parentId
      if (node.data.rotation !== (raw.angle ?? 0))
        raw.angle = node.data.rotation
      if (
        raw.shape === 'custom-react-node' &&
        raw.data?.name !== node.data.label
      )
        raw.data = { ...raw.data, name: node.data.label }
      cells.push(raw)
      continue
    }
    cells.push({
      ...raw,
      id: node.id,
      shape: node.type === 'topologyGroup' ? 'group' : raw.shape,
      x: node.position.x,
      y: node.position.y,
      width: node.width ?? raw.width,
      height: node.height ?? raw.height,
      angle: node.data.rotation,
      parent: node.parentId,
      zIndex: node.zIndex ?? raw.zIndex,
      data: {
        ...data,
        label: node.data.label,
        deviceId: node.data.deviceId,
        kind: node.data.kind,
      },
      attrs: clone(node.data.style),
      ports: raw.ports
        ? {
            ...raw.ports,
            items: node.data.ports.map((port) => ({
              ...clone(port.raw),
              id: port.id,
              group: port.group,
            })),
          }
        : undefined,
    })
  }

  for (const edge of editor.edges) {
    const raw = clone(edge.data.raw)
    cells.push({
      ...raw,
      id: edge.id,
      shape: 'edge',
      source: {
        ...(raw.source ?? {}),
        cell: edge.source,
        port: edge.sourceHandle,
      },
      target: {
        ...(raw.target ?? {}),
        cell: edge.target,
        port: edge.targetHandle,
      },
      ...(raw.vertices !== undefined || edge.data.vertices.length
        ? { vertices: clone(edge.data.vertices) }
        : {}),
      router: clone(edge.data.router),
      connector: clone(edge.data.connector),
      ...(raw.attrs !== undefined || Object.keys(edge.data.style).length
        ? { attrs: clone(edge.data.style) }
        : {}),
    })
  }

  const serialized = new Map(
    [...cells, ...clone(editor.passthroughCells)].map((cell) => [
      cell.id,
      cell,
    ]),
  )
  return {
    ...clone(editor.rawGraph),
    cells: editor.rawGraph.cells
      .flatMap((cell) => {
        const saved = serialized.get(cell.id)
        if (!saved) return []
        serialized.delete(cell.id)
        return [saved]
      })
      .concat([...serialized.values()]),
  }
}
