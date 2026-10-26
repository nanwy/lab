import { afterEach, expect, it, vi } from 'vitest'
import { getSituation } from './blue-situation'
import { getBlueSituation } from './blue-data'
import { getAbility } from './blue-script'

afterEach(() => vi.unstubAllGlobals())

it('初始态势和蓝军数据均接受原可空叶子child，错误类型仍拒绝', async () => {
  const node = {
    id: 11,
    data_type: 1,
    data_define: 1,
    define_name: 'IP',
    define_value: '192.0.2.11',
    child: null,
  }
  vi.stubGlobal('fetch', async () => Response.json({ status: 1, data: [node] }))
  await expect(getSituation('task')).resolves.toEqual([{ ...node, child: [] }])
  await expect(getBlueSituation('task', 'blue', 31)).resolves.toEqual([
    { ...node, child: [] },
  ])
  const parent = { ...node, id: 10, child: [{ ...node, extra: '保留原字段' }] }
  vi.stubGlobal('fetch', async () =>
    Response.json({ status: 1, data: [parent] }),
  )
  await expect(getSituation('task')).resolves.toEqual([
    { ...parent, child: [{ ...node, child: [], extra: '保留原字段' }] },
  ])
  await expect(getBlueSituation('task', 'blue', 31)).resolves.toEqual([
    { ...parent, child: [{ ...node, child: [], extra: '保留原字段' }] },
  ])
  vi.stubGlobal('fetch', async () =>
    Response.json({ status: 1, data: [{ ...node, child: {} }] }),
  )
  await expect(getSituation('task')).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  await expect(getBlueSituation('task', 'blue', 31)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

it('能力详情接受原可空输入输出及递归child，错误参数类型仍拒绝', async () => {
  vi.stubGlobal('fetch', async () =>
    Response.json({
      id: 7,
      name: '空参数能力',
      input_params: null,
      output_params: null,
    }),
  )
  await expect(getAbility(7)).resolves.toMatchObject({
    input_params: [],
    output_params: [],
  })
  vi.stubGlobal('fetch', async () =>
    Response.json({
      id: 7,
      name: '递归能力',
      input_params: [{ param_name: 'target', field_type: 4, child: null }],
    }),
  )
  await expect(getAbility(7)).resolves.toMatchObject({
    input_params: [{ param_name: 'target', field_type: 4, child: [] }],
    output_params: [],
  })
  for (const params of [
    { input_params: {} },
    { output_params: 'invalid' },
    { input_params: [{ param_name: 'target', field_type: 4, child: {} }] },
  ]) {
    vi.stubGlobal('fetch', async () =>
      Response.json({ id: 7, name: '错误参数能力', ...params }),
    )
    await expect(getAbility(7)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  }
})
