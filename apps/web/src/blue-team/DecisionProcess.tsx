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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import type { BlueId } from '../api/blue-team'
import { getBlueRounds } from '../api/blue-control'
import {
  getDecisionList,
  getDecisionTree,
  getDecisionLogs,
  type DecisionStep,
} from '../api/blue-decision'
import { DecisionTreeGraph, DecisionSunburst, stepLabel } from './DecisionGraph'
import { ResultJson } from './ControlRounds'
export function DecisionProcess({
  taskId,
  blueId,
}: {
  taskId: BlueId
  blueId: BlueId
}) {
  return (
    <DecisionSession
      key={`${taskId}:${blueId}`}
      taskId={taskId}
      blueId={blueId}
    />
  )
}
function DecisionSession({
  taskId,
  blueId,
}: {
  taskId: BlueId
  blueId: BlueId
}) {
  const rounds = useQuery({
    queryKey: ['blue-decision', String(taskId), String(blueId), 'rounds'],
    queryFn: ({ signal }) =>
      getBlueRounds(taskId, blueId, { nopage: 0 }, signal),
    retry: false,
  })
  return rounds.isPending ? (
    <Loading label="正在读取攻击轮次…" />
  ) : rounds.isError ? (
    <p role="alert">
      攻击轮次读取失败
      <Button variant="link" onClick={() => void rounds.refetch()}>
        重试轮次
      </Button>
    </p>
  ) : !rounds.data.length ? (
    <p>蓝军未执行，请先执行蓝军！</p>
  ) : (
    <Tabs defaultValue={String(rounds.data[0]!.id)}>
      <TabsList>
        {rounds.data.map((round) => (
          <TabsTrigger key={round.id} value={String(round.id)}>
            第{round.round}轮
          </TabsTrigger>
        ))}
      </TabsList>
      {rounds.data.map((round) => (
        <TabsContent key={round.id} value={String(round.id)}>
          <DecisionRound taskId={taskId} blueId={blueId} roundId={round.id} />
        </TabsContent>
      ))}
    </Tabs>
  )
}
function DecisionRound({
  taskId,
  blueId,
  roundId,
}: {
  taskId: BlueId
  blueId: BlueId
  roundId: BlueId
}) {
  const [decision, setDecision] = useState<BlueId | ''>(''),
    [view, setView] = useState<'tree' | 'sunburst'>('tree'),
    [detail, setDetail] = useState<DecisionStep | null>(null),
    [logsOpen, setLogsOpen] = useState(true)
  const list = useQuery({
    queryKey: [
      'blue-decision',
      String(taskId),
      String(blueId),
      String(roundId),
      'decisions',
    ],
    queryFn: ({ signal }) => getDecisionList(taskId, blueId, roundId, signal),
    retry: false,
  })
  const tree = useQuery({
    queryKey: [
      'blue-decision',
      String(taskId),
      String(blueId),
      String(roundId),
      'tree',
      String(decision),
    ],
    queryFn: ({ signal }) =>
      getDecisionTree(taskId, blueId, roundId, decision, signal),
    retry: false,
  })
  const logs = useQuery({
    queryKey: [
      'blue-decision',
      String(taskId),
      String(blueId),
      String(roundId),
      'logs',
    ],
    queryFn: ({ signal }) => getDecisionLogs(taskId, blueId, roundId, signal),
    retry: false,
  })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={decision === '' ? 'default' : 'outline'}
            aria-pressed={decision === ''}
            onClick={() => setDecision('')}
          >
            全部过程
          </Button>
          {list.isPending ? (
            <Loading variant="inline" label="正在读取决策…" />
          ) : list.isError ? (
            <p role="alert">
              决策列表读取失败
              <Button variant="link" onClick={() => void list.refetch()}>
                重试列表
              </Button>
            </p>
          ) : (
            list.data.map((item) => (
              <Button
                key={item.id}
                variant={decision === item.id ? 'default' : 'outline'}
                aria-pressed={decision === item.id}
                onClick={() => setDecision(item.id)}
              >
                第{item.number_of_decisions}次决策
              </Button>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant={view === 'tree' ? 'default' : 'outline'}
            onClick={() => setView('tree')}
          >
            决策树视图
          </Button>
          <Button
            variant={view === 'sunburst' ? 'default' : 'outline'}
            onClick={() => setView('sunburst')}
          >
            决策环视图
          </Button>
        </div>
      </div>
      {tree.isPending ? (
        <Loading label="正在读取决策过程…" />
      ) : tree.isError ? (
        <p role="alert">
          决策过程读取失败
          <Button variant="link" onClick={() => void tree.refetch()}>
            重试过程
          </Button>
        </p>
      ) : tree.data ? (
        view === 'tree' ? (
          <DecisionTreeGraph root={tree.data} onDetail={setDetail} />
        ) : (
          <DecisionSunburst key={String(decision)} root={tree.data} />
        )
      ) : (
        <p>暂无决策过程</p>
      )}
      <section className="space-y-2 rounded border p-3">
        <div className="flex justify-between">
          <h3 className="font-semibold">决策日志</h3>
          <Button
            variant="ghost"
            aria-expanded={logsOpen}
            onClick={() => setLogsOpen(!logsOpen)}
          >
            {logsOpen ? '收起决策日志' : '展开决策日志'}
          </Button>
        </div>
        {logsOpen &&
          (logs.isPending ? (
            <Loading label="正在读取决策日志…" />
          ) : logs.isError ? (
            <p role="alert">
              决策日志读取失败
              <Button variant="link" onClick={() => void logs.refetch()}>
                重试日志
              </Button>
            </p>
          ) : logs.data.length ? (
            <ul>
              {logs.data.map((log, i) => (
                <li key={i} className="py-2">
                  <strong>{log.create_time}</strong> 执行{' '}
                  <span
                    className={
                      log.status === 1
                        ? 'text-green-700'
                        : log.status === 2
                          ? 'text-red-700'
                          : ''
                    }
                  >
                    {log.instruction_name}
                  </span>
                  获取到数据 <code>{JSON.stringify(log.exec_return)}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p>暂无记录</p>
          ))}
      </section>
      <Dialog
        open={detail != null}
        onOpenChange={(v) => {
          if (!v) setDetail(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>步骤详情</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt>数据值</dt>
                  <dd>
                    {stepLabel(detail) ? (
                      <ResultJson value={detail.params} />
                    ) : (
                      '暂无'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>所执行指令</dt>
                  <dd>{detail.sub_technology_name || '暂无'}</dd>
                </div>
                <div>
                  <dt>执行时间</dt>
                  <dd>{detail.create_time || '暂无'}</dd>
                </div>
                {detail.status != null && detail.status >= 0 && (
                  <div>
                    <dt>执行状态</dt>
                    <dd>
                      {{ 0: '未执行', 1: '成功', 2: '失败' }[detail.status] ??
                        String(detail.status)}
                    </dd>
                  </div>
                )}
              </dl>
              <h3 className="font-semibold">下一步指令</h3>
              <DecisionTreeGraph root={detail} onlyNext />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
