import { createContext, useContext, useEffect, useRef } from 'react'
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import type { TopologyNodeData } from './x6-adapter'
import { asObject } from '../api/topology-resources'
import { Button } from '@workspace/ui/components/button'

export const CanvasNodeContext = createContext<{
  editable: boolean
  onLabel: (id: string, label: string) => void
  onTransform: (
    id: string,
    value: { rotation?: number; width?: number; height?: number },
  ) => void
}>({
  editable: false,
  onLabel: () => {},
  onTransform: () => {},
})

export function CanvasNode({
  id,
  data,
  type,
  selected,
  width = 80,
  height = 80,
}: NodeProps<Node<TopologyNodeData>>) {
  const { editable, onLabel, onTransform } = useContext(CanvasNodeContext)
  const flow = useReactFlow()
  const update = useUpdateNodeInternals()
  const activePointer = useRef<(() => void) | null>(null)
  useEffect(() => () => activePointer.current?.(), [])
  useEffect(() => {
    if (!editable) activePointer.current?.()
  }, [editable])
  const angle = (data.rotation * Math.PI) / 180
  const group = type === 'topologyGroup'
  const text = data.raw.shape === 'custom-react-text'
  const resize = group || asObject(data.raw.data?.nodeInfo).type === 3
  useEffect(() => {
    update(id)
  }, [id, data.rotation, width, height, update])
  function pointer(
    event: React.PointerEvent<HTMLButtonElement>,
    mode: 'rotate' | 'resize',
  ) {
    if (!editable) return
    activePointer.current?.()
    event.preventDefault()
    event.stopPropagation()
    const button = event.currentTarget
    button.setPointerCapture(event.pointerId)
    const box = button.closest('.react-flow__node')!.getBoundingClientRect()
    const center = flow.screenToFlowPosition({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    })
    const start = flow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    })
    const initialAngle = Math.atan2(start.y - center.y, start.x - center.x)
    const move = (e: PointerEvent) => {
      const point = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      if (mode === 'rotate')
        onTransform(id, {
          rotation:
            (data.rotation +
              ((Math.atan2(point.y - center.y, point.x - center.x) -
                initialAngle) *
                180) /
                Math.PI +
              360) %
            360,
        })
      else {
        const dx = point.x - start.x,
          dy = point.y - start.y
        onTransform(id, {
          width: Math.max(
            30,
            width + 2 * (dx * Math.cos(angle) + dy * Math.sin(angle)),
          ),
          height: Math.max(
            30,
            height + 2 * (-dx * Math.sin(angle) + dy * Math.cos(angle)),
          ),
        })
      }
    }
    const end = () => {
      button.removeEventListener('pointermove', move)
      button.removeEventListener('pointerup', end)
      button.removeEventListener('pointercancel', end)
      button.removeEventListener('lostpointercapture', end)
      activePointer.current = null
    }
    button.addEventListener('pointermove', move)
    button.addEventListener('pointerup', end)
    button.addEventListener('pointercancel', end)
    button.addEventListener('lostpointercapture', end)
    activePointer.current = end
  }
  const body = asObject(data.style.body)
  return (
    <div className="relative size-full">
      <div
        className={group ? 'topology-group' : 'topology-node'}
        style={{
          transform: `rotate(${data.rotation}deg)`,
          outline: selected ? '2px solid #2563eb' : undefined,
          background: typeof body.fill === 'string' ? body.fill : undefined,
          borderColor:
            typeof body.stroke === 'string' ? body.stroke : undefined,
        }}
      >
        {text ? (
          <textarea
            key={data.label}
            className="nodrag nowheel size-full resize-none bg-transparent p-2"
            aria-label={`文本 ${data.label}`}
            defaultValue={data.label}
            readOnly={!editable}
            onBlur={(event) => onLabel(id, event.target.value)}
          />
        ) : (
          <>
            {typeof data.raw.data?.logo === 'string' && data.raw.data.logo ? (
              <img
                src={data.raw.data.logo}
                alt=""
                className="mx-auto size-8 object-contain"
              />
            ) : null}
            <strong>{data.label}</strong>
          </>
        )}
      </div>
      {data.ports.map((port) => {
        const x =
          port.group === 'left' ? 0 : port.group === 'right' ? width : width / 2
        const y =
          port.group === 'top'
            ? 0
            : port.group === 'bottom'
              ? height
              : height / 2
        const rx =
          (x - width / 2) * Math.cos(angle) -
          (y - height / 2) * Math.sin(angle) +
          width / 2
        const ry =
          (x - width / 2) * Math.sin(angle) +
          (y - height / 2) * Math.cos(angle) +
          height / 2
        const direction =
          ((Math.atan2(ry - height / 2, rx - width / 2) * 180) / Math.PI +
            360) %
          360
        const position =
          direction < 45 || direction >= 315
            ? Position.Right
            : direction < 135
              ? Position.Bottom
              : direction < 225
                ? Position.Left
                : Position.Top
        return (
          <Handle
            id={port.id}
            key={port.id}
            type="source"
            position={position}
            style={{
              left: rx,
              top: ry,
              right: 'auto',
              bottom: 'auto',
              transform: 'translate(-50%,-50%)',
            }}
          />
        )
      })}
      {!data.ports.length ? (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={false}
          style={{ visibility: 'hidden' }}
        />
      ) : null}
      {editable && selected ? (
        <>
          <Button
            variant="outline"
            type="button"
            className="nodrag nopan absolute top-1 right-1 size-6 cursor-grab rounded-full border bg-white p-0 text-xs"
            aria-label={`旋转 ${data.label}`}
            onPointerDown={(event) => pointer(event, 'rotate')}
          >
            ↻
          </Button>
          {resize ? (
            <Button
              variant="outline"
              type="button"
              className="nodrag nopan absolute size-3 cursor-nwse-resize rounded-none border border-blue-600 bg-white p-0"
              aria-label={`调整尺寸 ${data.label}`}
              style={{
                left:
                  width / 2 +
                  (width / 2) * Math.cos(angle) -
                  (height / 2) * Math.sin(angle) -
                  6,
                top:
                  height / 2 +
                  (width / 2) * Math.sin(angle) +
                  (height / 2) * Math.cos(angle) -
                  6,
              }}
              onPointerDown={(event) => pointer(event, 'resize')}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
