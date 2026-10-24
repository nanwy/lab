import { z } from 'zod'
import { apiClient, ApiError } from './index'
export type ContentUpload = { mode: string; uuid?: string }
export function contentAddress(value: string): string {
  const url = new URL(value, location.href)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new ApiError('invalid-response', '内容地址不符合契约')
  return value
}
export async function uploadContentImage(
  file: File,
  context: ContentUpload & { signal?: AbortSignal },
): Promise<string> {
  const body = new FormData()
  body.set('image', file)
  body.set('mode', context.mode)
  if (context.uuid !== undefined) body.set('uuid', context.uuid)
  const response = await apiClient.request('/front/upload_image/', {
    method: 'POST',
    body,
    signal: context.signal,
    timeoutMs: 30 * 60 * 1000,
    authentication: 'csrf-only',
    isBusinessFailure: (value) =>
      z.object({ status: z.literal(2) }).safeParse(value).success,
  })
  const parsed = z
    .object({ data: z.object({ url: z.string().min(1) }) })
    .safeParse(response)
  if (!parsed.success)
    throw new ApiError('invalid-response', '图片上传响应缺少 data.url')
  return contentAddress(parsed.data.data.url)
}
