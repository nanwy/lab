import { afterEach, expect, it, vi } from 'vitest'
import { getNoVncUrl, prepareRdp } from './desktop'
import {
  getOperationMachines,
  allocateOperationMachines,
  updateOperationMachines,
  runOperationMachine,
} from './operation-machines'

afterEach(() => vi.unstubAllGlobals())
it('图形准备与操作机写操作沿原GET副作用和镜像/资源ID契约，不加入未知上下文', async () => {
  const calls: Array<{ path: string; method: string; body: unknown }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL, request: RequestInit) => {
      calls.push({
        path: url.pathname + url.search,
        method: request.method!,
        body: request.body ? JSON.parse(String(request.body)) : null,
      })
      return Response.json({
        status: 1,
        data: { novnc_url: 'https://console.example/novnc' },
      })
    }),
  )
  await prepareRdp('node/a')
  expect(await getNoVncUrl('node/a')).toBe('https://console.example/novnc')
  await allocateOperationMachines()
  await updateOperationMachines()
  const machine = { id: 11, name: '隔离操作机', status: 0, target_image: 22 }
  await runOperationMachine(machine, 'start', 'confirmed-env')
  await runOperationMachine(machine, 'release', null)
  expect(calls).toEqual([
    {
      path: '/api/front/topo/node_run/node%2Fa/rdp/',
      method: 'GET',
      body: null,
    },
    {
      path: '/api/front/topo/node_run/node%2Fa/novnc/',
      method: 'GET',
      body: null,
    },
    { path: '/api/front/image/operate/', method: 'GET', body: null },
    {
      path: '/api/front/image/default/operation/topo/',
      method: 'POST',
      body: null,
    },
    { path: '/api/front/image/operate/', method: 'GET', body: null },
    {
      path: '/api/front/image/operate/22/',
      method: 'POST',
      body: { ids: 'confirmed-env', resource_type: 1, resource_id: 11 },
    },
    {
      path: '/api/front/image/operate/22/',
      method: 'DELETE',
      body: { resource_type: 1, resource_id: 11 },
    },
  ])
})
it('损坏列表和缺失noVNC地址不能假报空数据或成功，未关联镜像不发起启动', async () => {
  const fetcher = vi.fn(async () => Response.json({ status: 1, data: {} }))
  vi.stubGlobal('fetch', fetcher)
  await expect(getOperationMachines()).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  await expect(getNoVncUrl('node')).rejects.toThrow('未返回noVNC地址')
  await expect(
    runOperationMachine({ id: 1, name: '未关联', status: 0 }, 'start', null),
  ).rejects.toThrow('缺少关联镜像')
  expect(fetcher).toHaveBeenCalledTimes(2)
})
