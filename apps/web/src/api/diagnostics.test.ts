// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createApiClient } from './client'
import { getDiagnosticResult } from './diagnostics'

describe('诊断接口契约', () => {
  it.each([{ data: [] }, { items: [{ id: 1, label: '错误类型' }] }, null])(
    '拒绝缺失或类型错误的约定字段：%j',
    async (body) => {
      const client = createApiClient({
        baseUrl: 'http://localhost/api',
        fetch: async () => Response.json(body),
      })
      await expect(
        getDiagnosticResult(client, 'success'),
      ).rejects.toMatchObject({
        kind: 'invalid-response',
        message: '诊断响应不符合约定',
      })
    },
  )
  it('保留合法的空结果', async () => {
    const client = createApiClient({
      baseUrl: 'http://localhost/api',
      fetch: async () => Response.json({ items: [] }),
    })
    await expect(getDiagnosticResult(client, 'empty')).resolves.toEqual({
      items: [],
    })
  })
})
