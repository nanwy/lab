import { afterEach, expect, it, vi } from 'vitest'
import {
  getExperiments,
  getExperiment,
  saveExperiment,
  saveExperimentOverview,
  deleteExperiment,
  getExperimentScenes,
  importExperiment,
  getExperimentTags,
  experimentInfoSchema,
} from './experiments'

afterEach(() => vi.unstubAllGlobals())

it('实验列表缺失分页总数时报告契约错误，不以空列表冒充成功', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ results: [] })),
  )
  await expect(getExperiments('today')).rejects.toMatchObject({
    kind: 'invalid-response',
    message: expect.stringContaining('count:invalid_type'),
  })
})

it('历史实验与场景库按原 URL 拼写提交分页搜索，详情不要求未消费的列表字段', async () => {
  const paths: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      paths.push(url.pathname + url.search)
      return Response.json({ count: 0, results: [] })
    }),
  )
  await getExperiments('before', 2, '网络&安全')
  await getExperimentScenes(3, '场景')
  expect(paths).toEqual([
    '/api/front/simulation/experiment/more/?page=2&size=10&search=%E7%BD%91%E7%BB%9C%26%E5%AE%89%E5%85%A8',
    '/api/front/simulation/experiment/expreiment_scene/?page=3&size=10&search=%E5%9C%BA%E6%99%AF',
  ])
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      expect(url.pathname + url.search).toBe(
        '/api/front/simulation/experiment/a%2Fb/?more=1',
      )
      return Response.json({
        id: 'a/b',
        name: '实验',
        desc: '',
        node_count: 0,
        user_name: '学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: '',
      })
    }),
  )
  expect(await getExperiment('a/b')).toMatchObject({
    name: '实验',
    tags_category: '',
  })
})

it('创建和编辑以返回 id 判成功，删除 POST ids，场景导入 GET status 判成功', async () => {
  const commands: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      commands.push([
        url.pathname + url.search,
        options.method,
        options.body ? JSON.parse(String(options.body)) : null,
      ])
      return Response.json(
        url.pathname.endsWith('delete/') || url.pathname.includes('select/')
          ? { status: 1 }
          : { id: 7 },
      )
    }),
  )
  await saveExperiment({ name: '实验', desc: '' })
  await saveExperiment({ name: '新名称', desc: '说明' }, 7)
  await deleteExperiment(7)
  await importExperiment('a/b')
  expect(commands).toEqual([
    ['/api/front/simulation/experiment/', 'POST', { name: '实验', desc: '' }],
    [
      '/api/front/simulation/experiment/7/?more=1',
      'PATCH',
      { name: '新名称', desc: '说明' },
    ],
    ['/api/front/simulation/experiment/delete/', 'POST', { ids: [7] }],
    ['/api/front/simulation/experiment/select/a%2Fb/', 'GET', null],
  ])
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 2 })),
  )
  await expect(importExperiment(1)).rejects.toMatchObject({ kind: 'business' })
  await expect(deleteExperiment(1)).rejects.toMatchObject({ kind: 'business' })
  await expect(
    saveExperiment({ name: '实验', desc: '' }),
  ).rejects.toMatchObject({ kind: 'invalid-response' })
})

it('标签只从 tag 名称来源读取，校验最多五个与单项二十字，读取支持取消', async () => {
  const controller = new AbortController()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      expect(url.pathname + url.search).toBe(
        '/api/front/base/tag/?otype_plus=tag&nopage=1',
      )
      expect(options.signal?.aborted).toBe(true)
      throw new DOMException('Aborted', 'AbortError')
    }),
  )
  controller.abort()
  await expect(getExperimentTags(controller.signal)).rejects.toMatchObject({
    kind: 'cancelled',
  })
  expect(
    experimentInfoSchema.safeParse({
      name: '实验',
      desc: '',
      tag: Array(6).fill('网络'),
    }).success,
  ).toBe(false)
  expect(
    experimentInfoSchema.safeParse({
      name: '实验',
      desc: '',
      tag: ['长'.repeat(21)],
    }).success,
  ).toBe(false)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json([{ label: '错误字段' }])),
  )
  await expect(getExperimentTags()).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('说明独立保存仅提交 overview，并拒绝缺少 id 的响应', async () => {
  const controller = new AbortController()
  const requests: unknown[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      requests.push([
        url.pathname + url.search,
        options.method,
        JSON.parse(String(options.body)),
      ])
      return Response.json({ id: 'a/b' })
    }),
  )
  await expect(
    saveExperimentOverview('a/b', '<h2>说明</h2>', controller.signal),
  ).resolves.toEqual({ id: 'a/b' })
  expect(requests).toEqual([
    [
      '/api/front/simulation/experiment/a%2Fb/?more=1',
      'PATCH',
      { overview: '<h2>说明</h2>' },
    ],
  ])
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ status: 1 })),
  )
  await expect(saveExperimentOverview('a/b', '')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
