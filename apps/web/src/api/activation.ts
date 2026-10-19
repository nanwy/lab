import { z } from 'zod'
import { apiClient, ApiError } from './index'

export const onlineActivationSchema = z.object({
  url: z.string().trim().min(1, '请输入激活网址'),
  activate_code: z.string().trim().min(1, '请输入激活码'),
  code: z.string().trim().min(1, '请输入验证码'),
})
export const offlineActivationSchema = z.object({
  activate_code: z.string().trim().min(1, '请输入激活码'),
  file: z.instanceof(File, { message: '请选择 License 文件' }),
})

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new ApiError('invalid-response', '服务响应不符合激活契约')
  return result.data
}

const resultSchema = z.object({ status: z.union([z.literal(1), z.literal(2)]) })

export async function getActivationStatus(signal?: AbortSignal) {
  return parse(
    z.object({
      status: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      url: z.string(),
      device_id: z.string(),
      expire_time: z.string(),
    }),
    await apiClient.request('/admin/system/active/status/', { signal }),
  )
}

export async function activateOnline(
  values: z.infer<typeof onlineActivationSchema>,
  signal?: AbortSignal,
) {
  return parse(
    resultSchema,
    await apiClient.request('/admin/system/active/online/', {
      method: 'POST',
      json: onlineActivationSchema.parse(values),
      signal,
    }),
  )
}

export async function activateOffline(
  activate_code: string,
  file: File,
  signal?: AbortSignal,
) {
  const values = offlineActivationSchema.parse({ activate_code, file })
  const body = new FormData()
  body.append('activate_code', values.activate_code)
  body.append('file', values.file)
  // 原 bundle URL 尾部带空格，沿用浏览器规范化后的实际路径。
  return parse(
    resultSchema,
    await apiClient.request('/admin/system/active/offline/', {
      method: 'POST',
      body,
      signal,
    }),
  )
}
