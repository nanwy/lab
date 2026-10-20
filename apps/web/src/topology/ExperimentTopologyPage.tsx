import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker } from '@tanstack/react-router'
import {
  Background,
  BaseEdge,
  EdgeText,
  Controls,
  ConnectionMode,
  Handle,
  Position,
  ReactFlow,
  useNodesState,
  useEdgesState,
  getSmoothStepPath,
  type ReactFlowInstance,
  type Connection as FlowConnection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
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
import { getExperimentTopology, saveExperimentTopology } from '../api/topology'
import { useExperiment } from '../experiments/ExperimentContext'
import { DeviceResources } from './DeviceResources'
import { NodeConfiguration } from './NodeConfiguration'
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
} from './x6-adapter'

type FlowNode = Node<TopologyNodeData, 'topologyNode' | 'topologyGroup'>
type FlowEdge = Edge<TopologyEdgeData, 'topologyEdge'> & {
  data: TopologyEdgeData
}
const positions = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
}

function Device({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className="topology-node"
      style={{ transform: `rotate(${data.rotation}deg)` }}
    >
      {data.ports.map((port) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={
            positions[port.group as keyof typeof positions] ?? Position.Right
          }
        />
      ))}
      {data.ports.length === 0 ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          style={{ visibility: 'hidden' }}
        />
      ) : null}
      {typeof data.raw.data?.logo === 'string' && data.raw.data.logo ? (
        <img
          src={data.raw.data.logo}
          alt=""
          className="mx-auto size-8 object-contain"
        />
      ) : null}
      <strong>{data.label}</strong>
    </div>
  )
}
function Group({ data }: NodeProps<FlowNode>) {
  return (
    <div className="topology-group">
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{ visibility: 'hidden' }}
      />
      <strong>{data.label}</strong>
    </div>
  )
}
function Connection({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<FlowEdge>) {
  const path =
    data?.router &&
    asObject(data.router).name === 'orth' &&
    !data.vertices.length
      ? getSmoothStepPath({ sourceX, sourceY, targetX, targetY })[0]
      : [
          `M ${sourceX} ${sourceY}`,
          ...(data?.vertices ?? []).map((point) => `L ${point.x} ${point.y}`),
          `L ${targetX} ${targetY}`,
        ].join(' ')
  const line = data?.style.line as Record<string, unknown> | undefined
  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: typeof line?.stroke === 'string' ? line.stroke : undefined,
          strokeWidth:
            typeof line?.strokeWidth === 'number'
              ? line.strokeWidth
              : undefined,
          strokeDasharray:
            typeof line?.strokeDasharray === 'string' ||
            typeof line?.strokeDasharray === 'number'
              ? String(line.strokeDasharray)
              : undefined,
        }}
      />
      {Array.isArray(data?.raw.labels)
        ? data.raw.labels.map((label, index) => {
            const item = asObject(label)
            const position =
              typeof item.position === 'number' ? item.position : 0.5
            const text = asObject(asObject(item.attrs).label).text
            return typeof text === 'string' ? (
              <EdgeText
                key={index}
                x={sourceX + (targetX - sourceX) * position}
                y={sourceY + (targetY - sourceY) * position}
                label={text}
              />
            ) : null
          })
        : null}
    </>
  )
}
const nodeTypes = { topologyNode: Device, topologyGroup: Group }
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
  const [editing, setEditing] = useState<'node' | 'link' | null>(null)
  const [linkSource, setLinkSource] = useState<string | null>(null)
  const [pendingConnection, setPendingConnection] =
    useState<FlowConnection | null>(null)
  const [busy, setBusy] = useState(false)
  const [context, setContext] = useState<{ x: number; y: number } | null>(null)
  const [inspectorDirty, setInspectorDirty] = useState(false)
  const flow = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null)
  const operation = useRef(new AbortController())
  const draft: EditorGraph = {
    ...initial,
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
  const saveController = useRef<AbortController | null>(null)
  const dirty = serialized !== baseline
  const locked = Boolean(initial.rawGraph.lock)
  const editable = !readOnly && !shared && !locked
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || inspectorDirty || busy,
    enableBeforeUnload: dirty || inspectorDirty || busy,
    withResolver: true,
  })
  useEffect(() => {
    operation.current = new AbortController()
    return () => {
      saveController.current?.abort()
      operation.current.abort()
    }
  }, [])

  async function save() {
    if (!editable || saving || !dirty) return
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
      toast.success('拓扑保存成功')
    } catch (error) {
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

  const selectedNode = nodes.find(
    (node) => node.id === selected && node.type === 'topologyNode',
  )
  const selectedEdge = edges.find((edge) => edge.id === selected)
  function report(error: unknown) {
    if (error instanceof ApiError) {
      if (!error.handled && error.kind !== 'cancelled')
        toast.error(error.message)
    } else toast.error(error instanceof Error ? error.message : '拓扑操作失败')
  }
  function patchNode(uuid: string, info: Record<string, unknown>) {
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
    } catch (error) {
      report(error)
    } finally {
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }
  async function remove() {
    if (!editable || busy || !selected || (!selectedNode && !selectedEdge))
      return
    const removeIds = new Set([selected])
    const linked = edges.filter(
      (edge) =>
        edge.source === selected ||
        edge.target === selected ||
        edge.id === selected,
    )
    for (const edge of linked) removeIds.add(edge.id)
    const extra = passthroughCells.filter(
      (cell) =>
        cell.source?.cell === selected || cell.target?.cell === selected,
    )
    const nodeIds =
      selectedNode?.data.raw.data?.data_id === undefined
        ? []
        : [selectedNode.data.raw.data.data_id]
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
            node.data.raw.children?.includes(selected)
              ? {
                  ...node,
                  data: {
                    ...node.data,
                    raw: {
                      ...node.data.raw,
                      children: node.data.raw.children.filter(
                        (child) => child !== selected,
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
            cell.children?.includes(selected)
              ? {
                  ...cell,
                  children: cell.children.filter((child) => child !== selected),
                }
              : cell,
          ),
      )
      setSelected(null)
    } catch (error) {
      report(error)
    } finally {
      if (!operation.current.signal.aborted) setBusy(false)
    }
  }
  function connect(connection: FlowConnection) {
    if (!editable || busy || connection.source === connection.target) return
    setSelected(null)
    setPendingConnection(connection)
    setLinkSource(connection.source)
    setEditing('link')
  }
  async function openNodeMenu(node: FlowNode, point: { x: number; y: number }) {
    if (!editable || busy || node.type !== 'topologyNode') return
    setContext(null)
    setSelected(node.id)
    setBusy(true)
    try {
      if (node.data.raw.data?.nodeType !== 'base_element')
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
    <section className="space-y-4" aria-label="实验场景拓扑">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">场景拓扑</h2>
          <p role="status">
            {locked
              ? '拓扑已锁定，仅可查看'
              : readOnly || shared
                ? '共享只读拓扑'
                : dirty || inspectorDirty
                  ? '有未保存的修改'
                  : '所有修改已保存'}
          </p>
        </div>
        <Button
          disabled={!editable || !dirty || saving}
          onClick={() => void save()}
        >
          {saving ? '正在保存拓扑…' : '保存拓扑'}
        </Button>
      </header>
      {editable ? (
        <div className="flex gap-2" aria-label="选中对象操作">
          <Button
            variant="outline"
            disabled={busy || (!selectedNode && !selectedEdge)}
            onClick={() => setEditing(selectedEdge ? 'link' : 'node')}
          >
            编辑选中对象
          </Button>
          <Button
            variant="outline"
            disabled={busy || !selectedNode || !nicIndices(selectedNode).length}
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
            disabled={busy || (!selectedNode && !selectedEdge)}
            onClick={() => void remove()}
          >
            删除选中对象
          </Button>
          {resource ? <p role="status">点击画布放置：{resource.name}</p> : null}
          {busy ? <p role="status">正在提交拓扑操作…</p> : null}
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
      <div className="flex gap-3">
        {editable ? (
          <DeviceResources disabled={busy} onChoose={setResource} />
        ) : null}
        <div
          className="h-[32rem] min-w-0 flex-1 border bg-white"
          aria-label="场景拓扑画布"
          tabIndex={0}
          onKeyDown={(event) => {
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
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
            onNodeClick={(_event, node) => setSelected(node.id)}
            onEdgeClick={(_event, edge) => setSelected(edge.id)}
            onNodeDoubleClick={(_event, node) => {
              if (editable && !busy && node.type === 'topologyNode') {
                setSelected(node.id)
                setEditing('node')
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
              if (editable) setContext({ x: event.clientX, y: event.clientY })
            }}
            onConnect={connect}
            isValidConnection={(connection) =>
              connection.source !== connection.target &&
              Boolean(
                nodes.find(
                  (node) =>
                    node.id === connection.source && nicIndices(node).length,
                ),
              ) &&
              Boolean(
                nodes.find(
                  (node) =>
                    node.id === connection.target && nicIndices(node).length,
                ),
              )
            }
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
            nodesDraggable={editable}
            onEdgesChange={(changes) =>
              changeEdges(changes.filter((change) => change.type === 'select'))
            }
            nodesConnectable={editable && !busy}
            edgesReconnectable={false}
            deleteKeyCode={null}
            fitView={initial.nodes.length > 0}
            minZoom={0.2}
            maxZoom={2}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
      {editable && context ? (
        <div
          role="menu"
          aria-label="拓扑对象菜单"
          className="fixed z-50 grid gap-1 rounded border bg-background p-2 shadow-lg"
          style={{
            left: Math.max(0, Math.min(context.x, window.innerWidth - 180)),
            top: Math.max(0, Math.min(context.y, window.innerHeight - 110)),
          }}
        >
          <Button
            role="menuitem"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setContext(null)
              setEditing(selectedEdge ? 'link' : 'node')
            }}
          >
            编辑
          </Button>
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
              {editing === 'node'
                ? '节点配置'
                : selectedEdge
                  ? '链路配置'
                  : '连接设备'}
            </DialogTitle>
            <DialogDescription>
              配置成功后保存拓扑以持久化画布。
            </DialogDescription>
          </DialogHeader>
          {editable && editing === 'node' && selectedNode ? (
            <NodeConfiguration
              onDirtyChange={setInspectorDirty}
              key={selectedNode.id}
              info={asObject(selectedNode.data.raw.data?.nodeInfo)}
              logo={selectedNode.data.raw.data?.logo}
              signal={() => operation.current.signal}
              onError={report}
              onSave={async (value) => {
                if (!editable) return
                const uuid = selectedNode.id
                const ports = asObject(value.config_info).ports
                if (
                  Array.isArray(ports) &&
                  edges.some(
                    (edge) =>
                      (edge.source === uuid &&
                        Number(edge.data.raw.data?.source) >= ports.length) ||
                      (edge.target === uuid &&
                        Number(edge.data.raw.data?.target) >= ports.length),
                  )
                )
                  throw new Error('该网卡仍有链路连接，请先删除关联链路')
                setBusy(true)
                try {
                  await updateTopologyNode(
                    id,
                    uuid,
                    value,
                    operation.current.signal,
                  )
                  if (operation.current.signal.aborted) return
                  patchNode(uuid, value)
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
                  occupied(source.id, value.sourcePort, edges) ||
                  occupied(target.id, value.targetPort, edges)
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
                    source.data.ports.find((port) => port.group === 'right')?.id
                  const targetHandle =
                    pendingConnection?.targetHandle ??
                    target.data.ports.find((port) => port.group === 'left')?.id
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
                        style: {},
                        raw,
                      },
                    },
                  ])
                  setEditing(null)
                  setLinkSource(null)
                  setPendingConnection(null)
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
              继续离开会丢失尚未保存的拓扑修改。
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
  )
}
