import { z } from 'zod'
import { apiClient, ApiError } from './index'

const id = z.union([z.string(), z.number()])
const machineSchema = z.looseObject({
  id,
  name: z.string(),
  status: z.number().int().min(0).max(6),
  target_image: id.nullish(),
  img_type: z.number().optional(),
  is_distribute: z.boolean().optional(),
  float_ip: z.string().nullish(),
  error_msg: z.string().nullish(),
  config: z
    .object({
      cpu: z.number().optional(),
      ram: z.number().optional(),
      disk: z.number().optional(),
    })
    .optional(),
  web_socker: z.object({ type: z.string(), uuid: z.string() }).nullish(),
})
export type OperationMachine = z.infer<typeof machineSchema>
export async function getOperationMachines(signal?: AbortSignal) {
  const value = await apiClient.request(
    '/front/default_operation_list/?nopage=0',
    { signal },
  )
  const result = z.array(machineSchema).safeParse(value)
  if (!result.success)
    throw new ApiError('invalid-response', '操作机列表响应不符合契约')
  return result.data
}
async function mutate(
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  body: unknown,
  signal?: AbortSignal,
) {
  return apiClient.request(path, {
    method,
    ...(body === undefined ? {} : { json: body }),
    signal,
    isBusinessFailure: (value) =>
      !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
}
export async function allocateOperationMachines(signal?: AbortSignal) {
  // 原GET会分配资源，只在明确操作时调用，不作为Query或自动重试。
  return mutate('/front/image/operate/', 'GET', undefined, signal)
}
export async function updateOperationMachines(signal?: AbortSignal) {
  await mutate(
    '/front/image/default/operation/topo/',
    'POST',
    undefined,
    signal,
  )
  await allocateOperationMachines(signal)
}
export async function runOperationMachine(
  machine: OperationMachine,
  action: 'start' | 'release',
  environmentId: string | number | null,
  signal?: AbortSignal,
) {
  if (machine.target_image == null)
    throw new ApiError('business', '当前操作机缺少关联镜像')
  return mutate(
    `/front/image/operate/${encodeURIComponent(machine.target_image)}/`,
    action === 'start' ? 'POST' : 'DELETE',
    {
      ...(action === 'start' ? { ids: environmentId } : {}),
      resource_type: 1,
      resource_id: machine.id,
    },
    signal,
  )
}
