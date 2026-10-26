import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { blueId, type BlueId } from './blue-team'
import { toX6Graph, type EditorGraph } from '../topology/x6-adapter'
const terminalFields = {
  id: blueId,
  blue_team_id: blueId,
  blue_team_name: z.string().nullish(),
  terminal_id: z.string().optional(),
  position_init_id: blueId.nullish(),
}
export const positionTerminalSchema = z.discriminatedUnion('scenario_type', [
  z.looseObject({
    ...terminalFields,
    scenario_type: z.literal(1),
    system: z.string().nullish(),
  }),
  z.looseObject({
    ...terminalFields,
    scenario_type: z.literal(2),
    name: z.string().nullish(),
  }),
])
export type PositionTerminal = z.infer<typeof positionTerminalSchema>
export const terminalKey = (terminal: PositionTerminal) =>
  `${terminal.blue_team_id}-${terminal.id}`
export const terminalLabel = (terminal: PositionTerminal) =>
  `${terminal.scenario_type === 1 ? (terminal.system ?? '') : (terminal.name ?? '')}（${terminal.blue_team_name ?? ''}）`
const base = (task: BlueId) =>
  `/front/wqzb/test_task/${encodeURIComponent(task)}`
const terminals = z
  .array(positionTerminalSchema)
  .nullish()
  .transform((value) => value ?? [])
export async function getPositionTerminals(task: BlueId, signal?: AbortSignal) {
  const raw = await apiClient.request(`${base(task)}/init_info/terminal/`, {
    signal,
    isBusinessFailure: (value) =>
      z.object({ status: z.literal(2) }).safeParse(value).success,
  })
  const parsed = z
    .object({
      status: z.literal(1),
      data: z.object({ used_data: terminals, unused_data: terminals }),
    })
    .safeParse(raw)
  if (!parsed.success)
    throw new ApiError('invalid-response', '蓝军终端列表响应格式错误')
  return parsed.data.data
}
async function command(
  path: string,
  method: 'POST' | 'DELETE',
  json: unknown,
  signal?: AbortSignal,
) {
  const raw = await apiClient.request(path, {
    method,
    json,
    signal,
    isBusinessFailure: (v) =>
      !z.object({ status: z.literal(1) }).safeParse(v).success,
  })
  const result = z.object({ message: z.string().optional() }).safeParse(raw)
  return result.success ? result.data.message : undefined
}
export const associatePosition = (
  task: BlueId,
  node: string,
  terminal: PositionTerminal,
  signal?: AbortSignal,
) =>
  command(
    `${base(task)}/init_info/`,
    'POST',
    {
      blue_team: terminal.blue_team_id,
      [terminal.scenario_type === 1 ? 'terminal' : 'intelligent_terminal']:
        terminal.id,
      device_id: node,
    },
    signal,
  )
export const removePosition = (
  task: BlueId,
  ids: BlueId[],
  signal?: AbortSignal,
) => command(`${base(task)}/init_info/`, 'DELETE', { ids }, signal)
export const positionToolSchema = z
  .object({
    id: blueId.nullable(),
    tool_name: z.string().nullish(),
    version_name: z.string().nullish(),
    instruction_count: z.number().nullish(),
    tool_uuid: z.string().nullish(),
    status: z.number().nullish(),
    run_status: z.number().nullish(),
  })
  .refine((tool) => tool.id != null || !!tool.tool_uuid, {
    message: '未生成部署记录的工具必须有tool_uuid',
    path: ['tool_uuid'],
  })
export type PositionTool = z.infer<typeof positionToolSchema>
const toolPageSchema = z.object({
  count: z.number(),
  results: z.array(positionToolSchema),
})
export async function getPositionTools(
  task: BlueId,
  terminal: PositionTerminal,
  filter: { page: number; search: string },
  signal?: AbortSignal,
) {
  const path = `${base(task)}/blue_team/${encodeURIComponent(terminal.blue_team_id)}/terminal/${encodeURIComponent(terminal.id)}/tool/?${new URLSearchParams({ page: String(filter.page), size: '10', search: filter.search, node_id: String(terminal.blue_team_id) })}`
  const raw = await apiClient.request(path, {
    signal,
    isBusinessFailure: (value) =>
      z.object({ status: z.literal(2) }).safeParse(value).success,
  })
  if (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    !('results' in raw)
  )
    return null
  const parsed = toolPageSchema.safeParse(raw)
  if (!parsed.success)
    throw new ApiError('invalid-response', '蓝军工具列表响应格式错误')
  return parsed.data
}
export const runPositionTool = (
  task: BlueId,
  id: BlueId,
  action: 'deploy' | 'check',
  signal?: AbortSignal,
) =>
  command(
    `${base(task)}/node_tool/${encodeURIComponent(id)}/${action}/`,
    'POST',
    undefined,
    signal,
  )
export const runPositionTools = (
  task: BlueId,
  terminal: PositionTerminal,
  action: 'deploy' | 'check',
  signal?: AbortSignal,
) =>
  command(
    `${base(task)}/terminal/${encodeURIComponent(terminal.id)}/node_tool/${action}/?type=${terminal.scenario_type}`,
    'POST',
    undefined,
    signal,
  )
/** 原蓝军关联成功后saveGraph({type:'node'})，保持lock，只保存这项业务结果。 */
export async function savePositionTopology(
  id: BlueId,
  graph: EditorGraph,
  signal?: AbortSignal,
) {
  await apiClient.request(
    `/front/topo/${encodeURIComponent(id)}/draw/?task_type=6`,
    {
      method: 'POST',
      json: { topo: toX6Graph(graph) },
      signal,
      isBusinessFailure: (v) =>
        !v || (typeof v === 'object' && 'status' in v && v.status === 2),
    },
  )
}
