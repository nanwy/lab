import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { blueId, type BlueId } from './blue-team'
export const blueControlBase = (taskId: BlueId, blueId: BlueId) =>
  `/front/wqzb/test_task/${encodeURIComponent(taskId)}/blue_team/${encodeURIComponent(blueId)}`
async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const parsed = schema.safeParse(await apiClient.request(path, { signal }))
  if (!parsed.success)
    throw new ApiError(
      'invalid-response',
      `蓝军控制响应格式错误：${path.split('?')[0]}（${parsed.error.issues.map((i) => i.path.join('.')).join(',')}）`,
    )
  return parsed.data
}
export const getBlueControl = (
  task: BlueId,
  blue: BlueId,
  signal?: AbortSignal,
) =>
  read(
    z.object({
      status: z.literal(1),
      data: z.object({
        status: z.number(),
        executed_time: z.number().nullish(),
      }),
    }),
    `${blueControlBase(task, blue)}/control/`,
    signal,
  ).then((r) => r.data)
export type BlueControlAction =
  'start' | 'pause' | 'continue' | 'over' | 'clear'
export const blueControlCommand = (
  path: string,
  json: unknown,
  signal: AbortSignal,
  method = 'POST',
) =>
  apiClient.request(path, {
    method,
    json,
    signal,
    isBusinessFailure: (v) =>
      !z.object({ status: z.literal(1) }).safeParse(v).success,
  })
export const checkBlueStage = (
  task: BlueId,
  blue: BlueId,
  kind: 1 | 2 | 3 | undefined,
  signal: AbortSignal,
) =>
  read(
    z.object({ status: z.number(), message: z.string() }),
    `${blueControlBase(task, blue)}/stage_check/${kind == null ? '' : `?kind=${kind}`}`,
    signal,
  )
const roundSchema = z.object({
  id: blueId,
  round: z.number(),
  status: z.number(),
  start_time: z.string().nullish(),
  end_time: z.string().nullish(),
})
const roundOptionSchema = roundSchema.pick({ id: true, round: true })
const roundsSchema = z.object({
  count: z.number(),
  results: z.array(roundSchema),
})
export type BlueRound = z.infer<typeof roundSchema>
export type BlueRoundOption = z.infer<typeof roundOptionSchema>
export type BlueRoundPage = z.infer<typeof roundsSchema>
export function getBlueRounds(
  task: BlueId,
  blue: BlueId,
  filter: { page: number },
  signal?: AbortSignal,
): Promise<z.infer<typeof roundsSchema>>
export function getBlueRounds(
  task: BlueId,
  blue: BlueId,
  filter: { nopage: 0 },
  signal?: AbortSignal,
): Promise<BlueRoundOption[]>
export function getBlueRounds(
  task: BlueId,
  blue: BlueId,
  filter: { page: number } | { nopage: 0 },
  signal?: AbortSignal,
) {
  const path = `${blueControlBase(task, blue)}/control_record/?${'page' in filter ? `page=${filter.page}&size=5` : 'nopage=0'}`
  return 'page' in filter
    ? read(roundsSchema, path, signal)
    : read(z.array(roundOptionSchema), path, signal)
}
const comparisonSchema = z.object({
  id: blueId,
  sub_technology_name: z.string(),
  undefended_return: z.unknown(),
  defended_return: z.unknown(),
  conclusion: z.string().nullish(),
})
export type BlueComparison = z.infer<typeof comparisonSchema>
export const getBlueComparison = (
  task: BlueId,
  blue: BlueId,
  round: BlueId,
  page: number,
  signal?: AbortSignal,
) =>
  read(
    z.object({ count: z.number(), results: z.array(comparisonSchema) }),
    `${blueControlBase(task, blue)}/control_record/compare/${encodeURIComponent(round)}/?page=${page}&size=10`,
    signal,
  )
