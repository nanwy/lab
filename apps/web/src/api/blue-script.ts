import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { blueId, type BlueId } from './blue-team'
const reference = blueId.or(z.literal(''))
const nodeDataSchema = z.looseObject({
  id: reference.optional(),
  name: z.string(),
  type: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(7),
    z.literal(8),
  ]),
  style: z.record(z.string(), z.unknown()).optional(),
})
const nodeSchema = z.looseObject({
  id: z.string(),
  type: z.literal('customNode'),
  position: z.object({ x: z.number(), y: z.number() }),
  data: nodeDataSchema,
})
const edgeSchema = z.looseObject({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  type: z.string().optional(),
  data: z.looseObject({ id: reference.optional() }).optional(),
})
export const scriptGraphSchema = z.looseObject({
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
})
export type ScriptGraph = z.infer<typeof scriptGraphSchema>
export type ScriptNodeData = z.infer<typeof nodeDataSchema>
export type ScriptNode = ScriptGraph['nodes'][number]
export type ScriptEdge = ScriptGraph['edges'][number]
export const scriptBase = (id: BlueId) =>
  `/front/wqzb/simulated_blue_team/scenario/${encodeURIComponent(id)}`
export async function readScript<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError(
      'invalid-response',
      `${path.split('?')[0]} 响应不符合剧本契约（${result.error.issues.map((i) => i.path.join('.')).join(',')}）`,
    )
  return result.data
}
const statusOne = z.object({ status: z.literal(1) })
export async function scriptCommand(
  path: string,
  json: unknown,
  signal?: AbortSignal,
  method = 'POST',
  success: 'status' | 'id' = 'status',
) {
  return apiClient.request<unknown>(path, {
    method,
    json,
    signal,
    isBusinessFailure: (value) =>
      success === 'status'
        ? !statusOne.safeParse(value).success
        : !z.object({ id: blueId }).safeParse(value).success,
  })
}
export const scriptKeys = {
  detail: (id: BlueId) => ['blue-script', String(id), 'detail'] as const,
  draw: (id: BlueId) => ['blue-script', String(id), 'draw'] as const,
}
export const getScriptDetail = (id: BlueId, signal?: AbortSignal) =>
  readScript(
    z.looseObject({ id: blueId }),
    `${scriptBase(id)}/?source=2`,
    signal,
  )
export async function getScriptGraph(id: BlueId, signal?: AbortSignal) {
  const value = await readScript(
    z.object({ topo_json: scriptGraphSchema }),
    `${scriptBase(id)}/draw/`,
    signal,
  )
  validateGraph(value.topo_json)
  return value.topo_json
}
export function validateGraph(graph: ScriptGraph) {
  const ids = new Set<string>()
  for (const node of graph.nodes) {
    if (ids.has(node.id))
      throw new ApiError('invalid-response', '剧本图节点标识重复')
    ids.add(node.id)
  }
  const edgeIds = new Set<string>()
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id) || !ids.has(edge.source) || !ids.has(edge.target))
      throw new ApiError('invalid-response', '剧本图连线引用无效')
    edgeIds.add(edge.id)
  }
}
export async function saveScriptGraph(
  id: BlueId,
  graph: ScriptGraph,
  signal?: AbortSignal,
) {
  validateGraph(graph)
  const raw = await scriptCommand(
    `${scriptBase(id)}/draw/`,
    { topo_json: graph },
    signal,
  )
  const parsed = z
    .object({
      status: z.literal(1),
      data: z.object({ topo_json: scriptGraphSchema }),
    })
    .safeParse(raw)
  if (!parsed.success)
    throw new ApiError('invalid-response', '剧本保存响应缺少有效topo_json')
  validateGraph(parsed.data.data.topo_json)
  return parsed.data.data.topo_json
}
export const previousSchema = z.array(
  z.object({ id: blueId, variable: z.string() }),
)
export const lineSchema = z.looseObject({
  weight: z.number(),
  sign: z.number(),
  brief: z.string().optional(),
})
export const getLine = (id: BlueId, edge: BlueId, signal?: AbortSignal) =>
  readScript(
    z.object({ status: z.literal(1), data: lineSchema }),
    `${scriptBase(id)}/draw/line/${encodeURIComponent(edge)}/`,
    signal,
  ).then((r) => r.data)
