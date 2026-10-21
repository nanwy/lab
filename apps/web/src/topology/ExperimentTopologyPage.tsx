import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker } from '@tanstack/react-router'
import {
  Background,
  BaseEdge,
  EdgeText,
  Panel,
  ConnectionMode,
  ReactFlow,
  useNodesState,
  useEdgesState,
  getSmoothStepPath,
  useInternalNode,
  SelectionMode,
  type ReactFlowInstance,
  type Connection as FlowConnection,
  type Edge,
  type EdgeProps,
  type Node,
} from '@xyflow/react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
import {
  getExperimentTopology,
  saveExperimentTopology,
  setExperimentTopologyLock,
} from '../api/topology'
import {
  getTopologyRuntime,
  runTopology,
  nodeRuntimeActions,
  runtimeActionLabels,
  type NodeAction,
} from '../api/topology-runtime'
import { useExperiment } from '../experiments/ExperimentContext'
import { DeviceResources } from './DeviceResources'
import { NodeConfiguration } from './NodeConfiguration'
import { CanvasNode, CanvasNodeContext } from './CanvasNode'
import { CanvasLabel } from './CanvasLabel'
import { intersectsRotatedNode } from './canvas-geometry'
import { CanvasExportError, exportCanvas } from './canvas-export'
import {
  LinkConfiguration,
  nicIndices,
  occupied,
  nicLabel,
} from './LinkConfiguration'
import {
  asObject,
  createTopologyNode,
  updateTopologyNode,
  saveNodeTemplate,
  createTopologyEdge,
  deleteTopologyObjects,
  getTopologyNodeMenuInfo,
  type DeviceResource,
} from '../api/topology-resources'
import {
  toX6Graph,
  fromX6Graph,
  type EditorGraph,
  type TopologyNodeData,
  type TopologyEdgeData,
  type X6Graph,
} from './x6-adapter'

type FlowNode = Node<TopologyNodeData, 'topologyNode' | 'topologyGroup'>
type FlowEdge = Edge<TopologyEdgeData, 'topologyEdge'> & {
  data: TopologyEdgeData
}
function Connection({
  sourceX: anchorSourceX,
  sourceY: anchorSourceY,
  targetX: anchorTargetX,
  targetY: anchorTargetY,
  source,
  target,
  sourceHandleId,
  targetHandleId,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<FlowEdge>) {
  const sourceNode = useInternalNode(source),
    targetNode = useInternalNode(target)
  const sourceHandle = sourceNode?.internals.handleBounds?.source?.find(
    (handle) => handle.id === sourceHandleId,
  )
  const targetHandle = targetNode?.internals.handleBounds?.source?.find(
    (handle) => handle.id === targetHandleId,
  )
  const sourceX =
    sourceHandle && sourceNode
      ? sourceNode.internals.positionAbsolute.x +
        sourceHandle.x +
        sourceHandle.width / 2
      : anchorSourceX
  const sourceY =
    sourceHandle && sourceNode
      ? sourceNode.internals.positionAbsolute.y +
        sourceHandle.y +
        sourceHandle.height / 2
      : anchorSourceY
  const targetX =
    targetHandle && targetNode
      ? targetNode.internals.positionAbsolute.x +
        targetHandle.x +
        targetHandle.width / 2
      : anchorTargetX
  const targetY =
    targetHandle && targetNode
      ? targetNode.internals.positionAbsolute.y +
        targetHandle.y +
        targetHandle.height / 2
      : anchorTargetY
  const path =
    data?.router &&
    asObject(data.router).name === 'orth' &&
    !data.vertices.length
      ? getSmoothStepPath({
          sourceX,
          sourceY,
          targetX,
          targetY,
          sourcePosition,
          targetPosition,
        })[0]
      : [
          `M ${sourceX} ${sourceY}`,
          ...(data?.vertices ?? []).map((point) => `L ${point.x} ${point.y}`),
          `L ${targetX} ${targetY}`,
        ].join(' ')
  const line = data?.style.line as Record<string, unknown> | undefined
  const labels = useMemo(() => {
    if (!Array.isArray(data?.raw.labels)) return []
    // 使用与 BaseEdge 相同的 d，由浏览器按实际线路弧长定位，包含正交圆角与折点。
    const geometry = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path',
    )
    geometry.setAttribute('d', path)
    const length = geometry.getTotalLength()
    return data.raw.labels.flatMap((label) => {
      const item = asObject(label)
      const position = typeof item.position === 'number' ? item.position : 0.5
      const text = asObject(asObject(item.attrs).label).text
      return typeof text === 'string'
        ? [{ text, point: geometry.getPointAtLength(length * position) }]
        : []
    })
  }, [path, data?.raw.labels])
  const runtimeColor =
    typeof data?.runtimeStatus === 'number'
      ? (({ 1: '#aaa', 2: '#87d068', 3: 'red' } as Record<number, string>)[
          data.runtimeStatus
        ] ?? '#1890ff')
      : undefined
  const animation = asObject(line?.style).animation
  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke:
            runtimeColor ??
            (typeof line?.stroke === 'string' ? line.stroke : undefined),
          strokeWidth:
            typeof line?.strokeWidth === 'number'
              ? line.strokeWidth
              : undefined,
          strokeDasharray:
            typeof line?.strokeDasharray === 'string' ||
            typeof line?.strokeDasharray === 'number'
              ? String(line.strokeDasharray)
              : undefined,
          animation: typeof animation === 'string' ? animation : undefined,
        }}
      />
      {labels.map(({ text, point }, index) => (
        <EdgeText key={index} x={point.x} y={point.y} label={text} />
      ))}
    </>
  )
}
const nodeTypes = { topologyNode: CanvasNode, topologyGroup: CanvasNode }
const edgeTypes = { topologyEdge: Connection }

