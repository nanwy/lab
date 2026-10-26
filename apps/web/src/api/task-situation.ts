import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { networkGraph } from './blue-network'

const logSchema = z.array(
  z.object({
    create_time: z.string().nullish(),
    message: z.string().nullish(),
  }),
)
export type TaskSituationLog = z.infer<typeof logSchema>[number]
const riskSchema = z.record(
  z.string(),
  z.union([
    z.number(),
    z
      .string()
      .refine((value) => value.trim() !== '' && Number.isFinite(Number(value)))
      .transform(Number),
    z.null(),
  ]),
)
const networkSchema = z.object({
  ip_relation: z
    .array(
      z.record(
        z.string(),
        z
          .array(z.string())
          .nullish()
          .transform((v) => v ?? []),
      ),
    )
    .nullish()
    .transform((v) => v ?? []),
})
const taskPath = (taskId: string) =>
  `/front/wqzb/test_task/${encodeURIComponent(taskId)}`

async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `独立态势响应格式错误：${path.split('?')[0]}（${result.error.issues.map((issue) => issue.path.join('.')).join(',')}）`,
    )
  return result.data
}

export function getTaskSituationRisk(taskId: string, signal?: AbortSignal) {
  return read(riskSchema, `${taskPath(taskId)}/rick_statistics/`, signal)
}
export async function getTaskSituationLogs(
  taskId: string,
  kind: 1 | 2,
  signal?: AbortSignal,
) {
  const result = await read(
    z.object({ status: z.literal(1), data: z.object({ log: logSchema }) }),
    `${taskPath(taskId)}/control/log/?kind=${kind}`,
    signal,
  )
  const logs = result.data.log
  return logs.length > 5 && logs.length < 10 ? [...logs, ...logs] : logs
}
export async function getTaskSituationNetwork(
  taskId: string,
  signal?: AbortSignal,
) {
  const result = await read(
    networkSchema,
    `${taskPath(taskId)}/flow_path/`,
    signal,
  )
  return networkGraph(result.ip_relation)
}
