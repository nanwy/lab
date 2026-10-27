import { ApiError } from '../api'
import { Button } from '@workspace/ui/components/button'
import { toast } from '@workspace/ui/components/sonner'

export function reportCourseError(error: unknown, signal: AbortSignal) {
  if (!signal.aborted && (!(error instanceof ApiError) || !error.handled))
    toast.error(error instanceof Error ? error.message : '课程操作失败')
}
export function CourseError({
  error,
  title,
  retry,
}: {
  error: Error
  title: string
  retry: () => void
}) {
  return (
    <div role="alert" className="space-y-2 rounded border p-4">
      <p>{title}</p>
      {!(error instanceof ApiError && error.handled) ? (
        <p>{error.message}</p>
      ) : null}
      <Button variant="outline" onClick={retry}>
        重试
      </Button>
    </div>
  )
}
