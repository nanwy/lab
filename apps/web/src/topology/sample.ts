import type { X6Graph } from './x6-adapter'

export const deterministicX6Graph: X6Graph = {
  cells: [
    {
      id: 'rack-a',
      shape: 'group',
      x: 72,
      y: 56,
      width: 360,
      height: 240,
      zIndex: 0,
      data: { label: 'A 区设备组', kind: 'rack' },
      attrs: { body: { fill: '#eef5ff', stroke: '#7392bd' } },
      customGroupField: { collapsedByDefault: false },
    },
    {
      id: 'router-a',
      shape: 'device',
      parent: 'rack-a',
      x: 48,
      y: 72,
      width: 176,
      height: 84,
      angle: 15,
      zIndex: 2,
      data: {
        label: '核心路由器',
        deviceId: 'device-router-a',
        kind: 'router',
      },
      ports: {
        groups: {
          right: { position: 'right' },
          left: { position: 'left' },
        },
        items: [
          { id: 'eth0', group: 'right', customPortField: 'uplink' },
          { id: 'console', group: 'left' },
        ],
      },
      attrs: {
        body: { fill: '#fff8dc', stroke: '#a87812' },
        label: { fill: '#392900' },
      },
      customDeviceField: { inventorySource: 'legacy-cmdb' },
    },
    {
      id: 'switch-b',
      shape: 'device',
      x: 496,
      y: 244,
      width: 176,
      height: 84,
      data: {
        label: '接入交换机',
        deviceId: 'device-switch-b',
        kind: 'switch',
      },
      ports: {
        groups: { left: { position: 'left' } },
        items: [{ id: 'uplink', group: 'left' }],
      },
      attrs: { body: { fill: '#effaf4', stroke: '#3f8860' } },
    },
    {
      id: 'link-a-b',
      shape: 'edge',
      source: { cell: 'router-a', port: 'eth0' },
      target: { cell: 'switch-b', port: 'uplink' },
      vertices: [
        { x: 360, y: 160 },
        { x: 360, y: 300 },
      ],
      router: { name: 'manhattan', args: { padding: 12 } },
      connector: { name: 'rounded', args: { radius: 8 } },
      attrs: { line: { stroke: '#54708f', strokeWidth: 2 } },
      data: { label: '管理链路' },
      customEdgeField: { cableId: 'cable-47' },
    },
    {
      id: 'annotation-legacy',
      shape: 'legacy-annotation',
      x: 24,
      y: 360,
      unknownPayload: { textMode: 'x6-only' },
    },
  ],
  graphMeta: {
    source: 'deterministic-x6-fixture',
    customCanvasField: { gridSize: 12 },
  },
}
