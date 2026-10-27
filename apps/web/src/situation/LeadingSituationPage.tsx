import { useEffect, useMemo, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { use as registerCharts } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { Loading } from '@workspace/ui/components/loading'
import { getSituationTopology } from '../api/situation-topology'
import {
  getTaskSituationLogs,
  getTaskSituationRisk,
  type TaskSituationLog,
} from '../api/task-situation'
import { blueError } from '../blue-team/feedback'
import { Chart, Clock, type SituationParams } from './shared'
import { LogEntries, riskRingOption } from './panels'
import { Topology3D } from './Topology3D'
import './situation.css'

registerCharts([PieChart, LegendComponent, TooltipComponent, SVGRenderer])
const fixedDistribution = riskRingOption({
  交换机: 2,
  路由器: 1,
  局域网: 2,
  防火墙: 1,
  节点: 5,
})
const readOptions = {
  retry: false,
  gcTime: 0,
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const
function ReadState({ query }: { query: UseQueryResult }) {
  if (query.isPending && query.fetchStatus !== 'idle')
    return <Loading label="正在读取态势…" />
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
        <ReadState query={query} />
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
function LeadingSession({ params }: { params: SituationParams }) {
  const [bottom, setBottom] = useState(false)
  const [left, setLeft] = useState(false)
  const [right, setRight] = useState(false)
  const context = [
    params.secne_id,
    params.resource_type,
    params.resource_id,
    params.test_task_id,
    params.scene_type,
  ]
  const topology = useQuery({
    ...readOptions,
    queryKey: ['leading-situation', ...context, 'topology'],
    queryFn: ({ signal }) =>
      getSituationTopology(
        params.secne_id,
        params.resource_type,
        params.scene_type,
        signal,
      ),
    enabled: Boolean(params.secne_id && params.resource_type),
  })
  const risk = useQuery({
    ...readOptions,
    queryKey: ['leading-situation', ...context, 'risk'],
    queryFn: ({ signal }) => getTaskSituationRisk(params.test_task_id, signal),
    enabled: Boolean(Number(params.test_task_id)),
  })
  const attack = useQuery({
    ...readOptions,
    queryKey: ['leading-situation', ...context, 'log', 1],
    queryFn: ({ signal }) =>
      getTaskSituationLogs(params.test_task_id, 1, signal),
    enabled: Boolean(Number(params.test_task_id)),
  })
  const execution = useQuery({
    ...readOptions,
    queryKey: ['leading-situation', ...context, 'log', 2],
    queryFn: ({ signal }) =>
      getTaskSituationLogs(params.test_task_id, 2, signal),
    enabled: Boolean(Number(params.test_task_id)),
  })
  // 两个原面板消费同一执行日志；每个请求错误仅在此处理一次。
  useEffect(() => {
    if (topology.error) blueError(topology.error)
  }, [topology.error])
  useEffect(() => {
    if (risk.error) blueError(risk.error)
  }, [risk.error])
  useEffect(() => {
    if (attack.error) blueError(attack.error)
  }, [attack.error])
  useEffect(() => {
    if (execution.error) blueError(execution.error)
  }, [execution.error])
  const riskOption = useMemo(() => riskRingOption(risk.data), [risk.data])
  return (
    <main className="blue-situation leading-situation">
      <header className="situation-header">
        <h1>导调态势</h1>
        <Clock />
      </header>
      <div className="situation-counts">
        {[
          '路由器数量',
          '交换机数量',
          '局域网数量',
          '防火墙数量',
          '节点数量',
        ].map((label) => (
          <div key={label}>
            <b aria-label={label}>0</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <ReadState query={topology} />
      {topology.isSuccess ? (
        <>
          <Topology3D graph={topology.data} label="导调3D拓扑" />
          {topology.data.nodes.length === 0 ? (
            <p className="situation-empty">暂无拓扑数据</p>
          ) : null}
        </>
      ) : null}
      <footer
        className={`situation-bottom leading-bottom${bottom ? ' situation-bottom-collapsed' : ''}`}
      >
        <button
          type="button"
          className="situation-toggle"
          aria-label={bottom ? '展开底部面板' : '收起底部面板'}
          aria-expanded={!bottom}
          onClick={() => setBottom((value) => !value)}
        >
          {bottom ? '⌃' : '⌄'}
        </button>
        <div className="situation-bottom-content" hidden={bottom}>
          <Logs title="事件日志" query={execution} />
          <Logs title="流量日志" query={attack} />
          <Logs title="蓝军攻击日志" query={execution} />
        </div>
      </footer>
      <aside className="leading-left">
        <div
          className={`leading-left-content${left ? ' leading-left-collapsed' : ''}`}
        >
          <div className="leading-left-panels" hidden={left}>
            {['事件分布', '资产分布'].map((title) => (
              <section
                className="situation-panel leading-distribution"
                key={title}
              >
                <h2>{title}</h2>
                <Chart label={title} option={fixedDistribution} />
              </section>
            ))}
            <section className="situation-panel leading-risk">
              <h2>蓝军发现风险与漏洞</h2>
              <ReadState query={risk} />
              {risk.isSuccess ? (
                Object.keys(risk.data).length ? (
                  <Chart label="蓝军发现风险与漏洞" option={riskOption} />
                ) : (
                  <p>暂无风险与漏洞</p>
                )
              ) : null}
            </section>
          </div>
        </div>
        <button
          type="button"
          className="leading-side-toggle"
          aria-label={left ? '展开左侧面板' : '收起左侧面板'}
          aria-expanded={!left}
          onClick={() => setLeft((value) => !value)}
        >
          {left ? '›' : '‹'}
        </button>
      </aside>
      <aside
        className={`leading-right${right ? ' leading-right-collapsed' : ''}`}
      >
        <button
          type="button"
          className="leading-side-toggle"
          aria-label={right ? '展开右侧面板' : '收起右侧面板'}
          aria-expanded={!right}
          onClick={() => setRight((value) => !value)}
        >
          {right ? '‹' : '›'}
        </button>
        <div className="leading-right-content" hidden={right}>
          <div className="leading-statistics">
            <div>
              <b>90</b>
              <span>事件统计</span>
            </div>
            <div>
              <b>901</b>
              <span>流量统计</span>
            </div>
          </div>
          <section className="situation-panel leading-tasks">
            <h2>训练任务</h2>
          </section>
          <section className="situation-panel leading-effects">
            <h2>训练过程与效果</h2>
          </section>
        </div>
      </aside>
    </main>
  )
}
export function LeadingSituationPage(params: SituationParams) {
  return <LeadingSession key={JSON.stringify(params)} params={params} />
}
