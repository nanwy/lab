import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { blueId, type BlueId } from './blue-team'
export const forceBase = (intelligentId: BlueId) =>
  `/front/wqzb/simulated_blue_team/intelligent/list/${encodeURIComponent(intelligentId)}/force_allocation/`
export const roleBase = (intelligentId: BlueId, roleId: BlueId) =>
  `${forceBase(intelligentId)}${encodeURIComponent(roleId)}/`
async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const parsed = schema.safeParse(await apiClient.request(path, { signal }))
  if (!parsed.success)
    throw new ApiError('invalid-response', `${path} 响应不符合兵力配置契约`)
  return parsed.data
}
export async function forceCommand(
  path: string,
  json: unknown,
  signal: AbortSignal,
  method = 'POST',
  creation = false,
) {
  return apiClient.request(path, {
    method,
    json,
    signal,
    isBusinessFailure: (v) => {
      if (creation)
        return !v || (typeof v === 'object' && 'status' in v && v.status === 2)
      return !z.object({ status: z.literal(1) }).safeParse(v).success
    },
  })
}
export const getForces = (id: BlueId, signal?: AbortSignal) =>
  read(
    z.object({
      status: z.literal(1),
      data: z.object({
        items: z.array(z.object({ id: blueId, name: z.string() })),
      }),
    }),
    forceBase(id),
    signal,
  ).then((v) => v.data.items)
export const getForceSystems = (
  id: BlueId,
  role: BlueId,
  signal?: AbortSignal,
) =>
  read(
    z.object({ data: z.array(z.string()) }),
    `${roleBase(id, role)}instruction/terminal/`,
    signal,
  ).then((v) => v.data)
export const getForceTerminals = (
  id: BlueId,
  role: BlueId,
  signal?: AbortSignal,
) =>
  read(
    z.object({
      count: z.number(),
      results: z.array(
        z.object({
          id: blueId,
          system: z.string(),
          tool_list: z.array(
            z.object({ tool_name: z.string(), version_name: z.string() }),
          ),
        }),
      ),
    }),
    `${roleBase(id, role)}terminal/`,
    signal,
  )
export const getForceAbilities = (
  id: BlueId,
  role: BlueId,
  signal?: AbortSignal,
) =>
  read(
    z.object({
      status: z.literal(1),
      data: z.object({
        dimensions: z.array(
          z.object({
            id: blueId,
            name: z.string(),
            count: z.number(),
            is_configured: z.boolean(),
          }),
        ),
      }),
    }),
    `${roleBase(id, role)}ability_configuration/`,
    signal,
  ).then((v) => v.data.dimensions)
