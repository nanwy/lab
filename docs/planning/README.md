# 学员端文档入口

开始或继续实施时，以[页面还原实施计划](page-rebuild-implementation.md)为基准：实施顺序、依赖、切片状态和 F 编号覆盖关系只在该文件维护。按当前切片读取对应规格与证据，不必通读全部文档。

## 按任务查阅

| 任务           | 文档                                                                                                    | 职责                                               |
| -------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 实施与进度     | [实施计划](page-rebuild-implementation.md)                                                              | 唯一执行和进度基准                                 |
| 业务范围与验收 | [功能规格](spec.md)                                                                                     | 103 条用户故事、业务规则与范围边界                 |
| 定位功能       | [功能目录](function-catalog.md)                                                                         | 49 个 F 编号的入口、操作、权限、证据缺口与验收     |
| 筛选功能       | [features.json](features.json) / [features.csv](features.csv)                                           | 功能目录的结构化视图，不维护实施状态               |
| 定位原站代码   | [页面功能与代码对照](page-feature-code-map.md) / [JSON 索引](page-feature-code-map.json)                | 原 bundle 的组件、请求、源码位置及用户故事映射     |
| 查路由与权限   | [路由覆盖](route-coverage.md) / [权限矩阵](permissions.md)                                              | 原始 104 条路由定义与账号、对象边界                |
| 修改工程基础   | [工程初始化规格](frontend-initialization.spec.md)                                                       | 工程选型、初始化边界与验收要求                     |
| 执行与验证     | [开发流程](../development-workflow.md)                                                                  | 调查、实现和验证流程                               |
| 查询原始证据   | [有界证据查询](../evidence-query.md)                                                                    | 分片、偏移、查询上限与无损门禁                     |
| 查历史交付     | [实施记录](../implementation-status.md)                                                                 | 交付时的范围、检查结果、差异和缺口；不维护当前进度 |
| 查已确认契约   | [账号与会话](../architecture/account-session.md) / [应用入口与壳](../architecture/application-shell.md) | 对应边界的协议与行为证据                           |

P1–P7 是产品范围阶段，S 编号是实施切片；两者职责见[功能规格](spec.md)和[实施计划](page-rebuild-implementation.md)。F 编号用于功能覆盖，不等于独立开发任务。

功能目录及 JSON / CSV 的业务字段发生变化时同步对应视图；切片状态变化只更新实施计划，验证结果记入实施记录。页面代码对照中的工程代码引用为审计快照，后续实施查阅实际代码和对应契约。

## 原始证据

原始证据保留在仓库外的 `rea-analysis/xueyuan/`，该目录中的旧规划副本已移除，规划统一维护在本目录。

- [静态分析](../../../rea-analysis/xueyuan/analysis.md)、[拓扑分析](../../../rea-analysis/xueyuan/topology.md)、[源码摘录](../../../rea-analysis/xueyuan/source-excerpts.md)。
- [已核对路由树](../../../rea-analysis/xueyuan/route-inventory-verified.json)、[API 表达式候选](../../../rea-analysis/xueyuan/api-inventory.json)、[REA 原始证据](../../../rea-analysis/xueyuan/rea-evidence.json)。

104 条定义包含容器、默认子路径和重定向，不等于 104 个页面。API 候选不构成完整服务契约；原站证据来自静态分析，不能替代当前线上行为验证。复刻边界见 [ADR 0001](../adr/0001-bundle-as-functional-boundary.md)，功能覆盖与实施切片分离的理由见 [ADR 0002](../adr/0002-separate-coverage-from-implementation-slices.md)。
