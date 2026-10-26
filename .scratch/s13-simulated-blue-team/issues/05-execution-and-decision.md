# S13-05：执行与决策过程查看

**Type:** AFK  
**Labels:** ready-for-agent  
**Status:** complete

**User stories:** US035；F041 模拟蓝军；R089 内部流程  
**Blocked by:** [S13-04](./04-control-and-comparison.md)

## What to build

按攻击轮次查看执行图、决策记录、输入输出、实时日志，以及决策树/环和步骤详情，统一处理过程页的上下文切换和连接清理。

## Acceptance criteria

### 按轮次执行过程与实时记录

- [x] 轮次nopage0数组，无轮次显示原空态；销毁非激活轮次；有scenario读取draw并按exec_scenario_node_uid高亮，无scenario仍显示记录与详情。
- [x] position_instruction_record分页携带blue_team_control，点击决策显示exec_params.data和exec_return；展示原状态与可收起面板。
- [x] control/log按实际包装器不带轮次query；记录该历史日志范围未确认，不将其标为已验证的轮次过滤日志，也不自行发明参数。
- [x] 同源WS普通路径按kind1前插日志、kind2更新运行信息并刷新记录；HTTP/ws与HTTPS/wss映射、原心跳和重连上限有协议接线，无消息标记覆盖缺陷。
- [x] 连接、心跳、重连timer、图与请求按当前实验/蓝军/轮次清理；原消息无已确认轮次标识时不声称可靠历史轮次归属；连接错误可见，不伪造自动成功。

### 按轮次决策树环与步骤详情

- [x] 读取轮次及nopage1决策列表，默认全部过程；GET perspective/tree携带blue_team_control与instruction_record_id（全部为空字符串），status1转换data/child。
- [x] 树/环使用同一原数据转换，保留节点语义；树画布保留缩放/平移及右键步骤详情，环只原层次展示；详情含数据、指令、时间、状态及下一步指令。
- [x] 决策日志instruction_record携带当前轮次和原分页参数，展示create_time/instruction_name/status/exec_return；原可见交互未提供分页控件时不添加新分页产品行为。
- [x] 无轮次/空树/空日志及读取失败有明确行为；轮次/决策切换、离页销毁图实例、监听和旧请求，不能混用智能配置图或S14大屏。

## 验证

复用现有浏览器、HTTP和WS隔离能力，检查轮次查看、输入/输出、树环与步骤详情、两种实时事件及连接清理。针对实际修复的错误补回归，不新建本地WS测试平台，不要求逐页重跑同类断连/并发矩阵。原WS心跳与重连参数照证据实现，不新增自动恢复、历史事件归档或推测的轮次过滤。

## 证据与共同约束

必读[本地票索引与共同验收](../README.md)、[S13主分析](../../../docs/planning/s13-analysis.md)、[配置补证](../../../docs/planning/s13-configuration-evidence.md)。以下按子流程定位原符号与协议，实施时按有界查询复查原件。

- 主分析“执行、决策与数据接口”“WebSocket”“原缺陷”，pho/hho/uho/qxt。
- 主分析“决策过程”，xho/Aho/vho/bho/mho/R2n/k2n/Iet。

按索引的精简约束实施；不新增决策编辑/保存、iho策略能力或S14大屏。

## 交付与验证（2026-10-26）

- 交付轮次nopage0数组读取与原未执行空态；执行页按轮次销毁非激活内容，有剧本时复用React Flow节点展示为只读图、按exec_scenario_node_uid高亮节点和入边，无剧本仍显示分页记录、输入输出和日志。决策记录page1/size10携带当前轮次，面板可收起；参数复用原JSON容器/展开组件，不复制编辑动作。
- 历史control/log不带query，不声称按轮次过滤。普通同源WS按kind1日志前插、kind2更新运行信息并重读当前页记录，60秒心跳；HTTP/ws和HTTPS/wss映射，原onerror后4秒检查readyState、未收到消息时最多4次重连，close只显示断开，不新增恢复策略。消息标记在单一onmessage内维护，不再被全局处理器替换破坏。
- 按原pho只给首个轮次读取初始control运行信息；WS本身没有已确认轮次字段，不推测过滤或归档历史事件。切轮次/蓝军/页签和离页清WS、心跳、重连timer、Query及图，旧事件不写新视图。重连参数按有界原件与代码核对，未为onerror另建WS服务平台。
- 决策读取同一轮次nopage1列表，默认全部过程，单次携带instruction_record_id；树与sunburst层次图由原data/child转换，保留节点颜色/参数标签和原层次权重，树画布保留缩放/平移，环只原层次展示。sunburst剔除kind3子节点、kind2使用params标签、叶权重child.length或1、父权重为子项和；原环click/contextmenu为空，不增右键能力。树右键详情展示数据/指令/时间/状态及当前节点与直接下一步图。决策日志page1/size10按当前轮次读取，原无分页控件，不新增产品分页。
- 原child与params合法missing/null分别归一为[]/{}，错误非数组/非对象不猜字段；空树、空日志、无轮次和失败重试明确展示。没有增加决策编辑、策略保存或S14大屏。
- TDD红灯：执行入口占位`/tmp/s13-05-execution-red.log`，未接WS时`/tmp/s13-05-ws-red.log`，决策入口占位`/tmp/s13-05-decision-red.log`，环未实现`/tmp/s13-05-decision-ring-red.log`。StrictMode开发初始连接总数不是业务指标，按唯一活跃连接与旧连接清理验收。
- 6项本票浏览器加原剧本画布/对比JSON两项直接消费者通过：执行3项及共享2项`/tmp/s13-05-direct.log`（5 passed、4.4秒）；正式入口接入决策后3项与执行初始信息/图直接受影响1项`/tmp/s13-05-integrated.log`（4 passed、5.7秒），其余未改结果复用，不重复全组。覆盖两类实时事件、心跳/close反馈/切轮次清理、查询参数、分页详情、树环/步骤/下一步、合法空分支及迟到树隔离。
- web类型`/tmp/s13-05-types-final.log`、11个改动代码/测试文件ESLint、15文件Prettier、文档链接及diff检查通过；执行图、决策树和层次环截图已目视核对。未跑前票全组、全量check、构建或真实服务。真实字段空值/资源结果、历史日志与WS轮次归属仍未实测；第五票已实施验证，双轴审查待执行，S13整体仍进行中，第六票未实施。

## 原范围精简复核（2026-10-26）

第五票两轴初审均0项，父代理另行核对精简范围发现sunburst额外增加wheel缩放与pointer拖拽。有界复查`bho @ 9738423`仅series sunburst、radius、sort、label及空click/contextmenu，未配置roam；`vho`才有zoom-canvas/drag-canvas。删除环的transform/drag状态及相关事件，保留响应式viewBox、原层次扇区和标签，不改树画布。受影响环1项、web类型、图文件ESLint/三文件Prettier及diff通过，未追加矩阵或重跑未改流程；尚待父代理增量复核。
