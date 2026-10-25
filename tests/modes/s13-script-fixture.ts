import type { Page } from '@playwright/test'
import { test, expect, simulateURL } from './s13-fixture'
export { test, expect, simulateURL }
export const scriptPath =
  '/api/front/wqzb/simulated_blue_team/scenario/scenario-a'
export const graphSample = () => ({
  custom_graph_field: 'keep-graph',
  nodes: [
    {
      id: 'start-ui',
      type: 'customNode' as const,
      position: { x: 0, y: 80 },
      data: {
        id: 101,
        name: '开始',
        type: 1 as const,
        style: { background: '#1677ff' },
        keep_node: 'keep',
      },
    },
    {
      id: 'branch-ui',
      type: 'customNode' as const,
      position: { x: 220, y: 80 },
      data: { id: 202, name: '数据分支', type: 2 as const, style: {} },
    },
    {
      id: 'decision-ui',
      type: 'customNode' as const,
      position: { x: 440, y: 80 },
      data: { id: 303, name: '判断', type: 3 as const, style: {} },
    },
    {
      id: 'action-ui',
      type: 'customNode' as const,
      position: { x: 660, y: 80 },
      data: { id: 404, name: '指令能力动作', type: 4 as const, style: {} },
    },
    {
      id: 'custom-ui',
      type: 'customNode' as const,
      position: { x: 220, y: 250 },
      data: { id: 707, name: '原自定义指令', type: 7 as const, style: {} },
    },
    {
      id: 'behavior-ui',
      type: 'customNode' as const,
      position: { x: 440, y: 250 },
      data: { id: 808, name: '原模拟节点', type: 8 as const, style: {} },
    },
    {
      id: 'end-ui',
      type: 'customNode' as const,
      position: { x: 880, y: 80 },
      data: { id: 505, name: '结束', type: 5 as const, style: {} },
    },
  ],
  edges: [
    {
      id: 'edge-ui',
      source: 'start-ui',
      target: 'branch-ui',
      sourceHandle: '2',
      targetHandle: '1',
      type: 'straight',
      data: { id: 606, keep_edge: 'keep' },
      label: '成功',
      style: { stroke: '#1677ff' },
      markerEnd: { type: 'arrowclosed', width: 15, height: 15 },
    },
  ],
})
export async function scriptFixture(page: Page) {
  await page.route(
    '**/api/front/simulation/experiment/exp-a/blue_team/**',
    (route) =>
      route.fulfill({
        json: [
          {
            id: 'blue-a',
            name: '剧本甲',
            scenario_type: 1,
            scenario: 'scenario-a',
          },
        ],
      }),
  )
  await page.route(`**${scriptPath}/?source=2`, (route) =>
    route.fulfill({ json: { id: 'scenario-a', name: '剧本甲' } }),
  )
  let graph: ReturnType<typeof graphSample> = graphSample()
  const writes: unknown[] = []
  await page.route(`**${scriptPath}/draw/`, (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      writes.push(body)
      graph = body.topo_json
      graph.nodes.forEach((node, index) => {
        if (!node.data.id) node.data.id = 900 + index
      })
      graph.edges.forEach((edge, index) => {
        if (!edge.data?.id) edge.data = { ...edge.data, id: 1600 + index }
      })
      return route.fulfill({ json: { status: 1, data: { topo_json: graph } } })
    }
    return route.fulfill({ json: { topo_json: graph } })
  })
  return { writes, getGraph: () => graph }
}
