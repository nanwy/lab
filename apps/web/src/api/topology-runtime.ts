import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { asObject } from './topology-resources'

const entry = z.looseObject({
  status: z.number().int().min(0).max(6).nullable(),
  name: z.string().optional(),
  nodea_name: z.string().optional(),
  nodez_name: z.string().optional(),
  error_msg: z.string().nullable().optional(),
  update_time: z.string().nullable().optional(),
})
const statusSchema = z.looseObject({
  nodes: z.record(z.string(), entry),
  edges: z.record(z.string(), entry),
})
export type TopologyRuntimeStatus = z.infer<typeof statusSchema>
export type NodeAction = 'start' | 'stop' | 'restart' | 'shutdown'
export const nodeStatusLabels = [
  '未启动',
  '启动中',
  '启动成功',
  '启动失败',
  '关机',
  '上传镜像中',
  '暂停',
]

export async function getTopologyRuntime(
  id: string | number,
  signal?: AbortSignal,
) {
  const path = `/front/topo/${encodeURIComponent(id)}/status/?task_type=6`
  const parsed = statusSchema.safeParse(
    await apiClient.request(path, { signal }),
  )
  if (!parsed.success)
    throw new ApiError('invalid-response', `${path} 响应不符合拓扑运行状态契约`)
  return parsed.data
}

// 原单节点 stop 是 POST；批量释放是 node/start/ 的 DELETE，不能按动作名猜协议。
export async function runTopology(
  id: string | number,
  action: NodeAction,
  target: string | string[] | undefined,
  signal?: AbortSignal,
) {
  const batch = Array.isArray(target)
  if (typeof target !== 'string' && action !== 'start' && action !== 'stop')
    throw new ApiError('business', '该操作需要指定节点')
  await apiClient.request(
    `/front/topo/${encodeURIComponent(id)}/${batch ? 'node/start' : typeof target === 'string' ? `node/${encodeURIComponent(target)}/${action}` : action}/?task_type=6`,
    {
      method: batch && action === 'stop' ? 'DELETE' : 'POST',
      ...(batch
        ? { json: { node_list: target } }
        : typeof target === 'string'
          ? { json: {} }
          : {}),
      signal,
      isBusinessFailure: (value) => asObject(value).status !== 1,
    },
  )
}

export function nodeRuntimeActions(
  status: number | null | undefined,
  type: unknown,
): NodeAction[] {
  switch (status ?? 0) {
    case 0:
    case 4:
    case 6:
      return status ? ['stop', 'start'] : ['start']
    case 1:
    case 3:
      return ['stop']
    case 2:
      return [
        'stop',
        ...(['libvirt', 'libvirt_middle_intercept', 'qemu'].includes(
          String(type),
        )
          ? ['restart' as const]
          : []),
        ...(['libvirt', 'libvirt_middle_intercept', 'docker', 'qemu'].includes(
          String(type),
        )
          ? ['shutdown' as const]
          : []),
      ]
    default:
      return []
  }
}
export const runtimeActionLabels: Record<NodeAction, string> = {
  start: '启动',
  stop: '释放',
  restart: '重启',
  shutdown: '关机',
}
