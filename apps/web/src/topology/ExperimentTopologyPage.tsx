import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useBlocker } from '@tanstack/react-router'
import {
  Background,
  BaseEdge,
  Controls,
  ConnectionMode,
  Handle,
  Position,
  ReactFlow,
  useNodesState,
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
import {
  toX6Graph,
  type EditorGraph,
  type TopologyNodeData,
  type TopologyEdgeData,
} from './x6-adapter'

type FlowNode = Node<TopologyNodeData, 'topologyNode' | 'topologyGroup'>
type FlowEdge = Edge<TopologyEdgeData, 'topologyEdge'>
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
          isConnectable={false}
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
  const path = [
    `M ${sourceX} ${sourceY}`,
    ...(data?.vertices ?? []).map((point) => `L ${point.x} ${point.y}`),
    `L ${targetX} ${targetY}`,
  ].join(' ')
  const line = data?.style.line as Record<string, unknown> | undefined
  return (
    <BaseEdge
      path={path}
      style={{
        stroke: typeof line?.stroke === 'string' ? line.stroke : undefined,
        strokeWidth:
          typeof line?.strokeWidth === 'number' ? line.strokeWidth : undefined,
        strokeDasharray:
          typeof line?.strokeDasharray === 'string' ||
          typeof line?.strokeDasharray === 'number'
            ? String(line.strokeDasharray)
            : undefined,
      }}
    />
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
  const [nodes, , changeNodes] = useNodesState<FlowNode>(initial.nodes)
  const edges: FlowEdge[] = initial.edges
  const draft: EditorGraph = {
    ...initial,
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
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  useEffect(
    () => () => {
      saveController.current?.abort()
    },
    [],
  )

  async function save() {
    if (!editable || saving || !dirty) return
    const controller = new AbortController()
    saveController.current = controller
    setSaving(true)
    try {
      await saveExperimentTopology(id, draft, controller.signal)
      if (controller.signal.aborted) return
      // 保存基线属于本次提交的快照；请求期间的新拖动继续保持 dirty。
      setBaseline(serialized)
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
                : dirty
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
      <div
        className="h-[32rem] min-w-0 border bg-white"
        aria-label="场景拓扑画布"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          connectionMode={ConnectionMode.Loose}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
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
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          fitView
          minZoom={0.2}
          maxZoom={2}
        >
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
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
              继续离开会丢失尚未保存的节点位置。
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
