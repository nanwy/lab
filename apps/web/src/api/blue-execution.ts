import { subscribeBlueSocket } from './blue-socket'
import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { blueId, type BlueId } from './blue-team'
import { blueControlBase } from './blue-control'
async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `执行过程响应格式错误：${path.split('?')[0]}（${result.error.issues.map((i) => i.path.join('.')).join(',')}）`,
    )
  return result.data
}
const logSchema = z.object({
  create_time: z.string(),
  message: z.string(),
  status: z.number(),
  spend_time: z.union([z.string(), z.number()]).nullish(),
})
export type ExecutionLog = z.infer<typeof logSchema>
const runSchema = z.object({
  number_of_decisions: z.number().nullish(),
  exec_scenario_node_uid: blueId.nullish(),
})
export type ExecutionRun = z.infer<typeof runSchema>
const recordSchema = z.object({
  id: blueId,
  number_of_decisions: z.number(),
  update_time: z.string(),
  instruction_name: z.string(),
  status: z.number(),
  exec_params: z.object({ data: z.unknown() }).nullish(),
  exec_return: z.unknown(),
})
export type ExecutionRecord = z.infer<typeof recordSchema>
export const getExecutionRecords = (
  task: BlueId,
  blue: BlueId,
  round: BlueId,
  page: number,
  signal?: AbortSignal,
) =>
  read(
    z.object({ count: z.number(), results: z.array(recordSchema) }),
    `${blueControlBase(task, blue)}/position_instruction_record/?page=${page}&size=10&blue_team_control=${encodeURIComponent(round)}`,
    signal,
  )
export const getExecutionLogs = (
  task: BlueId,
  blue: BlueId,
  signal?: AbortSignal,
) =>
  read(
    z.object({
      status: z.literal(1),
      data: z.object({ log: z.array(logSchema) }),
    }),
    `${blueControlBase(task, blue)}/control/log/`,
    signal,
  ).then((r) => r.data.log)
export const getExecutionRun = (
  task: BlueId,
  blue: BlueId,
  signal?: AbortSignal,
) =>
  read(
    z.object({
      status: z.literal(1),
      data: runSchema.extend({ status: z.number() }),
    }),
    `${blueControlBase(task, blue)}/control/`,
    signal,
  ).then((r): ExecutionRun => (r.data.status === 1 ? r.data : {}))
const eventSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal(1),
    create_time: z.string(),
    log_message: z.string(),
    status: z.number(),
    spend_time: z.union([z.string(), z.number()]).nullish(),
  }),
  runSchema.extend({ kind: z.literal(2) }),
])
export type ExecutionEvent = z.infer<typeof eventSchema>
export function subscribeExecution(
  task: BlueId,
  blue: BlueId,
  receive: (event: ExecutionEvent) => void,
  status: (message: string | null) => void,
) {
  return subscribeBlueSocket(
    task,
    blue,
    '',
    (raw) => {
      if (
        !raw ||
        typeof raw !== 'object' ||
        !('kind' in raw) ||
        (raw.kind !== 1 && raw.kind !== 2)
      )
        return
      const result = eventSchema.safeParse(raw)
      if (result.success) receive(result.data)
      else status('实时消息格式错误')
    },
    status,
  )
}
