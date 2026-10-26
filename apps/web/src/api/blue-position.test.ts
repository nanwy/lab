import { afterEach, expect, it, vi } from 'vitest'
import { getPositionTerminals, getPositionTools } from './blue-position'
afterEach(() => vi.unstubAllGlobals())
it('终端保留未知字段及可空列表，工具未启动与业务失败和坏列表明确区分', async () => {
  const terminal = {
    id: 7,
    blue_team_id: 100,
    scenario_type: 1 as const,
    custom: { keep: true },
  }
  vi.stubGlobal('fetch', async () =>
    Response.json({
      status: 1,
      data: { used_data: null, unused_data: [terminal] },
    }),
  )
  await expect(getPositionTerminals('task')).resolves.toEqual({
    used_data: [],
    unused_data: [terminal],
  })
  vi.stubGlobal('fetch', async () =>
    Response.json({ status: 1, data: { used_data: {}, unused_data: [] } }),
  )
  await expect(getPositionTerminals('task')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  vi.stubGlobal('fetch', async () => Response.json({ status: 1 }))
  await expect(
    getPositionTools('task', terminal, { page: 1, search: '' }),
  ).resolves.toBeNull()
  vi.stubGlobal('fetch', async () =>
    Response.json({ status: 2, message: '工具读取被拒绝' }),
  )
  await expect(
    getPositionTools('task', terminal, { page: 1, search: '' }),
  ).rejects.toMatchObject({ kind: 'business', handled: true })
  vi.stubGlobal('fetch', async () => Response.json({ count: 0, results: {} }))
  await expect(
    getPositionTools('task', terminal, { page: 1, search: '' }),
  ).rejects.toMatchObject({ kind: 'invalid-response' })
})
