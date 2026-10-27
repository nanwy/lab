import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loading } from '@workspace/ui/components/loading'
import { LoadingButton } from '@workspace/ui/components/loading-button'
import { toast } from '@workspace/ui/components/sonner'
import {
  getCourseCheckpointTopic,
  answerCourseCheckpoint,
  finishCourseCheckpoint,
  practiceKey,
  type CoursePracticeScope,
} from '../api/course-practice'
import type { CourseId } from '../api/courses'
import { CourseQuestion } from './CourseSectionTest'
import { CourseError, reportCourseError } from './CourseFeedback'
import { usePageSignal } from '../auth/use-page-signal'
export function CourseCheckpointTopic({
  scope,
  account,
  checkpointId,
  refresh,
}: {
  scope: CoursePracticeScope
  account: CourseId
  checkpointId: CourseId
  refresh: () => Promise<unknown>
}) {
  const signalForTopic = usePageSignal()
  const [busy, setBusy] = useState(false)
  const topic = useQuery({
    queryKey: [...practiceKey(account, scope), 'topic', checkpointId],
    queryFn: ({ signal }) =>
      getCourseCheckpointTopic(scope, checkpointId, signal),
    retry: false,
  })
  async function save(option: string[]) {
    if (busy || topic.data?.done) return false
    const signal = signalForTopic()
    setBusy(true)
    try {
      await answerCourseCheckpoint(scope, checkpointId, option, signal)
      if (signal.aborted) return false
      await topic.refetch()
      return !signal.aborted
    } catch (error) {
      reportCourseError(error, signal)
      return false
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  async function finish() {
    if (busy || !topic.data) return
    const signal = signalForTopic()
    setBusy(true)
    try {
      await finishCourseCheckpoint(scope, checkpointId, topic.data.done, signal)
      if (signal.aborted) return
      toast.success('提交成功')
      await topic.refetch()
      if (!signal.aborted) await refresh()
    } catch (error) {
      reportCourseError(error, signal)
    } finally {
      if (!signal.aborted) setBusy(false)
    }
  }
  return topic.isPending ? (
    <Loading label="正在读取检查点题目…" />
  ) : topic.isError ? (
    <CourseError
      title="检查点题目读取失败"
      error={topic.error}
      retry={() => void topic.refetch()}
    />
  ) : (
    <div className="space-y-3">
      <CourseQuestion
        key={`${topic.data.id}:${topic.data.done}`}
        question={topic.data}
        done={topic.data.done}
        busy={busy || topic.isFetching}
        save={save}
        optimistic
        snapshot={topic.dataUpdatedAt}
      />
      <LoadingButton
        loading={busy}
        disabled={topic.isFetching}
        onClick={() => void finish()}
      >
        {topic.data.done ? '重新测试' : '提交答案'}
      </LoadingButton>
    </div>
  )
}
