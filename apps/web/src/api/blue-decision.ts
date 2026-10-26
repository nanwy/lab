import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { blueId, type BlueId } from './blue-team'
import { blueControlBase } from './blue-control'
export type DecisionStep = {
  kind: number
  sub_technology_name?: string | null
  params: Record<string, unknown>
  status?: number | null
  create_time?: string | null
  child: DecisionStep[]
}
const stepSchema: z.ZodType<DecisionStep> = z.object({
  kind: z.number(),
  sub_technology_name: z.string().nullish(),
  params: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? {}),
  status: z.number().nullish(),
  create_time: z.string().nullish(),
  child: z
    .lazy(() => z.array(stepSchema))
    .nullish()
    .transform((v) => v ?? []),
})
async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `决策过程响应格式错误：${path.split('?')[0]}（${result.error.issues.map((i) => i.path.join('.')).join(',')}）`,
    )
  return result.data
}
export const getDecisionList = (
  task: BlueId,
  blue: BlueId,
  round: BlueId,
  signal?: AbortSignal,
) =>
  read(
    z.array(z.object({ id: blueId, number_of_decisions: z.number() })),
    `${blueControlBase(task, blue)}/position_instruction_record/?${new URLSearchParams({ blue_team_control: String(round), nopage: '1' })}`,
    signal,
  )
export const getDecisionTree = (
  task: BlueId,
  blue: BlueId,
  round: BlueId,
  decision: BlueId | '',
  signal?: AbortSignal,
) =>
  read(
    z.object({
      status: z.literal(1),
      data: z.union([stepSchema, z.strictObject({})]),
    }),
    `${blueControlBase(task, blue)}/perspective/tree/?${new URLSearchParams({ blue_team_control: String(round), instruction_record_id: String(decision) })}`,
    signal,
  ).then((r) =>
    typeof r.data.kind === 'number' ? (r.data as DecisionStep) : null,
  )
export const getDecisionLogs = (
  task: BlueId,
  blue: BlueId,
  round: BlueId,
  signal?: AbortSignal,
) =>
  read(
    z.object({
      results: z.array(
        z.object({
          create_time: z.string().nullish(),
          instruction_name: z.string().nullish(),
          status: z.number().nullish(),
          exec_return: z.unknown(),
        }),
      ),
    }),
    `${blueControlBase(task, blue)}/instruction_record/?${new URLSearchParams({ page: '1', size: '10', blue_team_control: String(round) })}`,
    signal,
  ).then((r) => r.results)
