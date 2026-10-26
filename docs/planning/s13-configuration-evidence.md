# S13 配置与初始态势静态证据

## 场景拓扑蓝军接入与部署补证（2026-10-26）

此前配置范围漏掉了 simulate 的跨页前置链。原 `Ojs @12682300 → QOe @8018585 → M4a → N3a @6861994` 在实验 `task_type="6"` 工具栏显示“蓝军配置”，传入 `experiment.topo_id`、`experiment.test_task` 和任务域蓝军 URL。该入口与 simulate 中的剧本/智能配置不同，不能用终端提取或 `data.is_blue` 开关替代。

以下偏移均为原 bundle 零起始 Unicode 字符，原件 SHA 沿用本文件下文；经 evidence_query 有界复核。`R4a @8008xxx–8017xxx` 只从拓扑选择 `shape="custom-react-node" && data.is_blue` 的节点。没有蓝军节点提示先配置；每节点关联一个蓝军终端，允许重新关联和确认解除。终端稳定选择值为 `${blue_team_id}-${id}`，其他节点已用的终端不可选；当前已关联终端仍可选。

接口共同前缀 `P=/api/front/wqzb/test_task/{T}`，定义 `1816400–1817900`，store 消费 `6093000–6097000`：

| 操作             | 原请求与消费                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 终端列表         | GET `P/init_info/terminal/`，`status=1` 时取 `data.used_data/unused_data`；项消费 `id,blue_team_id,blue_team_name,scenario_type,system/name,position_init_id`                                |
| 关联             | POST `P/init_info/`，body `{blue_team:选项.blue_team_id,terminal或intelligent_terminal:选项.id,device_id:画布节点UUID}`，按 `scenario_type=1/2` 选终端字段，成功 `status=1`                  |
| 解除             | DELETE `P/init_info/`，body `{ids:[used_data中同时匹配终端和蓝军的position_init_id]}`，成功 `status=1`                                                                                       |
| 工具列表（实验） | GET `P/blue_team/{B}/terminal/{terminalId}/tool/?page=1&size=10&search=&node_id={B}`；原 `node_id` 实际取蓝军 ID，不能按参数名改为节点 UUID；实验分支不发 `resource_id/resource_type` 请求体 |
| 单项部署/检测    | POST `P/node_tool/{toolId}/deploy/` 或 `check/`，无显式 body                                                                                                                                 |
| 批量部署/检测    | POST `P/terminal/{terminalId}/node_tool/deploy/` 或 `check/`，query `type=scenario_type`，无显式 body                                                                                        |

关联成功将完整选项（含稳定选择值 `terminal_id`）写入图元 `data.blueInfo` 并按 `saveGraph({type:"node"})` 保存；解除后写 `{}` 并保存。原操作按钮在锁图时仍可达，这是业务关系保存，不代表允许解锁后端或放宽普通设计编辑。业务关联和 draw 保存是两次操作，不得将 draw 失败报告为已完全持久化。

工具列表有 `results` 时采用 `count/results` 并标为可操作（空数组也成立）；无 `results` 时显示“当前蓝军节点未启动，请先启动节点，启动之后可进行工具布设”。表格消费 `id,tool_name,version,instruction_count,tool_uuid,status,run_status`；状态 `1待部署/2部署完成/3部署中/4部署失败`。部署中禁用该行部署；单项部署/检测遇 `run_status===2` 仅提示先启动环境。按钮复用全局请求忙状态，原无自动部署、自动启动或自动检测轮询。`status=1` 后重读当前列表，`status=2` 显示后端消息。

原教学手册 `12725600` 附近也说明“选择模拟蓝军 → 阵地初始化并接入网络场景 → 启动网络场景及武器工具布设 → 启动模拟蓝军”；该文字为辅助线索，具体实验操作以以上可达代码为准。真实后端响应、节点与终端对应关系、部署效果仍需在授权测试范围内验证。

调查日期：2026-10-25。仅通过 `scripts/evidence_query.py query` 查询原 bundle，没有请求真实接口、执行业务写入或修改原件。以下字段、成功条件和行为都是**源码静态观察**，不代表真实响应已验证；不能据消费代码推断每个字段均为接口必填。

## 证据入口与可达范围

证据位置均为原 bundle 的 Unicode 字符偏移，不是文件行号。复查示例：`python3 scripts/evidence_query.py query --offset 9923948 --context 4500 --max-chars 11000`。原件与查询规则见 [有界查询](../evidence-query.md)。

