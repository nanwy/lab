import { z } from 'zod'
import { ApiError } from './index'
import { parseBlueResponse, type BlueId } from './blue-team'
import { blueControlBase } from './blue-control'
const networkSchema = z.object({
  ip_relation: z
    .array(
      z.record(
        z.string(),
        z
          .array(z.string())
          .nullish()
          .transform((v) => v ?? []),
      ),
    )
    .nullish()
    .transform((v) => v ?? []),
  input_ip_params_map: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((v) => v ?? {}),
})
export const getBlueNetwork = (
  taskId: BlueId,
  blueId: BlueId,
  roundId: BlueId,
  signal?: AbortSignal,
) =>
  parseBlueResponse(
    networkSchema,
    `${blueControlBase(taskId, blueId)}/flow_path/?blue_team_control=${encodeURIComponent(roundId)}`,
    signal,
  ).then((data) => ({ ...data, graph: networkGraph(data.ip_relation) }))
export type NetworkNode = { id: string; kind: 'ip' | 'switch' | 'router' }
export function networkGraph(
  relations: z.infer<typeof networkSchema>['ip_relation'],
) {
  const nodes: NetworkNode[] = [],
    edges: { id: string; source: string; target: string }[] = []
  const links = new Map<string, Set<string>>()
  function node(id: string, kind: NetworkNode['kind'] = 'ip') {
    if (!links.has(id)) {
      links.set(id, new Set())
      nodes.push({ id, kind })
    }
  }
  function edge(source: string, target: string) {
    node(source)
    node(target)
    if (!links.get(source)!.has(target)) {
      links.get(source)!.add(target)
      links.get(target)!.add(source)
      edges.push({ id: `${source}_${target}`, source, target })
    }
  }
  const subnet = (ip: string) => ip.split('.').slice(0, 3).join('.')
  for (const relation of relations) {
    const first = Object.entries(relation)[0]
    if (!first) throw new ApiError('invalid-response', '网络关系缺少源节点')
    const [source, targets] = first,
      sourceSubnet = subnet(source),
      sourceSwitch = `${sourceSubnet}.sw`
    node(source)
    node(sourceSwitch, 'switch')
    edge(source, sourceSwitch)
    for (const target of targets) {
      const targetSubnet = subnet(target),
        targetSwitch = `${targetSubnet}.sw`
      node(target)
      node(targetSwitch, 'switch')
      if (sourceSubnet !== targetSubnet) {
        const router = `${sourceSubnet}_to_${targetSubnet}_r`
        node(router, 'router')
        edge(sourceSwitch, router)
        edge(targetSwitch, router)
      } else {
        edge(target, targetSwitch)
        if (sourceSwitch !== targetSwitch) edge(sourceSwitch, targetSwitch)
      }
      edge(target, targetSwitch)
    }
  }
  return { nodes, edges }
}