export const getPrevious = (id: BlueId, node: BlueId, signal?: AbortSignal) =>
  readScript(
    previousSchema,
    `${scriptBase(id)}/draw/node/${encodeURIComponent(node)}/last_variate/`,
    signal,
  )
export const getCombinationParams = (signal?: AbortSignal) =>
  readScript(
    z.array(z.object({ id: blueId, variable: z.string() })),
    '/front/wqzb/basic_resources/inouput/?nopage=1',
    signal,
  )
export const getDecisions = (id: BlueId, node: BlueId, signal?: AbortSignal) =>
  readScript(
    z.array(
      z.object({
        id: blueId.optional(),
        data_define_id: blueId.nullable().optional(),
        value: z.string(),
      }),
    ),
    `${scriptBase(id)}/draw/node/${encodeURIComponent(node)}/decision/`,
    signal,
  )
export const branchSchema = z.looseObject({
  data_list: z.array(
    z.looseObject({
      define_id: reference,
      value: z.string(),
      next_node: reference,
    }),
  ),
  transform_list: z.array(
    z.looseObject({
      define_id: reference,
      value: z.string(),
      next_define_id: reference,
      select_defines: z.array(blueId),
      rule: z.string(),
    }),
  ),
})
export const getBranch = (id: BlueId, node: BlueId, signal?: AbortSignal) =>
  readScript(
    branchSchema,
    `${scriptBase(id)}/draw/node/${encodeURIComponent(node)}/branch/`,
    signal,
  )
export const getBranchActions = (
  id: BlueId,
  node: BlueId,
  signal?: AbortSignal,
) =>
  readScript(
    z.array(z.object({ id: blueId, name: z.string() })),
    `${scriptBase(id)}/draw/node/${encodeURIComponent(node)}/branch/action/`,
    signal,
  )
export type CascadeItem = {
  value: BlueId
  label: string
  children?: CascadeItem[]
  color?: { r: number; g: number; b: number; a: number }
}
const cascadeSchema: z.ZodType<CascadeItem[]> = z.array(
  z.object({
    value: blueId,
    label: z.string(),
    children: z.lazy(() => cascadeSchema).optional(),
    color: z
      .object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() })
      .optional(),
  }),
)
export type InstructionCategory = {
  id: BlueId
  name: string
  background?: { r: number; g: number; b: number; a: number }
  children?: InstructionCategory[]
}
const instructionCascadeSchema: z.ZodType<InstructionCategory[]> = z.array(
  z.object({
    id: blueId,
    name: z.string(),
    background: z
      .object({ r: z.number(), g: z.number(), b: z.number(), a: z.number() })
      .optional(),
    children: z.lazy(() => instructionCascadeSchema).optional(),
  }),
)
export const getInstructionCascade = (signal?: AbortSignal) =>
  readScript(
    instructionCascadeSchema,
    '/front/wqzb/test_task/instruction/cascade/',
    signal,
  )
const optionalActionId = reference
  .nullable()
  .optional()
  .transform((value) => (value ? String(value) : ''))
export const actionSchema = z.object({
  tactics: optionalActionId,
  technology: optionalActionId,
  sub_technology: optionalActionId,
  sub_technology_name: z.string().optional(),
})
export const getAction = (id: BlueId, node: BlueId, signal?: AbortSignal) =>
  readScript(
    z.object({ status: z.literal(1), data: actionSchema }),
    `${scriptBase(id)}/draw/node/${encodeURIComponent(node)}/action/`,
    signal,
  ).then((r) => r.data)