| 符号／偏移                 | 用途                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `_8s` / 12737090           | simulate 路由页面，传 `module="1"`、`module_id=experiment.id`、`test_task_id=experiment.test_task`、`left=530`；回调重新获取实验详情 |
| `e_t` / 9923948            | 顶层蓝军配置、初始态势、运行控制；卸载调用 `tv.clearStore`                                                                           |
| `imo` / 9919085            | 蓝军配置列表、选择、删除、导入；剧本指令／蓝军终端或智能蓝军详情                                                                     |
| `tho` / 9697326            | 首次空列表导入弹窗                                                                                                                   |
| `Dho` / 9779791            | 已有蓝军列表内导入弹窗                                                                                                               |
| `tv` / 9689358             | 以上列表、导入与智能蓝军状态和请求动作                                                                                               |
| `Ug` / 9768182 附近        | 剧本配置状态、draw 保存、指令与终端动作                                                                                              |
| `rmo` / 9915143            | 智能蓝军详情及四个可操作页签                                                                                                         |
| `amo` / 9922058 附近       | 内嵌初始态势，实际仅传 `id=test_task_id`，不传 blue_id                                                                               |
| `zg.getInitInfo` / 9701816 | 初始态势请求分流、节点增改删及图归一化                                                                                               |

`e_t` 在 module=1 时从实验域读取蓝军列表，默认选择第一项。无蓝军显示导入入口；有蓝军显示三个顶层区块。`imo` 根据 `blue.scenario_type===2` 选择智能详情，否则显示剧本页签。没有发现此配置入口按实验运行状态、用户角色或蓝军发布状态禁用编辑的分支；不能补造门控。

初始态势、运行控制内的蓝军数据均是 simulate 可达能力。独立蓝军／防御／导调态势属于 S14；`e_t` 虽保留 key=5 的 `Jfo` 渲染分支，但生成菜单仅 key=1–4，该分支不能据此视为 S13 可选菜单。

## 列表、两种导入与删除

以 `E=experiment.id`、`T=experiment.test_task` 表示不同上下文。不能因都来自实验而合并这两个 ID。

| 动作             | 请求及参数                                                                                                                                               | 原响应消费／成功判据                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 蓝军列表         | GET `/api/front/simulation/experiment/{E}/blue_team/?nopage=1`                                                                                           | 仅数组写入 `blueList`；非空且未选择时选择第一项                                                 |
| 剧本候选         | GET `/api/front/wqzb/simulated_blue_team/scenario/?nopage=1&status=3`                                                                                    | 数组；下拉消费 `id/name`                                                                        |
| 智能候选         | GET `/api/front/wqzb/simulated_blue_team/intelligent/list/?nopage=1&status=2`                                                                            | 数组；下拉消费 `id/name`                                                                        |
| 空态导入 `tho`   | POST `/api/front/simulation/experiment/{E}/blue_team/`；剧本 `{scenario_type:1,scenario,source:1}`；智能 `{scenario_type:2,intelligent:所选值,source:1}` | `status===1` 或响应 truthy `id` 视为成功；提示 `message` 或“导入成功”；关闭并回调刷新实验与列表 |
| 列表内导入 `Dho` | 相同 POST，额外添加 `test_task:E`                                                                                                                        | 同 `tv.addBlue`；关闭并刷新列表                                                                 |
| 删除所选蓝军     | DELETE `/api/front/wqzb/test_task/{T}/blue_team/{blueId}/`                                                                                               | `status===1` 成功；`status===2` 显示 message；清选择、详情并刷新列表                            |
| 剧本详情         | GET `/api/front/wqzb/simulated_blue_team/scenario/{blue.scenario}/?source=2`                                                                             | truthy `id` 写入 `blueDetail`                                                                   |

API 定义证据：`mJr/vJr/yJr/bJr/AJr` 位于 1833226 附近；`ZQr` 位于 1818857。`imo` 的原列表 URL 字符串缺首个 `/`，而 `e_t` 有首 `/`；这是原字符串差异，不应由此生成两种业务契约。

