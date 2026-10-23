import { afterEach, expect, it, vi } from 'vitest'
import { getTrafficSniffing, setTrafficSniffing } from './traffic-sniffing'

afterEach(() => vi.unstubAllGlobals())
it('嗅探契约使用拓扑与链路业务ID，不把错误响应或业务拒绝当成功', async () => {
  let response: unknown = { status: 1 }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      expect(url.pathname).toBe(
        '/api/front/topo/topo%2Fa/edge/501/capture_status/',
      )
      return Response.json(response)
    }),
  )
  await expect(getTrafficSniffing('topo/a', 501)).resolves.toEqual({
    status: 1,
  })
  response = { status: '1' }
  await expect(getTrafficSniffing('topo/a', 501)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 2, message: '嗅探失败' })),
  )
  await expect(setTrafficSniffing('topo/a', 501, true)).rejects.toMatchObject({
    kind: 'business',
    message: '嗅探失败',
  })
  const controller = new AbortController()
  controller.abort()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, request: RequestInit) => {
      expect(request.signal?.aborted).toBe(true)
      throw new DOMException('Aborted', 'AbortError')
    }),
  )
  await expect(
    getTrafficSniffing('topo/a', 501, controller.signal),
  ).rejects.toMatchObject({ kind: 'cancelled' })
})
