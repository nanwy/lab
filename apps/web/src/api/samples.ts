import { apiClient } from './index'

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

export function getSamples(query: SampleQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    filter: query.filter,
    sort: query.descending ? 'name:desc' : 'name:asc',
  })
  return apiClient.request<SamplePage>(`/diagnostics/samples?${params}`, {
    signal,
  })
}
export function updateSample(id: string, value: SampleInput) {
  return apiClient.request<Sample>(
    `/diagnostics/samples/${encodeURIComponent(id)}`,
    { method: 'PATCH', json: value },
  )
}
