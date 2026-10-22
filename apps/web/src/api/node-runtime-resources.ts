import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { asObject, type ObjectValue } from './topology-resources'
import { type EditorGraph, toX6Graph } from '../topology/x6-adapter'

const idSchema = z.union([z.string(), z.number()])
const object = z.record(z.string(), z.unknown())
const snapshotSchema = z.looseObject({
  id: idSchema,
  name: z.string(),
  enable: z.boolean(),
  create_time: z.string(),
})
const natSchema = z.looseObject({
  id: idSchema,
  nat_type: z.string(),
  external_ip: z.string(),
  logical_ip: z.string(),
})
const listSchema = <T extends z.ZodType>(schema: T) =>
  z.object({ count: z.number().int().nonnegative(), results: z.array(schema) })
const account = z.looseObject({
  username: z.string(),
  password: z.string().optional(),
  passwrod: z.string().optional(),
})
const service = z.looseObject({
  name: z.string(),
  port: z.union([z.string(), z.number()]).nullable(),
  secondary_path: z.string(),
  protocol: z.string(),
})
const ip = z.looseObject({
  ip: z.string(),
  subnet_mask: z.string(),
  gateway: z.string(),
})
const imageSchema = z.looseObject({
  id: idSchema,
  name: z.string(),
  file_path: z.string(),
  config: object,
  open_service: z.array(service),
  system_user: z.array(account).optional().default([]),
  app_user: z.array(account).optional().default([]),
  ip_config: z.array(ip).optional().default([]),
  type: z.number(),
  property: z.number(),
  ip_type: z.number(),
  system_type: z.number().nullable().optional(),
  desc: z.string().optional(),
  start_config: z.string().optional(),
})
export type NodeImage = z.infer<typeof imageSchema>
export type Snapshot = z.infer<typeof snapshotSchema>
export type NatRule = z.infer<typeof natSchema>
const encode = (id: string | number) => encodeURIComponent(id)
const nodePath = (id: string | number, uuid: string) =>
  `/front/topo/${encode(id)}/node/${encode(uuid)}`
async function read<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `${path.split('?')[0]} 响应不符合节点运行资源契约`,
    )
  return result.data
}
function query(filter: { page: number; search: string; ordering?: string }) {
  return new URLSearchParams({
    page: String(filter.page),
    size: '10',
    search: filter.search,
    ...(filter.ordering ? { ordering: filter.ordering } : {}),
    task_type: '6',
  })
}
async function mutate(
  path: string,
  method: 'POST' | 'DELETE' | 'GET',
  body: unknown,
  signal?: AbortSignal,
  truthy = false,
) {
  return apiClient.request(path, {
    method,
    ...(method !== 'GET' ? { json: body } : {}),
    signal,
    isBusinessFailure: (value) =>
      truthy
        ? !value || asObject(value).status === 2
        : asObject(value).status !== 1,
  })
}
export function getSnapshots(
  id: string | number,
  uuid: string,
  filter: { page: number; search: string; ordering?: string },
  signal?: AbortSignal,
) {
  return read(
    listSchema(snapshotSchema),
    `${nodePath(id, uuid)}/snapshot/?${query(filter)}`,
    signal,
  )
}
export function createSnapshot(
  id: string | number,
  uuid: string,
  name: string,
  signal?: AbortSignal,
) {
  return mutate(
    `${nodePath(id, uuid)}/snapshot/?task_type=6`,
    'POST',
    { name },
    signal,
    true,
  )
}
export function changeSnapshot(
  id: string | number,
  uuid: string,
  snapshotId: string | number,
  remove: boolean,
  signal?: AbortSignal,
) {
  return mutate(
    `${nodePath(id, uuid)}/snapshot/${encode(snapshotId)}/resume/?task_type=6`,
    remove ? 'DELETE' : 'POST',
    {},
    signal,
  )
}
export function getNatRules(
  id: string | number,
  uuid: string,
  filter: { page: number; search: string },
  signal?: AbortSignal,
) {
  return read(
    listSchema(natSchema),
    `${nodePath(id, uuid)}/nat/?${query(filter)}`,
    signal,
  )
}
export function createNatRule(
  id: string | number,
  uuid: string,
  body: ObjectValue,
  signal?: AbortSignal,
) {
  return mutate(
    `${nodePath(id, uuid)}/nat/?task_type=6`,
    'POST',
    body,
    signal,
    true,
  )
}
export function deleteNatRule(
  id: string | number,
  uuid: string,
  natId: string | number,
  signal?: AbortSignal,
) {
  return mutate(
    `${nodePath(id, uuid)}/nat/${encode(natId)}/?task_type=6`,
    'DELETE',
    {},
    signal,
    true,
  )
}
export function setNetworkEntrance(
  id: string | number,
  uuid: string,
  signal?: AbortSignal,
) {
  return mutate(
    `/front/topo/${encode(id)}/network/${encode(uuid)}/`,
    'GET',
    undefined,
    signal,
  )
}
export function getConversionTemplates(
  info: ObjectValue,
  signal?: AbortSignal,
) {
  const filter = new URLSearchParams({ nopage: '1' })
  for (const key of ['device_type', 'icon_classify']) {
    const value = info[key]
    if (value !== undefined) filter.set(`${key}_id`, String(value))
  }
  return read(
    z.array(
      z.looseObject({ id: idSchema, name: z.string(), config_info: object }),
    ),
    `/front/node/convert/?${filter}`,
    signal,
  )
}
export async function saveNodeResourceTopology(
  id: string | number,
  graph: EditorGraph,
  signal?: AbortSignal,
) {
  // 转换及设置入口按原调用提交draw；锁图仅允许这两个专用动作，不放宽普通设计保存。
  return apiClient.request(`/front/topo/${encode(id)}/draw/?task_type=6`, {
    method: 'POST',
    json: { topo: toX6Graph(graph) },
    signal,
    isBusinessFailure: (value) => !value || asObject(value).status === 2,
  })
}
export function getRuntimeImage(
  imageId: string | number,
  signal?: AbortSignal,
) {
  return read(imageSchema, `/front/node/image/list/${encode(imageId)}/`, signal)
}
export function saveRuntimeImage(
  id: string | number,
  uuid: string,
  body: NodeImage,
  signal?: AbortSignal,
) {
  return mutate(
    `/front/${encode(id)}/node/${encode(uuid)}/save_image/?task_type=6`,
    'POST',
    body,
    signal,
  )
}
export async function uploadRuntimeFile(
  uuid: string,
  file: File,
  signal?: AbortSignal,
) {
  const body = new FormData()
  body.set('file', file)
  return apiClient.request(
    `/front/topo/node_run/${encode(uuid)}/upload_file/`,
    {
      method: 'POST',
      body,
      signal,
      isBusinessFailure: (value) => asObject(value).status !== 1,
    },
  )
}