两入口均默认 `scenario_type=1`，切换类型清所选 scenario；只要求选择一个候选。智能类型提交时把 scenario 改名 intelligent 并删除 scenario。关闭弹窗清 `blueForm/errMsg`；候选请求 effect 清理调用 `h2n()`。`tho` 使用 `open.importBlue`，`Dho` 使用 `open.add`，不能混成只支持首次导入。

**原行为差异**：`Dho` 的 `test_task` 取其 module_id，调用方传入的是 E；不能凭字段名把它改为 T，也不能在没有补充事实时宣布这是已证实的原 bug。`imo` 删除后通过 test_task 域 URL 重读列表，而正常进入通过实验域 URL 读取，同样需保留为静态差异并在实现时明确处理。

## 剧本指令与终端

### 可编辑编排画布

`Dgo` / 9873456 渲染 `Lgo` / 9866247，调用方**未传 readOnly**。这不是只读剧本图片。五种拖拽形状为开始、数据分支、判断、指令能力动作、结束；已有图还能包含 type=7 自定义指令和 type=8 模拟配置。

画布使用 `topo_json.nodes/edges`。节点消费 `id/type/position/data`，data 含 name、type、style；边含 id/source/target/handle/type/label/style/markerEnd/data。拖拽放置节点立即保存；连接操作先更新本地图；保存按钮提交全图；清除按钮确认后提交空图。键盘 Delete/Backspace 在没有弹窗打开时删除所选节点／边并提交；右键菜单按类型提供数据分支、判断、能力、连线、自定义指令、模拟配置与删除。右键删除边原分支只更新本地边数组，显式保存仍提交全图；不能把全部原事件描述成相同自动保存语义。

| API（前缀 `/api/front/wqzb/simulated_blue_team/scenario/{S}`）                                   | 用途／参数                                                                                  |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| GET `/draw/`                                                                                     | `B2n`；响应含 `topo_json` 时写入图                                                          |
| POST `/draw/`                                                                                    | `eXr`；`{topo_json:{nodes,edges}}`；status=1 时采用 `data.topo_json`；status=2 提示 message |
| GET `/draw/node/{N}/last_variate/`                                                               | `tXr`；前序变量，数组项消费 `variable/id`                                                   |
| GET / POST `/draw/line/{L}/`                                                                     | `nXr/rXr`；连线配置，POST 传调用方 data                                                     |
| GET / POST `/draw/node/{N}/decision/`                                                            | `iXr/aXr`；判断配置                                                                         |
| GET `/draw/node/{N}/branch/`、GET `/draw/node/{N}/branch/action/`、POST `/draw/node/{N}/branch/` | `oXr/sXr/lXr`；分支配置及动作                                                               |
| GET `/draw/node/{N}/action/instruct/?{filter}`                                                   | `cXr`；能力指令列表                                                                         |
| GET / POST / PATCH `/draw/node/{N}/action/`                                                      | `uXr/dXr/NXr`；能力配置及动作编辑                                                           |
| PATCH `/draw/node/{N}/action/instruct/{instructionId}/`                                          | `yXr`；指令参数修改                                                                         |
| POST `/draw/node/{N}/rename/`                                                                    | `MXr`；名称保存                                                                             |
| GET / POST `/draw/node/{N}/behavior_simulate/`                                                   | `PXr/kXr`；模拟配置，详情消费 id/topo_node/tool_type/tool_detail/interpreter/content        |

请求定义位于 1819031–1822900 有界查询范围；store 消费位于 9769682–9774791。模拟配置 UI 可选工具库或自行上传；执行命令解释器为 bat=1、bash=2、Python=3；上传 POST `/api/front/wqzb/basic_resources/upload_file/`，status=1 消费 `data.url`；版本列表 GET `/api/front/wqzb/tool/version/cascade/`。这些属于原可达配置，不代表允许执行真实攻击或上传。

画布随 `blueDetail.id` 读取，卸载清 map；注册的 keydown 监听在 effect 清理移除。`imo` 切剧本时延迟读取详情并清 map；剧本页签销毁未激活内容。

### 蓝军终端

`Bgo` / 9877329：展示适配系统和运行工具，支持提取共性终端、分页和删除。消费 `results/count`；行字段 `id/system/tool_list`，剧本工具字段精确为 `tool__name/version__name`。不要与智能终端的 `tool_name/version_name` 混用。

