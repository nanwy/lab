# S13-06：蓝军网络与数据视图

**Type:** AFK  
**Labels:** ready-for-agent  
**Status:** complete

**User stories:** US035；F041 模拟蓝军；R089 内部流程  
**Blocked by:** [S13-01](./01-entry-and-initial-situation.md)、[S13-04](./04-control-and-comparison.md)

## What to build

在蓝军数据页按轮次切换网络/数据视图，查看节点采集内容、维护数据图和执行记录，处理周期刷新及实时节点推送。

## Acceptance criteria

### 蓝军数据网络视图与节点详情

- [x] 还原按轮次选择及网络/数据两个视图，无轮次显示原空态。
- [x] GET flow_path携带blue_team_control，消费ip_relation和input_ip_params_map；转换IP/交换机/路由器图，点击节点显示对应JSON，无采集值提示原文。
- [x] 首次与每60秒轮询均携带当前轮次，修复原漏filter，不新增刷新频率或自动恢复逻辑。
- [x] 切视图/轮次/实验和离页清interval、图和resize监听，旧响应不能覆盖新轮次；失败不将旧数据标为刷新成功。

### 蓝军数据图维护推送与执行记录

- [x] 复用S13-01已验证图/三类型表单，显式切为蓝军级init_situation_node路径；读取带blue_team_control，新增kind3；原增改删不发送轮次归属字段，不能宣称服务端已保证轮次写入隔离。
- [x] 保留刷新、根/子节点新增、编辑、含子节点删除确认；成功重读当前轮次；不能把初始态势任务级数据与蓝军数据共用隐式ID或缓存。
- [x] 执行记录position_instruction_record带当前轮次与分页，展示时间/指令/状态/获取数据；面板可收起，切轮次重置旧记录与选中节点。
- [x] 同源situation_node WS按消息节点/parent更新图，从消息读取data_define，修复原初始化自引用；基于当前图状态更新，避免旧闭包吞节点。
- [x] 消息无已确认轮次标识时保留不确定性，不能把所有实时事件当成历史轮次结果；切视图和离页关闭本页WS/心跳/重连并清旧请求，不建设通用会话框架。

## 验证

检查网络图节点详情、轮次读取/60秒刷新、数据维护、执行记录和节点推送；表单规则复用01已有结果，只补蓝军路径、kind=3及本次修复的自引用/丢更新回归。不重复整套三类型表单矩阵或新建WS测试平台，真实写入效果仍列未验证。

## 证据与共同约束

必读[本地票索引与共同验收](../README.md)、[S13主分析](../../../docs/planning/s13-analysis.md)、[配置补证](../../../docs/planning/s13-configuration-evidence.md)。以下按子流程定位原符号与协议，实施时按有界查询复查原件。

- 主分析“网络视图”“原缺陷”，Pho/Lho/kho/Rho/pQr。
- 主分析“蓝军数据”“WebSocket”“原缺陷”；配置补证三类型表单；Oho/Eho/Pho/gQr/mQr/vQr/yQr。

按索引的精简约束实施；不扩充数据类型、节点操作、推测的轮次写入字段或S14独立态势。

## 交付与验证（2026-10-26）

