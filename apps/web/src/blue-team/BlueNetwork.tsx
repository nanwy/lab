import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  Controls,
  Handle,
  Position,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Loading } from '@workspace/ui/components/loading'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { toast } from '@workspace/ui/components/sonner'
import { getBlueNetwork, type NetworkNode } from '../api/blue-network'
import type { BlueId } from '../api/blue-team'
import { ResultJson } from './ControlRounds'
type NetworkFlowNode = Node<{ item: NetworkNode }, 'network'>
function NetworkNodeView({ data }: NodeProps<NetworkFlowNode>) {
  const item = data.item
  return (
    <div className="flex w-36 flex-col items-center gap-2">
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <svg
        width="50"
        height="50"
        viewBox="0 0 50 50"
        aria-hidden="true"
        className="text-blue-600"
      >
        {item.kind === 'ip' ? (
          <>
            <rect
              x="6"
              y="5"
              width="38"
              height="28"
              rx="2"
              fill="currentColor"
            />
            <path d="M25 33v8M15 43h20" stroke="currentColor" strokeWidth="3" />
            <rect x="10" y="9" width="30" height="19" fill="white" />
          </>
        ) : item.kind === 'switch' ? (
          <>
            <rect
              x="3"
              y="15"
              width="44"
              height="22"
              rx="3"
              fill="currentColor"
            />
            {[9, 17, 25, 33].map((x) => (
              <rect key={x} x={x} y="25" width="5" height="6" fill="white" />
            ))}
          </>
        ) : (
          <>
            <ellipse cx="25" cy="25" rx="23" ry="17" fill="currentColor" />
            <path
              d="M11 25h28M25 13v24M11 25l5-4M39 25l-5 4M25 13l-4 5M25 37l4-5"
              stroke="white"
              strokeWidth="2"
            />
          </>
        )}
      </svg>
      <span className="text-center text-sm">
        {item.kind === 'ip'
          ? item.id
          : item.kind === 'switch'
            ? '交换机'
            : '路由器'}
      </span>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  )
}
const nodeTypes = { network: NetworkNodeView }
export function BlueNetwork({
  taskId,
  blueId,
  roundId,
}: {
  taskId: BlueId
  blueId: BlueId
  roundId: BlueId
}) {
  return (
    <NetworkSession
      key={`${taskId}:${blueId}:${roundId}`}
      taskId={taskId}
      blueId={blueId}
      roundId={roundId}
    />
  )
}
function NetworkSession({
  taskId,
  blueId,
  roundId,
}: {
  taskId: BlueId
  blueId: BlueId
  roundId: BlueId
}) {
  const query = useQuery({
    queryKey: ['blue-network', String(taskId), String(blueId), String(roundId)],
    queryFn: ({ signal }) => getBlueNetwork(taskId, blueId, roundId, signal),
    retry: false,
    gcTime: 0,
    refetchOnReconnect: false,
  })
  const { refetch } = query

  useEffect(() => {
    const timer = setInterval(() => void refetch(), 60000)
    return () => clearInterval(timer)
  }, [refetch])
  const [detail, setDetail] = useState<unknown | undefined>(undefined)
  const graph = query.data?.graph
  const nodes: NetworkFlowNode[] =
    graph?.nodes.map((item, index) => ({
      id: item.id,
      type: 'network',
      data: { item },
      position: { x: (index % 3) * 240, y: Math.floor(index / 3) * 190 },
    })) ?? []
  if (query.isPending) return <Loading label="正在读取网络视图…" />
  if (query.isError)
    return (
      <p role="alert">
        网络视图读取失败
        <Button variant="link" onClick={() => void query.refetch()}>
          重试网络视图
        </Button>
      </p>
    )
  return (
    <section>
      {graph?.nodes.length ? (
        <div className="h-[520px] rounded border" aria-label="蓝军网络图">
          <ReactFlow
            nodes={nodes}
            edges={graph.edges.map((edge) => ({ ...edge, type: 'straight' }))}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            fitView
            minZoom={0.1}
            maxZoom={3}
            onNodeClick={(_, node) => {
              if (node.data.item.kind !== 'ip') return
              const value = query.data.input_ip_params_map[node.id] ?? {}
              if (JSON.stringify(value) === '{}') {
                toast.error('当前节点未采集到数据！')
                return
              }
              setDetail(value)
            }}
          >
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      ) : (
        <p>暂无阵地数据</p>
      )}
      <Dialog
        open={detail !== undefined}
        onOpenChange={(open) => {
          if (!open) setDetail(undefined)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>节点数据</DialogTitle>
          </DialogHeader>
          <ResultJson value={detail} />
        </DialogContent>
      </Dialog>
    </section>
  )
}
