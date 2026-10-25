# S13-04：运行控制、攻击轮次与结果对比

**Type:** AFK  
**Labels:** ready-for-agent  
**Status:** complete

**User stories:** US035；F041 模拟蓝军；R089 内部流程  
**Blocked by:** [S13-01](./01-entry-and-initial-situation.md)

## What to build

完成蓝军状态检查、全部运行控制动作、轮次维护和对比分析详情，形成完整运行与结果闭环。

## Acceptance criteria

### 蓝军状态检查控制与攻击轮次

- [x] 三类检查kind1/2/3及一键不指定kind；仅status=1且message精确为检查通过才标记通过；原前端不以三项全通过禁用启动。
- [x] GET/POST control使用测试任务ID与蓝军ID；0/4可start/clear，1可pause/over/clear，2可continue/over/clear；module1不发送scene_id，未知状态不猜动作。
- [x] 清空有所有轮次数据确认，操作成功才重读状态与轮次，失败不更新为成功态；重复点击在pending时受控。
- [x] 轮次分页默认page1/size5，展示原状态、起止与时长；删除确认成功重读、末页唯一行退一页；过程票使用nopage0数组，按显式请求分支适配两种响应形状。
- [x] 保留原当前页首行执行中才5秒刷新轮次的条件与executed_time计时；切蓝军/离页清timer、请求和检查标记，不新增轮询或重试策略。

### 攻击轮次对比与结果详情

- [x] 仅status4且round非1可对比；status5显示查看，其他状态不可发起POST；POST compare成功后刷新轮次。
- [x] 选择查看轮次后重置结果page1，按当前roundId GET compare分页；显示执行动作、两侧数据和结论。
- [x] 详情展开两侧JSON；内容一致结论使用原防御说明；无结果有空态，业务/网络失败不提示对比完成。

## 验证

用隔离HTTP响应检查原状态对应的动作、确认/失败、轮次分页及对比详情；同一业务流程可覆盖多个状态，不另造状态机或全组合测试。确认5秒刷新按原条件运行且离页停止；不执行真实资源操作。

## 证据与共同约束

必读[本地票索引与共同验收](../README.md)、[S13主分析](../../../docs/planning/s13-analysis.md)、[配置补证](../../../docs/planning/s13-configuration-evidence.md)。以下按子流程定位原符号与协议，实施时按有界查询复查原件。

- 主分析“运行、检查、轮次接口”，sho/zg/BZn/I2n/N2n/L2n。
- 主分析“轮次与对比”，SQr/CQr/aho/BZn。

按索引的精简约束实施；不增加启动前置门槛、控制动作、对比规则或额外运行框架。

## 交付与验证（2026-10-25）

- 完成实验module1蓝军三项/一键检查、全部五类控制动作、清空所有轮次确认；status1且message精确等于检查通过才标记通过，不附加启动前置条件。只用test_task和当前blue.id，不发送scene_id；未知状态不生成控制动作。
- 轮次page/size5使用TanStack Query/Table，按原0/1/2/4/5状态及起止时间展示；删除确认失败保留，成功末页退页。对比只开放status4且非首轮，status5查看；比较POST无body，结果page/size10随轮次重置；两侧JSON可展开收起，内容一致使用原防御结论，空结果明确展示。
- 有界复查sho/zg/BZn/aho及I2n/N2n/O2n/L2n/SQr/CQr。保留当前页首行执行中才延迟5秒重读轮次，否则只重读一次control的原分支，不把control更新当作再次刷新触发器。保留原lho在状态1/2挂载时逐秒累加executed_time。修复原setTimeout未清理：切页、切蓝军和离页清定时器/请求/检查标记，迟到结果不写新对象。
- getBlueRounds按显式page与nopage0分支解析分页对象/数组，后者只要求pho消费的id/round；未实现05/06界面或建立运行框架。原真实响应必填/空值和服务端状态效果仍未实测。
- TDD：检查/控制占位红灯`/tmp/s13-04-control-red.log`，轮次/对比红灯`/tmp/s13-04-rounds-red.log`；条件刷新红灯`/tmp/s13-04-timer-red2.log`在5秒后HTTP读取次数仍1而预期2。初次预加载冻结时钟阻塞Query通知的环境失败不计业务红灯。
- 最终3项本票浏览器与入口导入/选择直接消费者1项通过`/tmp/s13-04-final.log`（4项、6.2秒），覆盖精确检查判据、start/pause/continue/over/clear、确认取消与业务失败、轮次删除退页、对比门控/失败/成功/详情/空结果/分页、计时和条件刷新停止/切换清理。05/06数组分支仅静态契约适配，本票没有该UI消费者验证。
- web类型`/tmp/s13-04-types-final.log`、五代码/测试文件ESLint、九文件Prettier、文档链接及diff检查通过；`/tmp/s13-04-control.png`与`/tmp/s13-04-comparison.png`已目视核对。未运行全量check、构建、其他票全组或真实后端。第四票已实施验证，双轴审查待执行；S13整体仍进行中。

## 双轴初审修正

初审Standards 0项，Spec两项P2和一项P3已由同一实施代理修正：同一轮次再次查看也重置结果页码1；JSON根/嵌套容器保留[]/{}与展开收起；五类control动作成功显示原服务端可选message，无自造成功文案或重复错误提示。有界复查sho/aho/zg后，三项关键行为先红后绿，定向3项通过`/tmp/s13-04-review-green.log`；web类型/四文件lint/六文件格式及diff通过，不重跑未改计时与入口。增量差异`8a97c09...9928c77`经两轴独立复查，三项均关闭且无新增发现，已随`325326f`合入集成分支。具体修正与证据见[S13实施记录](../../../docs/planning/s13-implementation.md#s13-04-双轴初审修正2026-10-25)。
