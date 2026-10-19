import { apiClient } from './index'
import { ApiError } from './client'
import { z } from 'zod'

const sampleSchema = z.object({
  id: z.string(),
  name: z.string(),
  metadata: z.object({ aliases: z.array(z.string()) }),
})
const samplePageSchema = z.object({
  items: z.array(sampleSchema),
  total: z.number().int().nonnegative(),
})

export type Sample = {
  id: string
  name: string
  metadata: { aliases: string[] }
}
export type SampleInput = Omit<Sample, 'id'>
export type SampleQuery = {
  page: number
  pageSize: number
  filter: string
  descending: boolean
}
export type SamplePage = { items: Sample[]; total: number }

export async function getSamples(query: SampleQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    filter: query.filter,
    sort: query.descending ? 'name:desc' : 'name:asc',
  })
  const result = await apiClient.request<unknown>(
    `/diagnostics/samples?${params}`,
    {
      signal,
    },
  )
  const parsed = samplePageSchema.safeParse(result)
  if (!parsed.success)
    throw new ApiError('invalid-response', '样本分页响应不符合约定')
  return parsed.data
}
export async function updateSample(id: string, value: SampleInput) {
  const result = await apiClient.request<unknown>(
    `/diagnostics/samples/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      json: value,
      errorDisplay: {
        fieldErrors: {
          name: {
            '该名称由模拟服务保留，请换一个名称':
              '该名称由模拟服务保留，请换一个名称',
          },
        },
      },
    },
  )
  const parsed = sampleSchema.safeParse(result)
  if (!parsed.success)
    throw new ApiError('invalid-response', '样本更新响应不符合约定')
  return parsed.data
}
