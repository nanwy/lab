import { z } from 'zod'
import { apiClient } from './index'
import { blueId, parseBlueResponse, type BlueId } from './blue-team'
import { blueControlBase } from './blue-control'
import { nodeSchema } from './blue-situation'
export const blueSituationBase = (task: BlueId, blue: BlueId) =>
  `${blueControlBase(task, blue)}/init_situation_node/`
export const getBlueSituation = (
  task: BlueId,
  blue: BlueId,
  round: BlueId,
  signal?: AbortSignal,
) =>
  parseBlueResponse(
    z.object({ status: z.literal(1), data: z.array(nodeSchema) }),
    `${blueSituationBase(task, blue)}?blue_team_control=${encodeURIComponent(round)}`,
    signal,
  ).then((r) => r.data)
export async function saveBlueSituation(
  task: BlueId,
  blue: BlueId,
  data: unknown,
  id: BlueId | undefined,
  signal: AbortSignal,
) {
  await apiClient.request(
    `${blueSituationBase(task, blue)}${id == null ? '' : `${encodeURIComponent(id)}/`}`,
    {
      method: id == null ? 'POST' : 'PATCH',
      json: data,
      signal,
      isBusinessFailure: (v) =>
        id == null
          ? !z.object({ status: z.literal(1) }).safeParse(v).success
          : !v || typeof v !== 'object' || ('status' in v && v.status !== 1),
    },
  )
}
export async function deleteBlueSituation(
  task: BlueId,
  blue: BlueId,
  id: BlueId,
  signal: AbortSignal,
) {
  await apiClient.request(
    `${blueSituationBase(task, blue)}${encodeURIComponent(id)}/`,
    {
      method: 'DELETE',
      signal,
      isBusinessFailure: (v) =>
        !z.object({ status: z.literal(1) }).safeParse(v).success,
    },
  )
}
export const situationEventSchema = nodeSchema.and(
  z.object({ parent: blueId.nullish() }),
)
export const getDataRecords = (
  task: BlueId,
  blue: BlueId,
  round: BlueId,
  page: number,
  signal?: AbortSignal,
) =>
  parseBlueResponse(
    z.object({
      count: z.number(),
      results: z.array(
        z.object({
          id: blueId,
          create_time: z.string().nullish(),
          instruction_name: z.string().nullish(),
          status: z.number(),
          exec_return: z.unknown(),
        }),
      ),
    }),
    `${blueControlBase(task, blue)}/position_instruction_record/?page=${page}&size=10&search=&blue_team_control=${encodeURIComponent(round)}`,
    signal,
  )
