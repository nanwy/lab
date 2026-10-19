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
  it('只公开约定字段中批准的模拟错误消息', async () => {
    server.use(
      http.patch('http://localhost/api/diagnostics/samples/one', () =>
        HttpResponse.json(
          {
            message: 'private-token',
            fieldErrors: {
              name: '该名称由模拟服务保留，请换一个名称',
              secret: 'private-data',
            },
          },
          { status: 422 },
        ),
      ),
    )
    await expect(
      updateSample('one', { name: '样本', metadata: { aliases: [] } }),
    ).rejects.toMatchObject({
      kind: 'http',
      message: '请求失败（422）',
      fieldErrors: { name: '该名称由模拟服务保留，请换一个名称' },
    })
  })
})
