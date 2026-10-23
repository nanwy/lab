import { z } from 'zod'
import { apiClient, ApiError } from './index'
import { appConfig } from '../config'

const config = z.object({
  protocol: z.string().nullable(),
  src_ip: z.string().nullable(),
  dst_port: z.string().nullable(),
})
const template = z.looseObject({
  id: z.union([z.number(), z.string()]),
  name: z.string(),
  script: z.string(),
  config,
  is_built_in: z.boolean().optional(),
})
export type InterceptionTemplate = z.infer<typeof template>
export type InterceptionDraft = {
  protocol: string
  src_ip: string
  dst_port: string
  script: string
}
export type InterceptionInfo = {
  running: boolean
  cid?: string | number | null
  draft: InterceptionDraft
}
export const emptyInterception: InterceptionDraft = {
  protocol: '',
  src_ip: '',
  dst_port: '',
  script: '',
}
export const interceptionSchema = z.object({
  protocol: z.string().min(1, '请选择或输入协议'),
  src_ip: z.string(),
  dst_port: z.string(),
  script: z.string().min(1, '请输入拦截代码'),
})
const root = '/front/topo/blocking_template/'
const node = (id: string | number, uuid: string) =>
  `/front/topo/${encodeURIComponent(id)}/node/${encodeURIComponent(uuid)}/`
async function parsed<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  const result = schema.safeParse(await apiClient.request(path, { signal }))
  if (!result.success)
    throw new ApiError('invalid-response', `${path} 响应不符合流量拦截契约`)
  return result.data
}
const failed = (value: unknown) =>
  !value || typeof value !== 'object' || Reflect.get(value, 'status') !== 1
export const draftFromConfig = (value: {
  config: z.infer<typeof config>
  script: string
}): InterceptionDraft => ({
  protocol: value.config.protocol ?? '',
  src_ip: value.config.src_ip ?? '',
  dst_port: value.config.dst_port ?? '',
  script: value.script,
})
export const interceptionConfig = (draft: InterceptionDraft) => ({
  protocol: draft.protocol || null,
  src_ip: draft.src_ip || null,
  dst_port: draft.dst_port || null,
})
export async function getInterception(
  id: string | number,
  uuid: string,
  signal?: AbortSignal,
): Promise<InterceptionInfo> {
  const response = await parsed(
    `${node(id, uuid)}blocking_info/`,
    z.object({
      status: z.literal(1),
      data: z.union([
        z.object({
          status: z.number(),
          config,
          script: z.string(),
          cid: z
            .union([z.string(), z.number()])
            .refine(
              (value) =>
                String(value).trim() !== '' && Number.isFinite(Number(value)),
            )
            .nullish(),
        }),
        z.object({}).strict(),
      ]),
    }),
    signal,
  )
  if (!response.data.config)
    return { running: false, draft: { ...emptyInterception } }
  return {
    running: [1, 2].includes(response.data.status),
    cid: response.data.cid,
    draft: draftFromConfig({
      config: response.data.config,
      script: response.data.script,
    }),
  }
}
export async function saveInterception(
  id: string | number,
  uuid: string,
  draft: InterceptionDraft,
  start: boolean,
  signal?: AbortSignal,
) {
  return apiClient.request(
    `${node(id, uuid)}blocking_${start ? 'start' : 'draft'}/`,
    {
      method: 'POST',
      json: { config: interceptionConfig(draft), script: draft.script },
      signal,
      isBusinessFailure: failed,
    },
  )
}
export const closeInterception = (
  id: string | number,
  uuid: string,
  signal?: AbortSignal,
) =>
  apiClient.request(`${node(id, uuid)}blocking_close/`, {
    signal,
    isBusinessFailure: failed,
  })
export async function getInterceptionProtocols(signal?: AbortSignal) {
  return (
    await parsed(
      '/front/topo/common_protocol/',
      z.object({ status: z.literal(1), data: z.array(z.string()) }),
      signal,
    )
  ).data
}
export async function buildInterceptionRule(
  draft: InterceptionDraft,
  signal?: AbortSignal,
) {
  const response = await apiClient.request<unknown>(
    '/front/topo/build_strategy/',
    {
      method: 'POST',
      json: {
        protocol: draft.protocol,
        src_ip: draft.src_ip,
        dst_port: draft.dst_port,
      },
      signal,
      isBusinessFailure: failed,
    },
  )
  const result = z
    .object({ status: z.literal(1), data: z.array(z.string()) })
    .safeParse(response)
  if (!result.success)
    throw new ApiError('invalid-response', '拦截规则响应不符合契约')
  return result.data.data
}
export const getInterceptionTemplates = (signal?: AbortSignal) =>
  parsed(`${root}?nopage=1`, z.array(template), signal)
export async function saveInterceptionTemplate(
  draft: InterceptionDraft,
  name: string,
  original?: InterceptionTemplate,
  signal?: AbortSignal,
  saveAs = false,
) {
  const path = original ? `${root}${encodeURIComponent(original.id)}/` : root
  const value = await apiClient.request(path, {
    method: original ? 'PATCH' : 'POST',
    json: {
      ...original,
      name,
      script: draft.script,
      strategy: saveAs
        ? {
            protocol: draft.protocol,
            src_ip: draft.src_ip,
            dst_port: draft.dst_port,
          }
        : interceptionConfig(draft),
    },
    signal,
  })
  const result = template.safeParse(value)
  if (!result.success)
    throw new ApiError('invalid-response', '拦截模板保存响应不符合契约')
  return result.data
}
export const deleteInterceptionTemplate = (
  id: string | number,
  signal?: AbortSignal,
) =>
  apiClient.request(`${root}${encodeURIComponent(id)}/`, {
    method: 'DELETE',
    signal,
    isBusinessFailure: (value) =>
      !!value &&
      typeof value === 'object' &&
      Reflect.get(value, 'status') === 2,
  })
export function importInterceptionTemplates(file: File, signal?: AbortSignal) {
  const body = new FormData()
  body.append('file', file)
  return apiClient.request(`${root}import_export/`, {
    method: 'POST',
    body,
    signal,
    isBusinessFailure: failed,
  })
}
export const interceptionExportHref = () =>
  `${appConfig.apiBaseUrl}/scene/blocking_template/import_export/`
