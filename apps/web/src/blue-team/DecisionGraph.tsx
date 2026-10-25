import { useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Handle,
  Position,
  type Node,
  type NodeProps,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { DecisionStep } from '../api/blue-decision'
import { Button } from '@workspace/ui/components/button'
type StepNode = Node<{ step: DecisionStep; label: string }, 'step'>
export function stepLabel(step: DecisionStep) {
  return step.kind === 1 ||
    step.kind === 3 ||
    step.sub_technology_name === '开始' ||
    step.sub_technology_name === '结束'
    ? (step.sub_technology_name ?? '')
    : Object.entries(step.params)
        .map(([key, value]) => `${key}:${String(value)}`)
        .join('\n')
}
function StepView({ data }: NodeProps<StepNode>) {
  return (
    <div
      className="flex min-h-16 w-40 items-center justify-center rounded border p-3 text-center whitespace-pre-line text-white"
      style={{
        background:
          data.step.kind === 1
            ? '#531dab'
            : data.step.kind === 3
              ? '#d0021b'
              : '#1677ff',
      }}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      {data.label}
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  )
}
const nodeTypes = { step: StepView }
export function DecisionTreeGraph({
  root,
  onDetail,
  onlyNext = false,
}: {
  root: DecisionStep
  onDetail?: (step: DecisionStep) => void
  onlyNext?: boolean
}) {
  const [menu, setMenu] = useState<{
    step: DecisionStep
    x: number
    y: number
  } | null>(null)
  const graph = useMemo(() => {
    const nodes: StepNode[] = [],
      edges: Edge[] = []
    let leaf = 0
    function walk(step: DecisionStep, depth: number, parent?: string): number {
      const id = String(nodes.length)
      const node: StepNode = {
        id,
        type: 'step',
        data: { step, label: stepLabel(step) },
        position: { x: 0, y: depth * 150 },
      }
      nodes.push(node)
      if (parent != null)
        edges.push({
          id: `${parent}-${id}`,
          source: parent,
          target: id,
          markerEnd: { type: MarkerType.ArrowClosed },
          label:
            nodes.find((n) => n.id === parent)?.data.step.sub_technology_name ??
            '',
          style: { stroke: '#C2C8D5' },
        })
      const children = onlyNext && depth === 1 ? [] : step.child
      const ys = children.map((child) => walk(child, depth + 1, id))
      const x = ys.length
        ? ys.reduce((a, b) => a + b, 0) / ys.length
        : leaf++ * 220
      node.position.x = x
      return x
    }
    walk(root, 0)
    return { nodes, edges }
  }, [root, onlyNext])
  return (
    <div
      aria-label={onlyNext ? '下一步指令图' : '决策树'}
      className="relative h-[440px] min-w-0 rounded border"
      onClick={() => setMenu(null)}
    >
      <ReactFlow
        key={onlyNext ? 'next' : 'tree'}
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.1}
        maxZoom={3}
        onNodeContextMenu={(event, node) => {
          event.preventDefault()
          if (onDetail)
            setMenu({
              step: node.data.step,
              x: Math.min(event.clientX, window.innerWidth - 150),
              y: Math.min(event.clientY, window.innerHeight - 70),
            })
        }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
      {menu && (
        <div
          className="fixed z-50 rounded border bg-popover p-1 shadow"
          style={{ left: menu.x, top: menu.y }}
        >
          <Button
            variant="ghost"
            onClick={() => {
              onDetail?.(menu.step)
              setMenu(null)
            }}
          >
            查看详情
          </Button>
        </div>
      )}
    </div>
  )
}

type RingNode = {
  step: DecisionStep
  label: string
  children: RingNode[]
  value: number
}
function ringNode(step: DecisionStep): RingNode {
  const children = step.child.filter((child) => child.kind !== 3).map(ringNode)
  return {
    step,
    label:
      step.kind === 2
        ? Object.entries(step.params)
            .map(([key, value]) => `${key}:${String(value)}`)
            .join('\n')
        : (step.sub_technology_name ?? ''),
    children,
    value: children.length
      ? children.reduce((sum, c) => sum + c.value, 0)
      : step.child.length || 1,
  }
}
function polar(radius: number, angle: number) {
  return [radius * Math.cos(angle), radius * Math.sin(angle)] as const
}
function sector(inner: number, outer: number, start: number, end: number) {
  const full = end - start >= Math.PI * 2 - 0.00001
  const stop = full ? end - 0.00001 : end
  const a = polar(outer, start),
    b = polar(outer, stop),
    c = polar(inner, stop),
    d = polar(inner, start)
  const large = stop - start > Math.PI ? 1 : 0
  return inner === 0
    ? `M 0 0 L ${a.join(' ')} A ${outer} ${outer} 0 ${large} 1 ${b.join(' ')} Z`
    : `M ${a.join(' ')} A ${outer} ${outer} 0 ${large} 1 ${b.join(' ')} L ${c.join(' ')} A ${inner} ${inner} 0 ${large} 0 ${d.join(' ')} Z`
}
export function DecisionSunburst({ root }: { root: DecisionStep }) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 }),
    [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const data = useMemo(() => ringNode(root), [root])
  const depth = (node: RingNode): number =>
    1 + Math.max(0, ...node.children.map(depth))
  const band = 200 / depth(data)
  const pieces: {
    node: RingNode
    level: number
    start: number
    end: number
  }[] = []
  function visit(node: RingNode, level: number, start: number, end: number) {
    pieces.push({ node, level, start, end })
    let angle = start
    for (const child of node.children) {
      const finish = angle + ((end - start) * child.value) / node.value
      visit(child, level + 1, angle, finish)
      angle = finish
    }
  }
  visit(data, 0, -Math.PI / 2, Math.PI * 1.5)
  return (
    <svg
      role="img"
      aria-label="决策环层次图"
      viewBox="-250 -250 500 500"
      className="h-[440px] w-full touch-none rounded border"
      onWheel={(event) =>
        setTransform((v) => ({
          ...v,
          scale: Math.max(
            0.25,
            Math.min(4, v.scale * (event.deltaY < 0 ? 1.1 : 0.9)),
          ),
        }))
      }
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrag({ x: event.clientX, y: event.clientY })
      }}
      onPointerMove={(event) => {
        if (!drag) return
        const ratio = 500 / event.currentTarget.getBoundingClientRect().width
        setTransform((v) => ({
          ...v,
          x: v.x + (event.clientX - drag.x) * ratio,
          y: v.y + (event.clientY - drag.y) * ratio,
        }))
        setDrag({ x: event.clientX, y: event.clientY })
      }}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
    >
      <g
        transform={`translate(${transform.x} ${transform.y}) scale(${transform.scale})`}
      >
        {pieces.map(({ node, level, start, end }, index) => {
          const mid = (start + end) / 2,
            [x, y] = polar((level + 0.5) * band, mid)
          let rotation = (mid * 180) / Math.PI + 90
          if (rotation > 90 && rotation < 270) rotation += 180
          return (
            <g key={index}>
              <path
                d={sector(level * band, (level + 1) * band, start, end)}
                fill={node.step.kind === 1 ? '#1890FF' : '#62DE25'}
                stroke="white"
                strokeWidth={1}
              >
                <title>
                  {node.label}：{node.value}
                </title>
              </path>
              <text
                x={level === 0 ? 0 : x}
                y={level === 0 ? 0 : y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                transform={
                  level === 0 ? undefined : `rotate(${rotation} ${x} ${y})`
                }
                className="pointer-events-none"
                fill="#222"
              >
                {node.label}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
