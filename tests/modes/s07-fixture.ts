import { type Page } from '@playwright/test'
import { portalFixtures } from '../../apps/web/src/mocks/portal-fixtures'
import type { X6Graph } from '../../apps/web/src/topology/x6-adapter'

export const graph = (): X6Graph => ({
  lock: false,
  cells: [
    ...['a', 'b'].map((id, index) => ({
      id,
      shape: 'custom-react-node',
      position: { x: 100 + index * 260, y: 140 },
      data: {
        name: `设备${id}`,
        data_id: 91 + index,
        nodeInfo: {
          id: 91 + index,
          config_info: { type: index ? 'docker' : 'libvirt', node_id: id },
        },
      },
      ports: { items: [{ id: `${id}-p`, group: index ? 'left' : 'right' }] },
    })),
    {
      id: 'link',
      shape: 'edge',
      source: { cell: 'a', port: 'a-p' },
      target: { cell: 'b', port: 'b-p' },
      data: { data_id: 501 },
    },
  ],
})
export async function mount(page: Page, locked = false) {
  const stored = graph()
  stored.lock = locked
  let status = {
    nodes: {
      a: { status: 0, name: '设备a' },
      b: {
        status: 3,
        name: '设备b',
        error_msg: '设备启动失败',
        update_time: '2026-10-21T10:00:00',
      },
    },
    edges: {
      '501': {
        status: 3,
        nodea_name: '设备a',
        nodez_name: '设备b',
        error_msg: '链路异常',
      },
    },
  }
  const writes: Array<{ path: string; method: string; body: unknown }> = []
  const errors: string[] = []
  let fail = false
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route(/\/api\/(front|admin|captcha)\//, (route) =>
    route.fulfill({ json: {} }),
  )
  for (const [path, json] of Object.entries(portalFixtures))
    await page.route(`**/api${path}`, (route) => route.fulfill({ json }))
  await page.route('**/api/front/user/info/', (route) =>
    route.fulfill({
      json: {
        id: 's07',
        username: '隔离学员',
        extend_info: { first_entry: true },
      },
    }),
  )
  await page.route('**/api/front/simulation/experiment/*/?more=1', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!
    return route.fulfill({
      json: {
        id,
        name: `实验${id}`,
        desc: '',
        node_count: 2,
        user_name: '隔离学员',
        tags: [],
        overview: null,
        release_type: 2,
        max_duration: 2,
        tags_category: null,
        topo_id: `topo-${id}`,
      },
    })
  })
  for (const path of ['last_operat/**', 'list/?nopage=0', 'template/?*'])
    await page.route(`**/api/front/node/${path}`, (route) =>
      route.fulfill({ json: [] }),
    )
  for (const id of ['a', 'b'])
    await page.route(`**/api/front/topo/${id}/`, (route) =>
      route.fulfill({ json: { status: 1, data: {} } }),
    )
  await page.route('**/api/front/topo/topo-one/**', (route) => {
    const request = route.request(),
      url = new URL(request.url())
    if (url.pathname.endsWith('/status/'))
      return route.fulfill({ json: status })
    if (url.pathname.endsWith('/draw/') && request.method() === 'GET')
      return route.fulfill({ json: stored })
    writes.push({
      path: url.pathname + url.search,
      method: request.method(),
      body: request.postData() ? request.postDataJSON() : null,
    })
    if (fail) {
      fail = false
      return route.fulfill({ json: { status: 2, message: '资源不足' } })
    }
    if (url.pathname.endsWith('/draw/')) {
      Object.assign(stored, request.postDataJSON().topo)
      return route.fulfill({ json: true })
    }
    const action = url.pathname.split('/').at(-2)
    status = {
      ...status,
      nodes: {
        ...status.nodes,
        a: {
          status: action === 'stop' ? 0 : action === 'shutdown' ? 4 : 2,
          name: '设备a',
        },
      },
      edges: {
        '501': { ...status.edges['501'], status: action === 'stop' ? 0 : 2 },
      },
    }
    return route.fulfill({ json: { status: 1 } })
  })
  await page.goto('/#/basic/user/bench/experiment/one/scene')
  return {
    stored,
    writes,
    errors,
    failNext: () => {
      fail = true
    },
  }
}
