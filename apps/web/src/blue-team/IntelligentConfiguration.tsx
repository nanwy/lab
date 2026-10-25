import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import type { BlueId } from '../api/blue-team'
import {
  getIntelligent,
  getIntelligentStatistics,
} from '../api/blue-intelligent'
import { IntelligentForces } from './IntelligentForces'
import { IntelligentEngines } from './IntelligentEngines'
import { IntelligentTactics } from './IntelligentTactics'
import { IntelligentAbilities } from './IntelligentAbilities'
export function IntelligentConfiguration({
  intelligentId,
}: {
  intelligentId: BlueId
}) {
  const [tab, setTab] = useState('abilities')
  const detail = useQuery({
    queryKey: ['intelligent', String(intelligentId), 'detail'],
    queryFn: ({ signal }) => getIntelligent(intelligentId, signal),
    retry: false,
  })
  const stats = useQuery({
    queryKey: ['intelligent', String(intelligentId), 'statistics'],
    queryFn: ({ signal }) => getIntelligentStatistics(intelligentId, signal),
    retry: false,
  })
  return (
    <section className="space-y-4">
      {detail.isPending || stats.isPending ? (
        <Loading label="正在读取智能蓝军…" />
      ) : detail.isError || stats.isError ? (
        <p role="alert">
          智能蓝军读取失败
          <Button
            variant="link"
            onClick={() =>
              void Promise.all([detail.refetch(), stats.refetch()])
            }
          >
            重试
          </Button>
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-3">
          <dl className="space-y-3 rounded border p-4">
            <dt>蓝军名称</dt>
            <dd>{detail.data.name}</dd>
            <dt>能力场景</dt>
            <dd>{detail.data.ability_scenario_names.join('、') || '--'}</dd>
            <dt>蓝军描述</dt>
            <dd>{detail.data.description || '暂无描述信息'}</dd>
          </dl>
          <dl className="grid grid-cols-2 gap-3 rounded border p-4">
            <div>
              <dt>技战术</dt>
              <dd>
                {stats.data.tactics_count ?? 0}个战术 /{' '}
                {stats.data.technologies_count ?? 0}个技术
              </dd>
            </div>
            <div>
              <dt>攻击倾向</dt>
              <dd>
                {stats.data.attack_tendency === 1 ? '深度优先' : '广度优先'}
              </dd>
            </div>
            <div>
              <dt>兵力规模</dt>
              <dd>{stats.data.force_count ?? 0}人</dd>
            </div>
            <div>
              <dt>决策引擎</dt>
              <dd>{stats.data.enabled_engines_count ?? 0}个</dd>
            </div>
          </dl>
          <AbilityRadar styles={stats.data.ability_styles} />
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="abilities">能力动作</TabsTrigger>
          <TabsTrigger value="tactics">技战术</TabsTrigger>
          <TabsTrigger value="engines">决策引擎</TabsTrigger>
          <TabsTrigger value="forces">兵力数量</TabsTrigger>
        </TabsList>
        <TabsContent value="abilities">
          <IntelligentAbilities
            intelligentId={intelligentId}
            refreshed={stats.refetch}
          />
        </TabsContent>
        <TabsContent value="tactics">
          <IntelligentTactics intelligentId={intelligentId} />
        </TabsContent>
        <TabsContent value="engines">
          <IntelligentEngines
            intelligentId={intelligentId}
            refreshed={stats.refetch}
          />
        </TabsContent>
        <TabsContent value="forces">
          <IntelligentForces
            intelligentId={intelligentId}
            refreshed={stats.refetch}
          />
        </TabsContent>
      </Tabs>
    </section>
  )
}
function AbilityRadar({
  styles,
}: {
  styles: { name: string; abilities_count: number }[]
}) {
  if (!styles.length)
    return <p className="rounded border p-4">暂无能力维度数据</p>
  const max = Math.max(...styles.map((s) => s.abilities_count), 5) * 1.2
  const point = (i: number, ratio: number) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / styles.length
    return [
      180 + 105 * ratio * Math.cos(angle),
      145 + 105 * ratio * Math.sin(angle),
    ] as const
  }
  const points = (ratio: number) =>
    styles.map((_, i) => point(i, ratio).join(',')).join(' ')
  return (
    <svg
      viewBox="0 0 360 280"
      role="img"
      aria-label="能力维度雷达图"
      className="w-full min-w-0"
    >
      <title>
        {styles.map((s) => `${s.name}：${s.abilities_count}`).join('；')}
      </title>
      <defs>
        <linearGradient id="ability-radar-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8A79FF" stopOpacity=".7" />
          <stop offset="1" stopColor="#8A79FF" stopOpacity=".2" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((r) => (
        <polygon key={r} points={points(r)} fill="none" stroke="#ddd" />
      ))}
      {styles.map((s, i) => {
        const [x, y] = point(i, 1)
        const [tx, ty] = point(i, 1.15)
        return (
          <g key={s.name}>
            <line x1="180" y1="145" x2={x} y2={y} stroke="#ddd" />
            <text
              x={tx}
              y={ty}
              textAnchor="middle"
              fontSize="12"
              fill="currentColor"
            >
              {s.name}
            </text>
          </g>
        )
      })}
      <polygon
        points={styles
          .map((s, i) => point(i, s.abilities_count / max).join(','))
          .join(' ')}
        fill="url(#ability-radar-fill)"
        stroke="#8A79FF"
        strokeWidth="2"
      />
      {styles.map((s, i) => {
        const [x, y] = point(i, s.abilities_count / max)
        return (
          <text
            key={s.name}
            x={x}
            y={y - 5}
            textAnchor="middle"
            fontSize="12"
            fill="currentColor"
          >
            {s.abilities_count}
          </text>
        )
      })}
    </svg>
  )
}