export const instructionSchema = z.object({
  count: z.number(),
  results: z.array(
    z.object({
      id: blueId,
      name: z.string(),
      tool_name: z.string(),
      operating_system: z.array(z.string()),
      use: z.boolean(),
      weight: z.number(),
    }),
  ),
})
export const getInstructions = (
  id: BlueId,
  node: BlueId,
  page: number,
  signal?: AbortSignal,
) =>
  readScript(
    instructionSchema,
    `${scriptBase(id)}/draw/node/${encodeURIComponent(node)}/action/instruct/?page=${page}&size=10`,
    signal,
  )
export type AbilityParameter = {
  param_name: string
  required?: boolean
  field_type: 1 | 2 | 3 | 4
  example?: unknown
  child?: AbilityParameter[]
}
const parameterSchema: z.ZodType<AbilityParameter> = z.object({
  param_name: z.string(),
  required: z.boolean().optional(),
  field_type: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  example: z.unknown().optional(),
  child: z
    .lazy(() => z.array(parameterSchema))
    .nullish()
    .transform((value) => value ?? []),
})
export const getAbility = (id: BlueId, signal?: AbortSignal) =>
  readScript(
    z.object({
      id: blueId,
      name: z.string(),
      sign: z.string().nullable().optional(),
      desc: z.string().nullable().optional(),
      tactics_name: z.string().nullable().optional(),
      technology_name: z.string().nullable().optional(),
      attack_style_display: z.string().nullable().optional(),
      input_params: z
        .array(parameterSchema)
        .nullish()
        .transform((value) => value ?? []),
      output_params: z
        .array(parameterSchema)
        .nullish()
        .transform((value) => value ?? []),
    }),
    `/front/wqzb/basic_resources/subtolgy/${encodeURIComponent(id)}/`,
    signal,
  )
export const behaviorSchema = z.looseObject({
  id: blueId,
  topo_node: reference.nullable().optional(),
  tool_type: z.union([z.literal(1), z.literal(2)]),
  tool_detail: z.array(
    z.looseObject({
      tool_id: blueId.optional(),
      version_ids: z.array(blueId).optional(),
      file: z.string().optional(),
    }),
  ),
  interpreter: z.number(),
  content: z.string(),
  filename: z.string().optional(),
})
export const getBehavior = (id: BlueId, node: BlueId, signal?: AbortSignal) =>
  readScript(
    behaviorSchema,
    `${scriptBase(id)}/draw/node/${encodeURIComponent(node)}/behavior_simulate/`,
    signal,
  )
export const getToolVersions = (signal?: AbortSignal) =>
  readScript(cascadeSchema, '/front/wqzb/tool/version/cascade/', signal)
export async function uploadBehavior(file: File, signal?: AbortSignal) {
  const body = new FormData()
  body.append('file', file)
  body.append('mode', 'behavior_simulate')
  const raw = await apiClient.request(
    '/front/wqzb/basic_resources/upload_file/',
    {
      method: 'POST',
      body,
      signal,
      isBusinessFailure: (value) => !statusOne.safeParse(value).success,
    },
  )
  const parsed = z
    .object({ data: z.object({ url: z.string().min(1) }) })
    .safeParse(raw)
  if (!parsed.success)
    throw new ApiError('invalid-response', '上传响应缺少文件地址')
  return parsed.data.data.url
}
export const getTerminalSystems = (id: BlueId, signal?: AbortSignal) =>
  readScript(
    z.object({ status: z.literal(1), data: z.array(z.string()) }),
    `${scriptBase(id)}/instruction/terminal/`,
    signal,
  ).then((r) => r.data)
export const terminalSchema = z.object({
  count: z.number(),
  results: z.array(
    z.object({
      id: blueId,
      system: z.string(),
      tool_list: z.array(
        z.object({ tool__name: z.string(), version__name: z.string() }),
      ),
    }),
  ),
})
export const getTerminals = (id: BlueId, page: number, signal?: AbortSignal) =>
  readScript(
    terminalSchema,
    `${scriptBase(id)}/terminal/?page=${page}&size=10`,
    signal,
  )
