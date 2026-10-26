# S14 独立态势实施记录

## S14-01 独立深链与蓝军态势（2026-10-26）

范围为 F048 的 R098；[第一票](../../.scratch/s14-situation/issues/01-blue-situation.md)及[原调用链](../../.scratch/s14-situation/analysis.md)定义本次边界。S14-02/03 未实施，整片进度仅维护在[实施计划](page-rebuild-implementation.md)。本票已实施，尚待双轴审查，不声明真实服务接通。

### 交付与原行为

- 原五段参数拼写保持，任务请求只使用 test_task_id，保留 Number(task) 的原读取门控；没有把 resource_id、场景标识或 S13 蓝军实例 ID 混作任务 ID，也没有增加实验菜单入口。
- 读取原任务级 rick_statistics、kind1/2 control/log 和 flow_path。风险与网络均消费顶层原响应，只有日志使用 status/data 包装；风险值、日志纯展示字段及关系空值按静态消费处理，未把未消费的 status、spend_time 等加入必填 Schema。适配器记录为静态推断，未实测真实类型或空值。
- 复用 S13 已有 networkGraph 的纯关系转换，不修改 S13 请求/轮询。原 IP、网段交换机、跨网段路由器和无向边去重决定网络与四项计数；局域网数量与交换机数量同源。
- 使用 ECharts force 网络、原 repulsion=1000、图形拖放/缩放/平移和底部标签，以及风险环图、tooltip、右侧滚动图例；底部执行/攻击/风险三块面板初始展开，收起/展开仍为 0.5 秒。日志仅展示时间、消息及全文 title；6–9 条复制一份，复制后超过 5 条时 15 秒滚动。每秒时钟独立更新，没有业务刷新、轮询或 WS。

### 局部修复与差异

- 原 IP 点击缺少回调会抛错：独立页面不注册无消费者的点击回调，保持安全无动作，不增加详情弹窗或请求。
- 原空关系不更新旧图、共享 store 残留：页面及 Query 按完整路由上下文隔离，合法空网络清图，换对象/离页取消旧读取，拒绝旧响应串写；无全局业务 store 或新状态框架。
- 原图表无完整 dispose：图表卸载销毁 ECharts 实例并断开 ResizeObserver，每秒时钟清 interval；沿统一客户端处理失败及会话，不重复提示。
- 原独立大屏静态背景/装饰图片未复制，网络图标沿用当前 S13 网络图的主机/交换机/路由器 SVG 形状，保留功能语义与标签；这是外观差异，原静态媒体实际可用性未验证。原网络可能被底部面板遮挡，使用原收起操作查看，不另改布局设计。

### 依赖与验证边界

固定新增 echarts@5.6.0，以恢复原力导向布局和风险图例/tooltip，不手写近似图表。仅导入 graph、pie、legend、tooltip 和 SVG renderer，按[官方按需导入方式](https://echarts.apache.org/handbook/en/basics/import/)接入，路由懒加载。该版本没有 React peer 约束，依赖 tslib@2.3.0、zrender@5.6.1；现有 React/TypeScript 项目类型及运行检查通过，锁文件只追加这三个包。冻结锁文件离线安装通过，日志 `/tmp/s14-01-install.log`。

测试边界复用用户确认的票面：独立深链与任务数据、原图形/面板/日志交互，以及空图、缺回调、上下文与离页清理。API 公共函数仅验证原 raw 响应及必要空值/错误类型和日志复制边界。

首轮测试拦截正则误拦本地 API 源码模块，属于测试设置错误；修正后取消路由注册复核真实 404 红灯，再接回完整页面绿灯，分别见 `/tmp/s14-01-route-red.log`、`/tmp/s14-01-interactions.log`。图形测试使用浏览器时钟推进力导模拟，通过真实鼠标操作，不读取图表内部实例；高亮会重排 SVG 图元，测试保留同一 DOM 图元身份，未为测试改产品布局。

### 验证结果

- 本票 4 项浏览器通过（15.0 秒）：任务深链/原展示、实际拖放缩放/tooltip/图例翻页、空图/迟到响应/无业务轮询、失败单提示；日志 `/tmp/s14-01-browser-final.log`。
- 6 项公共 API 契约通过，日志 `/tmp/s14-01-contract.log`。web 类型 `/tmp/s14-01-types-final.log`、改动代码/测试定向 ESLint `/tmp/s14-01-lint-final.log` 通过；改动文件 Prettier、文档链接/结构化台账与 diff 检查通过。
- 专项服务保留开发构建与关闭 MSW 的隔离 API，仅使用 Vite test 模式按现有 App 条件关闭会遮挡右下图例箭头的开发工具；没有为测试改业务布局。早期箭头点击超时为 Devtools 覆盖与 SVG clipPath 定位问题，修正测试环境/定位后通过，不计产品功能缺陷。

不运行全量 check、构建或真实后端请求。截图 `/tmp/s14-01-blue-situation-final.png` 展示完整展开面板，等待字体就绪及两帧后重截的第一项复测通过（`/tmp/s14-01-screenshot-final.log`），标题、四项计数及底部面板已目视核对。真实服务字段、授权、采集数据与原媒体仍未验证。

## S14-01 双轴初审修正（2026-10-26）

初审 Spec 无发现，Standards 发现一项 P2：日志 HTTP 200 返回 status=0 及业务 message 时，原适配器仅以 status=1 Schema 校验，误报响应格式错误并丢失业务消息。现仅在日志请求接入统一客户端的 isBusinessFailure，按原 status=1 成功判据处理业务失败；风险/网络继续消费原顶层响应，不套用日志判据，不增加错误框架。

公共 API 先验证业务错误类型、原 message、HTTP 200 及 handled 状态，红灯见 `/tmp/s14-01-review-red.log`。修复后 7 项本票契约通过（含原 HTTP 503/error 消息保留），见 `/tmp/s14-01-review-green.log`。新增日志业务失败的定向浏览器 1 项通过（1.8 秒，`/tmp/s14-01-review-browser.log`），确认原消息仅提示一次、日志失败面板明确，其余网络/日志仍成功展示。

web 类型 `/tmp/s14-01-review-types.log`、三个改动代码/测试文件 ESLint `/tmp/s14-01-review-lint.log` 及定向格式/diff 检查通过。复用原四项浏览器结果，不重跑全组、构建、全量 check 或真实后端。本修正尚待增量复查，不提前声明审查关闭。
