import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { blueId, parseBlueResponse, type BlueId } from './blue-team'
const scalar = z.union([z.string(), z.number()])
const fieldValue = z.looseObject({
  data_define: blueId,
  define_name: z.string().optional(),
  define_value: scalar,
})
const arrayValue = z.looseObject({
  data_define: blueId,
  define_name: z.string().optional(),
  define_value: z.array(scalar),
})
const nodeFields = {
  id: blueId,
  data_define: blueId,
  define_name: z.string(),
  color: z.string().nullable().optional(),
}
const nodeValue = z.discriminatedUnion('data_type', [
  z.looseObject({
    ...nodeFields,
    data_type: z.literal(1),
    define_value: scalar,
  }),
  z.looseObject({
    ...nodeFields,
    data_type: z.literal(2),
    define_value: z.array(fieldValue),
  }),
  z.looseObject({
    ...nodeFields,
    data_type: z.literal(3),
    define_value: z.array(arrayValue),
  }),
])
export type SituationNode = z.infer<typeof nodeValue> & {
  child?: SituationNode[]
}
const childField = {
  child: z
    .lazy(() => z.array(nodeSchema))
    .nullish()
    .transform((value) => (value === null ? [] : value)),
}
export const nodeSchema: z.ZodType<SituationNode> = z.discriminatedUnion(
  'data_type',
  [
    nodeValue.options[0].extend(childField),
    nodeValue.options[1].extend(childField),
    nodeValue.options[2].extend(childField),
  ],
)
export const situationKeys = {
  tree: (taskId: BlueId) => ['blue-situation', String(taskId)] as const,
}
const base = (taskId: BlueId) =>
  `/front/wqzb/test_task/${encodeURIComponent(taskId)}/init_situation_node/`
export async function getSituation(taskId: BlueId, signal?: AbortSignal) {
  const result = await parseBlueResponse(
    z.object({ status: z.literal(1), data: z.array(nodeSchema) }),
    base(taskId),
    signal,
  )
  const seen = new Set<string>()
  const visit = (items: SituationNode[]) => {
    for (const item of items) {
      const id = String(item.id)
      if (seen.has(id))
        throw new ApiError('invalid-response', '态势节点标识重复')
      seen.add(id)
      visit(item.child ?? [])
    }
  }
  visit(result.data)
  return result.data
}
export function getSituationTypes(signal?: AbortSignal) {
  return parseBlueResponse(
    z.array(z.object({ id: blueId, datatype: z.string(), desc: z.string() })),
    '/front/wqzb/basic_resources/inouput/?nopage=1',
    signal,
  )
}
export async function saveSituation(
  taskId: BlueId,
  data: unknown,
  nodeId?: BlueId,
  signal?: AbortSignal,
) {
  await apiClient.request(
    nodeId === undefined
      ? base(taskId)
      : `${base(taskId)}${encodeURIComponent(nodeId)}/`,
    {
      method: nodeId === undefined ? 'POST' : 'PATCH',
      json: data,
      signal,
      isBusinessFailure: (value) => {
        if (nodeId === undefined)
          return !z.object({ status: z.literal(1) }).safeParse(value).success
        if (!value || typeof value !== 'object') return true
        return 'status' in value && value.status !== 1
      },
    },
  )
}
export async function deleteSituation(
  taskId: BlueId,
  nodeId: BlueId,
  signal?: AbortSignal,
) {
  await apiClient.request(`${base(taskId)}${encodeURIComponent(nodeId)}/`, {
    method: 'DELETE',
    signal,
    isBusinessFailure: (value) =>
      !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
}
/** 对齐原rho图节点；编辑请求保留原图归一化字段，不携带child子树。 */
export function situationGraphData(node: SituationNode) {
  let width = 20,
    height = 20
  if (node.data_type === 2) {
    width = Math.max(
      node.define_name.length,
      ...node.define_value.map(
        (row) =>
          String(row.define_value).length + (row.define_name?.length ?? 0) + 1,
      ),
    )
    height = node.define_value.length + 1
  }
  if (node.data_type === 3) {
    width = Math.max(
      node.define_value[0]?.define_name?.length ?? 0,
      ...(node.define_value[0]?.define_value ?? []).map(
        (value) => String(value).length,
      ),
    )
    height = (node.define_value[0]?.define_value.length || 1) + 1
  }
  return {
    id: node.id,
    data_type: node.data_type,
    name: String(node.id),
    define_name: node.define_name,
    data_define: node.data_define,
    define_value: node.define_value,
    symbol: node.data_type === 1 ? 'circle' : 'rect',
    symbolSize: node.data_type === 1 ? 80 : [width * 8, height * 22],
    label: {
      align: 'center',
      offset: node.data_type === 1 ? 0 : [0, 10],
      padding: 0,
    },
    itemStyle: { color: node.color || '#007bff' },
  }
}
