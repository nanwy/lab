import { ScriptConfigDialog } from './ScriptConfigDialog'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  SelectionMode,
  useReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type NodeProps,
  type Edge,
  type Connection,
} from '@xyflow/react'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogHeader,
} from '@workspace/ui/components/alert-dialog'
import { toast } from '@workspace/ui/components/sonner'
import {
  getScriptGraph,
  saveScriptGraph,
  scriptKeys,
  type ScriptGraph,
  type ScriptNodeData,
  type ScriptNode,
  type ScriptEdge,
} from '../api/blue-script'
import type { BlueId } from '../api/blue-team'
import { ApiError } from '../api'
import { usePageSignal } from '../auth/use-page-signal'
import { blueError } from './feedback'

type CanvasNode = Node<ScriptNodeData, 'customNode'>
const shapes = [
  {
    type: 1,
    name: '开始',
    style: { width: 120, height: 40, borderRadius: 20 },
  },
  {
    type: 2,
    name: '数据分支',
    style: {
      width: 120,
      height: 40,
      clipPath: 'polygon(15% 0,85% 0,100% 100%,0 100%)',
    },
  },
  {
    type: 3,
    name: '判断',
    style: {
      width: 120,
      height: 48,
      clipPath: 'polygon(50% 0,100% 50%,50% 100%,0 50%)',
    },
  },
  {
    type: 4,
    name: '指令能力动作',
    style: { width: 120, height: 40, borderRadius: 4 },
  },
  {
    type: 5,
    name: '结束',
    style: { width: 120, height: 40, borderRadius: 10 },
  },
] as const
function ScriptNodeView({ data }: NodeProps<CanvasNode>) {
  const type = data.type
  const shape = shapes.find((s) => s.type === type)
  return (
    <div className="relative text-center text-white">
      <div
        className="flex items-center justify-center overflow-hidden px-2 text-sm"
        style={
          {
            background: type === 5 ? '#d0021b' : '#1677ff',
            width: 120,
            height: 40,
            ...shape?.style,
            ...data.style,
          } as CSSProperties
        }
        title={data.name}
      >
        {data.name}
      </div>
      {type !== 1 && <Handle id="1" type="target" position={Position.Top} />}
      {type !== 5 && <Handle id="2" type="source" position={Position.Bottom} />}
      {(type === 3 || type === 4) && (
        <>
          <Handle
            id="3"
            type="source"
            position={Position.Left}
            style={type === 4 ? { top: '60%' } : undefined}
          />
          <Handle
            id="4"
            type="source"
            position={Position.Right}
            style={type === 4 ? { top: '60%' } : undefined}
          />
        </>
      )}
      {type === 4 && (
        <>
          <Handle
            id="5"
            type="target"
            position={Position.Left}
            style={{ top: '40%' }}
          />
          <Handle
            id="6"
            type="target"
            position={Position.Right}
            style={{ top: '40%' }}
          />
        </>
      )}
    </div>
  )
}
const nodeTypes = { customNode: ScriptNodeView }
export type ScriptTarget =
  { kind: 'node'; node: ScriptNode } | { kind: 'edge'; edge: ScriptEdge }