| 请求                                              | 原行为                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET `/scenario/{S}/instruction/terminal/`         | status=1 消费 data 为适配终端                                                 |
| POST `/scenario/{S}/instruction/terminal/common/` | status=1 提取成功并触发列表刷新；status=2 提示 message                        |
| GET `/scenario/{S}/terminal/?page=1&size=10`      | 消费 results/count                                                            |
| DELETE `/scenario/{S}/terminal/{terminalId}/`     | status=1 成功；末页仅一条且page>1时减页再刷新                                 |
| PATCH `/scenario/{S}/terminal/{terminalId}/`      | 定义与 `$go` 编辑弹窗存在；提交整个 terminalForm，字段 image/cpu/ram/disk/net |

以上省略的共同前缀为 `/api/front/wqzb/simulated_blue_team`。`Bgo` 主列表操作列只有删除；编辑弹窗 `$go` 虽被挂载，但未发现可达打开事件，见下文闭合证据，不能因存在 PATCH 就增加列表“编辑”按钮。卸载清适配终端、列表、过滤、详情、表单和错误。

## 智能蓝军四个可达页签

`rmo` / 9915143 按 `blue.intelligent` 请求智能详情和统计；卸载清 intelligent/intStatistic 并移除 resize 监听。详情消费 `name/ability_scenario_names/description`；统计消费 `tactics_count/technologies_count/attack_tendency/force_count/enabled_engines_count/ability_styles[].{name,abilities_count}`。攻击倾向 1 为深度优先，其余按原 UI 显示广度优先。

实施时有界复查`Xzt @ 5738616`及`rmo @ 9915143`：能力维度图是雷达图，数据由`ability_styles`映射`key=name/value=abilities_count`，共用上限`Math.max(...values,5)*1.2`、四层网格、紫色轮廓与渐变填充。Xzt空数组会换成硬编码演示数据；新实现将合法空维度显示为空态，避免演示值冒充当前蓝军统计。

以下 `I` 是智能蓝军 ID，`R` 是兵力角色 ID；共同前缀 `P=/api/front/wqzb/simulated_blue_team/intelligent/list/{I}`。协议定义位于 1830726–1835730，状态消费位于 9689358–9695650。

### 能力动作：`Wgo` / 9891318、`Vgo` / 9886237

- GET `P/ability_action/`：status=1 消费 data；维度项 `id/name/color/abilities`，能力消费 `id/name/instruction_count`。
- POST `P/ability_action/clear/`：确认清空，status=1 成功；刷新能力与统计。
- GET `/api/front/base/tag/?otype_plus=category&otype=attack_style&nopage=1`：维度数组，消费 id/name，默认第一维度。
- GET `P/ability_action/import/dimensions/{dimensionId}/?search=...&page=...&size=...`：status=1，消费 `data.abilities/total/page/size/pages`；能力表字段 code/name/dimension_name/instruction_count/id。
- POST `P/ability_action/import/`：`{dimensions:[{dimension_id:parseInt(维度id),ability_ids:[选中id]}]}`；必须至少选一项。原 store 以 truthy response data 为成功；关闭后刷新能力和统计。
- 支持维度切换、搜索、分页及每页10/20/50、逐条选择、当前页全选／取消。selection 按维度保存，关闭导入清 selection，不能把全选扩展为服务端全部结果。

### 技战术：`qgo` / 9896092、`Ggo` / 9893692 附近

GET `P/tactics/`，status=1 消费 data 树；展示名称、子技术数量、is_exists 导入标记及 instruction_count，点击能力 GET `/api/front/wqzb/basic_resources/subtolgy/{abilityId}/`，truthy id 设置 frameDetail。详情消费 name/sign/desc/tactics_name/technology_name/attack_style_display/input_params/output_params。参数按 field_type 1字符串、2数值、3数组、4对象递归生成示例。页签卸载清 frameList，关闭详情清 frameDetail。本页为展示和展开，不应创造编辑技战术结构的能力。

### 决策引擎：`Kgo` / 9899031

GET `P/decision_engine/`：要求 status=1 且 data 为数组，按 parseInt(engine_type) 排序。展示 engine_type_name；类型1数据、2技战术、3对抗图谱、4人工干预。切换 is_enabled、编辑 weight；保存前仅检查启用项权重在0–1，不要求权重总和等于1。

POST 同路径，body `{configs:[{engine_type,is_enabled,weight}]}`；status=1 成功，重新读引擎和统计。

### 兵力数量：`nmo` / 9910143 附近、`emo` / 9910143 之前

