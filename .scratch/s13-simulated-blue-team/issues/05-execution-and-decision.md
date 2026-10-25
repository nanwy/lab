# S13-05：执行与决策过程查看

**Type:** AFK  
**Labels:** ready-for-agent  
**Status:** todo  
**User stories:** US035；F041 模拟蓝军；R089 内部流程  
**Blocked by:** [S13-04](./04-control-and-comparison.md)

## What to build

按攻击轮次查看执行图、决策记录、输入输出、实时日志，以及决策树/环和步骤详情，统一处理过程页的上下文切换和连接清理。

## Acceptance criteria

### 按轮次执行过程与实时记录

- [ ] 轮次nopage0数组，无轮次显示原空态；销毁非激活轮次；有scenario读取draw并按exec_scenario_node_uid高亮，无scenario仍显示记录与详情。
- [ ] position_instruction_record分页携带blue_team_control，点击决策显示exec_params.data和exec_return；展示原状态与可收起面板。
- [ ] control/log按实际包装器不带轮次query；记录该历史日志范围未确认，不将其标为已验证的轮次过滤日志，也不自行发明参数。
- [ ] 同源WS普通路径按kind1前插日志、kind2更新运行信息并刷新记录；HTTP/ws与HTTPS/wss映射、原心跳和重连上限有协议接线，无消息标记覆盖缺陷。
- [ ] 连接、心跳、重连timer、图与请求按当前实验/蓝军/轮次清理；原消息无已确认轮次标识时不声称可靠历史轮次归属；连接错误可见，不伪造自动成功。

### 按轮次决策树环与步骤详情

- [ ] 读取轮次及nopage1决策列表，默认全部过程；GET perspective/tree携带blue_team_control与instruction_record_id（全部为空字符串），status1转换data/child。
- [ ] 树/环使用同一原数据转换，保留节点语义、缩放/拖拽及右键步骤详情；详情含数据、指令、时间、状态及下一步指令。
- [ ] 决策日志instruction_record携带当前轮次和原分页参数，展示create_time/instruction_name/status/exec_return；原可见交互未提供分页控件时不添加新分页产品行为。
- [ ] 无轮次/空树/空日志及读取失败有明确行为；轮次/决策切换、离页销毁图实例、监听和旧请求，不能混用智能配置图或S14大屏。

## 验证

复用现有浏览器、HTTP和WS隔离能力，检查轮次查看、输入/输出、树环与步骤详情、两种实时事件及连接清理。针对实际修复的错误补回归，不新建本地WS测试平台，不要求逐页重跑同类断连/并发矩阵。原WS心跳与重连参数照证据实现，不新增自动恢复、历史事件归档或推测的轮次过滤。

## 证据与共同约束

必读[本地票索引与共同验收](../README.md)、[S13主分析](../../../docs/planning/s13-analysis.md)、[配置补证](../../../docs/planning/s13-configuration-evidence.md)。以下按子流程定位原符号与协议，实施时按有界查询复查原件。

- 主分析“执行、决策与数据接口”“WebSocket”“原缺陷”，pho/hho/uho/qxt。
- 主分析“决策过程”，xho/Aho/vho/bho/mho/R2n/k2n/Iet。

按索引的精简约束实施；不新增决策编辑/保存、iho策略能力或S14大屏。
