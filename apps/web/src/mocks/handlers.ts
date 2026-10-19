import { HttpResponse, delay, http } from 'msw'
import { createSampleHandlers } from './sample-handlers'

export const handlers = [
  ...createSampleHandlers(),
  http.get('/api/diagnostics', async ({ request }) => {
    const mode = new URL(request.url).searchParams.get('mode')

    if (mode === 'empty') return HttpResponse.json({ items: [] })
    if (mode === 'http-error') {
      return HttpResponse.json(
        { message: '模拟服务暂时不可用' },
        { status: 503 },
      )
    }
    if (mode === 'business-error') {
      return HttpResponse.json({
        success: false,
        message: '模拟资源状态不允许此操作',
        fieldErrors: { state: '资源已锁定' },
      })
    }
    if (mode === 'slow' || mode === 'timeout') await delay(300)

    return HttpResponse.json({
      items: [
        { id: 'mock-01', label: '统一客户端' },
        { id: 'mock-02', label: 'TanStack Query' },
      ],
    })
  }),
]