GET `P/force_allocation/`：status=1，消费 `data.items`；默认选择第一角色，切角色回“节点配置”。添加 POST 同路径 `{name}`；编辑 PUT `P/force_allocation/{R}/` `{name}`；增改以 truthy data 成功。名称 trim 后不可空，输入 maxLength=20。DELETE 同角色路径，确认后 status=1 成功；清被删选择，刷新角色和统计。

节点配置 `Zgo` / 9906929：

| 请求                                                       | 消费／效果                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| GET `P/force_allocation/{R}/instruction/terminal/`         | truthy data 后采用其 data 为适配终端                                                            |
| POST `P/force_allocation/{R}/instruction/terminal/common/` | status=1 提取成功并刷新列表                                                                     |
| GET `P/force_allocation/{R}/terminal/`                     | results/count；注意 API 包装器未拼接调用方 filter，不能擅自声称原服务端已收到分页参数           |
| DELETE `P/force_allocation/{R}/terminal/{terminalId}/`     | status=1；末页唯一行减页再刷新                                                                  |
| PUT 同终端路径                                             | 编辑动作定义存在，data=terminalForm；truthy data 成功；主列表只有删除，编辑挂载但不可达，见下文 |

智能工具行消费 `tool_name/version_name`。切角色／卸载重置适配终端、列表、页码、详情、表单、错误。能力配置 `Jgo` 位于 9910143 之前：GET `P/force_allocation/{R}/ability_configuration/`，status=1 消费 `data.dimensions`；项 id/name/count/is_configured，count=0 禁止勾选。POST 同路径 `{dimension_ids:[所有勾选维度id]}`，status=1 成功后重读配置；必须先选择角色。

## 内嵌初始态势

`amo` 由 `e_t` 传 `id=T`，未传 blue_id，故实际使用**任务级**节点协议，不用当前蓝军 ID 拼蓝军级路径。虽调用 store 时传 `search:{kind:2}`，`bQr` 的任务级 GET 定义没有拼 query；不能写成实际请求 `?kind=2`。

| 动作               | 实际请求                                                            | 原成功／字段消费                                  |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------- |
| 初次读取、手动刷新 | GET `/api/front/wqzb/test_task/{T}/init_situation_node/`            | status=1，将 data 树经 rho 转换为图               |
| 数据类型候选       | GET `/api/front/wqzb/basic_resources/inouput/?nopage=1`             | 数组；id/datatype/desc                            |
| 增加节点或子节点   | POST `/api/front/wqzb/test_task/{T}/init_situation_node/`           | status=1 成功，关闭并重读；status=2 提示 message  |
| 编辑节点           | PATCH `/api/front/wqzb/test_task/{T}/init_situation_node/{nodeId}/` | 传编辑对象全量 data；原 store 以 truthy data 成功 |
| 删除节点           | DELETE 同节点路径                                                   | status=1 成功，关闭并重读；提示附带子节点一起删除 |

API 在 1815602 附近；`rho` / 9701816 之前递归消费 id/data_type/define_name/data_define/define_value/color/child，边由父子关系生成，节点数据类型1为圆、类型2/3为矩形。空树显示“暂无态势数据”及新增入口。

`VZn` / 9756663：力导向图，可漫游／拖拽。节点右键菜单为新增数据、编辑节点、删除节点；新增数据把 selectedNode.id 作为 parent；顶栏新增是根节点，parent=null。点击画布清选中和菜单。

`UZn` / 9743285 新增表单构造：

```text
{
  parent: selectedNode.id || null,
  data_type: 1 | 2 | 3,
  kind: 2,
  data_define,
  data: [{data_define,define_value}],
  define_value: [{data_define,define_value}],
  array_value: [{data_define,define_value:[字符串]}]
}
```

三组字段原请求会一起保留默认结构，按类型替换有效组，不能在没有契约依据时自行删除“看似无用”的组。类型1节点数据要求每行 data_define/value；类型2块数据要求块类型及每行字段类型和值；类型3块数组要求首项块类型及所有数组值，提交时将首项 data_define 同步到外层。支持加行／删行，保留至少一行的 UI 入口限制。

`HZn` / 9750602 编辑表单复制 selectedNode，类型不可切换；类型1要求 data_define 和 define_value；类型2要求外层 data_define 和各字段；类型3要求 define_value[0].data_define 和数组值，外层同步块类型。PATCH 提交整个编辑对象，包含图归一化带入的字段，不能伪称是最小字段 PATCH。

