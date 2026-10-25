import { toast } from '@workspace/ui/components/sonner'
import { ApiError } from '../api'
export function blueError(error: unknown) {
  if (
    error instanceof ApiError &&
    (error.handled || error.kind === 'cancelled')
  )
    return
  toast.error(error instanceof Error ? error.message : '操作失败，请重试')
}
