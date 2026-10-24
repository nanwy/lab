import { afterEach, expect, it, vi } from 'vitest'
import { getDetectionTools } from './detection-tools'
afterEach(() => vi.unstubAllGlobals())
it('五类目录只按tool_type读取results，保留工具名称与标签', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ results: [{ id: 8, name: 'Nmap', tags: ['侦察'] }] }),
  )
  vi.stubGlobal('fetch', fetch)
  for (const type of ['1', '2', '3', '4', '5']) {
    expect(await getDetectionTools(type)).toEqual([
      { id: 8, name: 'Nmap', tags: ['侦察'] },
    ])
    const url = new URL(String(fetch.mock.calls.at(-1)?.[0]))
    expect(url.pathname).toBe('/api/front/wqzb/detection_front/tools/')
    expect(Object.fromEntries(url.searchParams)).toEqual({ tool_type: type })
  }
})
it('详情按工具ID读取，保留附件、镜像、空说明和只读手册的单一来源', async () => {
  const { getDetectionTool } = await import('./detection-tools')
  const detail = {
    id: 'a/b',
    name: '工具',
    tags: [],
    tool_carrier: 1,
    carrier_path: '/media/tool.zip',
    description: null,
    account: '',
    user_manual: '<p>手册</p>',
    image_info: null,
  }
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json(detail),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await getDetectionTool('a/b')).toEqual(detail)
  expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe(
    '/api/front/wqzb/detection_front/tools/a%2Fb/',
  )
  expect(new URL(String(fetch.mock.calls[0]?.[0])).search).toBe('')
})
it('详情ID不匹配不能把其他工具响应交给当前选择', async () => {
  const { getDetectionTool } = await import('./detection-tools')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({ id: 9, name: '其他工具', tags: [], tool_carrier: 2 }),
    ),
  )
  await expect(getDetectionTool(8)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})
it('合法空列表与契约失败区分，缺失必填和错误字段类型不能猜key', async () => {
  const { getDetectionTool } = await import('./detection-tools')
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ results: [] }),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await getDetectionTools('1')).toEqual([])
  for (const response of [{ data: [] }, { results: [{ id: 1, tags: [] }] }]) {
    fetch.mockResolvedValueOnce(Response.json(response))
    await expect(getDetectionTools('1')).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
  for (const response of [
    { id: 1, name: '工具', tags: [], tool_carrier: '1' },
    {
      id: 1,
      name: '工具',
      tags: [],
      tool_carrier: 2,
      image_info: { title: '错误字段' },
    },
    { id: 1, name: '工具', tags: [], tool_carrier: 2, user_manual: {} },
  ]) {
    fetch.mockResolvedValueOnce(Response.json(response))
    await expect(getDetectionTool(1)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})
it('附件地址禁止可执行协议，防止点击工具资料执行脚本', async () => {
  const { getDetectionTool } = await import('./detection-tools')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        id: 8,
        name: '附件工具',
        tags: [],
        tool_carrier: 1,
        carrier_path: 'javascript:alert(1)',
      }),
    ),
  )
  await expect(getDetectionTool(8)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('原卡片可缺少标签，详情标签仍为必填数组', async () => {
  const { getDetectionTool } = await import('./detection-tools')
  const fetch = vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({ results: [{ id: 1, name: '无标签工具' }] }),
  )
  vi.stubGlobal('fetch', fetch)
  expect(await getDetectionTools('1')).toEqual([
    { id: 1, name: '无标签工具', tags: [] },
  ])
  fetch.mockResolvedValueOnce(
    Response.json({ id: 1, name: '详情缺少标签', tool_carrier: 2 }),
  )
  await expect(getDetectionTool(1)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('附件允许可选空串，但拒绝纯空白地址', async () => {
  const { getDetectionTool } = await import('./detection-tools')
  const detail = { id: 8, name: '工具', tags: [], tool_carrier: 1 }
  const fetch = vi.fn<typeof globalThis.fetch>()
  vi.stubGlobal('fetch', fetch)
  fetch.mockResolvedValueOnce(Response.json({ ...detail, carrier_path: '' }))
  expect(await getDetectionTool(8)).toMatchObject({ carrier_path: '' })
  for (const carrier_path of [' ', '\t', '\n']) {
    fetch.mockResolvedValueOnce(Response.json({ ...detail, carrier_path }))
    await expect(getDetectionTool(8)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})