export function ScriptCanvas({ scenarioId }: { scenarioId: BlueId }) {
  const query = useQuery({
    queryKey: scriptKeys.draw(scenarioId),
    queryFn: ({ signal }) => getScriptGraph(scenarioId, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  if (query.isPending) return <Loading label="正在读取剧本图…" />
  if (query.isError)
    return (
      <div role="alert">
        剧本图读取失败
        <Button variant="link" onClick={() => void query.refetch()}>
          重试剧本图
        </Button>
      </div>
    )
  return (
    <ReactFlowProvider>
      <CanvasSession
        key={String(scenarioId)}
        scenarioId={scenarioId}
        initial={query.data}
      />
    </ReactFlowProvider>
  )
}
function CanvasSession({
  scenarioId,
  initial,
}: {
  scenarioId: BlueId
  initial: ScriptGraph
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(
    initial.nodes,
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const [extras, setExtras] = useState(initial)
  const [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false),
    [clear, setClear] = useState(false),
    [target, setTarget] = useState<ScriptTarget | null>(null)
  const [menu, setMenu] = useState<{
      target: ScriptTarget
      x: number
      y: number
    } | null>(null),
    [missing, setMissing] = useState(false)
  const signalForPage = usePageSignal(),
    { screenToFlowPosition } = useReactFlow()
  const busy = useRef(false)
  const graph = useMemo(
    () => ({ ...extras, nodes, edges }) as ScriptGraph,
    [extras, nodes, edges],
  )
  const latest = useRef(graph)
  latest.current = graph
  const adopt = (value: ScriptGraph) => {
    setNodes((previous) =>
      value.nodes.map((node) => {
        const measured = previous.find((item) => item.id === node.id)?.measured
        return measured && !node.measured ? { ...node, measured } : node
      }),
    )
    setEdges(value.edges)
    setExtras(value)
    setDirty(false)
    setMenu(null)
  }
  const persist = async (value: ScriptGraph, report = true) => {
    if (busy.current) throw new ApiError('business', '请等待剧本保存完成')
    const signal = signalForPage()
    busy.current = true
    setSaving(true)
    try {
      const result = await saveScriptGraph(scenarioId, value, signal)
      if (signal.aborted) return
      adopt(result)
      const refreshed = await getScriptGraph(scenarioId, signal)
      if (signal.aborted) return
      adopt(refreshed)
      toast.success('剧本保存成功')
    } catch (error) {
      if (!signal.aborted) {
        setDirty(true)
        if (report) blueError(error)
        else throw error
      }
    } finally {
      busy.current = false
      if (!signal.aborted) setSaving(false)
    }
  }
  const remove = (nodeIds: string[], edgeIds: string[], save: boolean) => {
    const current = latest.current
    const next = {
      ...current,
      nodes: current.nodes.filter((n) => !nodeIds.includes(n.id)),
      edges: current.edges.filter(
        (e) =>
          !edgeIds.includes(e.id) &&
          !nodeIds.includes(e.source) &&
          !nodeIds.includes(e.target),
      ),
    }
    setNodes(next.nodes)
    setEdges(next.edges)
    setDirty(true)
    setMenu(null)
    if (save) void persist(next)
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !['Delete', 'Backspace'].includes(event.key) ||
        target ||
        clear ||
        missing ||
        busy.current
      )
        return
      const element = event.target
      if (
        element instanceof HTMLElement &&
        element.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"],[role="alertdialog"]',
        )
      )
        return
      const current = latest.current
      const nodeIds = current.nodes.filter((n) => n.selected).map((n) => n.id),
        edgeIds = current.edges.filter((e) => e.selected).map((e) => e.id)
      if (!nodeIds.length && !edgeIds.length) return
      event.preventDefault()
      remove(nodeIds, edgeIds, true)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  const openConfig = (selected: ScriptTarget) => {
    setMenu(null)
    if (selected.kind === 'node' && selected.node.data.type === 7) {
      setMissing(true)
      return
    }
    const id =
      selected.kind === 'node' ? selected.node.data.id : selected.edge.data?.id
    if (id == null || id === '') {
      toast.error('请先保存剧本以获取配置标识')
      return
    }
    setTarget(selected)
  }
  const connect = (connection: Connection) => {
    if (busy.current) return
    const source = nodes.find((n) => n.id === connection.source),
      dest = nodes.find((n) => n.id === connection.target)
    const branch =
      source?.data.type === 3 && Number(connection.sourceHandle) > 2
    const step =
      branch ||
      (source?.data.type === 4 &&
        dest?.data.type === 4 &&
        ['3', '4'].includes(connection.sourceHandle ?? '') &&
        ['5', '6'].includes(connection.targetHandle ?? ''))
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          type: step ? 'step' : 'straight',
          animated: true,
          label: source?.data.type === 3 ? (branch ? '失败' : '成功') : '',
          style: { stroke: '#1677ff' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15 },
        },
        current,
      ),
    )
    setDirty(true)
  }
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <LoadingButton loading={saving} onClick={() => void persist(graph)}>
          保存剧本
        </LoadingButton>
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => setClear(true)}
        >
          清除剧本
        </Button>
        {dirty && <span role="status">有未保存的剧本修改</span>}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="编排形状">
        {shapes.map((shape) => (
          <div
            key={shape.type}
            role="button"
            tabIndex={0}
            draggable={!saving}
            aria-label={`拖入${shape.name}`}
            className="cursor-grab rounded border px-3 py-2 text-sm"
            onDragStart={(event) => {
              event.dataTransfer.setData(
                'application/blue-script',
                String(shape.type),
              )
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            {shape.name}
          </div>
        ))}
      </div>
      <div
        className="h-[540px] rounded border"
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => {
          event.preventDefault()
          if (busy.current) return
          const shape = shapes.find(
            (s) =>
              s.type ===
              Number(event.dataTransfer.getData('application/blue-script')),
          )
          if (!shape) return
          const node: CanvasNode = {
            id: `shape-${shape.type}-${crypto.randomUUID()}`,
            type: 'customNode',
            position: screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }),
            data: {
              id: '',
              type: shape.type,
              name: shape.name,
              style: { ...shape.style },
            },
          }
          const next = { ...graph, nodes: [...nodes, node] }
          setNodes(next.nodes)
          setDirty(true)
          void persist(next)
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => {
            onNodesChange(changes)
            if (changes.some((change) => change.type === 'position'))
              setDirty(true)
          }}
          onEdgesChange={onEdgesChange}
          onConnect={connect}
          nodesDraggable={!saving}
          nodesConnectable={!saving}
          elementsSelectable={!saving}
          deleteKeyCode={null}
          selectionOnDrag
          panOnDrag={false}
          panActivationKeyCode="Alt"
          selectionMode={SelectionMode.Partial}
          connectionRadius={20}
          fitView
          minZoom={0.17}
          maxZoom={1.2}
          onPaneClick={() => setMenu(null)}
          onNodeContextMenu={(event, node) => {
            event.preventDefault()
            if (!saving)
              setMenu({
                target: { kind: 'node', node },
                x: event.clientX,
                y: event.clientY,
              })
          }}
          onEdgeContextMenu={(event, edge) => {
            event.preventDefault()
            if (!saving)
              setMenu({
                target: { kind: 'edge', edge: edge as ScriptEdge },
                x: event.clientX,
                y: event.clientY,
              })
          }}
        >
          <MiniMap zoomable pannable />
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {menu && (
        <div
          className="fixed z-40 grid gap-1 rounded border bg-popover p-2 shadow-lg"
          style={{
            left: Math.min(menu.x, window.innerWidth - 180),
            top: Math.min(menu.y, window.innerHeight - 120),
          }}
        >
          {(menu.target.kind === 'edge' ||
            [2, 3, 4, 7, 8].includes(menu.target.node.data.type)) && (
            <Button variant="ghost" onClick={() => openConfig(menu.target)}>
              配置
              {menu.target.kind === 'edge'
                ? '连线'
                : menu.target.node.data.type === 2
                  ? '数据分支'
                  : menu.target.node.data.type === 3
                    ? '判断'
                    : menu.target.node.data.type === 4
                      ? '能力动作'
                      : menu.target.node.data.type === 8
                        ? '模拟节点'
                        : '自定义指令'}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              if (menu.target.kind === 'node')
                remove([menu.target.node.id], [], true)
              else remove([], [menu.target.edge.id], false)
            }}
          >
            删除{menu.target.kind === 'node' ? '节点' : '连线'}
          </Button>
        </div>
      )}
      <AlertDialog open={clear} onOpenChange={setClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清除剧本</AlertDialogTitle>
            <AlertDialogDescription>
              确定清除全部节点和连线？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setClear(false)}
            >
              取消
            </Button>
            <LoadingButton
              loading={saving}
              onClick={() => {
                setClear(false)
                const next = { ...graph, nodes: [], edges: [] }
                setNodes([])
                setEdges([])
                setDirty(true)
                void persist(next)
              }}
            >
              确认清除
            </LoadingButton>
          </div>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={missing} onOpenChange={setMissing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>自定义指令暂不可用</AlertDialogTitle>
            <AlertDialogDescription>
              此节点的参数与脚本保存功能缺少有效接口，现有节点数据已保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Button onClick={() => setMissing(false)}>关闭</Button>
        </AlertDialogContent>
      </AlertDialog>
      {target && (
        <ScriptConfigDialog
          key={target.kind === 'node' ? target.node.id : target.edge.id}
          scenarioId={scenarioId}
          target={target}
          close={() => setTarget(null)}
          change={async (update) => {
            if (busy.current)
              throw new ApiError('business', '请等待剧本保存完成')
            const next = update(latest.current)
            setNodes(next.nodes)
            setEdges(next.edges)
            setDirty(true)
            await persist(next, false)
          }}
        />
      )}
    </section>
  )
}
