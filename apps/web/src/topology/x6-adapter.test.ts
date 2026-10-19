import { describe, expect, it } from 'vitest'

import { deterministicX6Graph } from './sample'
import { fromX6Graph, toX6Graph } from './x6-adapter'

describe('拓扑输入契约', () => {
  it('拒绝重复标识及缺失的节点坐标和名称，而不是生成可编辑的默认图', () => {
    const duplicate = structuredClone(deterministicX6Graph)
    duplicate.cells.push(structuredClone(duplicate.cells[0]!))
    expect(() => fromX6Graph(duplicate)).toThrow(/重复/)
    const invalid = structuredClone(deterministicX6Graph)
    delete invalid.cells[1]!.x
    expect(() => fromX6Graph(invalid)).toThrow(/x/)
    const missingLabel = structuredClone(deterministicX6Graph)
    delete missingLabel.cells[1]!.data!.label
    expect(() => fromX6Graph(missingLabel)).toThrow(/label/)
  })
  it('保留折点上的未知元数据', () => {
    const input = structuredClone(deterministicX6Graph)
    const edge = input.cells.find((cell) => cell.id === 'link-a-b')!
    edge.vertices = [{ x: 360, y: 160, routingHint: 'legacy' }]
    const output = toX6Graph(fromX6Graph(input))
    expect(
      output.cells.find((cell) => cell.id === 'link-a-b')!.vertices,
    ).toEqual([{ x: 360, y: 160, routingHint: 'legacy' }])
  })
})

describe('X6 topology adapter contract', () => {
  it('orders nested parents before children even when the source lists children first', () => {
    const opened = fromX6Graph({
      cells: [
        {
          id: 'child',
          shape: 'device',
          parent: 'inner',
          x: 1,
          y: 2,
          data: { label: '子节点' },
        },
        {
          id: 'inner',
          shape: 'group',
          parent: 'outer',
          x: 3,
          y: 4,
          data: { label: '内组' },
        },
        { id: 'outer', shape: 'group', x: 5, y: 6, data: { label: '外组' } },
      ],
    })
    expect(opened.issues).toEqual([])
    expect(opened.nodes.map((node) => node.id)).toEqual([
      'outer',
      'inner',
      'child',
    ])
  })

  it('preserves invalid relations without exposing unusable nodes or edges', () => {
    const input = {
      cells: [
        { id: 'valid', shape: 'device', ports: { items: [{ id: 'eth0' }] } },
        { id: 'unknown', shape: 'annotation' },
        { id: 'orphan', shape: 'group', parent: 'missing' },
        { id: 'descendant', shape: 'device', parent: 'orphan' },
        { id: 'wrong-parent', shape: 'device', parent: 'valid' },
        { id: 'cycle-a', shape: 'group', parent: 'cycle-b' },
        { id: 'cycle-b', shape: 'group', parent: 'cycle-a' },
        { id: 'cycle-child', shape: 'device', parent: 'cycle-a' },
        { id: 'unsupported-parent', shape: 'device', parent: 'unknown' },
        {
          id: 'missing-link',
          shape: 'edge',
          source: { cell: 'missing' },
          target: { cell: 'valid' },
        },
        {
          id: 'unknown-link',
          shape: 'edge',
          source: { cell: 'unknown' },
          target: { cell: 'valid' },
        },
        {
          id: 'port-link',
          shape: 'edge',
          source: { cell: 'valid', port: 'missing' },
          target: { cell: 'valid' },
        },
        {
          id: 'descendant-link',
          shape: 'edge',
          source: { cell: 'descendant' },
          target: { cell: 'valid' },
        },
      ].map((cell) =>
        cell.shape === 'device' || cell.shape === 'group'
          ? { ...cell, x: 10, y: 20, data: { label: cell.id } }
          : cell,
      ),
    }
    const opened = fromX6Graph(input)
    expect(opened.nodes.map((node) => node.id)).toEqual(['valid'])
    expect(opened.edges).toEqual([])
    expect(opened.issues.map((issue) => issue.cellId).sort()).toEqual([
      'cycle-a',
      'cycle-b',
      'cycle-child',
      'descendant',
      'descendant-link',
      'missing-link',
      'orphan',
      'port-link',
      'unknown',
      'unknown-link',
      'unsupported-parent',
      'wrong-parent',
    ])
    for (const raw of input.cells.slice(1)) {
      expect(
        toX6Graph(opened).cells.find((cell) => cell.id === raw.id),
      ).toEqual(raw)
    }
  })

  it('round-trips supported topology semantics and preserves unknown data', () => {
    const opened = fromX6Graph(deterministicX6Graph)

    expect(opened.issues).toEqual([
      expect.objectContaining({
        code: 'unsupported-cell-shape',
        cellId: 'annotation-legacy',
      }),
    ])
    expect(opened.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'router-a',
          parentId: 'rack-a',
          position: { x: 48, y: 72 },
          data: expect.objectContaining({
            deviceId: 'device-router-a',
            rotation: 15,
          }),
        }),
      ]),
    )

    const router = opened.nodes.find((node) => node.id === 'router-a')
    if (!router) throw new Error('Expected router-a node')
    router.position = { x: 64, y: 88 }
    router.data = { ...router.data, label: '核心路由器（已校准）' }

    const saved = toX6Graph(opened)
    const savedRouter = saved.cells.find((cell) => cell.id === 'router-a')
    const savedLink = saved.cells.find((cell) => cell.id === 'link-a-b')
    const legacyAnnotation = saved.cells.find(
      (cell) => cell.id === 'annotation-legacy',
    )

    expect(savedRouter).toEqual(
      expect.objectContaining({
        id: 'router-a',
        parent: 'rack-a',
        x: 64,
        y: 88,
        angle: 15,
        customDeviceField: { inventorySource: 'legacy-cmdb' },
        data: expect.objectContaining({
          deviceId: 'device-router-a',
          label: '核心路由器（已校准）',
        }),
        ports: expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({ id: 'eth0', group: 'right' }),
          ]),
        }),
      }),
    )
    expect(savedLink).toEqual(
      expect.objectContaining({
        source: { cell: 'router-a', port: 'eth0' },
        target: { cell: 'switch-b', port: 'uplink' },
        vertices: [
          { x: 360, y: 160 },
          { x: 360, y: 300 },
        ],
        router: { name: 'manhattan', args: { padding: 12 } },
        connector: { name: 'rounded', args: { radius: 8 } },
        customEdgeField: { cableId: 'cable-47' },
      }),
    )
    expect(legacyAnnotation).toEqual(
      expect.objectContaining({
        id: 'annotation-legacy',
        shape: 'legacy-annotation',
        unknownPayload: { textMode: 'x6-only' },
      }),
    )

    const reopened = fromX6Graph(saved)
    expect(reopened.nodes.find((node) => node.id === 'router-a')).toEqual(
      expect.objectContaining({
        position: { x: 64, y: 88 },
        data: expect.objectContaining({ label: '核心路由器（已校准）' }),
      }),
    )
  })
})
