import { useEffect, useMemo, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { use as registerCharts } from 'echarts/core'
import { GraphChart, PieChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { Loading } from '@workspace/ui/components/loading'
import {
  getTaskSituationLogs,
  getTaskSituationNetwork,
  getTaskSituationRisk,
  type TaskSituationLog,
} from '../api/task-situation'
import { LogEntries, riskRingOption } from './panels'
import { blueError } from '../blue-team/feedback'
import { Chart, Clock, type ChartOption, type SituationParams } from './shared'
import './situation.css'

registerCharts([
  GraphChart,
  PieChart,
  LegendComponent,
  TooltipComponent,
  SVGRenderer,
])
function QueryState({ query }: { query: UseQueryResult }) {
  useEffect(() => {
    if (query.error) blueError(query.error)
  }, [query.error])
  if (query.isPending) return <Loading label="正在读取态势…" />
  if (query.isError) return <p role="alert">态势读取失败</p>
  return null
}

function Logs({
  title,
  query,
}: {
  title: string
  query: UseQueryResult<TaskSituationLog[]>
}) {
  return (
    <section className="situation-panel" aria-label={title}>
      <h2>{title}</h2>
      <div className="situation-log-viewport">
        <QueryState query={query} />
        {query.isSuccess ? (
          query.data.length ? (
            <LogEntries logs={query.data} />
          ) : (
            <p>暂无日志</p>
          )
        ) : null}
      </div>
    </section>
  )
}

const icon = (body: string) =>
  `image://data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">${body}</svg>`)}`
// 沿用现有网络图的主机、交换机和路由器图元形状。
const symbols = {
  ip: icon(
    '<rect x="6" y="5" width="38" height="28" rx="2" fill="#1f93ff"/><rect x="10" y="9" width="30" height="19" fill="#d6edff"/><path d="M25 33v8M15 43h20" stroke="#1f93ff" stroke-width="3"/>',
  ),
  switch: icon(
    '<rect x="3" y="15" width="44" height="22" rx="3" fill="#1f93ff"/><path d="M9 28h5m3 0h5m3 0h5m3 0h5" stroke="#d6edff" stroke-width="6"/>',
  ),
  router: icon(
    '<ellipse cx="25" cy="25" rx="23" ry="17" fill="#1f93ff"/><path d="M11 25h28M25 13v24M11 25l5-4M39 25l-5 4M25 13l-4 5M25 37l4-5" stroke="#d6edff" stroke-width="2"/>',
  ),
}

function BlueSituationSession({ params }: { params: SituationParams }) {
  const [collapsed, setCollapsed] = useState(false)
  const context = [
    params.secne_id,
    params.resource_type,
    params.resource_id,
    params.test_task_id,
    params.scene_type,
  ]
  const options = {
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  } as const
  const task = params.test_task_id
  const network = useQuery({
    ...options,
    queryKey: ['task-situation', ...context, 'network'],
    queryFn: ({ signal }) => getTaskSituationNetwork(task, signal),
  })
  const risk = useQuery({
    ...options,
    queryKey: ['task-situation', ...context, 'risk'],
    queryFn: ({ signal }) => getTaskSituationRisk(task, signal),
  })
  const attack = useQuery({
    ...options,
    queryKey: ['task-situation', ...context, 'log', 1],
    queryFn: ({ signal }) => getTaskSituationLogs(task, 1, signal),
  })
  const execution = useQuery({
    ...options,
    queryKey: ['task-situation', ...context, 'log', 2],
    queryFn: ({ signal }) => getTaskSituationLogs(task, 2, signal),
  })
  const graphOption = useMemo<ChartOption>(
    () => ({
      tooltip: { show: false },
      animationDurationUpdate: 1500,
      animationEasingUpdate: 'quinticInOut',
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          force: { repulsion: 1000 },
          symbolSize: 50,
          draggable: true,
          data:
            network.data?.nodes.map((node) => ({
              id: node.id,
              name: node.id,
              symbol: symbols[node.kind],
              label: {
                show: true,
                position: 'bottom',
                color: '#d6edff',
                formatter:
                  node.kind === 'ip'
                    ? node.id
                    : node.kind === 'switch'
                      ? '交换机'
                      : '路由器',
              },
            })) ?? [],
          links: network.data?.edges ?? [],
          lineStyle: { color: '#849fba' },
        },
      ],
    }),
    [network.data],
  )
  const riskOption = useMemo(() => riskRingOption(risk.data), [risk.data])
  const counts = network.data?.nodes.reduce(
    (result, node) => {
      result[node.kind]++
      return result
    },
    { ip: 0, switch: 0, router: 0 },
  )
  return (
    <main className="blue-situation">
      <header className="situation-header">
        <h1>蓝军态势</h1>
        <Clock />
      </header>
      <div className="situation-counts">
        {(
          [
            ['路由器数量', counts?.router],
            ['交换机数量', counts?.switch],
            ['局域网数量', counts?.switch],
            ['节点数量', counts?.ip],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <b aria-label={label}>{value ?? 0}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="situation-network">
        <QueryState query={network} />
        {network.isSuccess ? (
          network.data.nodes.length ? (
            <Chart label="蓝军网络拓扑" option={graphOption} />
          ) : (
            <p className="situation-empty">暂无阵地数据</p>
          )
        ) : null}
      </div>
      <footer
        className={`situation-bottom${collapsed ? ' situation-bottom-collapsed' : ''}`}
      >
        <button
          className="situation-toggle"
          type="button"
          aria-label={collapsed ? '展开底部面板' : '收起底部面板'}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? '⌃' : '⌄'}
        </button>
        <div className="situation-bottom-content" hidden={collapsed}>
          <Logs title="执行日志" query={execution} />
          <Logs title="攻击日志" query={attack} />
          <section className="situation-panel" aria-label="蓝军发现风险与漏洞">
            <h2>蓝军发现风险与漏洞</h2>
            <QueryState query={risk} />
            {risk.isSuccess ? (
              Object.keys(risk.data).length ? (
                <Chart label="蓝军发现风险与漏洞" option={riskOption} />
              ) : (
                <p>暂无风险与漏洞</p>
              )
            ) : null}
          </section>
        </div>
      </footer>
    </main>
  )
}

export function BlueSituationPage(params: SituationParams) {
  if (!Number(params.test_task_id))
    return <p role="alert">独立态势缺少有效测试任务标识</p>
  return <BlueSituationSession key={JSON.stringify(params)} params={params} />
}
