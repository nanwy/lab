import { afterEach, expect, it, vi } from 'vitest'
import { getSituation } from './blue-situation'
import { getBlueSituation } from './blue-data'
import {
  getAbility,
  getTerminalSystems,
  getAction,
  getLine,
} from './blue-script'
import { getExecutionRecords } from './blue-execution'
import {
  getBlueComparison,
  getBlueControl,
  getBlueRounds,
} from './blue-control'
import { getBlueTeams } from './blue-team'
import {
  getIntelligent,
  getIntelligentStatistics,
  getIntelligentAbilities,
  getIntelligentTactics,
  getIntelligentEngines,
} from './blue-intelligent'
import { getDecisionTree } from './blue-decision'
import { getBlueNetwork } from './blue-network'

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

it('原版纯展示字段和适配终端空数据不会阻断整份响应', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ status: 1, data: null }))
  await expect(getTerminalSystems(7)).resolves.toEqual([])
  vi.stubGlobal('fetch', async () =>
    Response.json({
      status: 1,
      data: {
        tactics: null,
        technology: null,
        sub_technology: null,
        sub_technology_name: null,
      },
    }),
  )
  await expect(getAction(7, 8)).resolves.toMatchObject({
    sub_technology_name: null,
  })
  vi.stubGlobal('fetch', async () =>
    Response.json({ status: 1, data: { weight: 0, sign: 1, brief: null } }),
  )
  await expect(getLine(7, 8)).resolves.toMatchObject({ brief: null })
  const record = {
    id: 1,
    number_of_decisions: 1,
    update_time: null,
    instruction_name: null,
    status: 3,
    exec_params: null,
    exec_return: null,
  }
  vi.stubGlobal('fetch', async () =>
    Response.json({ count: 1, results: [record] }),
  )
  await expect(getExecutionRecords(1, 2, 3, 1)).resolves.toMatchObject({
    results: [record],
  })
  const comparison = {
    id: 1,
    sub_technology_name: null,
    undefended_return: null,
    defended_return: null,
    conclusion: null,
  }
  vi.stubGlobal('fetch', async () =>
    Response.json({ count: 1, results: [comparison] }),
  )
  await expect(getBlueComparison(1, 2, 3, 1)).resolves.toMatchObject({
    results: [comparison],
  })
})
it('放宽空值仍拒绝错误类型和缺失的业务ID', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ status: 1, data: {} }))
  await expect(getTerminalSystems(7)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
  vi.stubGlobal('fetch', async () =>
    Response.json({
      count: 1,
      results: [
        {
          id: null,
          number_of_decisions: 1,
          update_time: null,
          instruction_name: null,
          status: 3,
        },
      ],
    }),
  )
  await expect(getExecutionRecords(1, 2, 3, 1)).rejects.toMatchObject({
    kind: 'invalid-response',
  })
})

const nullableCases: [string, unknown, () => Promise<unknown>, object][] = [
  [
    '蓝军可空配置引用',
    [
      {
        id: 1,
        name: '蓝军',
        scenario_type: 1,
        scenario: null,
        intelligent: null,
      },
    ],
    () => getBlueTeams(1),
    [{ scenario: null, intelligent: null }],
  ],
  [
    '智能蓝军描述和场景',
    { id: 1, name: '智能', description: null, ability_scenario_names: null },
    () => getIntelligent(1),
    { description: null, ability_scenario_names: [] },
  ],
  [
    '智能统计空维度',
    { data: { tactics_count: null, ability_styles: null } },
    () => getIntelligentStatistics(1),
    { tactics_count: null, ability_styles: [] },
  ],
  [
    '能力维度空能力',
    {
      status: 1,
      data: [{ id: 1, name: '维度', color: null, abilities: null }],
    },
    () => getIntelligentAbilities(1),
    [{ color: null, abilities: [] }],
  ],
  [
    '技战术空子树',
    {
      status: 1,
      data: [{ name: '战术', child: [{ name: '技术', child: null }] }],
    },
    () => getIntelligentTactics(1),
    [{ child: [{ child: [] }] }],
  ],
  [
    '引擎未配权重',
    {
      status: 1,
      data: [
        {
          engine_type: 1,
          engine_type_name: '引擎',
          is_enabled: false,
          weight: null,
        },
      ],
    },
    () => getIntelligentEngines(1),
    [{ weight: null }],
  ],
  [
    '控制未计时',
    { status: 1, data: { status: 0, executed_time: null } },
    () => getBlueControl(1, 2),
    { executed_time: null },
  ],
  [
    '轮次未起止',
    {
      count: 1,
      results: [
        { id: 1, round: 1, status: 0, start_time: null, end_time: null },
      ],
    },
    () => getBlueRounds(1, 2, { page: 1 }),
    { results: [{ start_time: null, end_time: null }] },
  ],
  [
    '决策空参数和子树',
    {
      status: 1,
      data: { kind: 1, params: null, child: null, sub_technology_name: null },
    },
    () => getDecisionTree(1, 2, 3, ''),
    { params: {}, child: [], sub_technology_name: null },
  ],
  [
    '无网络采集数据',
    { ip_relation: null, input_ip_params_map: null },
    () => getBlueNetwork(1, 2, 3),
    {
      ip_relation: [],
      input_ip_params_map: {},
      graph: { nodes: [], edges: [] },
    },
  ],
]
it.each(nullableCases)(
  '%s保留合法空语义',
  async (_name, response, read, expected) => {
    vi.stubGlobal('fetch', async () => Response.json(response))
    await expect(read()).resolves.toMatchObject(expected)
  },
)
