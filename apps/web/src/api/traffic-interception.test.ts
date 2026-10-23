import { afterEach, expect, it, vi } from 'vitest'
import {
  closeInterception,
  getInterception,
  saveInterception,
  saveInterceptionTemplate,
} from './traffic-interception'
afterEach(() => vi.unstubAllGlobals())
it('节点按UUID读取配置、状态1/2运行、空配置可用，草稿与启动按config单值协议和空字段null提交', async () => {
  const writes: unknown[] = []
  let data: unknown = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, options: RequestInit) => {
      writes.push({
        path: url.pathname,
        method: options.method,
        body: options.body ? JSON.parse(String(options.body)) : null,
      })
      return Response.json(
        url.pathname.endsWith('/blocking_info/')
          ? { status: 1, data }
          : { status: 1 },
      )
    }),
  )
  expect(await getInterception('topo', 'uuid')).toEqual({
    running: false,
    draft: { protocol: '', src_ip: '', dst_port: '', script: '' },
  })
  data = {
    status: 1,
    cid: 71,
    config: { protocol: 'tcp', src_ip: null, dst_port: null },
    script: 'drop()',
  }
  expect(await getInterception('topo', 'uuid')).toMatchObject({
    running: true,
    cid: 71,
    draft: { protocol: 'tcp', src_ip: '', dst_port: '' },
  })
  const draft = { protocol: 'tcp', src_ip: '', dst_port: '', script: 'drop()' }
  await saveInterception('topo', 'uuid', draft, false)
  await saveInterception('topo', 'uuid', draft, true)
  await closeInterception('topo', 'uuid')
  expect(writes.slice(2)).toEqual([
    {
      path: '/api/front/topo/topo/node/uuid/blocking_draft/',
      method: 'POST',
      body: {
        config: { protocol: 'tcp', src_ip: null, dst_port: null },
        script: 'drop()',
      },
    },
    {
      path: '/api/front/topo/topo/node/uuid/blocking_start/',
      method: 'POST',
      body: {
        config: { protocol: 'tcp', src_ip: null, dst_port: null },
        script: 'drop()',
      },
    },
    {
      path: '/api/front/topo/topo/node/uuid/blocking_close/',
      method: 'GET',
      body: null,
    },
  ])
})
it('另存空IP端口保留空串；模板编辑保留实体并转换strategy空值为null', async () => {
  const values: unknown[] = []
  const original = {
    id: 1,
    name: '模板',
    script: 'drop()',
    config: { protocol: 'tcp', src_ip: '', dst_port: '' },
    is_built_in: false,
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: URL, options: RequestInit) => {
      values.push(JSON.parse(String(options.body)))
      return Response.json(original)
    }),
  )
  const draft = { protocol: 'tcp', src_ip: '', dst_port: '', script: 'drop()' }
  await saveInterceptionTemplate(draft, '另存', undefined, undefined, true)
  await saveInterceptionTemplate(draft, '模板', original)
  expect(values).toEqual([
    {
      name: '另存',
      script: 'drop()',
      strategy: { protocol: 'tcp', src_ip: '', dst_port: '' },
    },
    {
      ...original,
      strategy: { protocol: 'tcp', src_ip: null, dst_port: null },
    },
  ])
})

it('模板删除不吞业务拒绝；正常布尔和204响应保持可用，导出沿原scene前缀', async () => {
  const { deleteInterceptionTemplate, interceptionExportHref } =
    await import('./traffic-interception')
  let response = Response.json({ status: 2, message: '内置模板禁止删除' })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => response),
  )
  await expect(deleteInterceptionTemplate(1)).rejects.toMatchObject({
    kind: 'business',
    message: '内置模板禁止删除',
  })
  response = Response.json(true)
  await expect(deleteInterceptionTemplate(2)).resolves.toBe(true)
  response = new Response(null, { status: 204 })
  await expect(deleteInterceptionTemplate(2)).resolves.toBeNull()
  expect(interceptionExportHref()).toBe(
    '/api/scene/blocking_template/import_export/',
  )
})
