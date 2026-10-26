import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from '@xyflow/react'
import { useQuery } from '@tanstack/react-query'
import { Loading } from '@workspace/ui/components/loading'
import { Button } from '@workspace/ui/components/button'
import { getScriptGraph, type ScriptNodeData } from '../api/blue-script'
import type { BlueId } from '../api/blue-team'
import { ScriptNodeView } from './ScriptCanvas'
const nodeTypes = { customNode: ScriptNodeView }
export function ExecutionGraph({
  scenarioId,
  current,
}: {
  scenarioId: BlueId
  current?: BlueId | null
}) {
  const graph = useQuery({
    queryKey: ['execution-script', String(scenarioId)],
    queryFn: ({ signal }) => getScriptGraph(scenarioId, signal),
    retry: false,
    gcTime: 0,
  })
  if (graph.isPending) return <Loading label="正在读取执行图…" />
  if (graph.isError)
    return (
      <p role="alert">
        执行图读取失败
        <Button variant="link" onClick={() => void graph.refetch()}>
          重试执行图
        </Button>
      </p>
    )
  const nodes: Node<ScriptNodeData>[] = graph.data.nodes.map((node) => ({
    ...node,
    ariaLabel: node.data.name,
    domAttributes: { 'aria-current': node.id === String(current) },
    style:
      node.id === String(current)
        ? { outline: '3px dashed #1677ff', outlineOffset: 4 }
        : undefined,
  }))
  const edges: Edge[] = graph.data.edges.map((edge) => ({
    ...edge,
    animated: edge.target === String(current),
  }))
  return (
    <div className="h-[440px] rounded border" aria-label="只读执行剧本图">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        minZoom={0.17}
        maxZoom={1.2}
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
