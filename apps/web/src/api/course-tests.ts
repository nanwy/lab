import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { coursePath, type CourseId } from './courses'

const id = z.union([z.string().min(1), z.number().finite()])
const question = z.object({
  id,
  name: z.string(),
  option_type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  content: z.record(z.string(), z.string()),
  user_option: z.array(z.string()),
  status: z.number().finite().optional(),
  answer: z.array(z.string()).nullish(),
  parse: z.string().nullish(),
})
const test = z
  .object({
    done: z.boolean().nullish().transform(Boolean),
    results: z.array(question),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.results.forEach((item, index) => {
      if (seen.has(String(item.id)))
        ctx.addIssue({
          code: 'custom',
          path: ['results', index, 'id'],
          message: '题目标识重复',
        })
      seen.add(String(item.id))
      for (const option of item.user_option)
        if (!Object.hasOwn(item.content, option))
          ctx.addIssue({
            code: 'custom',
            path: ['results', index, 'user_option'],
            message: '答案未对应选项',
          })
    })
  })
export type CourseSectionTest = z.infer<typeof test>
export type CourseTestQuestion = z.infer<typeof question>
export type CourseTestScope = { courseId: CourseId; sectionId: CourseId }
export const courseTestKey = (account: CourseId, scope: CourseTestScope) =>
  ['course-test', String(account), scope] as const
const testPath = (scope: CourseTestScope) =>
  `${coursePath(scope.courseId)}section/${encodeURIComponent(scope.sectionId)}/test/`
async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  options: Parameters<typeof apiClient.request>[1],
) {
  const parsed = schema.safeParse(await apiClient.request(path, options))
  if (!parsed.success)
    throw new ApiError(
      'invalid-response',
      `章节测试响应契约错误：${path.split('?')[0]}（${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .join('; ')}）`,
    )
  return parsed.data
}
export function getCourseSectionTest(
  scope: CourseTestScope,
  signal?: AbortSignal,
) {
  return read(test, `${testPath(scope)}?size=1000`, { signal })
}
const success = z.object({
  status: z.literal(1),
  message: z.string().optional(),
})
function command(path: string, signal?: AbortSignal, json?: unknown) {
  return read(success, path, {
    method: 'POST',
    signal,
    json,
    isBusinessFailure: (value) =>
      z.object({ status: z.literal(2) }).safeParse(value).success,
  })
}
export function saveCourseTestAnswer(
  scope: CourseTestScope,
  questionId: CourseId,
  option: string[],
  signal?: AbortSignal,
) {
  return command(
    `${testPath(scope)}${encodeURIComponent(questionId)}/`,
    signal,
    { option },
  )
}
export function finishCourseSectionTest(
  scope: CourseTestScope,
  signal?: AbortSignal,
) {
  return command(`${testPath(scope)}finish/`, signal)
}
export function resetCourseSectionTest(
  scope: CourseTestScope,
  signal?: AbortSignal,
) {
  return command(`${testPath(scope)}reset/`, signal)
}
