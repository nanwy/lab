import { z } from 'zod'
import { apiClient, ApiError } from './index'
const truth = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform(Boolean)
const address = z
  .string()
  .min(1)
  .refine((value) => {
    if (!value.trim()) return false
    try {
      return ['http:', 'https:'].includes(
        new URL(value, 'https://local.invalid').protocol,
      )
    } catch {
      return false
    }
  }, '资料地址协议无效')
const materialId = z.union([
  z
    .string()
    .min(1)
    .refine((id) => id !== '..'),
  z.number().finite(),
])
const entry = z
  .object({
    id: materialId,
    name: z.string(),
    path: z.string(),
    is_file: truth,
    attached: address.nullish(),
    size: z
      .union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)])
      .transform(Number)
      .pipe(z.number().finite().nonnegative()),
    type: z.string().nullish(),
    isLink: truth.nullish().transform(Boolean),
    create_time: z.string().nullable(),
    altertime: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.is_file && !value.attached)
      ctx.addIssue({
        code: 'custom',
        path: ['attached'],
        message: '文件缺少地址',
      })
    if (!value.is_file && (!value.path.startsWith('/') || value.path === '..'))
      ctx.addIssue({ code: 'custom', path: ['path'], message: '目录路径无效' })
  })
export type DetectionMaterial = z.infer<typeof entry>
const base = '/front/wqzb/detection_front/tools/'
function materialContractError(endpoint: string, error: z.ZodError) {
  const issues = error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.')}:${issue.code}`)
    .join('; ')
  const label =
    endpoint === 'materials/'
      ? '检测资料响应契约错误'
      : '检测资料导出响应契约错误'
  return new ApiError(
    'invalid-response',
    `${label}：${base}{toolId}/${endpoint}（${issues}）`,
  )
}
export async function getDetectionMaterials(
  toolId: string | number,
  path: string,
  signal?: AbortSignal,
) {
  const response = await apiClient.request(
    `${base}${encodeURIComponent(toolId)}/materials/?${new URLSearchParams({ id: String(toolId), parent_path: path })}`,
    { signal },
  )
  const parsed = z.object({ results: z.array(entry) }).safeParse(response)
  if (!parsed.success) throw materialContractError('materials/', parsed.error)
  if (
    new Set(parsed.data.results.map((file) => String(file.id))).size !==
    parsed.data.results.length
  )
    throw new ApiError(
      'invalid-response',
      `检测资料响应契约错误：${base}{toolId}/materials/（results.id:duplicate_id）`,
    )
  return parsed.data.results
}
export async function exportDetectionMaterials(
  toolId: string | number,
  ids: DetectionMaterial['id'][],
  signal?: AbortSignal,
): Promise<string> {
  if (!z.array(materialId).min(1).safeParse(ids).success)
    throw new Error('请选择有效资料')
  const response = await apiClient.request(
    `${base}${encodeURIComponent(toolId)}/materials/export_zip/`,
    { method: 'POST', json: { material_ids: ids }, signal },
  )
  const parsed = z
    .object({ download_url: address, status: z.literal(1).optional() })
    .safeParse(response)
  if (!parsed.success)
    throw materialContractError('materials/export_zip/', parsed.error)
  return parsed.data.download_url
}
export function detectionDownloadName(attached: string) {
  const [stem, extension] = attached.split('/').at(-1)!.split('.')
  const clean = stem!.includes('_')
    ? stem!.split('_').slice(0, -1).join('_')
    : stem
  return `${clean}.${extension}`
}
