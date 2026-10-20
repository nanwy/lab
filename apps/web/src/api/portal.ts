import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { getTodos, collectionSchema } from './activity'

const id = z.union([z.string().min(1), z.number()])
const resource = z.object({ id, name: z.string() })
const weight = z.number().min(0).max(10)
export const recommendationSettingsSchema = z.object({
  position: weight,
  direction: weight,
  learning_content: weight,
  knowledge_system_width: weight,
  knowledge_system_depth: weight,
  failed_skills: weight,
})
export type RecommendationSettings = z.infer<
  typeof recommendationSettingsSchema
>
export const recommendationLabels: Record<
  keyof RecommendationSettings,
  string
> = {
  position: '岗位',
  direction: '方向',
  learning_content: '学习内容',
  knowledge_system_width: '知识体系广度',
  knowledge_system_depth: '知识体系深度',
  failed_skills: '薄弱技能',
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success)
    throw new ApiError('invalid-response', '服务响应不符合应用入口契约')
  return result.data
}
async function read<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  return parse(schema, await apiClient.request(path, { signal }))
}
function wrapped<T>(schema: z.ZodType<T>) {
  return z.object({ status: z.literal(1), data: schema })
}

export function getPlatformLogo(signal?: AbortSignal) {
  return read(
    '/admin/system/logo/default/',
    z.object({
      platform_name: z.string().optional(),
      front_logo: z.string().optional(),
      icon: z.string().optional(),
    }),
    signal,
  )
}
// 原 bundle 加载配置但未消费具体字段，不推测 enabled/角色开关。
export async function getResourceSettings(signal?: AbortSignal) {
  const schema = z.record(z.string(), z.unknown())
  const [tool, vuln] = await Promise.all([
    read('/admin/resources/tool/tool/settings/', schema, signal),
    read('/admin/resources/vuln/settings/', schema, signal),
  ])
  return { tool, vuln }
}
export async function getLearningStatistics(signal?: AbortSignal) {
  const result = await read(
    '/front/user/learning_guide/statistics/',
    wrapped(
      z.object({
        day: z.union([z.number(), z.string()]),
        learn_duration: z.union([z.number(), z.string()]),
        recent_course: resource
          .extend({
            mode: z.string(),
            section: z.object({ name: z.string() }).nullish(),
          })
          .nullish(),
      }),
    ),
    signal,
  )
  return result.data
}
export async function getRecommendations(signal?: AbortSignal) {
  const result = await read(
    '/front/user/recommend/resource/',
    wrapped(
      z.object({
        learning_route: z.array(resource),
        practical_operation: z
          .object({
            subject_operate: z.array(resource),
            test_operate: z.array(resource),
          })
          .nullable(),
        course: z.array(
          resource.extend({
            type: z.number(),
            image: z.string(),
            progress: z.union([z.string(), z.number()]),
            difficulty: z.number(),
          }),
        ),
      }),
    ),
    signal,
  )
  return result.data
}
export async function getRecommendationSettings(signal?: AbortSignal) {
  return (
    await read(
      '/front/user/recommend/config/',
      wrapped(recommendationSettingsSchema),
      signal,
    )
  ).data
}
export async function saveRecommendationSettings(
  values: RecommendationSettings,
  signal?: AbortSignal,
) {
  return parse(
    z.object({ status: z.literal(1) }),
    await apiClient.request('/front/user/recommend/config/', {
      method: 'POST',
      json: { data: recommendationSettingsSchema.parse(values) },
      signal,
      isBusinessFailure: (value) =>
        !z.object({ status: z.literal(1) }).safeParse(value).success,
    }),
  )
}
export function getCourseAvailability(
  courseId: string | number,
  signal?: AbortSignal,
) {
  return read(
    `/front/learn/task/self_study/open_courses/${encodeURIComponent(courseId)}/brief/`,
    z.object({ is_open: z.boolean() }),
    signal,
  )
}

// 首页只读投影；完整待办/收藏管理在 S04 复用这些数据域。
export function getHomeTodos(signal?: AbortSignal) {
  return getTodos(signal)
}
export async function getHomeCollections(signal?: AbortSignal) {
  const items = await read(
    '/front/user/collect/?nopage=1',
    z.array(collectionSchema),
    signal,
  )
  return items.slice(0, 5)
}
