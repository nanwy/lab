import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { asObject } from './topology-resources'

const statusSchema = z.object({
  status: z.number().int(),
  cmd: z.string().optional(),
})
function edgePath(id: string | number, edgeId: string | number) {
  return `/front/topo/${encodeURIComponent(id)}/edge/${encodeURIComponent(edgeId)}`
}
export async function getTrafficSniffing(
  id: string | number,
  edgeId: string | number,
  signal?: AbortSignal,
) {
  const result = statusSchema.safeParse(
    await apiClient.request(`${edgePath(id, edgeId)}/capture_status/`, {
      signal,
    }),
  )
  if (!result.success)
    throw new ApiError('invalid-response', '流量嗅探状态响应不符合约定')
  return result.data
}
export async function setTrafficSniffing(
  id: string | number,
  edgeId: string | number,
  start: boolean,
  signal?: AbortSignal,
) {
  await apiClient.request(
    `${edgePath(id, edgeId)}/${start ? 'start_capture' : 'stop_capture'}/`,
    {
      method: 'POST',
      signal,
      isBusinessFailure: (value) => asObject(value).status !== 1,
    },
  )
}
