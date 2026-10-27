# S14 独立态势实施记录

## S14-01 独立深链与蓝军态势（2026-10-26）

范围为 F048 的 R098；[第一票](../../.scratch/s14-situation/issues/01-blue-situation.md)及[原调用链](../../.scratch/s14-situation/analysis.md)定义本次边界。S14-02/03 未实施，整片进度仅维护在[实施计划](page-rebuild-implementation.md)。本票已实施并完成双轴审查及增量复查，不声明真实服务接通。

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

## 第一票最终收口（2026-10-26）

初审固定差异 `fdc4aef...a872eee`：Standards 1 项 P2、Spec 0 项。日志接口 HTTP 200 业务失败原被 literal Schema 误判格式错误，修复提交 `c0a8401` 已仅对日志接入统一客户端业务失败判据，风险/网络 raw 协议保持原样。增量 `a872eee...c0a8401` 两轴复查确认原问题关闭，新增均为 0；完整[审查记录](../../.scratch/s14-situation/review-01.md)。

修复以 `0062f9b` 合入 `integration/s14-situation`，第一票关闭。累计 5 项不同浏览器用例通过（原 4 项复用、增量业务失败单提示 1 项通过），最终 7 项契约、web 类型、定向 lint/格式通过。最终收口仅检查文档和工单一致性，不重复应用测试，不推进 02/03，不推送远端。静态范围完成与真实服务未验证、原媒体外观差异继续分开记录。

## S14-02 防御态势与3D拓扑（2026-10-26）

按[第二票](../../.scratch/s14-situation/issues/02-defensive-situation.md)交付 R099；本票已完成双轴审查及增量复查，03未实施。

### 交付与边界

- 原五段参数保留，拓扑只消费 secne_id、resource_type、scene_type。scene_type=scene 选择 scene，否则 topo；原特殊 POST 的 numeric14 判据不会命中 string 深链，保持 GET draw/?task_type，直接消费顶层 cells，不套 S07 固定6或 status/data 包装。
- Three 真实 WebGL 场景保留原设备 Sprite、data.logo、名称 CanvasTexture、直线、原坐标与顺序 level、透视相机、雾及 wireframe/透明地面。使用 OrbitControls 原旋转、缩放、平移，不补相机按钮、节点详情或编辑。原 composer 未在主动画循环使用，不复制无消费者后处理。
- 五项计数固定0、安全90%、资产分布2/1/2/1/5和训练任务空壳原样保留，不主动读取日志、风险或网络。底部/右侧原收起尺寸及0.5秒过渡保留，底部固定 right400px；右面板按原DOM顺序应在顶卡之上，初始误将文字遮挡归为原行为，已在下节撤销并修正。
- 已出现第二个消费者后，仅抽取现有 Chart/Clock/参数类型供01和02复用，不预建03或通用图形平台。场景查询透传 AbortSignal，换上下文/空图不残留；离页取消帧、断开 resize 和 controls、销毁 renderer/context、geometry/material/texture，迟到贴图加载也释放。
- 原装饰媒体未复制；节点 logo 按响应指定 URL 加载，本次浏览器采用独立 SVG 图标 fixture。WebGL 不可用有明确状态，不以2D假图冒充；真实服务字段/媒体/授权未验证。

### 依赖与验证