关闭新增重置 submitData/selectedNode/loading；关闭编辑清局部副本/selectedNode/loading。`amo` 卸载清 atlas/networkInstance/selectedNode/selectedEdge/inouputData/submitData/contextMenu；新增、编辑、删除后都重读任务级树。无定时轮询。

## 编排配置抽屉逐字段补证

本节补齐画布配置消费者；S 为剧本 ID，N 为节点业务 ID（nodeData.data.id），L 为连线业务 ID（edgeData.data.id），不能用画布元素 ID 替代。除完整地址外，以下路径前缀为 `/api/front/wqzb/simulated_blue_team/scenario/{S}`。

### 连线 vgo / 9817643

GET `/draw/line/{L}/`，status=1 采用 data 为 edgeForm；POST 同路径提交 edgeForm。weight 为0–100整数，允许0但不能空；brief 最多50字；sign 为1执行成功、2执行失败。status=1 成功后回调更新画布边 data、label、stroke/markerEnd 并再次提交 draw。备注优先作为 label，否则显示 weight。关闭重置 `{weight:0,sign:1}` 和错误。

### 判断 ygo / 9820158

打开 GET last_variate 和 GET `/draw/node/{N}/decision/`；后者数组项 data_define_id/id/value 映射为 `{define_id:字符串,id,data:value}`。POST decision 为 `{data_list:[{define_id,id?,data}]}`，status=1 成功。展示“结果数据 in 上一步输出变量”；可逐行删，添加前检查现有 data 非空与 define_id。原保存校验函数恒 false，因此保存没有相同强制完整校验。关闭重置一条空行和错误。

### 数据分支 bgo / 9822897

打开 GET `/draw/node/{N}/branch/`（直接采用响应对象）、GET branch/action（数组 name/id 映射下一步动作）、GET last_variate、GET `/api/front/wqzb/basic_resources/inouput/?nopage=1`。POST branch 提交完整 branchForm：

```text
{
  data_list: [{define_id,value,next_node}],
  transform_list: [{define_id,value,next_define_id,select_defines:[],rule}]
}
```

data_list 的 define_id/value/next_node 必填；transform_list 要求 define_id/next_define_id/rule.trim() 非空，value 为可选匹配值。select_defines 为多选，规则示例 `https://{ip}:{port}/`。两组可添加／删除，添加前检查已填行。原 store status=1 或 status=2 均返回 true，但 status=2 提示配置失败；这是原错误成功返回，不能视为真实协议允许成功。关闭重置 data_list 一条空行、transform_list 空数组及错误。

### 动作能力 _go / 9831109

打开 GET `/api/front/wqzb/test_task/instruction/cascade/` 和 GET `/draw/node/{N}/action/`；后者 status=1 消费 tactics/technology/sub_technology/sub_technology_name。选择三级能力后 POST action `{action_id:sub_technology}`；刷新指令并更新节点名称／背景和 draw。原 saveActionConfig 在 status=2 提示错误后也返回 true，列为原缺陷。

执行次数 PATCH action `{retry_count}`，UI 为0–10整数，保存只检查 typeof 为 number；status=1 成功。原 getActionConfig 只保留四个能力字段，没有恢复服务端 retry_count，不得据 UI 存在推定读取已正确回填次数。

指令 GET `/draw/node/{N}/action/instruct/?page=1&size=10`，消费 results/count、行 id/name/tool_name/operating_system/use/weight。勾选 PATCH `/draw/node/{N}/action/instruct/{instructionId}/` `{use:boolean}`；优先级双击编辑、Enter 或失焦保存，范围0–100000整数，PATCH `{weight}`；truthy 响应 id 成功并重读。原分页处理 M 引用未定义 filter 而非 insFilter，属于原缺陷。

输入／输出样例 GET `/api/front/wqzb/basic_resources/subtolgy/{sub_technology}/`，truthy id 写 movementDetail；消费 param_name/required/field_type/example/child，按 string/int/list/object 递归展示。关闭重置 actionForm、insFilter、insList、预览和错误。

### 已有 type=7 自定义指令 Ngo / 9855379

