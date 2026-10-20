// @vitest-environment node
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { getSamples, updateSample } from './samples'

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
const query = { page: 0, pageSize: 10, filter: '', descending: false }

describe('样本接口契约', () => {
  it('拒绝把错误字段当成合法的空页', async () => {
    server.use(
      http.get('http://localhost/api/diagnostics/samples', () =>
        HttpResponse.json({ rows: [], total: '0' }),
      ),
    )
    await expect(getSamples(query)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })
  it('更新结果必须包含完整的样本契约', async () => {
    server.use(
      http.patch('http://localhost/api/diagnostics/samples/one', () =>
        HttpResponse.json({
          id: 'one',
          name: '样本',
          metadata: { aliases: 3 },
        }),
      ),
    )
    await expect(
      updateSample('one', { name: '样本', metadata: { aliases: [] } }),
    ).rejects.toMatchObject({ kind: 'invalid-response' })
  })
  it('透传 HTTP error 文案', async () => {
    server.use(
      http.patch('http://localhost/api/diagnostics/samples/one', () =>
        HttpResponse.json(
          {
            error: '名称不可用',
          },
          { status: 422 },
        ),
      ),
    )
    await expect(
      updateSample('one', { name: '样本', metadata: { aliases: [] } }),
    ).rejects.toMatchObject({
      kind: 'http',
      message: '名称不可用',
    })
  })
})
