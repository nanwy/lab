import { useEffect, useRef, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import {
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
} from '@workspace/ui/components/field'
import { toast } from '@workspace/ui/components/sonner'
import {
  getCourseOperates,
  getCoursePractice,
  getCourseCheckpoints,
  submitCourseFlag,
  practiceKey,
  type CoursePracticeScope,
  type CourseCheckpoint,
} from '../api/course-practice'
import type { CourseId } from '../api/courses'
import { RichContentEditor } from '../content/RichContentEditor'
import { CourseDialog } from './CourseDialog'
import { CourseCountdown } from './CourseCountdown'
import { CourseEnvironment } from './CourseEnvironment'
import { CourseCheckpointTopic } from './CourseCheckpointTopic'
import { usePageSignal } from '../auth/use-page-signal'
import { CourseError, reportCourseError } from './CourseFeedback'

export function CoursePractice({
  courseId,
  sectionId,
  account,
}: {
  courseId: CourseId
  sectionId: CourseId
  account: CourseId
}) {
  const list = useQuery({
    queryKey: ['course-operates', String(account), courseId, sectionId],
    queryFn: ({ signal }) => getCourseOperates(courseId, sectionId, signal),
    retry: false,
  })
  const first = list.data?.[0]
  return (
    <>
      {list.isError ? (
        <CourseError
          title="课程实验读取失败"
          error={list.error}
          retry={() => void list.refetch()}
        />
      ) : null}
      {list.isPending ? (
        <Loading label="正在读取课程实验…" />
      ) : !list.data ? null : !first ? (
        <p>本节暂无实验</p>
      ) : (
        <PracticeSession
          key={first.id}
          scope={{ courseId, sectionId, operateId: first.id }}
          account={account}
        />
      )}
    </>
  )
}
function PracticeSession({
  scope,
  account,
}: {
  scope: CoursePracticeScope
  account: CourseId
}) {
  const client = useQueryClient()
  const key = practiceKey(account, scope)
  const detail = useQuery({
    queryKey: [...key, 'detail'],
    queryFn: ({ signal }) => getCoursePractice(scope, signal),
    retry: false,
  })
  const checks = useQuery({
    queryKey: [...key, 'checkpoints'],
    queryFn: ({ signal }) => getCourseCheckpoints(scope, signal),
    retry: false,
  })
  const signalForPractice = usePageSignal()
  const manualDelay = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  useEffect(() => () => clearTimeout(manualDelay.current), [])
  const [manual, setManual] = useState<'practice' | 'checkpoint' | null>(null)
  const [selected, setSelected] = useState<CourseId>()
  const current =
    checks.data?.find((c) => String(c.id) === String(selected)) ??
    checks.data?.[0]
  const refresh = () =>
    client.invalidateQueries({ queryKey: [...key, 'checkpoints'] })
  return (
    <section className="space-y-4" aria-label="课程实验内容">
      {detail.isError ? (
        <CourseError
          title="实验详情读取失败"
          error={detail.error}
          retry={() => void detail.refetch()}
        />
      ) : null}
      {checks.isError ? (
        <CourseError
          title="检查点读取失败"
          error={checks.error}
          retry={() => void checks.refetch()}
        />
      ) : null}
      {detail.isPending || checks.isPending ? (
        <Loading label="正在读取实验内容…" />
      ) : !detail.data || !checks.data ? null : (
        <>
          {detail.data.test_type !== 'experiment' ? (
            <>
              <h3 className="font-semibold">{detail.data.name}</h3>
              <p>{detail.data.desc || '暂无描述'}</p>
            </>
          ) : null}
          {detail.data.write_up_time ? (
            <p>
              手册开放倒计时：
              <CourseCountdown
                key={detail.data.write_up_time}
                seconds={detail.data.write_up_time}
                onFinish={() => {
                  manualDelay.current = setTimeout(() => {
                    if (!signalForPractice().aborted) void detail.refetch()
                  }, 1100)
                }}
              />
            </p>
          ) : detail.data.write_up && detail.data.write_up_option !== 2 ? (
            <Button onClick={() => setManual('practice')}>实验手册</Button>
          ) : !detail.data.write_up &&
            ((Object.hasOwn(detail.data, 'buy') && !detail.data.buy) ||
              detail.data.allow_buy) ? (
            <div>
              <Button disabled>购买实验手册</Button>
              <p>原课程未提供购买接口</p>
            </div>
          ) : null}
          {detail.data.test_type !== 'through' && current ? (
            <EnvironmentAndAttachments
              key={`environment:${current.id}`}
              practice={detail.data}
              checkpoint={current}
              scope={scope}
              account={account}
              urlPorts={
                checks.data.find((c) => c.url_port?.length)?.url_port ?? []
              }
            />
          ) : null}
          <p>题目分值：{detail.data.score || 0}</p>
          {detail.data.option_type === '5' ? (
            <a href="/media/handbook/update_sample.zip" download>
              下载补丁程序示例
            </a>
          ) : null}
          {checks.data.length > 1 &&
          !['ctf', 'confront'].includes(detail.data.test_type) ? (
            <CheckpointNavigation
              items={checks.data}
              currentId={current?.id}
              kind={detail.data.test_type === 'experiment' ? '实验' : '关卡'}
              select={(c, index) => {
                if (
                  detail.data.test_type === 'through' &&
                  index > 0 &&
                  detail.data.extended_content?.stage_mode &&
                  !checks.data[index - 1]!.done
                ) {
                  toast.warning('请先完成上一关卡！')
                  return
                }
                setManual(null)
                setSelected(c.id)
              }}
            />
          ) : null}
          {current ? (
            <div key={current.id} className="space-y-3">
              {detail.data.test_type === 'through' ? (
                <EnvironmentAndAttachments
                  practice={detail.data}
                  checkpoint={current}
                  scope={scope}
                  account={account}
                  urlPorts={
                    checks.data.find((c) => c.url_port?.length)?.url_port ?? []
                  }
                />
              ) : null}
              {['through', 'loophole', 'scene'].includes(
                detail.data.test_type,
              ) ? (
                <>
                  {checks.data.length > 1 ? (
                    <p>关卡分值：{current.score}</p>
                  ) : null}
                  {detail.data.write_up_option === 2 &&
                  !detail.data.write_up_time &&
                  current.write_up ? (
                    <Button onClick={() => setManual('checkpoint')}>
                      实验手册
                    </Button>
                  ) : null}
                </>
              ) : null}
              {current.mode !== 4 ? <p>{current.desc}</p> : null}
              {[1, 2].includes(current.mode) ? (
                <FlagCheckpoint
                  scope={scope}
                  checkpoint={current}
                  refresh={refresh}
                />
              ) : current.mode === 4 ? (
                <CourseCheckpointTopic
                  scope={scope}
                  account={account}
                  checkpointId={current.id}
                  refresh={refresh}
                />
              ) : detail.data.test_type === 'confront' ? (
                <div>
                  <Button disabled>check</Button>
                  <p>原课程缺少对抗检查回调，暂不可用。</p>
                </div>
              ) : null}
              {detail.data.test_type === 'confront' &&
              detail.data.test_environment?.in_check ? (
                <div>
                  <h4>防御得分</h4>
                  <Button disabled>上传防御文件</Button>
                  <Button disabled>防御check</Button>
                  <p>原课程缺少防御上传地址及检查回调，暂不可用。</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p>暂无检查点</p>
          )}
          {manual ? (
            <CourseDialog
              title={manual === 'practice' ? '实验手册' : '关卡解答'}
              close={() => setManual(null)}
              expandable
            >
              <RichContentEditor
                value={
                  (manual === 'practice'
                    ? detail.data.write_up
                    : current?.write_up) ?? ''
                }
                scopeKey={`${account}:${scope.courseId}:${scope.sectionId}:${scope.operateId}:${manual}:${current?.id}`}
                readOnly
              />
            </CourseDialog>
          ) : null}
        </>
      )}
    </section>
  )
}
function FlagCheckpoint({
  scope,
  checkpoint,
  refresh,
}: {
  scope: CoursePracticeScope
  checkpoint: CourseCheckpoint
  refresh: () => Promise<unknown>
}) {
  const signalForCheck = usePageSignal()
  const form = useForm({
    defaultValues: { flag: '' },
    validators: { onSubmit: z.object({ flag: z.string() }) },
    onSubmit: async ({ value }) => {
      const signal = signalForCheck()
      try {
        await submitCourseFlag(scope, checkpoint.id, value.flag, signal)
        if (signal.aborted) return
        form.reset()
        toast.success('提交成功')
        await refresh()
      } catch (error) {
        reportCourseError(error, signal)
      }
    },
  })
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field
          name="flag"
          children={(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Flag</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  aria-invalid={isInvalid}
                  disabled={checkpoint.done}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            )
          }}
        />
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(submitting) => (
            <LoadingButton
              type="submit"
              loading={submitting}
              disabled={checkpoint.done}
            >
              提交Flag
            </LoadingButton>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

function EnvironmentAndAttachments({
  practice,
  checkpoint,
  scope,
  account,
  urlPorts,
}: {
  practice: import('../api/course-practice').CoursePractice
  checkpoint: CourseCheckpoint
  scope: CoursePracticeScope
  account: CourseId
  urlPorts: (string | number)[]
}) {
  return (
    <div className="space-y-3">
      {checkpoint.task_type !== 4 ? <h4>题目地址</h4> : null}
      {checkpoint.task_type === 3 && checkpoint.link_path ? (
        <a href={checkpoint.link_path} target="_blank" rel="noreferrer">
          {checkpoint.link_path}
        </a>
      ) : null}
      {[1, 2].includes(checkpoint.task_type ?? 0) ? (
        <CourseEnvironment
          key={`${practice.id}:${checkpoint.id}:${checkpoint.env}:${checkpoint.topo}`}
          practice={practice}
          checkpoint={checkpoint}
          scope={scope}
          account={account}
          urlPorts={urlPorts}
        />
      ) : null}
      {[
        practice.tool_attachment,
        practice.question_file,
        practice.test_environment?.attachment,
      ].some(Boolean) ? (
        <div>
          <h4>实验附件</h4>
          {[
            practice.tool_attachment,
            practice.question_file,
            practice.test_environment?.attachment,
          ].map((url, index) =>
            url ? (
              <a className="mr-3 underline" key={index} href={url} download>
                {url.split('/').at(-1)}
              </a>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  )
}

function CheckpointNavigation({
  items,
  currentId,
  kind,
  select,
}: {
  items: CourseCheckpoint[]
  currentId?: CourseId
  kind: string
  select: (item: CourseCheckpoint, index: number) => void
}) {
  const container = useRef<HTMLElement>(null)
  const [size, setSize] = useState(10)
  const [page, setPage] = useState(1)
  useEffect(() => {
    const target = container.current!
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setSize(Math.max(1, Math.floor(width / 90)))
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  const pages = Math.max(1, Math.ceil(items.length / size)),
    currentPage = Math.min(page, pages)
  return (
    <nav
      ref={container}
      aria-label="选择检查点"
      className="flex items-center gap-2"
    >
      {currentPage > 1 ? (
        <Button variant="ghost" onClick={() => setPage(currentPage - 1)}>
          上一组检查点
        </Button>
      ) : null}
      <div className="flex flex-1 flex-wrap gap-2">
        {items
          .slice((currentPage - 1) * size, currentPage * size)
          .map((item, offset) => {
            const index = (currentPage - 1) * size + offset
            return (
              <Button
                key={item.id}
                variant={currentId === item.id ? 'secondary' : 'outline'}
                onClick={() => select(item, index)}
              >
                {kind}
                {index + 1}
                {item.done ? '（完成）' : ''}
              </Button>
            )
          })}
      </div>
      {currentPage < pages ? (
        <Button variant="ghost" onClick={() => setPage(currentPage + 1)}>
          下一组检查点
        </Button>
      ) : null}
    </nav>
  )
}
