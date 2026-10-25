import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { blueId, type BlueId } from './blue-team'
export const intelligentBase = (id: BlueId) =>
  `/front/wqzb/simulated_blue_team/intelligent/list/${encodeURIComponent(id)}`
export async function readIntelligent<T>(
  schema: z.ZodType<T>,
  path: string,
  signal?: AbortSignal,
) {
  const parsed = schema.safeParse(await apiClient.request(path, { signal }))
  if (!parsed.success)
    throw new ApiError(
      'invalid-response',
      `智能蓝军响应格式错误：${path.split('?')[0]}（${parsed.error.issues.map((i) => i.path.join('.')).join(',')}）`,
    )
  return parsed.data
}
export const intelligentCommand = (
  path: string,
  json: unknown,
  signal?: AbortSignal,
  success: 'status' | 'truthy' = 'status',
) =>
  apiClient.request(path, {
    method: 'POST',
    json,
    signal,
    isBusinessFailure: (value) =>
      success === 'truthy'
        ? !value || z.object({ status: z.literal(2) }).safeParse(value).success
        : !z.object({ status: z.literal(1) }).safeParse(value).success,
  })
const detailSchema = z.object({
  id: blueId,
  name: z.string(),
  ability_scenario_names: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  description: z.string().nullable().optional(),
})
const statisticSchema = z.object({
  tactics_count: z.number().nullish(),
  technologies_count: z.number().nullish(),
  attack_tendency: z.number().nullish(),
  force_count: z.number().nullish(),
  enabled_engines_count: z.number().nullish(),
  ability_styles: z
    .array(z.object({ name: z.string(), abilities_count: z.number() }))
    .nullish()
    .transform((v) => v ?? []),
})
export const getIntelligent = (id: BlueId, signal?: AbortSignal) =>
  readIntelligent(detailSchema, `${intelligentBase(id)}/`, signal)
export const getIntelligentStatistics = (id: BlueId, signal?: AbortSignal) =>
  readIntelligent(
    z.object({ data: statisticSchema }),
    `${intelligentBase(id)}/data_statistics/`,
    signal,
  ).then((r) => r.data)
const dimensionSchema = z.object({ id: blueId, name: z.string() })
const abilitySchema = z.object({
  id: blueId,
  name: z.string(),
  instruction_count: z.number(),
})
const rgbaSchema = z.object({
  r: z.number(),
  g: z.number(),
  b: z.number(),
  a: z.number(),
})
export const getIntelligentAbilities = (id: BlueId, signal?: AbortSignal) =>
  readIntelligent(
    z.object({
      status: z.literal(1),
      data: z.array(
        dimensionSchema.extend({
          color: rgbaSchema.nullable().optional(),
          abilities: z.array(abilitySchema),
        }),
      ),
    }),
    `${intelligentBase(id)}/ability_action/`,
    signal,
  ).then((r) => r.data)
export const getAbilityDimensions = (signal?: AbortSignal) =>
  readIntelligent(
    z.array(dimensionSchema),
    '/front/base/tag/?otype_plus=category&otype=attack_style&nopage=1',
    signal,
  )
export const getImportAbilities = (
  id: BlueId,
  dimension: BlueId,
  search: string,
  page: number,
  size: number,
  signal?: AbortSignal,
) =>
  readIntelligent(
    z.object({
      status: z.literal(1),
      data: z.object({
        abilities: z.array(
          abilitySchema.extend({
            code: z.string(),
            dimension_name: z.string(),
          }),
        ),
        total: z.number(),
      }),
    }),
    `${intelligentBase(id)}/ability_action/import/dimensions/${encodeURIComponent(dimension)}/?${new URLSearchParams({ search, page: String(page), size: String(size) })}`,
    signal,
  ).then((r) => r.data)
const tacticSchema = z.object({
  name: z.string(),
  child: z.array(
    z.object({
      name: z.string(),
      child: z.array(abilitySchema.extend({ is_exists: z.boolean() })),
    }),
  ),
})
export const getIntelligentTactics = (id: BlueId, signal?: AbortSignal) =>
  readIntelligent(
    z.object({ status: z.literal(1), data: z.array(tacticSchema) }),
    `${intelligentBase(id)}/tactics/`,
    signal,
  ).then((r) => r.data)
export const engineSchema = z.object({
  engine_type: blueId,
  engine_type_name: z.string(),
  is_enabled: z.boolean(),
  weight: z.number().nullable(),
})
export type IntelligentEngine = z.infer<typeof engineSchema>
export const getIntelligentEngines = (id: BlueId, signal?: AbortSignal) =>
  readIntelligent(
    z.object({ status: z.literal(1), data: z.array(engineSchema) }),
    `${intelligentBase(id)}/decision_engine/`,
    signal,
  ).then((r) =>
    r.data.toSorted((a, b) => Number(a.engine_type) - Number(b.engine_type)),
  )
