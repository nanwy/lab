import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type EdgeProps,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import { useEffect, useMemo, useState } from 'react'

import { useTopologyEditorInteraction } from './editor-store'
import { deterministicX6Graph } from './sample'
import {
  fromX6Graph,
  toX6Graph,
  type EditorGraph,
  type TopologyEdge,
  type TopologyEdgeData,
  type TopologyNode,
  type TopologyNodeData,
} from './x6-adapter'

type FlowNode = Node<TopologyNodeData, 'topologyNode' | 'topologyGroup'>
type FlowEdge = Edge<TopologyEdgeData, 'topologyEdge'>

function handlePosition(group?: string) {
  if (group === 'left') return Position.Left
  if (group === 'top') return Position.Top
  if (group === 'bottom') return Position.Bottom
  return Position.Right
}

function DeviceNode({ data }: NodeProps<FlowNode>) {
  const selectNode = useTopologyEditorInteraction((state) => state.selectNode)
  const selectedNodeId = useTopologyEditorInteraction(
    (state) => state.selectedNodeId,
  )

  return (
    <div
      className={
        selectedNodeId === data.raw.id
          ? 'topology-node topology-node-selected'
          : 'topology-node'
      }
      style={{ transform: `rotate(${data.rotation}deg)` }}
    >
      {data.ports.map((port) => (
        <Handle
          id={port.id}
          key={port.id}
          type={port.group === 'left' ? 'target' : 'source'}
          position={handlePosition(port.group)}
        />
      ))}
      <button
        type="button"
        className="topology-node-button"
        aria-label={`编辑 ${data.label}`}
        onClick={() => selectNode(data.raw.id)}
      >
        <strong>{data.label}</strong>
        <span>{data.deviceId}</span>
      </button>
    </div>
  )
}

function GroupNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className="topology-group">
      <strong>{data.label}</strong>
      <span>分组容器</span>
    </div>
  )
}

function TopologyEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
}: EdgeProps<FlowEdge>) {
  const bends = data?.vertices ?? []
  const path = [
    `M ${sourceX} ${sourceY}`,
    ...bends.map((point) => `L ${point.x} ${point.y}`),
    `L ${targetX} ${targetY}`,
  ].join(' ')

  return <BaseEdge path={path} markerEnd={markerEnd} />
}

const nodeTypes = {
  topologyNode: DeviceNode,
  topologyGroup: GroupNode,
}

const edgeTypes = {
  topologyEdge: TopologyEdgeComponent,
}

function asFlowNodes(nodes: TopologyNode[]): FlowNode[] {
  return nodes.map((node) => ({ ...node }))
}

function asFlowEdges(edges: TopologyEdge[]): FlowEdge[] {
  return edges.map((edge) => ({ ...edge }))
}

function asTopologyEdges(edges: FlowEdge[]): TopologyEdge[] {
  return edges.map((edge) => {
    if (!edge.data) throw new Error(`Topology edge ${edge.id} is missing adapter data`)
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? undefined,
      targetHandle: edge.targetHandle ?? undefined,
      type: 'topologyEdge',
      data: edge.data,
    }
  })
}

function asTopologyNodes(nodes: FlowNode[]): TopologyNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    parentId: node.parentId,
    extent: node.extent === 'parent' ? 'parent' : undefined,
    width: node.width,
    height: node.height,
    zIndex: node.zIndex,
    data: node.data,
  }))
}

export function TopologyPage() {
  const initial = useMemo(() => fromX6Graph(deterministicX6Graph), [])
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(
    asFlowNodes(initial.nodes),
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(
    asFlowEdges(initial.edges),
  )
  const [adapterContext, setAdapterContext] = useState(() => ({
    issues: initial.issues,
    passthroughCells: initial.passthroughCells,
    rawGraph: initial.rawGraph,
  }))
  const [draftLabel, setDraftLabel] = useState('')
  const selectedNodeId = useTopologyEditorInteraction(
    (state) => state.selectedNodeId,
  )
  const notice = useTopologyEditorInteraction((state) => state.notice)
  const setNotice = useTopologyEditorInteraction((state) => state.setNotice)
  const resetInteraction = useTopologyEditorInteraction((state) => state.reset)

  const selectedNode = nodes.find((node) => node.id === selectedNodeId)

  useEffect(() => {
    resetInteraction()
  }, [resetInteraction])

  useEffect(() => {
    setDraftLabel(selectedNode?.data.label ?? '')
  }, [selectedNode?.data.label])

  function applyLabel() {
    if (!selectedNodeId || !draftLabel.trim()) return
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, label: draftLabel.trim() } }
          : node,
      ),
    )
    setNotice('节点名称已应用，尚未写回 X6 格式。')
  }

  function saveAndReopen() {
    const editor: EditorGraph = {
      nodes: asTopologyNodes(nodes),
      edges: asTopologyEdges(edges),
      ...adapterContext,
    }
    const reopened = fromX6Graph(toX6Graph(editor))
    setNodes(asFlowNodes(reopened.nodes))
    setEdges(asFlowEdges(reopened.edges))
    setAdapterContext({
      issues: reopened.issues,
      passthroughCells: reopened.passthroughCells,
      rawGraph: reopened.rawGraph,
    })
    setNotice('已从 X6 格式重新打开；未知字段与未支持图元仍被保留。')
  }

  return (
    <section className="topology-page">
      <p className="eyebrow">Topology compatibility preview</p>
      <h1>拓扑适配验证</h1>
      <p>
        该确定性样本只验证 X6 数据适配边界与 React Flow
        自定义节点，不代表正式拓扑业务已经完成。
      </p>

      {adapterContext.issues.length > 0 ? (
        <div className="compatibility-report" role="status">
          <strong>兼容性报告</strong>
          <ul>
            {adapterContext.issues.map((issue) => (
              <li key={`${issue.code}-${issue.cellId}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="topology-workspace">
        <div className="topology-canvas" aria-label="拓扑画布">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            minZoom={0.5}
            maxZoom={1.5}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="topology-inspector" aria-label="节点检查器">
          <h2>样本编辑</h2>
          {selectedNode ? (
            <label className="field">
              <span>节点名称</span>
              <input
                name="node-label"
                value={draftLabel}
                onChange={(event) => setDraftLabel(event.target.value)}
              />
              <button type="button" onClick={applyLabel}>
                应用名称
              </button>
            </label>
          ) : (
            <p>选择设备节点后可修改名称。</p>
          )}
          <button type="button" onClick={saveAndReopen}>
            保存并重开
          </button>
          {notice ? <p className="editor-notice">{notice}</p> : null}
        </aside>
      </div>
    </section>
  )
}
