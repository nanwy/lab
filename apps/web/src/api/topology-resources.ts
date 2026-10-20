import { z } from 'zod'
import { apiClient, ApiError } from './index'

export type ObjectValue = Record<string, unknown>
const object = z.record(z.string(), z.unknown())
const resourceSchema = z.looseObject({
  id: z.union([z.string(), z.number()]),
  name: z.string(),
  config_info: object.optional(),
  engin: z.union([z.string(), z.number()]).optional(),
  classify: z.union([z.string(), z.number()]).optional(),
  device_type: z.union([z.string(), z.number()]).optional(),
  device_type_name: z.string().optional(),
  device_type_order: z.number().optional(),
  icon_classify_order: z.number().optional(),
})
export type DeviceResource = z.infer<typeof resourceSchema>
export type ConfigSchema = {
  type?: string
  description?: string
  properties?: Record<string, ConfigSchema>
  items?: ConfigSchema
  required?: string[]
  enum?: unknown[]
  default?: unknown
  read_only?: boolean
  maxLength?: number
  minLength?: number
  info?: string
  big?: boolean
  format?: string
}
const configSchema: z.ZodType<ConfigSchema> = z.lazy(() =>
  z.looseObject({
    type: z.string().optional(),
    description: z.string().optional(),
    properties: z.record(z.string(), configSchema).optional(),
    items: configSchema.optional(),
    required: z.array(z.string()).optional(),
    enum: z.array(z.unknown()).optional(),
    default: z.unknown().optional(),
    read_only: z.boolean().optional(),
    maxLength: z.number().optional(),
    minLength: z.number().optional(),
    info: z.string().optional(),
    big: z.boolean().optional(),
    format: z.string().optional(),
  }),
)
const encode = (id: string | number) => encodeURIComponent(id)
async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `${path.split('?')[0]} 响应不符合拓扑资源契约`,
    )
  return result.data
}
export async function getTopologyResources(
  search: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ search, nopage: '1' })
  const [recent, templates, personal] = await Promise.all([
    read(z.array(resourceSchema), `/front/node/last_operat/?${query}`, signal),
    read(z.array(resourceSchema), `/front/node/template/?${query}`, signal),
    read(z.array(resourceSchema), '/front/node/list/?nopage=0', signal),
  ])
  return { recent: recent.slice(0, 10), templates, personal }
}
export function getNodeDefinitions(signal?: AbortSignal) {
  return read(
    z.record(z.string(), configSchema),
    '/front/node/template/define/',
    signal,
  )
}
export function getNodeImages(id: string | number, signal?: AbortSignal) {
  return read(
    z.looseObject({ name: z.string() }),
    `/front/node/image/list/${encode(id)}/`,
    signal,
  )
}
export async function getTopologyNodeMenuInfo(
  uuid: string,
  signal?: AbortSignal,
) {
  const response = await apiClient.request(`/front/topo/${encode(uuid)}/`, {
    signal,
    isBusinessFailure: (value) => asObject(value).status !== 1,
  })
  const parsed = object.safeParse(asObject(response).data)
  if (!parsed.success)
    throw new ApiError('invalid-response', '节点菜单响应缺少 data')
  return parsed.data
}
function requireId(value: unknown): ObjectValue & { id: string | number } {
  const parsed = z
    .looseObject({ id: z.union([z.string(), z.number()]) })
    .safeParse(value)
  if (!parsed.success)
    throw new ApiError(
      'invalid-response',
      '业务资源响应缺少 id，保留草稿以便重试。',
    )
  return parsed.data
}
export async function createTopologyNode(
  id: string | number,
  resource: DeviceResource,
  uuid: string,
  signal?: AbortSignal,
) {
  if (!resource.config_info) throw new ApiError('business', '设备资源缺少配置')
  const body = {
    ...resource,
    status: 0,
    device_id: uuid,
    config_info: { ...resource.config_info, node_id: uuid },
  }
  return requireId(
    await apiClient.request(`/front/topo/${encode(id)}/node/`, {
      method: 'POST',
      json: body,
      signal,
    }),
  )
}
export async function updateTopologyNode(
  id: string | number,
  uuid: string,
  body: ObjectValue,
  signal?: AbortSignal,
) {
  return requireId(
    await apiClient.request(`/front/topo/${encode(id)}/node/${encode(uuid)}/`, {
      method: 'PATCH',
      json: {
        ...body,
        config_info: { ...asObject(body.config_info), node_id: uuid },
      },
      signal,
    }),
  )
}
export async function createTopologyEdge(
  id: string | number,
  uuid: string,
  source: { id: string; rowId: unknown; name: string; port: number },
  target: { id: string; rowId: unknown; name: string; port: number },
  signal?: AbortSignal,
) {
  return requireId(
    await apiClient.request(`/front/topo/${encode(id)}/edge/`, {
      method: 'POST',
      json: {
        device_id: uuid,
        config_info: {
          dst: { name: source.name, port: source.port, node_id: source.id },
          src: { name: target.name, port: target.port, node_id: target.id },
        },
        topo_nodea: source.rowId,
        topo_nodez: target.rowId,
      },
      signal,
    }),
  )
}
export async function deleteTopologyObjects(
  id: string | number,
  nodeIds: unknown[],
  edgeIds: unknown[],
  signal?: AbortSignal,
) {
  await apiClient.request(`/front/topo/${encode(id)}/edge_node/`, {
    method: 'POST',
    json: { node_list: nodeIds, edge_list: edgeIds },
    signal,
    isBusinessFailure: (value) => asObject(value).status !== 1,
  })
}
export async function uploadNodeLogo(file: File, signal?: AbortSignal) {
  const body = new FormData()
  body.set('file', file)
  body.set('mode', 'node_template')
  const response = await apiClient.request('/front/topo/upload_file/', {
    method: 'POST',
    body,
    signal,
    isBusinessFailure: (value) => asObject(value).status !== 1,
  })
  const url = asObject(asObject(response).data).url
  if (typeof url !== 'string')
    throw new ApiError('invalid-response', '图标响应缺少 URL')
  return url
}
export function asObject(value: unknown): ObjectValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
    : {}
}
