import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@workspace/ui/components/alert-dialog'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@workspace/ui/components/tabs'
import { useExperiment } from '../experiments/ExperimentContext'
import { experimentKeys } from '../api/experiments'
import {
  blueKeys,
  getBlueTeams,
  getTaskBlueTeams,
  deleteBlueTeam,
  type BlueTeam,
} from '../api/blue-team'
import { usePageSignal } from '../auth/use-page-signal'
import { BlueImport } from './BlueImport'
import { blueError } from './feedback'
import { ScriptConfiguration } from './ScriptConfiguration'
import { IntelligentConfiguration } from './IntelligentConfiguration'
import { DecisionProcess } from './DecisionProcess'
import { ExecutionProcess } from './ExecutionProcess'
import { BlueControl } from './BlueControl'
import { InitialSituation } from './InitialSituation'

export function BlueTeamPage() {
  const experiment = useExperiment()
  return <BlueTeamSession key={String(experiment.id)} />
}
function BlueTeamSession() {
  const experiment = useExperiment(),
    client = useQueryClient(),
    signalForPage = usePageSignal()
  const blues = useQuery({
    queryKey: blueKeys.list(experiment.id),
    queryFn: ({ signal }) => getBlueTeams(experiment.id, signal),
    retry: false,
  })
  const [selected, setSelected] = useState<string | null>(null),
    [importing, setImporting] = useState(false),
    [deleting, setDeleting] = useState<BlueTeam | null>(null),
    [busy, setBusy] = useState(false)
  const current =
    blues.data?.find((blue) => String(blue.id) === selected) ?? blues.data?.[0]
  const taskId = experiment.test_task
  const remove = async () => {
    if (!deleting || taskId == null) return
    const signal = signalForPage()
    setBusy(true)
    try {
      await deleteBlueTeam(taskId, deleting.id, signal)
      const next = await getTaskBlueTeams(taskId, signal)
      if (!signal.aborted) {
        client.setQueryData(blueKeys.list(experiment.id), next)
        setSelected(null)
        setDeleting(null)
      }
    } catch (error) {
      if (!signal.aborted) blueError(error)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  const imported = async () => {
    await client.invalidateQueries({ queryKey: blueKeys.list(experiment.id) })
    if (!blues.data?.length)
      await client.invalidateQueries({
        queryKey: experimentKeys.detail(experiment.id),
      })
  }
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">模拟蓝军</h2>
      {blues.isPending ? (
        <Loading label="正在加载模拟蓝军…" />
      ) : blues.isError ? (
        <div role="alert">
          模拟蓝军读取失败
          <Button variant="link" onClick={() => void blues.refetch()}>
            重试蓝军列表
          </Button>
        </div>
      ) : !blues.data.length ? (
        <div className="space-y-3">
          <p>暂无模拟蓝军</p>
          <Button onClick={() => setImporting(true)}>导入模拟蓝军</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {blues.data.map((blue) => (
              <div key={blue.id} className="flex gap-1">
                <Button
                  variant={current?.id === blue.id ? 'default' : 'outline'}
                  aria-label={`选择蓝军：${blue.name}`}
                  onClick={() => setSelected(String(blue.id))}
                >
                  {blue.name}
                </Button>
                <Button
                  variant="outline"
                  aria-label={`删除蓝军：${blue.name}`}
                  disabled={taskId == null}
                  onClick={() => setDeleting(blue)}
                >
                  删除
                </Button>
              </div>
            ))}
            <Button onClick={() => setImporting(true)}>导入</Button>
          </div>
          <Tabs defaultValue="configuration">
            <TabsList>
              <TabsTrigger value="configuration">蓝军配置</TabsTrigger>
              <TabsTrigger value="initial">初始态势</TabsTrigger>
              <TabsTrigger value="run">运行控制</TabsTrigger>
            </TabsList>
            <TabsContent value="configuration">
              {current?.scenario_type === 1 ? (
                current.scenario == null ? (
                  <p role="alert">当前蓝军缺少剧本标识，无法读取配置。</p>
                ) : (
                  <ScriptConfiguration
                    key={String(current.scenario)}
                    scenarioId={current.scenario}
                  />
                )
              ) : current?.intelligent == null ? (
                <p role="alert">当前蓝军缺少智能蓝军标识，无法读取配置。</p>
              ) : (
                <IntelligentConfiguration
                  key={String(current.intelligent)}
                  intelligentId={current.intelligent}
                />
              )}
            </TabsContent>
            <TabsContent value="initial">
              {taskId == null ? (
                <p role="alert">
                  当前实验尚未绑定测试任务，无法读取或维护初始态势。
                </p>
              ) : (
                <InitialSituation taskId={taskId} />
              )}
            </TabsContent>
            <TabsContent value="run">
              {taskId == null ? (
                <p role="alert">
                  当前实验尚未绑定测试任务，无法执行任务域操作。
                </p>
              ) : (
                <Tabs defaultValue="control" key={String(current?.id)}>
                  <TabsList>
                    <TabsTrigger value="control">蓝军控制</TabsTrigger>
                    <TabsTrigger value="execution">执行过程</TabsTrigger>
                    <TabsTrigger value="decision">决策过程</TabsTrigger>
                    <TabsTrigger value="data">蓝军数据</TabsTrigger>
                  </TabsList>
                  <TabsContent value="control">
                    {current && (
                      <BlueControl taskId={taskId} blueId={current.id} />
                    )}
                  </TabsContent>
                  <TabsContent value="execution">
                    {current && (
                      <ExecutionProcess
                        taskId={taskId}
                        blueId={current.id}
                        scenarioId={current.scenario}
                      />
                    )}
                  </TabsContent>
                  <TabsContent value="decision">
                    {current && (
                      <DecisionProcess taskId={taskId} blueId={current.id} />
                    )}
                  </TabsContent>
                  {['data'].map((value) => (
                    <TabsContent value={value} key={value}>
                      <p role="note">当前功能尚未开放。</p>
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
      {taskId == null && (
        <p className="text-sm text-muted-foreground">
          当前实验尚未绑定测试任务；导入仍可使用，删除与运行操作不可用。
        </p>
      )}
      {importing && (
        <BlueImport
          experimentId={experiment.id}
          existing={!!blues.data?.length}
          close={() => setImporting(false)}
          saved={imported}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除蓝军</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除“{deleting?.name}”？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <LoadingButton loading={busy} onClick={() => void remove()}>
              确认删除
            </LoadingButton>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
