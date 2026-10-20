import type { X6Cell } from './x6-adapter'

type Rect = { x: number; y: number; width: number; height: number }
/** 在原图的绝对坐标系用分离轴检测实际旋转矩形，避免角落框选误中或漏中。 */
export function intersectsRotatedNode(
  rect: Rect,
  cell: X6Cell,
  size: { width: number; height: number },
) {
  const position = cell.position ?? { x: cell.x!, y: cell.y! }
  const width = cell.size?.width ?? cell.width ?? size.width,
    height = cell.size?.height ?? cell.height ?? size.height
  const angle = ((cell.angle ?? 0) * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle)
  const center = { x: position.x + width / 2, y: position.y + height / 2 }
  const node = [
    [-width / 2, -height / 2],
    [width / 2, -height / 2],
    [width / 2, height / 2],
    [-width / 2, height / 2],
  ].map(([x, y]) => ({
    x: center.x + x! * cos - y! * sin,
    y: center.y + x! * sin + y! * cos,
  }))
  const selection = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
  return [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: cos, y: sin },
    { x: -sin, y: cos },
  ].every((axis) => {
    const a = node.map((p) => p.x * axis.x + p.y * axis.y),
      b = selection.map((p) => p.x * axis.x + p.y * axis.y)
    return Math.max(...a) >= Math.min(...b) && Math.min(...a) <= Math.max(...b)
  })
}