- 交付蓝军数据入口的nopage0轮次、网络/数据两视图及无轮次空态。网络按原Nho/Mho生成IP、网段交换机及跨网段路由器与去重直线，仅IP可查看input_ip_params_map对应JSON，无采集值保持“当前节点未采集到数据！”。首次及60秒重读均携带当前blue_team_control，切视图/轮次/离页取消interval和旧请求，失败显示错误态不以旧图冒充刷新成功。
- 原SituationEditor/SituationForm复用于蓝军级路径，任务级包装仍保留原独立路径/缓存；显式保存回调与kind=2/3区分两个实际消费者，不新建表单框架。蓝军读取携带轮次；根/子数据新增kind3、编辑、含子节点删除及成功重读保留，写入不额外添加轮次字段。执行记录按page/size10/search空值及当前轮次读取，支持收起，切轮次回第一页。
- 有界复查Oho：原`data_define:C.data_define`初始化自引用改为从消息读取；事件按当前Query缓存函数式合并节点与父子关系，连续事件不覆盖前一次图。图收到数据变化同步节点，保留已拖位置，不依赖毫秒时间戳key导致同批消息丢展示。
- 只把05/06实际共用的同源WS构造、60秒心跳、4秒最多4次onerror重连和清理抽至blue-socket，两个消费者分别解析自身消息；普通执行与situation_node路径明确分开，无全局socket/推测轮次过滤。close仍只反馈；原事件未确认轮次标识，不能声称历史轮次归属或写入隔离已由服务端保证。
- TDD红灯：数据入口占位`/tmp/s13-06-data-red.log`、无节点订阅`/tmp/s13-06-events-red.log`；网络展示/缺轮询分别`/tmp/s13-06-network-red.log`、`/tmp/s13-06-network-timer-red.log`。实施时一次旧标签定位错误已按共享表单实际字段修正，不计业务红灯。
- 正式入口蓝军CRUD与连续节点事件2项通过`/tmp/s13-06-data-integrated.log`（2 passed、3.9秒）；网络3项通过`/tmp/s13-06-network-integrated.log`（3 passed、4.4秒）；原任务级CRUD与05实时执行直接消费者2项通过`/tmp/s13-06-consumers.log`（2 passed、2.5秒）。节点事件流程随后追加适配视图操作用于截图，定向1项通过`/tmp/s13-06-data-view.log`。未重跑三类型表单矩阵或其他票全组。
- web类型`/tmp/s13-06-types-final.log`、12个改动代码/测试文件ESLint、16文件Prettier、文档链接及diff检查通过。`/tmp/s13-06-data.png`与`/tmp/s13-06-network.png`已目视核对；未运行全量check、构建或真实接口。
- 六票的原可达静态范围与缺口已在[S13记录](../../../docs/planning/s13-implementation.md#六票覆盖与剩余边界)核对。06已实施验证，S13仅待最终双轴审查收口，尚未声明本票审查通过。type7原链缺失继续明确不可用，终端编辑/iho不可达不补造；真实服务、工具/资源操作、持久化及授权仍未联调，不能冒称已接通。未修改S12或S14。

## 双轴初审修正

两轴汇总3项独立P2（读取竞态重复发现只计一次）已统一修正，尚待增量复查：当前GET窗口暂存节点事件，响应快照合并事件后再写缓存；未知parent必须明确反馈，不能提升为根；原type3空define_value数组在HTTP/WS、图与编辑中合法，保存不伪造首项，错误数组元素仍拒绝。三项公共行为先红后绿`/tmp/s13-06-review-green.log`，原蓝军CRUD/任务级态势CRUD直接消费者2项通过`/tmp/s13-06-review-consumers.log`；web类型、六文件lint、八文件格式/链接/diff通过。只处理当前读取窗口，不建归档或轮次协议，未重跑原7项全组；细节见[S13记录](../../../docs/planning/s13-implementation.md#s13-06-双轴初审修正2026-10-26)。

## 空结构增量回归修正

原3项P2已复查关闭后，Spec新增1项P2已修：只有原外层define_value=[]且未添加值才保留外层空；首块内部define_value=[]仍保留该块与未知元字段，按原HZn保存逻辑将首块data_define写入顶层，不错误改用旧外层来源。独立fixture outer99/inner7及未知unit/metadata先红后绿，连同既有outer[]定向2项通过`/tmp/s13-06-inner-green.log`，类型/两文件lint/四文件格式及diff通过。最终增量`c92daa9...bd3423b`两轴复查无新增发现，保存回归已关闭，Spec确认六票静态范围可收口；本票随`94058ac`合入集成分支。细节见[S13记录](../../../docs/planning/s13-implementation.md#s13-06-空结构增量回归修正2026-10-26)。
