import { useEffect, useRef, useState } from 'react'
import { init, type ComposeOption } from 'echarts/core'
import type { GraphSeriesOption, PieSeriesOption } from 'echarts/charts'
import type {
  LegendComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
export type ChartOption = ComposeOption<
  | GraphSeriesOption
  | PieSeriesOption
  | LegendComponentOption
  | TooltipComponentOption
>

// 三个原独立路径共用参数拼写；各页只消费原组件实际使用的参数。
export type SituationParams = {
  secne_id: string
  resource_type: string
  resource_id: string
  test_task_id: string
  scene_type: string
}

export function Chart({
  label,
  option,
}: {
  label: string
  option: ChartOption
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const chart = init(element, undefined, { renderer: 'svg' })
    chart.setOption(option)
    const resize = new ResizeObserver(() => chart.resize())
    resize.observe(element)
    return () => {
      resize.disconnect()
      chart.dispose()
    }
  }, [option])
  return (
    <div className="situation-chart" role="img" aria-label={label} ref={ref} />
  )
}

export function Clock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  const pad = (v: number) => String(v).padStart(2, '0')
  return (
    <time className="situation-clock">{`${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`}</time>
  )
}
