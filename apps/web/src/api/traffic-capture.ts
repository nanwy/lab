import { z } from 'zod'
import { apiClient, ApiError } from './index'

const filterSchema = z.object({
  proto: z.string(),
  host: z.string(),
  port: z.string(),
})
const configSchema = z.object({
  status: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  pcap_size: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => v || 5),
  pcap_filter: filterSchema
    .nullish()
    .transform((v) => v ?? { proto: '', host: '', port: '' }),
})
export type CaptureConfig = z.infer<typeof configSchema>
export type CaptureInput = Pick<CaptureConfig, 'pcap_size' | 'pcap_filter'>
export const captureStatusLabels = { 1: '未启动', 2: '已启动', 3: '启动失败' }
const base = (id: string | number) => `/front/topo/${encodeURIComponent(id)}`
const edge = (id: string | number, edgeId: string | number) =>
  `${base(id)}/edge/${encodeURIComponent(edgeId)}`
async function read<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  const parsed = schema.safeParse(await apiClient.request(path, { signal }))
  if (!parsed.success)
    throw new ApiError('invalid-response', `${path} 响应不符合流量捕获契约`)
  return parsed.data
}
export const getCaptureConfig = (
  id: string | number,
  edgeId: string | number,
  signal?: AbortSignal,
) => read(`${edge(id, edgeId)}/capture_pcap_status/`, configSchema, signal)
export async function setCapture(
  id: string | number,
  edgeId: string | number,
  input: CaptureInput | undefined,
  signal?: AbortSignal,
) {
  await apiClient.request(
    `${edge(id, edgeId)}/${input ? 'start' : 'stop'}_capture_pcap/`,
    {
      method: 'POST',
      ...(input ? { json: input } : {}),
      signal,
      isBusinessFailure: (v) =>
        !v || typeof v !== 'object' || Reflect.get(v, 'status') !== 1,
    },
  )
}

const recordSchema = z.object({
  name: z.string(),
  size: z.union([z.string(), z.number()]),
  created_time: z.string(),
  detail: z.string().nullish(),
  mark_path: z.string().nullish(),
})
const markSchema = z.object({
  id: z.union([z.string(), z.number()]),
  topo_line: z.union([z.string(), z.number()]),
  mark_path: z.array(z.string()),
  pcap_filter: filterSchema,
  pcap_size: z.union([z.string(), z.number()]),
  create_time: z.string().nullish(),
  duration_time: z.union([z.string(), z.number()]).nullish(),
  status: configSchema.shape.status,
})
export type CaptureRecord = z.infer<typeof recordSchema>
export type CaptureMark = z.infer<typeof markSchema>
export type CaptureFilter = {
  page: number
  size: number
  search?: string
  ordering?: string
}
const query = (filter: CaptureFilter) =>
  new URLSearchParams(
    Object.entries(filter)
      .filter(([, value]) => value !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString()
export const getCaptureMarks = (
  id: string | number,
  filter: CaptureFilter,
  signal?: AbortSignal,
) =>
  read(
    `${base(id)}/capture_situation/?${query(filter)}`,
    z.object({ count: z.number(), results: z.array(markSchema) }),
    signal,
  )
export const getCaptureRecords = (
  id: string | number,
  edgeId: string | number | undefined,
  filter: CaptureFilter,
  signal?: AbortSignal,
) =>
  read(
    `${edgeId === undefined ? base(id) : edge(id, edgeId)}/capture_pcap_list/?${query(filter)}`,
    z.object({ count: z.number(), results: z.array(recordSchema) }),
    signal,
  )
export async function deleteCaptureRecords(
  files: string[],
  signal?: AbortSignal,
) {
  await apiClient.request('/front/topo/capture_pcap_delete/', {
    method: 'POST',
    json: { file_list: files },
    signal,
    isBusinessFailure: (v) =>
      !v || typeof v !== 'object' || Reflect.get(v, 'status') !== 1,
  })
}
export async function clearCaptureRecords(
  id: string | number,
  signal?: AbortSignal,
) {
  await apiClient.request(`${base(id)}/all_pcap_delete/`, {
    method: 'DELETE',
    signal,
    isBusinessFailure: (v) =>
      !v || typeof v !== 'object' || Reflect.get(v, 'status') !== 1,
  })
}
