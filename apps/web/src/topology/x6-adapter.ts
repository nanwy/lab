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
  width?: number
  height?: number
  angle?: number
  parent?: string
  source?: X6Endpoint
  target?: X6Endpoint
  vertices?: Array<{ x: number; y: number }>
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
  vertices: Array<{ x: number; y: number }>
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
  code: 'unsupported-cell-shape' | 'invalid-edge-endpoint'
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

const supportedNodeShapes = new Set(['device', 'group'])

function clone<T>(value: T): T {
  return structuredClone(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export function fromX6Graph(input: X6Graph): EditorGraph {
  const graph = clone(input)
  const nodes: TopologyNode[] = []
  const edges: TopologyEdge[] = []
  const issues: TopologyCompatibilityIssue[] = []
  const passthroughCells: X6Cell[] = []

  for (const cell of graph.cells) {
    if (cell.shape === 'edge') {
      if (!cell.source?.cell || !cell.target?.cell) {
        issues.push({
          code: 'invalid-edge-endpoint',
          cellId: cell.id,
          message: `连线 ${cell.id} 缺少可识别的节点端点，已原样保留。`,
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
      type: cell.shape === 'group' ? 'topologyGroup' : 'topologyNode',
      position: { x: cell.x ?? 0, y: cell.y ?? 0 },
      parentId: cell.parent,
      extent: cell.parent ? 'parent' : undefined,
      width: cell.width,
      height: cell.height,
      zIndex: typeof cell.zIndex === 'number' ? cell.zIndex : undefined,
      data: {
        label: asString(data.label, cell.id),
        deviceId: asString(data.deviceId) || undefined,
        kind: asString(data.kind) || undefined,
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

  return { nodes, edges, issues, passthroughCells, rawGraph: graph }
}

export function toX6Graph(editor: EditorGraph): X6Graph {
  const cells: X6Cell[] = []

  for (const node of editor.nodes) {
    const data = node.data.raw.data ?? {}
    const raw = clone(node.data.raw)
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
      source: { ...(raw.source ?? {}), cell: edge.source, port: edge.sourceHandle },
      target: { ...(raw.target ?? {}), cell: edge.target, port: edge.targetHandle },
      vertices: clone(edge.data.vertices),
      router: clone(edge.data.router),
      connector: clone(edge.data.connector),
      attrs: clone(edge.data.style),
    })
  }

  return {
    ...clone(editor.rawGraph),
    cells: [...cells, ...clone(editor.passthroughCells)],
  }
}
