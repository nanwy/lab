import { z } from 'zod'
import { apiClient, ApiError } from './index'
export const detectionCategories = [
  { type: 'penetration', value: '1', label: '渗透测试' },
  { type: 'defense', value: '2', label: '防御验证' },
  { type: 'baseline', value: '3', label: '基线检查' },
  { type: 'vulnerability', value: '4', label: '漏洞扫描' },
  { type: 'riskAssessment', value: '5', label: '风险评估' },
] as const
export type DetectionCategory = (typeof detectionCategories)[number]
const toolId = z.union([z.string().min(1), z.number().finite()])
const item = z.object({
  id: toolId,
  name: z.string(),
  tags: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
})
export type DetectionToolItem = z.infer<typeof item>
const base = '/front/wqzb/detection_front/tools/'
async function parse<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `检测工具响应契约错误：${path.split('?')[0]}（${result.error.issues
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .slice(0, 5)
        .join('; ')}）`,
    )
  return result.data
}
export async function getDetectionTools(type: string, signal?: AbortSignal) {
  return (
    await parse(
      z.object({ results: z.array(item) }),
      `${base}?${new URLSearchParams({ tool_type: type })}`,
      signal,
    )
  ).results
}
const detail = item.extend({
  tags: z.array(z.string()),
  tool_carrier: z.number().int(),
  description: z.string().nullish(),
  account: z.string().nullish(),
  carrier_path: z
    .string()
    .refine(
      (value) => {
        if (value !== '' && !value.trim()) return false
        try {
          return ['http:', 'https:'].includes(
            new URL(value, 'https://local.invalid').protocol,
          )
        } catch {
          return false
        }
      },
      { message: '附件地址协议无效' },
    )
    .nullish(),
  image_info: z.object({ name: z.string() }).nullish(),
  user_manual: z.string().nullish(),
})
export type DetectionTool = z.infer<typeof detail>
export function getDetectionTool(id: string | number, signal?: AbortSignal) {
  return parse(
    detail.refine((value) => String(value.id) === String(id), {
      message: '工具ID与请求不符',
    }),
    `${base}${encodeURIComponent(id)}/`,
    signal,
  )
}
