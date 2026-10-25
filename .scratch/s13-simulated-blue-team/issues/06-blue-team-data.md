# S13-06：蓝军网络与数据视图

**Type:** AFK  
**Labels:** ready-for-agent  
**Status:** todo  
**User stories:** US035；F041 模拟蓝军；R089 内部流程  
**Blocked by:** [S13-01](./01-entry-and-initial-situation.md)、[S13-04](./04-control-and-comparison.md)

## What to build

在蓝军数据页按轮次切换网络/数据视图，查看节点采集内容、维护数据图和执行记录，处理周期刷新及实时节点推送。

## Acceptance criteria

### 蓝军数据网络视图与节点详情

- [ ] 还原按轮次选择及网络/数据两个视图，无轮次显示原空态。
- [ ] GET flow_path携带blue_team_control，消费ip_relation和input_ip_params_map；转换IP/交换机/路由器图，点击节点显示对应JSON，无采集值提示原文。
- [ ] 首次与每60秒轮询均携带当前轮次，修复原漏filter，不新增刷新频率或自动恢复逻辑。
- [ ] 切视图/轮次/实验和离页清interval、图和resize监听，旧响应不能覆盖新轮次；失败不将旧数据标为刷新成功。

### 蓝军数据图维护推送与执行记录

- [ ] 复用S13-01已验证图/三类型表单，显式切为蓝军级init_situation_node路径；读取带blue_team_control，新增kind3；原增改删不发送轮次归属字段，不能宣称服务端已保证轮次写入隔离。
- [ ] 保留刷新、根/子节点新增、编辑、含子节点删除确认；成功重读当前轮次；不能把初始态势任务级数据与蓝军数据共用隐式ID或缓存。
- [ ] 执行记录position_instruction_record带当前轮次与分页，展示时间/指令/状态/获取数据；面板可收起，切轮次重置旧记录与选中节点。
- [ ] 同源situation_node WS按消息节点/parent更新图，从消息读取data_define，修复原初始化自引用；基于当前图状态更新，避免旧闭包吞节点。
- [ ] 消息无已确认轮次标识时保留不确定性，不能把所有实时事件当成历史轮次结果；切视图和离页关闭本页WS/心跳/重连并清旧请求，不建设通用会话框架。

## 验证

检查网络图节点详情、轮次读取/60秒刷新、数据维护、执行记录和节点推送；表单规则复用01已有结果，只补蓝军路径、kind=3及本次修复的自引用/丢更新回归。不重复整套三类型表单矩阵或新建WS测试平台，真实写入效果仍列未验证。

## 证据与共同约束

必读[本地票索引与共同验收](../README.md)、[S13主分析](../../../docs/planning/s13-analysis.md)、[配置补证](../../../docs/planning/s13-configuration-evidence.md)。以下按子流程定位原符号与协议，实施时按有界查询复查原件。

- 主分析“网络视图”“原缺陷”，Pho/Lho/kho/Rho/pQr。
- 主分析“蓝军数据”“WebSocket”“原缺陷”；配置补证三类型表单；Oho/Eho/Pho/gQr/mQr/vQr/yQr。

按索引的精简约束实施；不扩充数据类型、节点操作、推测的轮次写入字段或S14独立态势。
