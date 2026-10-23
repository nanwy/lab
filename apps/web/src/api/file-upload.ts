import { z } from 'zod'
import { apiClient, ApiError } from './index'

export async function uploadFiles(
  path: string,
  files: readonly File[],
  options: {
    signal: AbortSignal
    onUploadProgress: (progress: { loaded: number; total: number }) => void
  },
) {
  const body = new FormData()
  body.append('parent_path', path)
  for (const file of files) body.append('attached', file)
  const value = await apiClient.request(
    '/front/learn/task/my_profile/files/upload/',
    {
      method: 'POST',
      body,
      timeoutMs: 30 * 60 * 1000,
      ...options,
    },
  )
  const result = z.object({ message: z.string().optional() }).safeParse(value)
  if (!result.success)
    throw new ApiError('invalid-response', '上传响应不符合契约')
  return result.data
}