固定 three@0.170.0 与对应 @types/three@0.170.0。Three 无 React peer 依赖，直接在 effect 管理实例，不引入 React Three Fiber；对应类型与当前 TypeScript 兼容，类型和浏览器通过。仅新增该运行时与对应类型依赖树，按[Three 官方 OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls)及[资源释放说明](https://threejs.org/manual/en/cleanup.html)使用 controls/dispose，不修改现有依赖版本。冻结锁文件离线安装通过 `/tmp/s14-02-install.log`。

测试边界沿票面：scene/topo 参数、真实3D相机及原面板、静态内容、空图/切页/失败。首项404红灯见 `/tmp/s14-02-red.log`，主链绿见 `/tmp/s14-02-green.log`。3D实际鼠标旋转、滚轮缩放、右键平移通过画面变化验证；空图与离页、迟到响应和失败单提示两项通过 `/tmp/s14-02-interactions.log`（2项、21.1秒）。主链在局部修正原生按钮白底污染后定向1项复测通过 `/tmp/s14-02-initial-final.log`（8.0秒）。累计3项不同本票浏览器用例通过；01共享直接消费者1项通过 `/tmp/s14-02-consumer.log`（4.2秒），未重跑01其他未变分支。

3项公共 API 契约通过 `/tmp/s14-02-contract.log`，确认顶层 cells、string14 GET、原坐标层级及合法空值/错误引用/HTTP失败。web类型 `/tmp/s14-02-types.log`、改动代码定向 ESLint `/tmp/s14-02-lint.log` 通过。初始完整面板截图 `/tmp/s14-02-defense-initial.png` 已目视核对；动态相机截图另见 `/tmp/s14-02-defense.png`。未运行全量 check、构建、无关回归或真实后端。

## S14-02 双轴初审修正（2026-10-26）

Standards 初审0项，Spec 初审1项P2：共享计数卡的z-index=2反转了原防御页DOM中右侧面板晚于卡片的绘制次序，遮住90%与安全状态。先前将其记录为原布局问题的结论不成立，已撤销。仅给防御右侧面板指定高于卡片的局部层级，不改尺寸、排布、固定数据或其他页面。

主链回归在文字实际Range的三处覆盖点检查绘制层级；由于原计数卡不接收指针，检查时暂时恢复其pointer-events以暴露透明于指针的遮挡，再立即恢复原值。原实现返回false红灯 `/tmp/s14-02-review-layer-red.log`，修正后主链1项绿灯 `/tmp/s14-02-review-layer-green.log`，同时复用原拓扑、计数、空日志及面板验收。最终唯一截图 `/tmp/s14-02-defense-layer-final.png` 用于复核安全状态文字完整可读。其余已通过测试结果复用，不重跑整组。修复尚待增量复查，不提前声明审查关闭。

## 第二票最终收口（2026-10-26）

初审固定差异 `8e13032...f9be487`：Standards 0项、Spec 1项P2。局部层级修复 `987eafd` 经固定增量 `8bc9b33...987eafd` 两轴复查确认原问题关闭、新增均为0；详见[审查记录](../../.scratch/s14-situation/review-02.md)。修复已以 `c3b984c` 合入 `integration/s14-situation`，第二票关闭。

复用3项本票浏览器、01共享直接消费者1项、3项契约、web类型及定向lint/格式；层级修复主链1项先红后绿，最终截图 `/tmp/s14-02-defense-layer-final.png` 已目视确认90%及安全状态完整可读。收口只检查文档、工单与进度一致性，不重复应用验证、不启动第三票、不推送远端。真实接口、原媒体可用性及授权仍未实测。

## S14-03 导调态势（2026-10-27）

按[第三票](../../.scratch/s14-situation/issues/03-leading-situation.md)交付R100；本票已实施待双轴审查，S14整片暂不声明完成。

### 交付与原行为

- 原五段深链参数保留。复用既有scene/topo适配器读取顶层cells，资源类型保持字符串；风险与kind1/2日志仅在Number(test_task_id)为真时读取。共4请求，未调用原仅解构而未使用的flow_path，不添加刷新、轮询、WS或入口。
- 原3D场景、logo/标签、坐标/顺序层级、OrbitControls和资源释放复用02，不修改算法，只为当前实际导调消费者增加可读label。任务风险、日志协议及6–9条复制规则复用01，没有新增适配协议或依赖。
- 底部事件日志→kind2、流量日志→kind1、蓝军攻击日志→kind2，保留后者原映射；共用同一执行日志Query，错误处理在请求消费处一次，避免两个面板重复toast。日志时间/消息及title全文、15秒滚动复用原显示内容。
- 原五项0、事件/资产固定2/1/2/1/5环图、90事件统计、901流量统计、训练任务及训练过程与效果空壳保留。左右top40/bottom280，左410→0/opacity0并保留32px触发条，右450→30；底部全宽300→35、5:14:5，均0.5秒。侧栏局部层级在顶卡上方，标题在侧栏上方，保持原DOM覆盖关系，不改原布局设计。
- 原固定尺寸在较低视口会压缩动态风险高度、覆盖部分顶卡；可按原三侧收起查看。完整截图采用1600×1100展示可见范围，不添加响应式重排。原装饰媒体未复制，真实字段/授权/采集结果和媒体仍未实测。

### 验证

首项真实路由404→标题缺失红灯`/tmp/s14-03-red.log`，接入完整页面后主链绿`/tmp/s14-03-green.log`。随后按已确认边界补上下文隔离/空数据/迟到响应及离页、双面板同一日志失败单提示验证，最终3项浏览器通过`/tmp/s14-03-final.log`（15.2秒）。截图`/tmp/s14-03-leading.png`已目视核对。

仅提取已有日志内容及风险环图选项供01/03两个实际消费者复用，01主链直接消费者1项通过`/tmp/s14-03-consumer-blue.log`（3.7秒）；02默认3D label直接消费者1项通过`/tmp/s14-03-consumer-defense.log`（9.7秒）。不重跑前两票其他分支，未改API/3D协议及渲染，复用既有契约与相机操作结果。

web类型`/tmp/s14-03-types.log`、改动代码/测试定向ESLint`/tmp/s14-03-lint.log`及Prettier/链接/diff检查通过；冻结锁文件离线安装`/tmp/s14-03-install.log`通过，无依赖变化。未运行全量check、构建或真实后端。三票当前覆盖R098–R100的原静态边界，但第三票审查及S14最终收口仍未完成。
