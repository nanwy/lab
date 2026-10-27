import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@workspace/ui/components/button'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import { ActivityTable } from '../activity/ActivityTable'
import {
  courseEnvironmentRequest,
  getCourseEnvironmentRuns,
  getCourseEnvironmentStatus,
  startCourseEnvironment,
  changeCourseEnvironment,
  getCourseEnvironmentNodes,
  courseConsoleHref,
  type CourseEnvironmentNode,
} from '../api/course-environment'
import {
  type CoursePractice,
  type CourseCheckpoint,
  type CoursePracticeScope,
  practiceKey,
} from '../api/course-practice'
import type { CourseId } from '../api/courses'
import { usePageSignal } from '../auth/use-page-signal'
import { CourseError, reportCourseError } from './CourseFeedback'
import { CourseCountdown } from './CourseCountdown'

export function CourseEnvironment(props: {
  practice: CoursePractice
  checkpoint: CourseCheckpoint
  scope: CoursePracticeScope
  account: CourseId
  urlPorts: (string | number)[]
}) {
  try {
    const request = courseEnvironmentRequest(
      props.practice,
      props.checkpoint,
      false,
    )
    return <EnvironmentSession {...props} request={request} />
  } catch (error) {
    return (
      <p role="alert">
        {error instanceof Error ? error.message : '环境参数不符合契约'}
      </p>
    )
  }
}
function EnvironmentSession({
  practice,
  checkpoint,
  scope,
  account,
  urlPorts,
  request,
}: {
  practice: CoursePractice
  checkpoint: CourseCheckpoint
  scope: CoursePracticeScope
  account: CourseId
  urlPorts: (string | number)[]
  request: ReturnType<typeof courseEnvironmentRequest>
}) {
  const client = useQueryClient()
  const signalForEnv = usePageSignal()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const delayed = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    const timer = setTimeout(
      () => setReady(true),
      practice.test_type === 'through' ? 100 : 200,
    )
    return () => {
      clearTimeout(timer)
      clearTimeout(delayed.current)
    }
  }, [practice.test_type])
  const key = [
    ...practiceKey(account, scope),
    'environment',
    checkpoint.id,
    request,
  ] as const
  const runs = useQuery({
    queryKey: ['course-env-runs', String(account)],
    queryFn: ({ signal }) => getCourseEnvironmentRuns(signal),
    retry: false,
    enabled: ready,
  })
  const state = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getCourseEnvironmentStatus(request, signal),
    retry: false,
    enabled: ready,
    refetchInterval: (q) =>
      !q.state.error && [2, 5].includes(q.state.data?.status ?? 0)
        ? 2000
        : false,
  })
  const runId = state.data?.status === 3 ? state.data.run_id : null
  const nodes = useQuery({
    queryKey: [...key, 'nodes', runId],
    queryFn: ({ signal }) => getCourseEnvironmentNodes(runId!, signal),
    enabled: runId != null,
    retry: false,
  })
  async function action(kind: 'start' | 'stop' | 'delay', automatic = false) {
    if ((busy && !automatic) || !state.data) return
    const signal = signalForEnv()
    const id = state.data.run_id
    if (kind !== 'start' && id == null) return
    setBusy(true)
    try {
      await client.cancelQueries({ queryKey: key, exact: true })
      const result =
        kind === 'start'
          ? await startCourseEnvironment(
              courseEnvironmentRequest(practice, checkpoint, true),
              signal,
            )
          : await changeCourseEnvironment(id!, kind, signal)
      if (signal.aborted) return
      if (result.message) toast.success(result.message)
      if (kind !== 'delay')
        void client.invalidateQueries({
          queryKey: ['course-env-runs', String(account)],
        })
      if (kind === 'stop') {
        clearTimeout(delayed.current)
        delayed.current = setTimeout(() => {
          if (!signal.aborted) void state.refetch()
        }, 500)
      } else await state.refetch()
    } catch (error) {
      reportCourseError(error, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  const secType =
    practice.test_type === 'through'
      ? checkpoint.sec_type
      : practice.test_environment?.sec_type
  return (
    <section aria-label="课程环境" className="space-y-3">
      {runs.isError ? (
        <CourseError
          title="运行环境列表读取失败"
          error={runs.error}
          retry={() => void runs.refetch()}
        />
      ) : null}
      {state.isError ? (
        <CourseError
          title="课程环境状态读取失败"
          error={state.error}
          retry={() => void state.refetch()}
        />
      ) : null}
      {!ready || state.isPending ? (
        <Loading label="正在查询课程环境…" />
      ) : !state.data ? null : (
        <>
          {[1, 4].includes(state.data.status) ? (
            <LoadingButton loading={busy} onClick={() => void action('start')}>
              启动
            </LoadingButton>
          ) : state.data.status === 2 ? (
            <Loading label="启动中…" variant="inline" />
          ) : state.data.status === 5 ? (
            <Loading label="释放中…" variant="inline" />
          ) : state.data.status === 3 ? (
            <>
              {nodes.isError ? (
                <CourseError
                  title="运行节点读取失败"
                  error={nodes.error}
                  retry={() => void nodes.refetch()}
                />
              ) : null}
              {nodes.isPending ? (
                <Loading label="正在读取运行节点…" />
              ) : !nodes.data ? null : (
                <ActivityTable<{ id: string; node: CourseEnvironmentNode }>
                  name="环境资源"
                  empty="暂无运行节点"
                  data={Object.entries(nodes.data.nodes)
                    .filter(([, n]) => n.type !== 'bridge_net')
                    .map(([id, node]) => ({ id, node }))}
                  columns={[
                    {
                      header: '环境地址',
                      cell: ({
                        row: {
                          original: { node },
                        },
                      }) => (
                        <div>
                          {node.float_ip
                            ? practice.protocol_ports?.length
                              ? practice.protocol_ports.map((p, i) => (
                                  <p key={i}>
                                    {p.service}- {p.protocol}://{node.float_ip}:
                                    {p.port}/{p.path}
                                  </p>
                                ))
                              : node.float_ip
                            : !practice.protocol_ports?.length
                              ? '暂无环境地址信息'
                              : null}
                        </div>
                      ),
                    },
                    {
                      header: '账号信息',
                      cell: ({
                        row: {
                          original: { node },
                        },
                      }) => (
                        <div>
                          {node.system_user?.length ? (
                            <>
                              <p>系统账号密码：</p>
                              {node.system_user.map((u, i) => (
                                <p key={i}>
                                  账号：{u.username || '暂无'} 密码：
                                  {u.password || '暂无'}
                                </p>
                              ))}
                            </>
                          ) : null}
                          {node.app_user?.length ? (
                            <>
                              <p>应用账号密码：</p>
                              {node.app_user.map((u, i) => (
                                <p key={i}>
                                  账号：{u.username || '暂无'} 密码：
                                  {u.password || '暂无'}
                                </p>
                              ))}
                            </>
                          ) : null}
                          {!node.system_user?.length && !node.app_user?.length
                            ? '该节点未配置账号信息'
                            : null}
                        </div>
                      ),
                    },
                    {
                      header: '操作',
                      cell: ({
                        row: {
                          original: { id, node },
                        },
                      }) => (
                        <Button
                          variant="link"
                          onClick={() => {
                            try {
                              window.open(
                                courseConsoleHref(id, node),
                                '_blank',
                                'noopener',
                              )
                            } catch (error) {
                              reportCourseError(error, signalForEnv())
                            }
                          }}
                        >
                          VNC控制台
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
              {practice.vnc !== false &&
              secType === 1 &&
              state.data.uuid &&
              (state.data.type === 'docker' ||
                state.data.type === 'libvirt') ? (
                <Button
                  onClick={() => {
                    const uuid = state.data!.uuid!
                    window.open(
                      `${location.pathname}#/${state.data!.type === 'docker' ? 'vnccontrol/docker' : 'mpst/fullscreen/vnc'}/${encodeURIComponent(uuid)}`,
                      '_blank',
                      'noopener',
                    )
                  }}
                >
                  vnc控制台
                </Button>
              ) : null}
              {[3, 4].includes(secType ?? 0)
                ? state.data.ext_ip
                    ?.filter(
                      (ip) =>
                        practice.test_type !== 'confront' ||
                        urlPorts.includes(ip.port!),
                    )
                    .map((ip, i) => (
                      <p key={i}>
                        {ip.name}：
                        {Array.isArray(ip.ext_ip)
                          ? ip.ext_ip.join('、')
                          : ip.ext_ip}
                      </p>
                    ))
                : null}
              <div className="flex flex-wrap items-center gap-2">
                题目自动释放倒计时：
                <CourseCountdown
                  key={`${runId}:${state.data.times}`}
                  seconds={state.data.times ?? 0}
                  onFinish={() => void action('stop', true)}
                />
                {!practice.shared ? (
                  <LoadingButton
                    variant="destructive"
                    loading={busy}
                    onClick={() => void action('stop')}
                  >
                    释放
                  </LoadingButton>
                ) : null}
                <LoadingButton
                  loading={busy}
                  onClick={() => void action('delay')}
                >
                  延时
                </LoadingButton>
                <Button
                  disabled={busy || nodes.isFetching}
                  onClick={async () => {
                    const result = await nodes.refetch()
                    if (!signalForEnv().aborted && !result.isError)
                      toast.success('刷新成功')
                  }}
                >
                  刷新
                </Button>
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  )
}
