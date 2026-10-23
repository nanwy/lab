# S08 原 bundle 对照审计（2026-10-24）

修复前审计结论：主要功能已接通，但尚未全部还原。Spec 轴确认两项 P2 行为差异，Standards 轴确认一项 P2 错误处理遗漏；未发现需要删除的过度设计。下文保留修复前发现。随后按用户指令实施三项修正并通过8项定向隔离浏览器验证，见[修正记录](s08-implementation.md#审计后修正2026-10-24)；原始审计本身未修改业务代码。

固定范围为 `160f32558114d5eaac0581120d001b679e031e66...736c604e2b19e64433a071d5d8329a4a57de49a2`，对应 S08 四票。依据为[四票范围](../../.scratch/s08-traffic/analysis.md)、[实施记录](s08-implementation.md)、当前源码及通过 `scripts/evidence_query.py query` 查询的原 bundle。下列原始偏移均为 Unicode 字符偏移。当前切片状态以[实施计划](page-rebuild-implementation.md)为准。

## 修复前功能覆盖

| 能力       | 审计时覆盖与结论                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 捕获与记录 | 标记配置、启停、实验监控独立双表、链路/全图记录、分页、搜索、链路排序及刷新、详情、下载、删除、清空均有实现；弹窗关闭条件及链路切页签状态有差异。    |
| 嗅探       | 状态、启停、后端命令复制、Wireshark 配置说明、OnlyOffice 指南入口均有接线；未确认遗漏。                                                              |
| 镜像       | 场景内部页签、编辑器挂载保留、规则搜索/分页、节点/TAP 选择、原必填与互斥、创建、启停、删除及末页回退均有实现；未确认遗漏。                           |
| 拦截与模板 | 指定运行节点菜单、UUID、策略、规则生成、Ace 编辑、草稿保存、启停、运行中只读、日志及清空、模板各操作均有实现；弹窗关闭条件及协议契约失败提示有遗漏。 |

原实验包装 `Ojs`（约 `12682300`）传入 `task_type="6"`；通用组件 `M4a`（约 `8007480`）据此隐藏流量模拟页签。因此 PCAP/脚本回放不是本次实验入口的遗漏。完整拓扑模板和拓扑文件导入也不属于该入口可达范围。

## Spec

### P2：四处弹窗遗漏禁止遮罩关闭

审计时 [CaptureDialog.tsx](../../apps/web/src/traffic/CaptureDialog.tsx#L53)、[InterceptionDialog.tsx](../../apps/web/src/traffic/InterceptionDialog.tsx#L70)、[模板导入](../../apps/web/src/traffic/InterceptionTemplates.tsx#L188)和[另存模板](../../apps/web/src/traffic/InterceptionTemplates.tsx#L259)沿用 Dialog 默认的外部点击关闭行为。输入尚未保存的配置、脚本、模板名称或选择文件后点击遮罩，会关闭弹窗并丢失本地输入。

原 `pPa`（约 `6927801`）、`ZDa`（约 `7550580`）、`qDa`（约 `7543000`）、`BDa`（约 `7466000`）均设置 `maskClosable:!1`。范围要求“原入口的字段、状态、校验、确认、分页和刷新逐项还原”，此关闭条件未还原。最小修正是阻止这些弹窗的遮罩关闭，无需新增未保存确认流程。

### P2：链路记录切页签后丢失查询与选择状态

[CaptureDialog.tsx](../../apps/web/src/traffic/CaptureDialog.tsx#L79)只在记录页签挂载 `CaptureRecords`；[CaptureRecords.tsx](../../apps/web/src/traffic/CaptureRecords.tsx#L87)将筛选和选择保存在组件本地。搜索、翻页或排序后切到配置再切回，会回到默认第一页、空搜索和空选择。

原 `pPa` 虽然设置 `destroyInactiveTabPane:!0`，但 `mPa`（约 `6931124`、`6932300`）的 `flowFilter/flowSelected` 存在共享 store。`capturePcapList`（约 `6849150`）只更新列表；`resetFlowMonitor`（约 `6859020`）才重置查询和选择，且由 `pPa` 在捕获弹窗关闭时调用。页签销毁不等于原查询状态销毁。票01要求“保留各入口原有分页、搜索和选择行为”；最小修正是让状态存活至弹窗关闭。

## Standards

### P2：协议响应契约损坏被展示为空候选列表

[InterceptionDialog.tsx](../../apps/web/src/traffic/InterceptionDialog.tsx#L50)读取协议列表，却不处理 `protocols.isError`；节点表单和模板均以 `protocols.data ?? []` 消费。若 HTTP 200 返回合法 JSON、但字段不符合协议契约，[traffic-interception.ts](../../apps/web/src/api/traffic-interception.ts#L44)在统一请求返回后抛出 `invalid-response`，不会经过请求实例内部的错误提示；页面最终呈现正常空候选列表。

这违反根 `AGENTS.md` 中“必填字段缺失、类型错误……及时返回明确错误”和“不能用空数组……掩盖错误”的要求。网络/HTTP 失败已有统一提示，本项特指请求结束后的 schema 解析失败。最小修正是明确呈现协议查询错误，仍保留原手动输入能力，不增加重试或恢复向导。

## 过度设计判断

未确认需要删除的通用框架、推测性抽象或额外业务校验。`InterceptionFields` 有节点和模板两个实际消费者；显式 Field/TanStack Form 写法符合仓库约束，不能仅因代码较长改成动态字段框架。

Ace 的高亮、行号、补全、snippets、tabSize2 和运行中只读有原 `YAt` 依据；规则生成的 200ms 延迟及策略字段非空条件有原 `VDa/QDa` 依据。日志 60 秒心跳、仅特定 error 分支触发的 4 秒间隔/最多四次重连有原 `MVn/LDa/PDa/DDa` 依据，属于恢复原能力。连接清理和明确失败提示属于必要生命周期处理。

## 验证边界

审计轮完成静态原始证据、源码和固定差异审查，未修改 UI，也未新运行单测或浏览器测试。既有隔离验收结果仅作为历史交付记录，不能证明上述遗漏不存在。

未调用真实后端执行采集、镜像、拦截或模板写入；实际 PCAP/模板文件兼容、真实流量效果、外部 Office 渲染、HTTPS/WSS 部署、其他浏览器和移动视口仍未验证。未验证项不直接等同于已确认的前端遗漏。

计数：Spec 两项 P2；Standards 一项 P2。没有确认主要功能类别整体缺失，但三项问题修正前不能认定 S08 完全还原。
