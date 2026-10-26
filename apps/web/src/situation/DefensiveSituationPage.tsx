import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { use as registerCharts } from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import { Loading } from '@workspace/ui/components/loading'
import { getSituationTopology } from '../api/situation-topology'
import { blueError } from '../blue-team/feedback'
import { Chart, Clock, type ChartOption, type SituationParams } from './shared'
import { Topology3D } from './Topology3D'
import './situation.css'

registerCharts([PieChart, LegendComponent, TooltipComponent, SVGRenderer])
const assetOption: ChartOption = {
  tooltip: { trigger: 'item' },
  legend: {
    type: 'scroll',
    orient: 'vertical',
    right: 10,
    top: 10,
    icon: 'rect',
    textStyle: { color: '#849fba' },
  },
  series: [
    {
      type: 'pie',
      radius: ['30%', '60%'],
      center: ['35%', '50%'],
      label: { show: false },
      labelLine: { show: false },
      data: [
        { name: '交换机', value: 2 },
        { name: '路由器', value: 1 },
        { name: '局域网', value: 2 },
        { name: '防火墙', value: 1 },
        { name: '节点', value: 5 },
      ],
    },
  ],
}
function DefensiveSession({ params }: { params: SituationParams }) {
  const [bottom, setBottom] = useState(false)
  const [right, setRight] = useState(false)
  const query = useQuery({
    queryKey: [
      'defensive-topology',
      params.secne_id,
      params.resource_type,
      params.scene_type,
    ],
    queryFn: ({ signal }) =>
      getSituationTopology(
        params.secne_id,
        params.resource_type,
        params.scene_type,
        signal,
      ),
    enabled: Boolean(params.secne_id && params.resource_type),
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  useEffect(() => {
    if (query.error) blueError(query.error)
  }, [query.error])
  return (
    <main className="blue-situation defensive-situation">
      <header className="situation-header">
        <h1>防御态势</h1>
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
      {query.isPending ? (
        <Loading label="正在读取态势…" />
      ) : query.isError ? (
        <p role="alert">态势读取失败</p>
      ) : (
        <>
          <Topology3D graph={query.data} />
          {query.data.nodes.length === 0 ? (
            <p className="situation-empty">暂无拓扑数据</p>
          ) : null}
        </>
      )}
      <footer
        className={`situation-bottom defensive-bottom${bottom ? ' situation-bottom-collapsed' : ''}`}
      >
        <button
          className="situation-toggle"
          type="button"
          aria-label={bottom ? '展开底部面板' : '收起底部面板'}
          aria-expanded={!bottom}
          onClick={() => setBottom((value) => !value)}
        >
          {bottom ? '⌃' : '⌄'}
        </button>
        <div className="situation-bottom-content" hidden={bottom}>
          {['防御操作日志', '防御效果日志'].map((title) => (
            <section className="situation-panel" aria-label={title} key={title}>
              <h2>{title}</h2>
              <div className="situation-log-viewport" />
            </section>
          ))}
        </div>
      </footer>
      <aside
        className={`defensive-right${right ? ' defensive-right-collapsed' : ''}`}
      >
        <button
          type="button"
          className="defensive-right-toggle"
          aria-label={right ? '展开右侧面板' : '收起右侧面板'}
          aria-expanded={!right}
          onClick={() => setRight((value) => !value)}
        >
          {right ? '‹' : '›'}
        </button>
        <div className="defensive-right-content" hidden={right}>
          <div className="defensive-security">
            <span>90%</span>
            <span>安全状态</span>
          </div>
          <section className="situation-panel defensive-assets">
            <h2>资产分布</h2>
            <Chart label="资产分布" option={assetOption} />
          </section>
          <section className="situation-panel defensive-training">
            <h2>训练任务</h2>
          </section>
        </div>
      </aside>
    </main>
  )
}
export function DefensiveSituationPage(params: SituationParams) {
  return <DefensiveSession key={JSON.stringify(params)} params={params} />
}
