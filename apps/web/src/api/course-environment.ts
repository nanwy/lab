import { z } from 'zod'
import { ApiError } from './index'
import { textConsoleType, textConsoleHref } from './terminal'
import { desktopHref } from './desktop'
import {
  readPracticeResponse,
  practiceCommand,
  type CoursePractice,
  type CourseCheckpoint,
} from './course-practice'
const id = z.union([z.string().min(1), z.number().finite()])
const credential = z.object({
  username: z.string().nullish(),
  password: z.string().nullish(),
})
const node = z.object({
  type: z.string(),
  name: z.string().nullish(),
  float_ip: z.string().nullish(),
  system_user: z.array(credential).nullish(),
  app_user: z.array(credential).nullish(),
  console_type: z.string().nullish(),
  console_port: z.union([z.string(), z.number()]).nullish(),
})
const state = z
  .object({
    status: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    run_id: id.nullish(),
    times: z.number().finite().nullish(),
    uuid: z.string().nullish(),
    type: z.string().nullish(),
    ext_ip: z
      .array(
        z.object({
          name: z.string().nullish(),
          port: z.union([z.string(), z.number()]).optional(),
          ext_ip: z.union([z.string(), z.array(z.string())]).nullish(),
        }),
      )
      .nullish(),
  })
  .superRefine((value, ctx) => {
    if (value.status === 3 && value.run_id == null)
      ctx.addIssue({
        code: 'custom',
        path: ['run_id'],
        message: '运行环境缺少运行ID',
      })
  })
export type CourseEnvironmentState = z.infer<typeof state>
export type CourseEnvironmentNode = z.infer<typeof node>
export type CourseEnvironmentRequest = ReturnType<
  typeof courseEnvironmentRequest
>
export function courseEnvironmentRequest(
  practice: CoursePractice,
  check: CourseCheckpoint,
  starting: boolean,
) {
  const envId = check.task_type === 1 ? check.env : check.topo
  if (![1, 2].includes(check.task_type ?? 0) || envId == null)
    throw new ApiError('invalid-response', '当前检查点缺少环境模板标识')
  return {
    resource_type: 16 as const,
    resource_id: practice.id,
    env_type: check.task_type!,
    env_id: envId,
    start_type: 2 as const,
    share: starting
      ? practice.test_environment?.shared || false
      : practice.shared || false,
    assist: {
      start_new_type: 1,
      ...(practice.test_type === 'through' ? { check_id: check.id } : {}),
      ...(practice.test_type === 'confront' ? { confront: true } : {}),
    },
  }
}
export function getCourseEnvironmentRuns(signal?: AbortSignal) {
  return readPracticeResponse(
    z.array(z.unknown()),
    '/front/env/runs/?nopage=1&shared=false',
    { signal },
  )
}
export async function getCourseEnvironmentStatus(
  body: CourseEnvironmentRequest,
  signal?: AbortSignal,
) {
  const result = await readPracticeResponse(
    z.object({ status: z.literal(1), data: state }),
    '/front/env/status/',
    {
      method: 'POST',
      json: body,
      signal,
      isBusinessFailure: (value) =>
        z.object({ status: z.literal(2) }).safeParse(value).success,
    },
  )
  return result.data
}
export function startCourseEnvironment(
  body: CourseEnvironmentRequest,
  signal?: AbortSignal,
) {
  return practiceCommand('/front/env/start/', body, signal)
}
export function changeCourseEnvironment(
  runId: string | number,
  action: 'stop' | 'delay',
  signal?: AbortSignal,
) {
  return practiceCommand(
    `/front/env/${action}/${encodeURIComponent(runId)}/`,
    { run_id: runId, resource_type: 16 },
    signal,
  )
}
export function getCourseEnvironmentNodes(
  runId: string | number,
  signal?: AbortSignal,
) {
  return readPracticeResponse(
    z.object({
      nodes: z
        .record(z.string().min(1), node)
        .nullish()
        .transform((v) => v ?? {}),
    }),
    `/front/scene/${encodeURIComponent(runId)}/status/?task_type=16`,
    { signal },
  )
}
export function courseConsoleHref(nodeId: string, node: CourseEnvironmentNode) {
  const text = textConsoleType(node.type, node.console_type)
  if (text) return textConsoleHref(text, nodeId)
  if (['libvirt', 'libvirt_middle_intercept'].includes(node.type))
    return desktopHref('vnc', nodeId, node.name ?? '')
  if (
    !node.console_type ||
    !/^[a-z][a-z0-9+.-]*$/i.test(node.console_type) ||
    ['javascript', 'data', 'vbscript', 'file'].includes(
      node.console_type.toLowerCase(),
    ) ||
    node.console_port == null
  )
    throw new ApiError('invalid-response', '节点未提供有效的控制台协议或端口')
  return `${node.console_type}://${location.hostname}:${node.console_port}`
}