export function ExperimentTopologyPage() {
  const experiment = useExperiment()
  const id = experiment.topo_id
  const graph = useQuery({
    queryKey: ['experiments', String(experiment.id), 'topology', id],
    queryFn: ({ signal }) => getExperimentTopology(id!, signal),
    enabled: id !== undefined && id !== null,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  if (id === undefined || id === null)
    return (
      <section role="alert">
        <h2>实验没有关联拓扑</h2>
        <Link to="/basic/user/bench">返回实验列表</Link>
      </section>
    )
  if (graph.isPending) return <p role="status">正在加载场景拓扑…</p>
  if (graph.isError)
    return (
      <section className="space-y-3" role="alert">
        <h2>
          {graph.error instanceof ApiError && graph.error.status === 404
            ? '拓扑已被删除或不存在'
            : '场景拓扑读取失败'}
        </h2>
        <p>{graph.error.message}</p>
        <Button variant="outline" onClick={() => void graph.refetch()}>
          重试拓扑
        </Button>
        <Link className="ml-4 text-primary underline" to="/basic/user/bench">
          返回实验列表
        </Link>
      </section>
    )
  return (
    <ExperimentTopologyEditor
      key={`${experiment.id}:${id}`}
      id={id}
      initial={graph.data}
    />
  )
}

// 原实验入口未传 readOnly/shared；保留共享包装层明确传入的查看能力，不从详情猜字段。
export function ExperimentTopologyEditor({
  id,
  initial,
  readOnly = false,
  shared = false,
}: {
  id: string | number
  initial: EditorGraph
  readOnly?: boolean
  shared?: boolean
}) {
  const queryClient = useQueryClient()
  const [nodes, setNodes, changeNodes] = useNodesState<FlowNode>(initial.nodes)
  const [edges, setEdges, changeEdges] = useEdgesState<FlowEdge>(initial.edges)
  const [passthroughCells, setPassthroughCells] = useState(
    initial.passthroughCells,
  )
  const [lastNode, setLastNode] = useState<Array<string | number>>([])
  const [resource, setResource] = useState<DeviceResource | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<'node' | 'link' | 'label' | null>(null)
  const [linkSource, setLinkSource] = useState<string | null>(null)
  const [pendingConnection, setPendingConnection] =
    useState<FlowConnection | null>(null)
  const [busy, setBusy] = useState(false)
  const [context, setContext] = useState<{ x: number; y: number } | null>(null)
  const [inspectorDirty, setInspectorDirty] = useState(false)
  const [pendingTexts, setPendingTexts] = useState<Set<string>>(() => new Set())
  const [locked, setLocked] = useState<boolean | undefined>(
    initial.rawGraph.lock === undefined
      ? undefined
      : Boolean(initial.rawGraph.lock),
  )
  const clipboard = useRef<X6Graph | null>(null)
  const pasteCount = useRef(0)
  const panCleanup = useRef<(() => void) | null>(null)
  const selectionOrigin = useRef<{ x: number; y: number } | null>(null)
  const flow = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null)
  const operation = useRef(new AbortController())
  const canvas = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const savedNodeConfiguration = useRef<string | null>(null)
  const draft: EditorGraph = {
    ...initial,
    rawGraph: { ...initial.rawGraph, lock: locked },
    edges: edges.map((edge) => ({
      ...edge,
      type: 'topologyEdge',
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
    })),
    passthroughCells,
    nodes: nodes.map((node) => ({
      ...node,
      extent: node.extent === 'parent' ? 'parent' : undefined,
    })),
  }
  const serialized = JSON.stringify(toX6Graph(draft))
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(toX6Graph(initial)),
  )
  const [saving, setSaving] = useState(false)
  const [businessSaveRequested, setBusinessSaveRequested] = useState(false)
  const [businessSaveFailed, setBusinessSaveFailed] = useState(false)
  const saveController = useRef<AbortController | null>(null)
  const runtimeRequest = useRef<NodeAction | null>(null)
  const [showRuntimeErrors, setShowRuntimeErrors] = useState(false)
  const runtime = useQuery({
    queryKey: ['topology-runtime', id],
    queryFn: ({ signal }) => getTopologyRuntime(id, signal),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const dirty = serialized !== baseline
  const needsSave = dirty || businessSaveFailed
  const editable = !readOnly && !shared && !locked
  const blocker = useBlocker({
    shouldBlockFn: () =>
      needsSave ||
      inspectorDirty ||
      pendingTexts.size > 0 ||
      busy ||
      saving ||
      businessSaveRequested,
    enableBeforeUnload:
      needsSave ||
      inspectorDirty ||
      pendingTexts.size > 0 ||
      busy ||
      saving ||
      businessSaveRequested,
    withResolver: true,
  })
  useEffect(() => {
    operation.current = new AbortController()
    return () => {
      saveController.current?.abort()
      operation.current.abort()
      panCleanup.current?.()
    }
  }, [])

  // 业务结果先进入画布，再在已提交的 React 状态上取快照，避免保存操作前的旧闭包。
  const saveBusinessResult = useEffectEvent(() => {
    setBusinessSaveRequested(false)
    void save(true)
  })
  useEffect(() => {
    if (businessSaveRequested && !busy && !saving) saveBusinessResult()
  }, [businessSaveRequested, busy, saving])

  async function save(afterBusiness = false) {
    if (!editable || busy || saving || (!needsSave && !afterBusiness)) return
    const controller = new AbortController()
    saveController.current = controller
    setSaving(true)
    try {
      const submittedLast = lastNode
      await saveExperimentTopology(id, draft, controller.signal, submittedLast)
      if (controller.signal.aborted) return
      // 保存基线属于本次提交的快照；请求期间的新拖动继续保持 dirty。
      setBaseline(serialized)
      setLastNode((current) => current.slice(submittedLast.length))
      setBusinessSaveFailed(false)
      toast.success('拓扑保存成功')
    } catch (error) {
      if (afterBusiness && !controller.signal.aborted)
        setBusinessSaveFailed(true)
      if (
        error instanceof ApiError &&
        !error.handled &&
        error.kind !== 'cancelled'
      )
        toast.error(error.message)
    } finally {
      if (!controller.signal.aborted) setSaving(false)
    }
  }
  async function toggleLock() {
    if (readOnly || shared || busy || saving) return
    const controller = new AbortController()
    saveController.current = controller
    const nextLock = !locked,
      submittedLast = lastNode
    const submitted = {
      ...draft,
      rawGraph: { ...draft.rawGraph, lock: nextLock },
    }
    setBusy(true)
    setSaving(true)
    try {
      await setExperimentTopologyLock(
        id,
        draft,
        nextLock,
        controller.signal,
        submittedLast,
      )
      if (controller.signal.aborted) return
      setLocked(nextLock)
      setBaseline(JSON.stringify(toX6Graph(submitted)))
      setLastNode((current) => current.slice(submittedLast.length))
      setBusinessSaveFailed(false)
      setContext(null)
      setResource(null)
    } catch (error) {
      report(error)
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        setSaving(false)
      }
    }
  }

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedNode =
    selectedNodes.find((node) => node.id === selected) ?? selectedNodes[0]
  const graphical =
    selectedNode &&
    (selectedNode.type === 'topologyGroup' ||
      selectedNode.data.raw.data?.nodeType === 'base_element')
  async function operateRuntime(
    action: NodeAction,
    target?: string | string[],
  ) {
    if (
      readOnly ||
      busy ||
      saving ||
      businessSaveRequested ||
      runtimeRequest.current
    )
      return
    if (
      target &&
      ![target]
        .flat()
        .every((uuid) =>
          nodes.some(
            (node) =>
              node.id === uuid &&
              node.type !== 'topologyGroup' &&
              node.data.raw.data?.nodeType !== 'base_element',
          ),
        )
    )
      return
    if (shared && typeof target !== 'string') return
    if (Array.isArray(target) && !target.length) return
    runtimeRequest.current = action
    setContext(null)
    setBusy(true)
    try {
      await runTopology(id, action, target, operation.current.signal)
      if (!operation.current.signal.aborted) {
        toast.success(`${runtimeActionLabels[action]}成功`)
        await runtime.refetch()
      }
    } catch (error) {
      report(error)
    } finally {
      runtimeRequest.current = null
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }
  const selectedRuntimeNodes = selectedNodes.filter(
    (node) =>
      node.type !== 'topologyGroup' &&
      node.data.raw.data?.nodeType !== 'base_element',
  )
  const runtimeErrors = runtime.data
    ? [
        ...Object.entries(runtime.data.nodes).map(([uuid, entry]) => ({
          ...entry,
          title: `节点：${entry.name ?? uuid}`,
        })),
        ...Object.entries(runtime.data.edges).map(([rowId, entry]) => ({
          ...entry,
          title: `边：${entry.nodea_name ?? rowId} - ${entry.nodez_name ?? ''}`,
        })),
      ]
        .filter((entry) => entry.status === 3)
        .sort((a, b) =>
          (b.update_time ?? '').localeCompare(a.update_time ?? ''),
        )
    : []
  function editSelected() {
    if (!editable || busy) return
    if (selectedNode?.data.raw.shape === 'custom-react-text') return
    setEditing(selectedEdge ? 'link' : graphical ? 'label' : 'node')
  }
  function installGraph(graph: X6Graph, selectedId?: string) {
    const opened = fromX6Graph(graph)
    setNodes((current) =>
      opened.nodes.map((node) => ({
        ...node,
        selected:
          selectedId === undefined
            ? current.some(
                (previous) => previous.id === node.id && previous.selected,
              )
            : node.id === selectedId,
      })),
    )
    setEdges(opened.edges)
    setPassthroughCells(opened.passthroughCells)
  }
  function changeLabel(uuid: string, label: string) {
    if (!editable || busy) return
    setNodes((current) =>
      current.map((node) =>
        node.id === uuid ? { ...node, data: { ...node.data, label } } : node,
      ),
    )
  }
  function groupSelection() {
    if (!editable || busy || !selectedNodes.length) return
    const graph = toX6Graph(draft)
    const ids = new Set(
      selectedNodes.filter((node) => !node.parentId).map((node) => node.id),
    )
    const members = graph.cells.filter((cell) => ids.has(cell.id))
    if (!members.length) return
    const x =
      Math.min(...members.map((cell) => cell.position?.x ?? cell.x!)) - 50
    const y =
      Math.min(...members.map((cell) => cell.position?.y ?? cell.y!)) - 50
    const right =
      Math.max(
        ...members.map(
          (cell) =>
            (cell.position?.x ?? cell.x!) +
            (cell.size?.width ?? cell.width ?? 80),
        ),
      ) + 50
    const bottom =
      Math.max(
        ...members.map(
          (cell) =>
            (cell.position?.y ?? cell.y!) +
            (cell.size?.height ?? cell.height ?? 80),
        ),
      ) + 50
    const uuid = crypto.randomUUID()
    members.forEach((cell) => {
      cell.parent = uuid
    })
    graph.cells.push({
      id: uuid,
      shape: 'custom-rect',
      shapeType: 'parent',
      position: { x, y },
      size: { width: right - x, height: bottom - y },
      children: [...ids],
      zIndex: 1,
      visible: true,
      data: { parent: true, name: '' },
      attrs: {
        label: {
          fontSize: 16,
          refX: '50%',
          refY: 30,
          textAnchor: 'middle',
          textVerticalAnchor: 'middle',
        },
      },
    })
    installGraph(graph, uuid)
    setSelected(uuid)
  }
  function finishSelection(event: React.MouseEvent) {
    if (!editable || !selectionOrigin.current || !flow.current) return
    const start = selectionOrigin.current,
      end = flow.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
    selectionOrigin.current = null
    const rect = {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    }
    const cells = new Map(toX6Graph(draft).cells.map((cell) => [cell.id, cell]))
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        selected: intersectsRotatedNode(rect, cells.get(node.id)!, {
          width: node.width ?? 80,
          height: node.height ?? 80,
        }),
      })),
    )
  }
  function ungroup(uuid = selectedNode?.id) {
    if (!editable || busy || !uuid) return
    const graph = toX6Graph(draft)
    const group = graph.cells.find((cell) => cell.id === uuid)
    if (!group || !group.data?.parent) return
    for (const cell of graph.cells) {
      if (cell.parent === uuid) delete cell.parent
      if (cell.children)
        cell.children = cell.children.filter((id) => id !== uuid)
    }
    graph.cells = graph.cells.filter((cell) => cell.id !== uuid)
    installGraph(graph)
    setSelected(null)
    setContext(null)
  }
  function embed(uuid: string) {
    if (!editable || busy || !flow.current) return
    const current = flow.current.getNodes()
    const graph = toX6Graph({
      ...draft,
      nodes: current.map((node) => ({ ...node, extent: undefined })),
    })
    const cell = graph.cells.find((cell) => cell.id === uuid)!
    const pos = cell.position ?? { x: cell.x!, y: cell.y! }
    const width = cell.size?.width ?? cell.width ?? 80,
      height = cell.size?.height ?? cell.height ?? 80
    const descendants = new Set([uuid])
    for (let i = 0; i < graph.cells.length; i++)
      for (const child of graph.cells)
        if (child.parent && descendants.has(child.parent))
          descendants.add(child.id)
    const parent = graph.cells
      .filter((candidate) => {
        if (!candidate.data?.parent || descendants.has(candidate.id))
          return false
        const p = candidate.position ?? { x: candidate.x!, y: candidate.y! }
        return (
          pos.x + width >= p.x &&
          pos.x <= p.x + (candidate.size?.width ?? candidate.width ?? 70) &&
          pos.y + height >= p.y &&
          pos.y <= p.y + (candidate.size?.height ?? candidate.height ?? 40)
        )
      })
      .at(-1)
    if (cell.parent === parent?.id) return
    if (parent) cell.parent = parent.id
    else delete cell.parent
    for (const group of graph.cells)
      if (group.data?.parent)
        group.children = graph.cells
          .filter((c) => c.parent === group.id)
          .map((c) => c.id)
    installGraph(graph)
  }
  function copySelection() {
    if (!editable || busy) return
    const graph = toX6Graph(draft),
      ids = new Set(selectedNodes.map((node) => node.id))
    for (let i = 0; i < graph.cells.length; i++)
      for (const cell of graph.cells)
        if (cell.parent && ids.has(cell.parent)) ids.add(cell.id)
    clipboard.current = {
      cells: graph.cells.filter(
        (cell) =>
          ids.has(cell.id) ||
          (cell.source &&
            cell.target &&
            ids.has(cell.source.cell) &&
            ids.has(cell.target.cell)),
      ),
    }
    pasteCount.current = 0
  }
  async function pasteSelection() {
    if (!editable || busy || !clipboard.current?.cells.length) return
    const cells = structuredClone(clipboard.current.cells),
      ids = new Map(cells.map((cell) => [cell.id, crypto.randomUUID()]))
    const ports = new Map<string, string>()
    const offset = 50 * ++pasteCount.current
    for (const cell of cells) {
      const previous = cell.id
      cell.id = ids.get(previous)!
      if (cell.position) {
        cell.position.x += offset
        cell.position.y += offset
      } else if (cell.x !== undefined && cell.y !== undefined) {
        cell.x += offset
        cell.y += offset
      }
      if (cell.parent && ids.has(cell.parent))
        cell.parent = ids.get(cell.parent)
      else delete cell.parent
      if (cell.children)
        cell.children = cell.children.flatMap((child) =>
          ids.has(child) ? [ids.get(child)!] : [],
        )
      for (const port of cell.ports?.items ?? []) {
        const uuid = crypto.randomUUID()
        ports.set(`${previous}:${port.id}`, uuid)
        port.id = uuid
      }
      for (const vertex of cell.vertices ?? []) {
        vertex.x += offset
        vertex.y += offset
      }
    }
    for (const cell of cells)
      for (const endpoint of [cell.source, cell.target])
        if (endpoint) {
          if (endpoint.port)
            endpoint.port = ports.get(`${endpoint.cell}:${endpoint.port}`)!
          endpoint.cell = ids.get(endpoint.cell)!
        }
    const graph = toX6Graph(draft)
    const added: typeof cells = []
    function publish() {
      const combined = [...graph.cells, ...added]
      for (const cell of added)
        if (cell.children)
          cell.children = added
            .filter((child) => child.parent === cell.id)
            .map((child) => child.id)
      const opened = fromX6Graph({ ...graph, cells: combined })
      const pasted = new Set(added.map((cell) => cell.id))
      setNodes(
        opened.nodes.map((node) => ({
          ...node,
          selected: pasted.has(node.id),
        })),
      )
      setEdges(opened.edges)
      setPassthroughCells(opened.passthroughCells)
    }
    setBusy(true)
    try {
      // 区域先建立，部分创建失败时，已成功的业务对象仍可见、可保存和删除。
      for (const cell of cells.filter(
        (cell) => cell.shape !== 'edge' && cell.data?.data_id === undefined,
      ))
        added.push(cell)
      for (const cell of cells.filter(
        (cell) => cell.shape !== 'edge' && cell.data?.data_id !== undefined,
      )) {
        const info = asObject(cell.data?.nodeInfo)
        if (
          (typeof info.id !== 'string' && typeof info.id !== 'number') ||
          typeof info.name !== 'string'
        )
          throw new Error('复制设备缺少有效业务资源标识或名称')
        const created = await createTopologyNode(
          id,
          {
            ...info,
            id: info.id,
            name: info.name,
            config_info: asObject(info.config_info),
          },
          cell.id,
          operation.current.signal,
        )
        if (operation.current.signal.aborted) return
        cell.data = {
          ...cell.data,
          data_id: created.id,
          nodeInfo: created,
          action: 'create',
        }
        added.push(cell)
      }
      for (const cell of cells.filter((cell) => cell.shape === 'edge')) {
        const source = cells.find((node) => node.id === cell.source?.cell)!,
          target = cells.find((node) => node.id === cell.target?.cell)!
        if (
          source.data?.nodeType !== 'base_element' &&
          target.data?.nodeType !== 'base_element'
        ) {
          const sourcePort = cell.data?.source,
            targetPort = cell.data?.target
          if (typeof sourcePort !== 'number' || typeof targetPort !== 'number')
            throw new Error('复制链路缺少已确认的网卡索引')
          const created = await createTopologyEdge(
            id,
            cell.id,
            {
              id: source.id,
              rowId: source.data?.data_id,
              name: String(source.data?.name),
              port: sourcePort,
            },
            {
              id: target.id,
              rowId: target.data?.data_id,
              name: String(target.data?.name),
              port: targetPort,
            },
            operation.current.signal,
          )
          if (operation.current.signal.aborted) return
          cell.data = { ...cell.data, data_id: created.id, action: 'create' }
        }
        added.push(cell)
      }
    } catch (error) {
      report(error)
    } finally {
      if (!operation.current.signal.aborted) {
        publish()
        setBusy(false)
        setSelected(added.find((cell) => cell.shape !== 'edge')?.id ?? null)
      }
    }
  }
  const selectedEdge =
    edges.find((edge) => edge.id === selected && edge.selected) ??
    edges.find((edge) => edge.selected)
  function report(error: unknown) {
    if (error instanceof ApiError) {
      if (!error.handled && error.kind !== 'cancelled')
        toast.error(error.message)
    } else toast.error(error instanceof Error ? error.message : '拓扑操作失败')
  }
  async function exportImage(format: 'png' | 'svg') {
    if (readOnly || shared || exporting || !canvas.current) return
    if (!nodes.length && !edges.length && !passthroughCells.length) {
      toast.warning('请绘制拓扑图！')
      return
    }
    setExporting(true)
    try {
      await exportCanvas(canvas.current, format, operation.current.signal)
    } catch (error) {
      if (!operation.current.signal.aborted)
        toast.error(
          error instanceof CanvasExportError
            ? error.message
            : '画布导出失败，请重试。',
        )
    } finally {
      if (!operation.current.signal.aborted) setExporting(false)
    }
  }
  function pan(event: React.PointerEvent<HTMLDivElement>) {
    if (
      !editable ||
      !event.ctrlKey ||
      event.button !== 0 ||
      !flow.current ||
      (event.target as Element).closest(
        '.react-flow__node,.react-flow__edge,button',
      )
    )
      return
    event.preventDefault()
    event.stopPropagation()
    panCleanup.current?.()
    const element = event.currentTarget,
      origin = flow.current.getViewport(),
      x = event.clientX,
      y = event.clientY
    element.setPointerCapture(event.pointerId)
    const move = (event: PointerEvent) => {
      void flow.current?.setViewport({
        ...origin,
        x: origin.x + event.clientX - x,
        y: origin.y + event.clientY - y,
      })
    }
    const end = () => {
      element.removeEventListener('pointermove', move)
      element.removeEventListener('pointerup', end)
      element.removeEventListener('pointercancel', end)
      element.removeEventListener('lostpointercapture', end)
      panCleanup.current = null
    }
    element.addEventListener('pointermove', move)
    element.addEventListener('pointerup', end)
    element.addEventListener('pointercancel', end)
    element.addEventListener('lostpointercapture', end)
    panCleanup.current = end
  }
  function patchNode(
    uuid: string,
    info: Record<string, unknown>,
    isBlue: boolean,
  ) {
    setNodes((current) =>
      current.map((node) =>
        node.id !== uuid
          ? node
          : {
              ...node,
              data: {
                ...node.data,
                label: String(
                  asObject(asObject(info.config_info).base_info).name ??
                    info.name,
                ),
                raw: {
                  ...node.data.raw,
                  data: {
                    ...node.data.raw.data,
                    name: String(
                      asObject(asObject(info.config_info).base_info).name ??
                        info.name,
                    ),
                    logo: info.logo,
                    is_blue: isBlue || null,
                    nodeInfo: info,
                    action: 'update',
                  },
                },
              },
            },
      ),
    )
  }
  async function place(item: DeviceResource, client: { x: number; y: number }) {
    if (!editable || busy || !flow.current) return
    const point = flow.current.screenToFlowPosition(client)
    const uuid = crypto.randomUUID()
    if (item.nodeType === 'base_element') {
      const area = item.type === 1,
        text = item.type === 3
      const ports = {
        items: ['top', 'right', 'bottom', 'left'].map((group) => ({
          id: `${uuid}-${group}`,
          group,
        })),
      }
      const cell = {
        id: uuid,
        shape: area
          ? 'custom-rect'
          : text
            ? 'custom-react-text'
            : 'custom-react-node',
        position: point,
        size: area
          ? { width: 350, height: 200 }
          : text
            ? { width: 180, height: 80 }
            : { width: 80, height: 80 },
        data: {
          name: item.name,
          nodeType: 'base_element',
          logo: item.logo,
          nodeInfo: item,
          ...(area ? { parent: true } : {}),
        },
        ports,
      }
      setNodes((current) => [
        ...current,
        ...fromX6Graph({ cells: [cell] }).nodes,
      ])
      setResource(null)
      return
    }
    setBusy(true)
    try {
      const created = await createTopologyNode(
        id,
        item,
        uuid,
        operation.current.signal,
      )
      if (operation.current.signal.aborted) return
      const cell = {
        id: uuid,
        shape: 'custom-react-node',
        position: point,
        size: { width: 80, height: 80 },
        data: {
          name: item.name,
          logo: item.logo,
          nodeType: 'node',
          data_id: created.id,
          nodeInfo: created,
        },
        ports: {
          items: ['top', 'right', 'bottom', 'left'].map((group) => ({
            id: `${uuid}-${group}`,
            group,
          })),
        },
      }
      setNodes((current) => [
        ...current,
        ...fromX6Graph({ cells: [cell] }).nodes,
      ])
      setLastNode((current) => [...current, item.id])
      setResource(null)
      setBusinessSaveRequested(true)
    } catch (error) {
      report(error)
    } finally {
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }
  async function remove() {
    const selected = selectedEdge?.id ?? selectedNode?.id
    if (!editable || busy || !selected || (!selectedNode && !selectedEdge))
      return
    if (selectedNode?.type === 'topologyGroup') {
      ungroup(selectedNode.id)
      return
    }
    const removeIds = new Set(
      selectedEdge
        ? [selected]
        : selectedNodes.some((node) => node.id === selected)
          ? selectedNodes
              .filter((node) => node.type !== 'topologyGroup')
              .map((node) => node.id)
          : [selected],
    )
    const linked = edges.filter(
      (edge) =>
        removeIds.has(edge.source) ||
        removeIds.has(edge.target) ||
        edge.id === selected,
    )
    for (const edge of linked) removeIds.add(edge.id)
    const extra = passthroughCells.filter(
      (cell) =>
        (cell.source && removeIds.has(cell.source.cell)) ||
        (cell.target && removeIds.has(cell.target.cell)),
    )
    const nodeIds = nodes
      .filter((node) => removeIds.has(node.id))
      .flatMap((node) =>
        node.data.raw.data?.data_id === undefined
          ? []
          : [node.data.raw.data.data_id],
      )
    const edgeIds = [...linked.map((edge) => edge.data.raw), ...extra].flatMap(
      (cell) => (cell.data?.data_id === undefined ? [] : [cell.data.data_id]),
    )
    setBusy(true)
    try {
      if (nodeIds.length || edgeIds.length)
        await deleteTopologyObjects(
          id,
          nodeIds,
          edgeIds,
          operation.current.signal,
        )
      if (operation.current.signal.aborted) return
      setNodes((current) =>
        current
          .filter((node) => !removeIds.has(node.id))
          .map((node) =>
            node.data.raw.children?.some((child) => removeIds.has(child))
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    raw: {
                      ...node.data.raw,
                      children: node.data.raw.children.filter(
                        (child) => !removeIds.has(child),
                      ),
                    },
                  },
                }
              : node,
          ),
      )
      setEdges((current) => current.filter((edge) => !removeIds.has(edge.id)))
      setPassthroughCells((current) =>
        current
          .filter((cell) => !extra.includes(cell))
          .map((cell) =>
            cell.children?.some((child) => removeIds.has(child))
              ? {
                  ...cell,
                  children: cell.children.filter(
                    (child) => !removeIds.has(child),
                  ),
                }
              : cell,
          ),
      )
      setSelected(null)
      setBusinessSaveRequested(true)
    } catch (error) {
      report(error)
    } finally {
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }
  function connect(connection: FlowConnection) {
    if (!editable || busy || connection.source === connection.target) return
    const source = nodes.find((node) => node.id === connection.source),
      target = nodes.find((node) => node.id === connection.target)
    if (
      source?.data.raw.data?.nodeType === 'base_element' ||
      target?.data.raw.data?.nodeType === 'base_element'
    ) {
      const uuid = crypto.randomUUID()
      const raw = {
        id: uuid,
        shape: 'edge',
        source: {
          cell: connection.source,
          port: connection.sourceHandle ?? undefined,
        },
        target: {
          cell: connection.target,
          port: connection.targetHandle ?? undefined,
        },
        data: { nodeType: 'base_element' },
      }
      setEdges((current) => [
        ...current,
        ...fromX6Graph({
          cells: [...toX6Graph(draft).cells, raw],
        }).edges.filter((edge) => edge.id === uuid),
      ])
      return
    }
    setSelected(null)
    setPendingConnection(connection)
    setLinkSource(connection.source)
    setEditing('link')
  }
  async function openNodeMenu(node: FlowNode, point: { x: number; y: number }) {
    if (readOnly || busy || saving) return
    setContext(null)
    setSelected(node.id)
    setNodes((current) =>
      current.map((item) => ({ ...item, selected: item.id === node.id })),
    )
    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })))
    setBusy(true)
    try {
      if (
        node.type !== 'topologyGroup' &&
        node.data.raw.data?.nodeType !== 'base_element'
      )
        await queryClient.fetchQuery({
          queryKey: ['topology-node-menu', node.id],
          queryFn: ({ signal }) =>
            getTopologyNodeMenuInfo(
              node.id,
              AbortSignal.any([signal, operation.current.signal]),
            ),
          retry: false,
          staleTime: 0,
          gcTime: 0,
        })
      if (!operation.current.signal.aborted) setContext(point)
    } catch (error) {
      report(error)
    } finally {
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }

  return (
    <CanvasNodeContext.Provider
      value={{
        editable: editable && !busy,
        runtime: runtime.data,
        onLabel: changeLabel,
        onTextDirty: (id, dirty) =>
          setPendingTexts((current) => {
            if (current.has(id) === dirty) return current
            const next = new Set(current)
            if (dirty) next.add(id)
            else next.delete(id)
            return next
          }),
        onTransform: (uuid, value) => {
          if (!editable || busy) return
          setNodes((current) =>
            current.map((node) => {
              if (node.id !== uuid) return node
              return {
                ...node,
                position: {
                  x:
                    node.position.x -
                    ((value.width ?? node.width ?? 80) - (node.width ?? 80)) /
                      2,
                  y:
                    node.position.y -
                    ((value.height ?? node.height ?? 80) -
                      (node.height ?? 80)) /
                      2,
                },
                width: value.width ?? node.width,
                height: value.height ?? node.height,
                data: {
                  ...node.data,
                  rotation: value.rotation ?? node.data.rotation,
                },
              }
            }),
          )
        },
      }}
    >
      <section className="@container space-y-4" aria-label="实验场景拓扑">
        {busy && runtimeRequest.current ? (
          <p role="status">
            正在{runtimeActionLabels[runtimeRequest.current]}，请稍候…
          </p>
        ) : null}
        {businessSaveFailed ? (
          <p role="alert">
            业务操作已成功，画布保存失败。请点击保存拓扑重试，已成功的业务操作不会重复。
          </p>
        ) : null}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">场景拓扑</h2>
            <p role="status">
              {locked
                ? '拓扑已锁定，仅可查看'
                : readOnly || shared
                  ? '共享只读拓扑'
                  : needsSave || inspectorDirty || pendingTexts.size > 0
                    ? '有未保存的修改'
                    : '所有修改已保存'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!readOnly && !shared ? (
              <>
                <Button
                  variant="outline"
                  disabled={exporting}
                  onClick={() => void exportImage('svg')}
                >
                  导出SVG
                </Button>
                <Button
                  variant="outline"
                  disabled={exporting}
                  onClick={() => void exportImage('png')}
                >
                  导出PNG
                </Button>
              </>
            ) : null}
            {!readOnly && !shared ? (
              <Button
                variant="outline"
                disabled={busy || saving}
                onClick={() => void toggleLock()}
              >
                {locked ? '解锁拓扑' : '锁定拓扑'}
              </Button>
            ) : null}
            <Button
              disabled={!editable || busy || !needsSave || saving}
              onClick={() => void save()}
            >
              {saving ? '正在保存拓扑…' : '保存拓扑'}
            </Button>
          </div>
        </header>
        {!readOnly && !shared ? (
          <>
            <div
              className="flex flex-wrap items-center gap-2"
              aria-label="拓扑运行操作"
            >
              <Button
                disabled={busy || saving || businessSaveRequested}
                onClick={() => void operateRuntime('start')}
              >
                启动场景
              </Button>
              <Button
                variant="outline"
                disabled={busy || saving || businessSaveRequested}
                onClick={() => void operateRuntime('stop')}
              >
                释放场景
              </Button>
              <Button
                variant="outline"
                disabled={busy || saving || runtime.isFetching}
                onClick={() => void runtime.refetch()}
              >
                {runtime.isFetching ? '正在读取运行状态…' : '刷新运行状态'}
              </Button>
              {selectedRuntimeNodes.length > 1 ? (
                <>
                  <Button
                    variant="outline"
                    disabled={busy || saving}
                    onClick={() =>
                      void operateRuntime(
                        'start',
                        selectedRuntimeNodes.map((node) => node.id),
                      )
                    }
                  >
                    批量启动
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || saving}
                    onClick={() =>
                      void operateRuntime(
                        'stop',
                        selectedRuntimeNodes.map((node) => node.id),
                      )
                    }
                  >
                    批量释放
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                onClick={() => setShowRuntimeErrors(!showRuntimeErrors)}
              >
                {showRuntimeErrors ? '关闭错误信息' : '开启错误信息'}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              节点释放后会删除相关数据，请谨慎操作
            </p>
            {runtime.isError ? (
              <p role="alert">运行状态读取失败：{runtime.error.message}</p>
            ) : null}
            {showRuntimeErrors ? (
              <aside aria-label="错误信息提示" className="rounded border p-3">
                <h3>错误信息提示</h3>
                {runtimeErrors.length ? (
                  runtimeErrors.map((entry, index) => (
                    <div key={index}>
                      <strong>{entry.title}</strong>
                      <p>{entry.error_msg || '暂未获取到错误信息！'}</p>
                    </div>
                  ))
                ) : (
                  <p>暂无错误信息</p>
                )}
              </aside>
            ) : null}
          </>
        ) : null}
        {editable ? (
          <div className="flex flex-wrap gap-2" aria-label="选中对象操作">
            <Button
              variant="outline"
              disabled={busy || (!selectedNode && !selectedEdge)}
              onClick={editSelected}
            >
              编辑选中对象
            </Button>
            <Button
              variant="outline"
              disabled={busy || !selectedNodes.some((node) => !node.parentId)}
              onClick={groupSelection}
            >
              创建分组
            </Button>
            <Button
              variant="outline"
              disabled={busy || selectedNode?.type !== 'topologyGroup'}
              onClick={() => ungroup()}
            >
              解除分组
            </Button>
            <Button
              variant="outline"
              disabled={
                busy || !selectedNode || !nicIndices(selectedNode).length
              }
              onClick={() => {
                setLinkSource(selectedNode!.id)
                setPendingConnection(null)
                setEditing('link')
              }}
            >
              连接设备
            </Button>
            <Button
              variant="destructive"
              disabled={
                busy ||
                (!selectedNode && !selectedEdge) ||
                selectedNode?.type === 'topologyGroup'
              }
              onClick={() => void remove()}
            >
              删除选中对象
            </Button>
            {resource ? (
              <p role="status">点击画布放置：{resource.name}</p>
            ) : null}
            {busy && !runtimeRequest.current ? (
              <p role="status">正在提交拓扑操作…</p>
            ) : null}
          </div>
        ) : null}
        {initial.issues.length ? (
          <div role="status" className="compatibility-report">
            <strong>兼容性报告：未支持的图元将原样保存</strong>
            <ul>
              {initial.issues.map((issue) => (
                <li key={`${issue.code}:${issue.cellId}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!nodes.length && !edges.length ? <p>暂无可显示的拓扑图元</p> : null}
        <div className="flex flex-col gap-3 @min-[48rem]:flex-row">
          {editable ? (
            <DeviceResources
              disabled={busy}
              onChoose={setResource}
              onRemoved={(id) =>
                setResource((current) => (current?.id === id ? null : current))
              }
            />
          ) : null}
          <div
            className="h-[32rem] w-full min-w-0 border bg-white @min-[48rem]:flex-1"
            aria-label="场景拓扑画布"
            ref={canvas}
            tabIndex={0}
            onPointerDownCapture={pan}
            onKeyDown={(event) => {
              if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement ||
                event.target instanceof HTMLSelectElement ||
                !editable ||
                busy
              )
                return
              if (event.ctrlKey || event.metaKey) {
                if (event.key.toLowerCase() === 'a') {
                  event.preventDefault()
                  setNodes((current) =>
                    current.map((node) => ({ ...node, selected: true })),
                  )
                  return
                }
                if (event.key.toLowerCase() === 'c') {
                  event.preventDefault()
                  copySelection()
                  return
                }
                if (event.key.toLowerCase() === 'v') {
                  event.preventDefault()
                  void pasteSelection()
                  return
                }
              }
              if (
                (event.key === 'Delete' || event.key === 'Backspace') &&
                !(event.target instanceof HTMLInputElement) &&
                !(event.target instanceof HTMLTextAreaElement) &&
                !(event.target instanceof HTMLSelectElement)
              ) {
                event.preventDefault()
                void remove()
              }
            }}
            onDragOver={(event) => {
              if (editable) event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (!editable || busy) return
              try {
                const item = JSON.parse(
                  event.dataTransfer.getData('application/x-topology-resource'),
                ) as DeviceResource
                setResource(item)
                void place(item, { x: event.clientX, y: event.clientY })
              } catch (error) {
                report(error)
              }
            }}
          >
            <ReactFlow<FlowNode, FlowEdge>
              nodes={nodes}
              edges={edges.map((edge) => ({
                ...edge,
                data: {
                  ...edge.data,
                  runtimeStatus:
                    runtime.data?.edges[String(edge.data.raw.data?.data_id)]
                      ?.status,
                },
              }))}
              connectionMode={ConnectionMode.Loose}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={(instance) => {
                flow.current = instance
              }}
              onPaneClick={(event) => {
                setContext(null)
                if (resource)
                  void place(resource, { x: event.clientX, y: event.clientY })
                else setSelected(null)
              }}
              onPaneContextMenu={(event) => {
                event.preventDefault()
                if (editable && selectedNodes.length)
                  setContext({ x: event.clientX, y: event.clientY })
              }}
              onNodeClick={(event, node) => {
                setSelected(node.id)
                if (!(event.target instanceof HTMLTextAreaElement))
                  (
                    event.currentTarget.closest(
                      '[aria-label="场景拓扑画布"]',
                    ) as HTMLElement | null
                  )?.focus({ preventScroll: true })
                if (editable)
                  setNodes((current) =>
                    current.map((item) =>
                      item.id === node.id
                        ? {
                            ...item,
                            zIndex:
                              node.type === 'topologyGroup'
                                ? 0
                                : Math.max(
                                    2,
                                    ...current.map((n) => n.zIndex ?? 0),
                                  ) + 1,
                          }
                        : item,
                    ),
                  )
              }}
              onEdgeClick={(_event, edge) => setSelected(edge.id)}
              onNodeDoubleClick={(_event, node) => {
                if (editable && !busy) {
                  setSelected(node.id)
                  if (node.data.raw.shape !== 'custom-react-text')
                    setEditing(
                      node.type === 'topologyGroup' ||
                        node.data.raw.data?.nodeType === 'base_element'
                        ? 'label'
                        : 'node',
                    )
                }
              }}
              onEdgeDoubleClick={(_event, edge) => {
                if (editable && !busy) {
                  setSelected(edge.id)
                  setEditing('link')
                }
              }}
              onNodeContextMenu={(event, node) => {
                event.preventDefault()
                void openNodeMenu(node, { x: event.clientX, y: event.clientY })
              }}
              onEdgeContextMenu={(event, edge) => {
                event.preventDefault()
                setSelected(edge.id)
                setEdges((current) =>
                  current.map((item) => ({
                    ...item,
                    selected: item.id === edge.id,
                  })),
                )
                setNodes((current) =>
                  current.map((node) => ({ ...node, selected: false })),
                )
                if (editable) setContext({ x: event.clientX, y: event.clientY })
              }}
              onConnect={connect}
              isValidConnection={(connection) => {
                const source = nodes.find(
                    (node) => node.id === connection.source,
                  ),
                  target = nodes.find((node) => node.id === connection.target)
                if (!source || !target || source.id === target.id) return false
                if (
                  source.data.raw.data?.nodeType === 'base_element' ||
                  target.data.raw.data?.nodeType === 'base_element'
                )
                  return true
                return (
                  nicIndices(source).length > 0 && nicIndices(target).length > 0
                )
              }}
              onNodesChange={(changes) =>
                changeNodes(
                  changes.filter(
                    (change) =>
                      change.type === 'dimensions' ||
                      change.type === 'select' ||
                      (editable && change.type === 'position'),
                  ),
                )
              }
              nodesDraggable={editable && !busy}
              onNodeDragStop={(_event, node) => embed(node.id)}
              selectionOnDrag={editable}
              onSelectionStart={(event) => {
                selectionOrigin.current =
                  flow.current?.screenToFlowPosition({
                    x: event.clientX,
                    y: event.clientY,
                  }) ?? null
              }}
              onSelectionEnd={finishSelection}
              selectionMode={SelectionMode.Partial}
              multiSelectionKeyCode={editable ? ['Control', 'Meta'] : null}
              selectionKeyCode={null}
              panOnDrag={editable ? [1, 2] : true}
              panActivationKeyCode={null}
              zoomActivationKeyCode={['Control', 'Meta']}
              zoomOnScroll={!editable}
              zoomOnDoubleClick={false}
              onEdgesChange={(changes) =>
                changeEdges(
                  changes.filter((change) => change.type === 'select'),
                )
              }
              nodesConnectable={editable && !busy}
              edgesReconnectable={false}
              deleteKeyCode={null}
              fitView={initial.nodes.length > 0}
              minZoom={0.2}
              maxZoom={2}
            >
              <Background />
              <Panel position="bottom-left" className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="放大拓扑"
                  onClick={() => {
                    if (flow.current)
                      void flow.current.zoomTo(
                        Math.min(2, flow.current.getZoom() + 0.2),
                      )
                  }}
                >
                  ＋
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="缩小拓扑"
                  onClick={() => {
                    if (flow.current)
                      void flow.current.zoomTo(
                        Math.max(0.2, flow.current.getZoom() - 0.2),
                      )
                  }}
                >
                  −
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="居中拓扑"
                  onClick={() => void flow.current?.fitView()}
                >
                  居中
                </Button>
              </Panel>
            </ReactFlow>
          </div>
        </div>
        {!readOnly && context ? (
          <div
            role="menu"
            aria-label="拓扑对象菜单"
            className="fixed z-50 grid gap-1 rounded border bg-background p-2 shadow-lg"
            style={{
              left: Math.max(0, Math.min(context.x, window.innerWidth - 180)),
              top: Math.max(0, Math.min(context.y, window.innerHeight - 300)),
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            {selectedNode && !graphical
              ? nodeRuntimeActions(
                  runtime.data?.nodes[selectedNode.id]?.status,
                  asObject(
                    asObject(selectedNode.data.raw.data?.nodeInfo).config_info,
                  ).type,
                ).map((action) => (
                  <Button
                    key={action}
                    role="menuitem"
                    variant="ghost"
                    disabled={
                      busy || saving || runtime.isFetching || !runtime.data
                    }
                    onClick={() => void operateRuntime(action, selectedNode.id)}
                  >
                    {runtimeActionLabels[action]}
                  </Button>
                ))
              : null}
            {editable &&
            selectedNode?.data.raw.shape !== 'custom-react-text' ? (
              <Button
                role="menuitem"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setContext(null)
                  editSelected()
                }}
              >
                编辑
              </Button>
            ) : null}
            {editable && selectedNodes.length ? (
              <Button
                role="menuitem"
                variant="ghost"
                onClick={() => {
                  groupSelection()
                  setContext(null)
                }}
              >
                创建分组
              </Button>
            ) : null}
            {editable && selectedNode?.type === 'topologyGroup' ? (
              <Button role="menuitem" variant="ghost" onClick={() => ungroup()}>
                解除分组
              </Button>
            ) : null}
            {editable && selectedNode?.type !== 'topologyGroup' ? (
              <Button
                role="menuitem"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setContext(null)
                  void remove()
                }}
              >
                删除
              </Button>
            ) : null}
          </div>
        ) : null}
        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (busy) return
            if (!open) {
              setEditing(null)
              setLinkSource(null)
              setPendingConnection(null)
            }
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editing === 'label'
                  ? '图元名称'
                  : editing === 'node'
                    ? '节点配置'
                    : selectedEdge
                      ? '链路配置'
                      : '连接设备'}
              </DialogTitle>
              <DialogDescription>
                配置成功后自动保存拓扑；画布保存失败可通过保存拓扑重试。
              </DialogDescription>
            </DialogHeader>
            {editable && editing === 'label' && selectedNode ? (
              <CanvasLabel
                allowEmpty={selectedNode.type === 'topologyGroup'}
                key={selectedNode.id}
                name={selectedNode.data.label}
                onDirtyChange={setInspectorDirty}
                onSave={(name) => {
                  changeLabel(selectedNode.id, name)
                  setBusinessSaveRequested(true)
                  setEditing(null)
                }}
              />
            ) : null}
            {editable && editing === 'node' && selectedNode ? (
              <NodeConfiguration
                isBlue={Boolean(selectedNode.data.raw.data?.is_blue)}
                connectedPorts={[
                  ...edges.map((edge) => edge.data.raw),
                  ...passthroughCells,
                ].flatMap((cell) => {
                  if (
                    cell.shape !== 'edge' ||
                    cell.data?.nodeType === 'base_element'
                  )
                    return []
                  const indices: unknown[] = []
                  if (cell.source?.cell === selectedNode.id)
                    indices.push(cell.data?.source)
                  if (cell.target?.cell === selectedNode.id)
                    indices.push(cell.data?.target)
                  return indices.filter(
                    (index): index is number =>
                      typeof index === 'number' &&
                      Number.isInteger(index) &&
                      index >= 0,
                  )
                })}
                onDirtyChange={setInspectorDirty}
                key={selectedNode.id}
                info={asObject(selectedNode.data.raw.data?.nodeInfo)}
                logo={selectedNode.data.raw.data?.logo}
                signal={() => operation.current.signal}
                onError={report}
                onSave={async (value, isBlue, asTemplate) => {
                  if (!editable) return
                  const uuid = selectedNode.id
                  const ports = asObject(value.config_info).ports
                  if (
                    Array.isArray(ports) &&
                    [
                      ...edges.map((edge) => edge.data.raw),
                      ...passthroughCells,
                    ].some(
                      (cell) =>
                        cell.shape === 'edge' &&
                        cell.data?.nodeType !== 'base_element' &&
                        ((cell.source?.cell === uuid &&
                          Number(cell.data?.source) >= ports.length) ||
                          (cell.target?.cell === uuid &&
                            Number(cell.data?.target) >= ports.length)),
                    )
                  )
                    throw new Error('该网卡仍有链路连接，请先删除关联链路')
                  setBusy(true)
                  try {
                    const snapshot = JSON.stringify([uuid, value, isBlue])
                    if (savedNodeConfiguration.current !== snapshot) {
                      await updateTopologyNode(
                        id,
                        uuid,
                        value,
                        operation.current.signal,
                      )
                      if (operation.current.signal.aborted) return
                      savedNodeConfiguration.current = snapshot
                      patchNode(uuid, value, isBlue)
                      setBusinessSaveRequested(true)
                    }
                    if (operation.current.signal.aborted) return
                    if (asTemplate) {
                      await saveNodeTemplate(value, operation.current.signal)
                      if (operation.current.signal.aborted) return
                      void queryClient.invalidateQueries({
                        queryKey: ['topology-resources'],
                      })
                    }
                    setBusinessSaveRequested(true)
                    setEditing(null)
                  } finally {
                    if (!operation.current.signal.aborted) setBusy(false)
                  }
                }}
              />
            ) : null}
            {editable &&
            editing === 'link' &&
            nodes.find(
              (node) => node.id === (selectedEdge?.source ?? linkSource),
            ) ? (
              <LinkConfiguration
                onDirtyChange={setInspectorDirty}
                key={selectedEdge?.id ?? linkSource}
                source={nodes.find(
                  (node) => node.id === (selectedEdge?.source ?? linkSource),
                )!}
                nodes={nodes}
                edges={edges}
                passthrough={passthroughCells}
                edge={selectedEdge}
                onError={report}
                onSave={async (value) => {
                  if (!editable) return
                  if (selectedEdge) {
                    setEdges((current) =>
                      current.map((edge) =>
                        edge.id !== selectedEdge.id
                          ? edge
                          : {
                              ...edge,
                              data: {
                                ...edge.data,
                                router: {
                                  ...asObject(edge.data.router),
                                  name: value.lineType,
                                },
                                raw: {
                                  ...edge.data.raw,
                                  data: {
                                    ...edge.data.raw.data,
                                    lineType: value.lineType,
                                    action: 'update',
                                  },
                                },
                              },
                            },
                      ),
                    )
                    setEditing(null)
                    setBusinessSaveRequested(true)
                    return
                  }
                  const source = nodes.find((node) => node.id === linkSource),
                    target = nodes.find((node) => node.id === value.target)
                  if (
                    !source ||
                    !target ||
                    source.id === target.id ||
                    !nicIndices(source).includes(value.sourcePort) ||
                    !nicIndices(target).includes(value.targetPort) ||
                    occupied(
                      source.id,
                      value.sourcePort,
                      edges,
                      undefined,
                      passthroughCells,
                    ) ||
                    occupied(
                      target.id,
                      value.targetPort,
                      edges,
                      undefined,
                      passthroughCells,
                    )
                  )
                    throw new Error('网卡不可用，请重新选择合法端点')
                  const uuid = crypto.randomUUID()
                  setBusy(true)
                  try {
                    const created = await createTopologyEdge(
                      id,
                      uuid,
                      {
                        id: source.id,
                        rowId: source.data.raw.data?.data_id,
                        name: source.data.label,
                        port: value.sourcePort,
                      },
                      {
                        id: target.id,
                        rowId: target.data.raw.data?.data_id,
                        name: target.data.label,
                        port: value.targetPort,
                      },
                      operation.current.signal,
                    )
                    if (operation.current.signal.aborted) return
                    const sourceHandle =
                      pendingConnection?.sourceHandle ??
                      source.data.ports.find((port) => port.group === 'right')
                        ?.id
                    const targetHandle =
                      pendingConnection?.targetHandle ??
                      target.data.ports.find((port) => port.group === 'left')
                        ?.id
                    const raw = {
                      id: uuid,
                      shape: 'edge',
                      source: {
                        cell: source.id,
                        port: sourceHandle ?? undefined,
                      },
                      target: {
                        cell: target.id,
                        port: targetHandle ?? undefined,
                      },
                      router: { name: value.lineType },
                      attrs: {
                        line: {
                          stroke: '#1890ff',
                          strokeDasharray: 5,
                          style: { animation: 'ant-line 30s infinite linear' },
                        },
                      },
                      labels: [
                        {
                          position: 0.2,
                          attrs: {
                            label: { text: nicLabel(source, value.sourcePort) },
                          },
                        },
                        {
                          position: 0.8,
                          attrs: {
                            label: { text: nicLabel(target, value.targetPort) },
                          },
                        },
                      ],
                      data: {
                        source: value.sourcePort,
                        target: value.targetPort,
                        lineType: value.lineType,
                        data_id: created.id,
                        action: 'create',
                      },
                    }
                    setEdges((current) => [
                      ...current,
                      {
                        id: uuid,
                        source: source.id,
                        target: target.id,
                        sourceHandle: sourceHandle ?? undefined,
                        targetHandle: targetHandle ?? undefined,
                        type: 'topologyEdge',
                        data: {
                          vertices: [],
                          router: raw.router,
                          style: raw.attrs,
                          raw,
                        },
                      },
                    ])
                    setEditing(null)
                    setLinkSource(null)
                    setPendingConnection(null)
                    setBusinessSaveRequested(true)
                  } finally {
                    if (!operation.current.signal.aborted) setBusy(false)
                  }
                }}
              />
            ) : null}
          </DialogContent>
        </Dialog>
        <Dialog
          open={blocker.status === 'blocked'}
          onOpenChange={(open) => {
            if (!open) blocker.reset?.()
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>放弃未保存的拓扑？</DialogTitle>
              <DialogDescription>
                继续离开会丢失尚未保存的本地拓扑修改，已经成功的远端业务操作不会撤销。
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={blocker.reset}>
                继续编辑
              </Button>
              <Button onClick={blocker.proceed}>放弃并离开</Button>
            </div>
          </DialogContent>
        </Dialog>
      </section>
    </CanvasNodeContext.Provider>
  )
}
