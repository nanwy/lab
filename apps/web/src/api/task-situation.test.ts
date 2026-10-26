import { afterEach, expect, it, vi } from 'vitest'
import {
  getTaskSituationLogs,
  getTaskSituationNetwork,
  getTaskSituationRisk,
} from './task-situation'

afterEach(() => vi.unstubAllGlobals())

it('独立态势读取原顶层风险与IP关系，日志只消费原展示字段', async () => {
  const paths: string[] = []
  vi.stubGlobal('fetch', async (input: URL | string) => {
    const url = String(input)
    const parsed = new URL(url)
    paths.push(parsed.pathname + parsed.search)
    return Response.json(
      url.includes('rick_statistics')
        ? { 弱口令: '2', 待采集: null }
        : url.includes('flow_path')
          ? { ip_relation: [{ '192.0.2.1': [] }] }
          : {
              status: 1,
              data: {
                log: [
                  { create_time: null, message: '原日志无需status/spend_time' },
                ],
              },
            },
    )
  })
  await expect(getTaskSituationRisk('73')).resolves.toEqual({
    弱口令: 2,
    待采集: null,
  })
  await expect(getTaskSituationNetwork('73')).resolves.toMatchObject({
    nodes: [
      { id: '192.0.2.1', kind: 'ip' },
      { id: '192.0.2.sw', kind: 'switch' },
    ],
    edges: [{ source: '192.0.2.1', target: '192.0.2.sw' }],
  })
  await expect(getTaskSituationLogs('73', 1)).resolves.toEqual([
    { create_time: null, message: '原日志无需status/spend_time' },
  ])
  expect(paths).toEqual([
    '/api/front/wqzb/test_task/73/rick_statistics/',
    '/api/front/wqzb/test_task/73/flow_path/',
    '/api/front/wqzb/test_task/73/control/log/?kind=1',
  ])
})

it.each([
  [5, 5],
  [6, 12],
  [9, 18],
  [10, 10],
])('原日志%s条展示%s条，不扩大复制区间', async (count, expected) => {
  vi.stubGlobal('fetch', async () =>
    Response.json({
      status: 1,
      data: {
        log: Array.from({ length: count }, (_, i) => ({ message: `日志${i}` })),
      },
    }),
  )
  await expect(getTaskSituationLogs('73', 2)).resolves.toHaveLength(expected)
})

it('合法空网络保留空图，错误字段类型明确拒绝', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ ip_relation: null }))
  await expect(getTaskSituationNetwork('73')).resolves.toEqual({
    nodes: [],
    edges: [],
  })
  vi.stubGlobal('fetch', async () =>
    Response.json({ ip_relation: [{ '192.0.2.1': {} }] }),
  )
  await expect(getTaskSituationNetwork('73')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  vi.stubGlobal('fetch', async () =>
    Response.json({ status: 1, data: { log: {} } }),
  )
  await expect(getTaskSituationLogs('73', 1)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
