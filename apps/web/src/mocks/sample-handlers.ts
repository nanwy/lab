import { http, HttpResponse } from 'msw'
import type { Sample, SampleInput } from '../api/samples'
import { appConfig } from '../config'

// Each handler factory owns resettable fake data. No production identifiers or writes.
export function createSampleHandlers() {
  const initial = (): Sample[] =>
    Array.from({ length: 12 }, (_, i) => ({
      id: `sample-${String(i + 1).padStart(2, '0')}`,
      name: `样本 ${String(i + 1).padStart(2, '0')}`,
      metadata: { aliases: [`别名 ${i + 1}`] },
    }))
  let samples = initial()
  return [
    http.get(`${appConfig.apiBaseUrl}/diagnostics/samples`, ({ request }) => {
      const params = new URL(request.url).searchParams
      const page = Math.max(0, Number(params.get('page')) || 0)
      const pageSize = Math.max(
        1,
        Math.min(50, Number(params.get('pageSize')) || 5),
      )
      const matching = samples
        .filter((item) => item.name.includes(params.get('filter') ?? ''))
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name, 'zh-CN') *
            (params.get('sort') === 'name:desc' ? -1 : 1),
        )
      return HttpResponse.json({
        items: matching.slice(page * pageSize, (page + 1) * pageSize),
        total: matching.length,
      })
    }),
    http.patch(
      `${appConfig.apiBaseUrl}/diagnostics/samples/:id`,
      async ({ params, request }) => {
        const index = samples.findIndex((item) => item.id === params.id)
        if (index < 0)
          return HttpResponse.json(
            { message: '模拟样本不存在' },
            { status: 404 },
          )
        const value = (await request.json()) as SampleInput
        if (value.name === '保留名称')
          return HttpResponse.json(
            {
              message: '模拟服务拒绝保存',
              fieldErrors: { name: '该名称由模拟服务保留，请换一个名称' },
            },
            { status: 422 },
          )
        if (
          !value.name?.trim() ||
          !Array.isArray(value.metadata?.aliases) ||
          value.metadata.aliases.some(
            (alias) => typeof alias !== 'string' || !alias.trim(),
          )
        )
          return HttpResponse.json({ message: '模拟字段无效' }, { status: 422 })
        samples[index] = { id: samples[index]!.id, ...value }
        return HttpResponse.json(samples[index])
      },
    ),
    http.post(`${appConfig.apiBaseUrl}/diagnostics/samples/reset`, () => {
      samples = initial()
      return HttpResponse.json({ reset: true })
    }),
  ]
}
