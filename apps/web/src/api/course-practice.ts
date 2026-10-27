import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { coursePath, type CourseId } from './courses'
import { contentAddress } from './content'
const id = z.union([z.string().min(1), z.number().finite()])
const address = z.string().transform(contentAddress)
const file = address.nullish().or(z.literal(''))
const flag = z.boolean().nullish().transform(Boolean)
const score = z.union([z.string(), z.number()]).nullish()
const practice = z.object({
  id,
  test_type: z.enum([
    'experiment',
    'ctf',
    'through',
    'loophole',
    'scene',
    'confront',
  ]),
  name: z.string().nullish(),
  desc: z.string().nullish(),
  score,
  write_up: z.string().nullish(),
  write_up_option: z.number().nullish(),
  write_up_time: z.number().finite().nullish(),
  buy: z.boolean().optional(),
  allow_buy: z.boolean().optional(),
  option_type: z.string().optional(),
  shared: flag,
  vnc: z.boolean().nullish(),
  extended_content: z.object({ stage_mode: flag }).nullish(),
  test_environment: z
    .object({
      shared: flag,
      attachment: file,
      in_check: flag,
      sec_type: z.number().nullish(),
    })
    .nullish(),
  tool_attachment: file,
  question_file: file,
  protocol_ports: z
    .array(
      z.object({
        service: z.string().nullish(),
        protocol: z.string().nullish(),
        port: score,
        path: z.string().nullish(),
      }),
    )
    .nullish(),
})
const checkpoint = z.object({
  id,
  mode: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  done: flag,
  desc: z.string().nullish(),
  score,
  write_up: z.string().nullish(),
  task_type: z.number().nullish(),
  env: id.nullish(),
  topo: id.nullish(),
  link_path: file,
  sec_type: z.number().nullish(),
  url_port: z.array(z.union([z.string(), z.number()])).nullish(),
})
const topic = z.object({
  id,
  name: z.string(),
  option_type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  content: z
    .record(z.string(), z.string())
    .nullish()
    .transform((v) => v ?? {}),
  user_option: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  status: z
    .number()
    .nullish()
    .transform((v) => v ?? undefined),
  answer: z.array(z.string()).nullish(),
  parse: z.string().nullish(),
  done: flag,
})
export type CoursePractice = z.infer<typeof practice>
export type CourseCheckpoint = z.infer<typeof checkpoint>
export type CourseCheckpointTopic = z.infer<typeof topic>
export type CoursePracticeScope = {
  courseId: CourseId
  sectionId: CourseId
  operateId: CourseId
}
export const practiceKey = (account: CourseId, scope: CoursePracticeScope) =>
  ['course-practice', String(account), scope] as const
export const practicePath = (scope: CoursePracticeScope) =>
  `${coursePath(scope.courseId)}section/${encodeURIComponent(scope.sectionId)}/operate/${encodeURIComponent(scope.operateId)}/`
export async function readPracticeResponse<T>(
  schema: z.ZodType<T>,
  path: string,
  options: Parameters<typeof apiClient.request>[1] = {},
) {
  const parsed = schema.safeParse(await apiClient.request(path, options))
  if (!parsed.success)
    throw new ApiError(
      'invalid-response',
      `课程实验响应契约错误：${path.split('?')[0]}（${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}:${i.code}`)
        .join('; ')}）`,
    )
  return parsed.data
}
export const practiceSuccess = z.object({
  status: z.literal(1),
  message: z.string().optional(),
})
export function practiceCommand(
  path: string,
  json: unknown,
  signal?: AbortSignal,
) {
  return readPracticeResponse(practiceSuccess, path, {
    method: 'POST',
    json,
    signal,
    isBusinessFailure: (value) =>
      z.object({ status: z.literal(2) }).safeParse(value).success,
  })
}
export function getCourseOperates(
  courseId: CourseId,
  sectionId: CourseId,
  signal?: AbortSignal,
) {
  return readPracticeResponse(
    z.array(z.object({ id })),
    `${coursePath(courseId)}section/${encodeURIComponent(sectionId)}/operate/?nopage=1`,
    { signal },
  )
}
export function getCoursePractice(
  scope: CoursePracticeScope,
  signal?: AbortSignal,
) {
  return readPracticeResponse(practice, practicePath(scope), { signal })
}
export function getCourseCheckpoints(
  scope: CoursePracticeScope,
  signal?: AbortSignal,
) {
  return readPracticeResponse(
    z.array(checkpoint),
    `${practicePath(scope)}checkpoint/?nopage=true`,
    { signal },
  )
}
export function getCourseCheckpointTopic(
  scope: CoursePracticeScope,
  checkpointId: CourseId,
  signal?: AbortSignal,
) {
  return readPracticeResponse(
    topic,
    `${practicePath(scope)}checkpoint/topic/${encodeURIComponent(checkpointId)}/`,
    { signal },
  )
}
export function answerCourseCheckpoint(
  scope: CoursePracticeScope,
  checkpointId: CourseId,
  option: string[],
  signal?: AbortSignal,
) {
  return practiceCommand(
    `${practicePath(scope)}checkpoint/topic/${encodeURIComponent(checkpointId)}/answer/`,
    { option },
    signal,
  )
}
export function finishCourseCheckpoint(
  scope: CoursePracticeScope,
  checkpointId: CourseId,
  reset: boolean,
  signal?: AbortSignal,
) {
  return practiceCommand(
    `${practicePath(scope)}checkpoint/topic/${encodeURIComponent(checkpointId)}/${reset ? 'reset' : 'finish'}/`,
    undefined,
    signal,
  )
}
export function submitCourseFlag(
  scope: CoursePracticeScope,
  checkpointId: CourseId,
  value: string,
  signal?: AbortSignal,
) {
  return practiceCommand(
    `${practicePath(scope)}checkpoint/flag/${encodeURIComponent(checkpointId)}/finish/`,
    { flag: value },
    signal,
  )
}
