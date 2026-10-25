# S13-04：运行控制、攻击轮次与结果对比

**Type:** AFK  
**Labels:** ready-for-agent  
**Status:** todo  
**User stories:** US035；F041 模拟蓝军；R089 内部流程  
**Blocked by:** [S13-01](./01-entry-and-initial-situation.md)

## What to build

完成蓝军状态检查、全部运行控制动作、轮次维护和对比分析详情，形成完整运行与结果闭环。

## Acceptance criteria

### 蓝军状态检查控制与攻击轮次

- [ ] 三类检查kind1/2/3及一键不指定kind；仅status=1且message精确为检查通过才标记通过；原前端不以三项全通过禁用启动。
- [ ] GET/POST control使用测试任务ID与蓝军ID；0/4可start/clear，1可pause/over/clear，2可continue/over/clear；module1不发送scene_id，未知状态不猜动作。
- [ ] 清空有所有轮次数据确认，操作成功才重读状态与轮次，失败不更新为成功态；重复点击在pending时受控。
- [ ] 轮次分页默认page1/size5，展示原状态、起止与时长；删除确认成功重读、末页唯一行退一页；过程票使用nopage0数组，按显式请求分支适配两种响应形状。
- [ ] 保留原当前页首行执行中才5秒刷新轮次的条件与executed_time计时；切蓝军/离页清timer、请求和检查标记，不新增轮询或重试策略。

### 攻击轮次对比与结果详情

- [ ] 仅status4且round非1可对比；status5显示查看，其他状态不可发起POST；POST compare成功后刷新轮次。
- [ ] 选择查看轮次后重置结果page1，按当前roundId GET compare分页；显示执行动作、两侧数据和结论。
- [ ] 详情展开两侧JSON；内容一致结论使用原防御说明；无结果有空态，业务/网络失败不提示对比完成。

## 验证

用隔离HTTP响应检查原状态对应的动作、确认/失败、轮次分页及对比详情；同一业务流程可覆盖多个状态，不另造状态机或全组合测试。确认5秒刷新按原条件运行且离页停止；不执行真实资源操作。

## 证据与共同约束

必读[本地票索引与共同验收](../README.md)、[S13主分析](../../../docs/planning/s13-analysis.md)、[配置补证](../../../docs/planning/s13-configuration-evidence.md)。以下按子流程定位原符号与协议，实施时按有界查询复查原件。

- 主分析“运行、检查、轮次接口”，sho/zg/BZn/I2n/N2n/L2n。
- 主分析“轮次与对比”，SQr/CQr/aho/BZn。

按索引的精简约束实施；不增加启动前置门槛、控制动作、对比规则或额外运行框架。
