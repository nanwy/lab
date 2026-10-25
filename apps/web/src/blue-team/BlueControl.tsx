import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@workspace/ui/components/alert-dialog'
import type { BlueId } from '../api/blue-team'
import {
  getBlueControl,
  getBlueRounds,
  checkBlueStage,
  blueControlBase,
  blueControlCommand,
  type BlueControlAction,
} from '../api/blue-control'
import { usePageSignal } from '../auth/use-page-signal'
import { ControlRounds } from './ControlRounds'
import { blueError } from './feedback'
export function BlueControl({
  taskId,
  blueId,
}: {
  taskId: BlueId
  blueId: BlueId
}) {
  return (
    <ControlSession
      key={`${taskId}:${blueId}`}
      taskId={taskId}
      blueId={blueId}
    />
  )
}
function ControlSession({
  taskId,
  blueId,
}: {
  taskId: BlueId
  blueId: BlueId
}) {
  const signalForPage = usePageSignal(),
    [passed, setPassed] = useState<number[]>([]),
    [checking, setChecking] = useState(false),
    [action, setAction] = useState<BlueControlAction | null>(null),
    [clearing, setClearing] = useState(false),
    [page, setPage] = useState(1)
  const control = useQuery({
    queryKey: ['blue-control', String(taskId), String(blueId), 'state'],
    queryFn: ({ signal }) => getBlueControl(taskId, blueId, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const rounds = useQuery({
    queryKey: ['blue-control', String(taskId), String(blueId), 'rounds', page],
    queryFn: ({ signal }) => getBlueRounds(taskId, blueId, { page }, signal),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const {
    data: roundData,
    dataUpdatedAt: roundsUpdatedAt,
    isSuccess: roundsReady,
    refetch: refetchRounds,
  } = rounds
  const { refetch: refetchControl } = control
  useEffect(() => {
    if (!roundsReady) return
    if (roundData.results[0]?.status === 1) {
      const timer = setTimeout(() => void refetchRounds(), 5000)
      return () => clearTimeout(timer)
    }
    void refetchControl()
  }, [roundData, roundsUpdatedAt, roundsReady, refetchRounds, refetchControl])
  async function check(kind?: 1 | 2 | 3) {
    if (checking) return
    const signal = signalForPage()
    setChecking(true)
    try {
      const result = await checkBlueStage(taskId, blueId, kind, signal)
      if (signal.aborted) return
      if (result.status === 1 && result.message === '检查通过') {
        setPassed((v) => [...new Set([...v, ...(kind ? [kind] : [1, 2, 3])])])
        toast.success(result.message)
      } else toast.error(result.message)
    } catch (e) {
      if (!signal.aborted) blueError(e)
    } finally {
      if (!signal.aborted) setChecking(false)
    }
  }
  async function execute(next: BlueControlAction) {
    if (action) return
    const signal = signalForPage()
    setAction(next)
    try {
      await blueControlCommand(
        `${blueControlBase(taskId, blueId)}/control/`,
        { action: next },
        signal,
      )
      if (signal.aborted) return
      setClearing(false)
      await Promise.all([control.refetch(), rounds.refetch()])
    } catch (e) {
      if (!signal.aborted) blueError(e)
    } finally {
      if (!signal.aborted) setAction(null)
    }
  }
  const status = control.data?.status
  return (
    <section className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">蓝军状态检查</h3>
          <LoadingButton loading={checking} onClick={() => void check()}>
            一键检查
          </LoadingButton>
        </div>
        <div className="flex flex-wrap gap-4">
          {(
            [
              { kind: 1, name: '蓝军阵地接入', pass: '已接入' },
              { kind: 2, name: '蓝军武器布设', pass: '已布设' },
              { kind: 3, name: '初始态势录入', pass: '已录入' },
            ] as const
          ).map((item) => (
            <div
              key={item.kind}
              className="flex items-center gap-3 rounded border p-3"
            >
              <span>{item.name}</span>
              {passed.includes(item.kind) && (
                <span className="text-green-700">{item.pass}</span>
              )}
              <LoadingButton
                variant="outline"
                aria-label={`检查${item.name}`}
                loading={checking}
                onClick={() => void check(item.kind)}
              >
                检查
              </LoadingButton>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3 rounded border p-4">
        <h3 className="font-semibold">模拟蓝军控制</h3>
        {control.isPending ? (
          <Loading label="正在读取控制状态…" />
        ) : control.isError ? (
          <p role="alert">
            控制状态读取失败
            <Button variant="link" onClick={() => void control.refetch()}>
              重试控制状态
            </Button>
          </p>
        ) : (
          <>
            {(status === 1 || status === 2) && (
              <div className="flex items-center gap-2">
                已启动执行：
                <ExecutionTimer
                  key={control.data.executed_time ?? 0}
                  seconds={control.data.executed_time ?? 0}
                />
              </div>
            )}
            <div className="flex gap-3">
              {(status === 0 || status === 4) && (
                <LoadingButton
                  loading={action === 'start'}
                  disabled={action != null}
                  onClick={() => void execute('start')}
                >
                  启动模拟蓝军
                </LoadingButton>
              )}
              {(status === 1 || status === 2) && (
                <>
                  <LoadingButton
                    loading={action === 'pause' || action === 'continue'}
                    disabled={action != null}
                    onClick={() =>
                      void execute(status === 1 ? 'pause' : 'continue')
                    }
                  >
                    {status === 1 ? '暂停' : '继续'}
                  </LoadingButton>
                  <LoadingButton
                    loading={action === 'over'}
                    disabled={action != null}
                    onClick={() => void execute('over')}
                  >
                    结束
                  </LoadingButton>
                </>
              )}
              {[0, 1, 2, 4].includes(status!) ? (
                <Button
                  variant="outline"
                  disabled={action != null}
                  onClick={() => setClearing(true)}
                >
                  清空数据
                </Button>
              ) : (
                <p>当前状态无可用控制操作</p>
              )}
            </div>
          </>
        )}
      </section>
      <ControlRounds
        taskId={taskId}
        blueId={blueId}
        rounds={rounds}
        page={page}
        setPage={setPage}
      />
      <AlertDialog
        open={clearing}
        onOpenChange={(v) => {
          if (!action) setClearing(v)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空所有轮次数据</AlertDialogTitle>
            <AlertDialogDescription>
              当前操作会清空所有轮次数据，请谨慎操作！请确认是否要清空所有轮次数据？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={action != null}
              onClick={() => setClearing(false)}
            >
              取消
            </Button>
            <LoadingButton
              loading={action === 'clear'}
              disabled={action != null}
              onClick={() => void execute('clear')}
            >
              确认清空
            </LoadingButton>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
function ExecutionTimer({ seconds }: { seconds: number }) {
  const [elapsed, setElapsed] = useState(seconds)
  useEffect(() => {
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  return (
    <span>
      {String(Math.floor(elapsed / 3600)).padStart(2, '0')}小时
      {String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0')}分
      {String(elapsed % 60).padStart(2, '0')}秒
    </span>
  )
}
