import type { TaskSituationLog } from '../api/task-situation'
import type { ChartOption } from './shared'

export function LogEntries({ logs }: { logs: TaskSituationLog[] }) {
  return (
    <ul
      className={
        logs.length > 5
          ? 'situation-log-list situation-log-scroll'
          : 'situation-log-list'
      }
    >
      {logs.map((log, index) => (
        <li key={index} title={log.message ?? undefined}>
          <span>{log.create_time}</span>
          {log.message}
        </li>
      ))}
    </ul>
  )
}

export function riskRingOption(
  risk: Record<string, number | null> | undefined,
): ChartOption {
  return {
    color: [
      '#1F93FF',
      '#F66603',
      '#EF3546',
      '#F6EB52',
      '#0246D3',
      '#7D3FBB',
      '#01A041',
      '#FF5171',
      '#00CED1',
      '#0DC673',
    ],
    tooltip: { trigger: 'item' },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      icon: 'rect',
      right: 10,
      top: 10,
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 20,
      textStyle: { color: '#849fba', fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        radius: ['30%', '60%'],
        center: ['35%', '50%'],
        label: { show: false },
        labelLine: { show: false },
        data: Object.entries(risk ?? {}).map(([name, value]) => ({
          name,
          value: value ?? undefined,
        })),
      },
    ],
  }
}
