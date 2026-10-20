import { z } from 'zod'
import { apiClient, ApiError } from './index'

const id = z.union([z.string().min(1), z.number()])
const count = z.number().int().nonnegative()
export const experimentSchema = z.object({
  id,
  name: z.string(),
  desc: z.string(),
  node_count: count,
  start_status: z.boolean(),
  create_time: z.string(),
  source: z.union([z.literal(1), z.literal(2)]),
})
export const experimentDetailSchema = experimentSchema
  .pick({ id: true, name: true, desc: true, node_count: true })
  .extend({
    user_name: z.string(),
    tags: z.array(z.object({ name: z.string() })),
    overview: z.string().nullable(),
    release_type: z.number().int(),
    max_duration: z.number().nullable(),
    // 原详情以空字符串表达未分类；保留原值，不放宽其他实体 ID。
    tags_category: id.or(z.literal('')).nullable(),
    topo_id: id.nullable().optional(),
  })
export type Experiment = z.infer<typeof experimentSchema>
export type ExperimentDetail = z.infer<typeof experimentDetailSchema>
export const experimentInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请输入实验名称')
    .max(50, '实验名称最多50个字符'),
  desc: z.string().max(200, '实验概述最多200个字符'),
})
export const experimentInfoSchema = experimentInputSchema.extend({
  tag: z
    .array(z.string().trim().min(1).max(20, '每个标签最多20个字符'))
    .max(5, '最多添加五个标签'),
})
const base = '/front/simulation/experiment/'
const encoded = (value: string | number) => encodeURIComponent(value)
export const experimentKeys = {
  all: ['experiments'] as const,
  lists: ['experiments', 'list'] as const,
  detail: (value: string | number) =>
    ['experiments', 'detail', String(value)] as const,
}
function invalidResponse(path: string, error: z.ZodError) {
  // 只保留路径、字段和错误类别，不输出响应值或搜索内容。
  const issues = error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || 'root'}:${issue.code}`)
    .join('; ')
  return new ApiError(
    'invalid-response',
    `${path.split('?')[0]} 响应不符合实验契约（${issues}）`,
  )
}
async function parse<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success) throw invalidResponse(path, result.error)
  return result.data
}

export function getExperiments(
  period: 'today' | 'before',
  page = 1,
  search = '',
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(page), size: '10', search })
  return parse(
    z.object({ count, results: z.array(experimentSchema) }),
    `${base}${period === 'before' ? 'more/' : ''}?${query}`,
    signal,
  )
}

export function getExperiment(value: string | number, signal?: AbortSignal) {
  return parse(
    experimentDetailSchema,
    `${base}${encoded(value)}/?more=1`,
    signal,
  )
}
export async function saveExperiment(
  value:
    | z.infer<typeof experimentInputSchema>
    | (z.infer<typeof experimentInfoSchema> & {
        release_type: number
        max_duration: number | null
        category: string | number | null
      }),
  experimentId?: string | number,
  signal?: AbortSignal,
) {
  const result = await apiClient.request(
    experimentId === undefined
      ? base
      : `${base}${encoded(experimentId)}/?more=1`,
    {
      method: experimentId === undefined ? 'POST' : 'PATCH',
      json: value,
      signal,
    },
  )
  const parsed = z.object({ id }).safeParse(result)
  if (!parsed.success)
    throw invalidResponse(
      experimentId === undefined ? base : `${base}${encoded(experimentId)}/`,
      parsed.error,
    )
  return parsed.data
}
export async function deleteExperiment(
  value: string | number,
  signal?: AbortSignal,
) {
  await apiClient.request(`${base}delete/`, {
    method: 'POST',
    json: { ids: [value] },
    signal,
    isBusinessFailure: (value) =>
      !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
}
export function getExperimentScenes(
  page = 1,
  search = '',
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(page), size: '10', search })
  return parse(
    z.object({
      count,
      results: z.array(
        z.object({
          id,
          name: z.string(),
          sub_user: z.string(),
          create_time: z.string(),
        }),
      ),
    }),
    `${base}expreiment_scene/?${query}`,
    signal,
  )
}
// 原 select GET 会创建实验：仅在确认导入时调用，不预取、不重试。
export async function importExperiment(
  value: string | number,
  signal?: AbortSignal,
) {
  await apiClient.request(`${base}select/${encoded(value)}/`, {
    signal,
    isBusinessFailure: (value) =>
      !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
}
export function getExperimentTags(signal?: AbortSignal) {
  return parse(
    z.array(z.object({ name: z.string() })),
    '/front/base/tag/?otype_plus=tag&nopage=1',
    signal,
  )
}