原右键可打开，抽屉含参数配置、指令名称、指令脚本，另有导入自定义指令、另存指令库。Sgo / 9842821 参数含 input_params/output_params，项 `{scenario_node,kind:1|2,data_define,required,default_data,example}`，要求 data_define；执行节点受 topo_params.id 控制。Cgo / 9849114 名称 trim 非空、最多30字，调用 saveName POST rename `{name}`，但使用 Ug.detail.id。Ego / 9850276 脚本 script_content 非空，编辑／取消／确认；导入选一个 self_defined_id；另存名称非空、最多50字。

**这条链缺失实现，不能补造请求**。Ug 完整定义（9768182–9779791）没有 detail/customParams/customCode/customFilter 初始化，亦没有 getParamsConfig、saveParamsConfig、getCustomCode、editCustomCode、getCustomList、importCustom、saveAsCustom、getBlueNodeList 方法。精确查询 getParamsConfig:async、saveParamsConfig:async、getCustomCode:async、saveAsCustom:async 均0匹配；同名命中只是解构别名。Lgo 的 custom 回调还引用未定义 detail.id。五个可拖拽形状不含 type7，不能添加新自定义指令创建入口；若已有图含 type7，按原链缺失记录明确不可用，不能自行设计指令库 API。

### 已有 type=8 模拟配置 Mgo / 9856832

打开 GET `/draw/node/{N}/behavior_simulate/`，truthy id 消费 id/topo_node/tool_type/tool_detail/interpreter/content；GET `/api/front/wqzb/tool/version/cascade/` 获取工具版本。名称独立编辑：trim 非空、最多50字，POST rename `{name}`，status=1 回调同步图。

POST behavior_simulate 提交 behaviorForm，status=1 成功。tool_type=1 多选工具，归一化 `tool_detail:[{tool_id,version_ids:[]}]`，选整个工具包含全部版本。tool_type=2 上传 FormData `{file,mode:"behavior_simulate"}` 到 `/api/front/wqzb/basic_resources/upload_file/`，status=1 消费 data.url；提交 tool_detail 为 `[{file:已上传url}]`。切类型清工具和文件，可移除文件，至少选择工具或上传文件。interpreter 1=bat、2=bash、3=Python；content 原校验不要求非空。

实验调用 Dgo 未传 topo_params，因此执行节点下拉与拓扑资源请求不出现，topo_node 不新增必填，显示“当剧本导入到具体场景应用时，节点行为模拟需增加执行节点配置”。其他上下文若有 topo_params.id 才要求节点；model/id 同时有值才读拓扑。关闭清 behaviorDetail/behaviorForm/errMsg/topoData。原五形状不含 type8，只能配置已有图内该类型。

### 终端编辑可达性已闭合

全 bundle 查询 `editTerminal:!0` 仅在 9695734、9774020 命中，均是 loading 设置，不是 open 设置。Bgo / 9877329 和 Zgo / 9906929 的操作列只有删除，尾部虽挂载编辑弹窗（9879700、9909700 附近），静态没有打开事件。此前“编辑打开触发待补证”已由此闭合为**挂载但不可达**，不能因 PATCH/PUT 定义存在而补一个编辑按钮。

## 拆票约束与验证边界

- 配置区包含可编辑编排与智能蓝军四页签，不能拆成一个简易“配置表单”而宣称还原完成。
- 以上 API 必须按可达调用方建立独立适配器，尤其区分 E、T、scenario、intelligent、role、terminal；不得猜字段或复用硬编码 task_type=6 的实验运行端点。
- 两导入请求的 test_task 参数差异、删除后的列表重读域、无 query 的智能终端列表，以及原 store 宽松成功判据都已明确记录；它们不是已实测确认的后端契约。
- 编排可创建节点及配置已补请求／字段／状态证据；type7 是已定位的原缺失链，type8 已有节点配置有协议证据。不可把缺失方法当作待猜接口。
- 两类终端编辑已闭合为挂载但不可达，不列为必须还原的可见编辑能力。
- 尚未验证真实响应、资源可用性、服务端对共享蓝军配置修改的归属语义或实际操作效果。当前可依据静态行为拆还原票，并用隔离协议样例验证；不宣称真实环境兼容。

配置子范围已足以拆给实施代理：分别列出可达还原项、原缺陷／不可达项、真实协议未验证项，把原错误成功返回、未回填字段、未定义变量写进差异验收。这里没有声称穷尽 bundle 中全部未使用方法。
