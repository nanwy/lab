import { z } from 'zod'
import { apiClient, ApiError } from './index'
export const blueId = z.union([z.string().min(1), z.number()])
export type BlueId = z.infer<typeof blueId>
export const blueSchema = z.object({
  id: blueId,
  name: z.string(),
  scenario_type: z.union([z.literal(1), z.literal(2)]),
  scenario: blueId.nullable().optional(),
  intelligent: blueId.nullable().optional(),
})

export type BlueTeam = z.infer<typeof blueSchema>
const optionSchema = z.array(z.object({ id: blueId, name: z.string() }))
export async function parseBlueResponse<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `${path.split('?')[0]} 响应不符合蓝军契约（${result.error.issues.map((i) => i.path.join('.')).join(',')}）`,
    )
  return result.data
}
export const blueBase = (experimentId: BlueId) =>
  `/front/simulation/experiment/${encodeURIComponent(experimentId)}/blue_team/`
export const taskBlueBase = (taskId: BlueId) =>
  `/front/wqzb/test_task/${encodeURIComponent(taskId)}/blue_team/`
export const blueKeys = {
  list: (experimentId: BlueId) => ['blue-team', String(experimentId)] as const,
}
export function getBlueTeams(experimentId: BlueId, signal?: AbortSignal) {
  return parseBlueResponse(
    z.array(blueSchema),
    `${blueBase(experimentId)}?nopage=1`,
    signal,
  )
}
export function getTaskBlueTeams(taskId: BlueId, signal?: AbortSignal) {
  return parseBlueResponse(
    z.array(blueSchema),
    `${taskBlueBase(taskId)}?nopage=1`,
    signal,
  )
}
export function getBlueCandidates(type: 1 | 2, signal?: AbortSignal) {
  return parseBlueResponse(
    optionSchema,
    `/front/wqzb/simulated_blue_team/${type === 1 ? 'scenario/?nopage=1&status=3' : 'intelligent/list/?nopage=1&status=2'}`,
    signal,
  )
}
export async function importBlueTeam(
  experimentId: BlueId,
  type: 1 | 2,
  selected: BlueId,
  existing: boolean,
  signal?: AbortSignal,
) {
  await apiClient.request(blueBase(experimentId), {
    method: 'POST',
    signal,
    json: {
      scenario_type: type,
      ...(type === 1 ? { scenario: selected } : { intelligent: selected }),
      source: 1,
      ...(existing ? { test_task: experimentId } : {}),
    },
    isBusinessFailure: (value) => {
      const r = z
        .object({ status: z.number().optional(), id: blueId.optional() })
        .safeParse(value)
      return !r.success || !(r.data.status === 1 || r.data.id)
    },
  })
}
export async function deleteBlueTeam(
  taskId: BlueId,
  id: BlueId,
  signal?: AbortSignal,
) {
  await apiClient.request(`${taskBlueBase(taskId)}${encodeURIComponent(id)}/`, {
    method: 'DELETE',
    signal,
    isBusinessFailure: (value) =>
      !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
}
