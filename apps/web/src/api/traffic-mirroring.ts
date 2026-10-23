import { z } from 'zod'
import { apiClient, ApiError } from './index'

const rule = z.object({
  id: z.union([z.string(), z.number()]),
  src_node_name: z.string(),
  src_tap: z.string(),
  dst_node_name: z.string(),
  dst_tap: z.string(),
  status: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})
export type MirrorRule = z.infer<typeof rule>
const base = (id: string | number) => `/front/topo/${encodeURIComponent(id)}`
export async function getMirrorRules(
  id: string | number,
  filter: { page: number; size: number; search: string },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    page: String(filter.page),
    size: String(filter.size),
  })
  if (filter.search) query.set('search', filter.search)
  const result = z
    .object({ count: z.number().int().nonnegative(), results: z.array(rule) })
    .safeParse(
      await apiClient.request(`${base(id)}/flow_miror/?${query}`, { signal }),
    )
  if (!result.success)
    throw new ApiError('invalid-response', '流量镜像列表响应不符合约定')
  return result.data
}

const mirrorNode = z.object({
  id: z.union([z.number(), z.string()]).pipe(z.coerce.number()),
  name: z.string(),
  node_tap_list: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
})
export async function getMirrorNodes(
  id: string | number,
  signal?: AbortSignal,
) {
  const result = z
    .array(mirrorNode)
    .safeParse(
      await apiClient.request(`${base(id)}/node_list/?nopage=1`, { signal }),
    )
  if (!result.success)
    throw new ApiError('invalid-response', '流量镜像节点响应不符合约定')
  return result.data
}
export const mirrorInputSchema = z.object({
  src_node: z.number().positive('请选择源节点'),
  src_tap: z.string().min(1, '请选择源节点TAP网卡'),
  dst_node: z.number().positive('请选择目标节点'),
  dst_tap: z.string().min(1, '请选择目标节点TAP网卡'),
})
export async function createMirrorRule(
  id: string | number,
  input: z.infer<typeof mirrorInputSchema>,
  signal?: AbortSignal,
) {
  await apiClient.request(`${base(id)}/flow_miror/`, {
    method: 'POST',
    json: input,
    signal,
    isBusinessFailure: (value) =>
      !value ||
      (typeof value === 'object' && Reflect.get(value, 'status') === 2),
  })
}
export async function runMirrorRule(
  id: string | number,
  fid: string | number,
  action: 'start' | 'stop' | 'delete',
  signal?: AbortSignal,
) {
  await apiClient.request(
    `${base(id)}/mirror_${action === 'delete' ? 'del' : action}/${encodeURIComponent(fid)}/`,
    {
      method: action === 'delete' ? 'DELETE' : 'POST',
      signal,
      isBusinessFailure: (value) =>
        !value ||
        typeof value !== 'object' ||
        Reflect.get(value, 'status') !== 1,
    },
  )
}
