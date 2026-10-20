# S06 实施记录

## 01：实验拓扑读取、移动、保存与重开（2026-10-20）

正式入口 `/basic/user/bench/experiment/:id/scene` 使用实验详情唯一的 `topo_id`，通过统一客户端 GET/POST `/front/topo/{topo_id}/draw/?task_type=6`；保存请求为 `{topo: graph}`。实验 ID、画布节点 UUID 与节点业务行 `data.data_id` 分开，移动仅更新画布坐标，不改业务节点配置。原 `/topology` 工程样本入口保留。

X6 适配覆盖 `custom-react-node`、`custom-parent`、`custom-rect`、端口和边。原绝对 `position` 在编辑器转换为相对父级坐标，保存时还原；已存在的 `x/y` 创建格式分别原样写回。保留 size、旋转、parent/children、业务字段、折点、router、connector、样式和未知字段。重复标识/端口或非法字段拒绝读取；未知形状、无效分组/端点进入兼容性报告并原样保留，不静默删除。原图元顺序保留。React Flow 端口采用 loose 模式，使原 X6 磁吸点能用于任一方向。

保存失败保留草稿；成功只推进本次提交快照的基线，请求期间的新拖动仍待保存。离页/实验切换提供放弃确认，刷新使用 beforeunload；读取沿 Query AbortSignal 取消，保存离页取消。编辑期间不自动后台重读覆盖草稿；离页销毁缓存，重开重新请求。HTTP/业务错误复用统一 toast/权限跳转，页面仅显示读取恢复入口与契约错误。

权限以原调用链为界：实验 Ojs 传 `model=topo, task_type=6, id=experiment.topo_id`，没有传 readOnly/shared/topo_edit，也没有已证实的详情权限字段。本票不猜这些字段；编辑器明确的 readOnly/shared 查看参数及读取图的 lock 统一阻止拖动和保存。当前正式入口可复现的只读分支是 lock；锁图 API 保存同样拒绝发请求。运行/释放、设备添加配置、分组操作、标注、模板与导出由后续票承担，本票不将其计作完成。

### 静态证据

以下均为原 bundle Unicode 全局偏移，通过 [有界查询](../evidence-query.md) 读取，未执行原 bundle。

| 位置                                    | 已确认事实                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Ojs 12682300；QOe 8018585；M4a 8007455  | 实验上下文 topo_id、task_type 6 与参数传递                                                                     |
| t9n 6072984；Uha 6073458                | draw GET 与 POST URL；POST 直接 data                                                                           |
| store getTopoData/submitTopo 6843213    | 返回图直接含 cells/lock；custom-rect 读时归为 custom-parent；普通保存以非空响应判成功，无证据支持固定 status=1 |
| r$a tn 7569633                          | graph.toJSON → graph.lock → `{topo: graph}`；只有节点创建追踪才带 last_node，移动不带                          |
| 注册 7553850；Graph 配置 7558500        | custom-react-node 默认80×80、父容器默认尺寸、四方向端口；lock/readOnly 移动控制                                |
| X6 Node getPosition/setPosition 6567271 | 默认绝对画布坐标，relative 显式相减/相加父坐标                                                                 |

### 验证与限制

Node 24.14.0、pnpm 10.32.1，离线 frozen 安装，无依赖更新。TDD 在已确认的 API 适配/图往返与浏览器用户行为边界执行；红灯分别揭示原始设备未适配、边字段被补默认值、无效 children 未报告，以及任意端口无法作为目标。

- 定向 Vitest：`src/api/topology.test.ts`、`src/topology/x6-adapter.test.ts`、`src/topology/topology-page.test.tsx`、`src/api/experiments.test.ts`，14 项通过。
- 专项 Playwright：`s06.spec.ts --config=playwright.focused.config.ts`，5 项通过：端口/边/分组显示，移动失败恢复与保存重开（DOM 坐标核对），锁定查看，保存期间新修改、刷新警告与放弃导航，空图/失败重试/404，实验切换取消及迟到结果隔离。pageerror 自动检查为空；已人工查看端口/分组截图。
- web 类型检查、改动代码文件 ESLint/Prettier 与 diff 空白检查通过。未启动全量检查。

浏览器全部使用关闭 MSW、清空真实代理配置的本地隔离服务与确定性 HTTP 响应；保存后 GET 返回模拟服务持有的图，区别于内存序列化重开。本轮没有请求原站、没有真实写入，未声称当前线上后端联调完成。静态保存成功契约仅到原 store 的 truthy 判据，未发明业务状态码。
