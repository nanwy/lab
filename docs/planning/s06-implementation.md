# S06 实施记录

## 02：设备资源、配置与合法网卡链路（2026-10-20）

资源来自三个直接数组接口：`node/last_operat/?search=…&nopage=1`（前十项）、`node/template/?search=…&nopage=1`、`node/list/?nopage=0`。按 classify/device_type 分类折叠，支持200ms搜索、拖放与点选放置、加载/空数据/失败重试。没有添加实验 id/task_type 筛选、固定资源数量或配额。基本元素/岗位由03负责，节点模板保存/删除由04负责。

创建 POST `/front/topo/{topo_id}/node/` 直接发送完整资源（保留未知字段），设置 status0，生成新 UUID 同时写入 device_id/config_info.node_id；成功响应后才在画布添加设备，data_id 为响应业务行 id。React Flow screenToFlowPosition 处理平移/缩放；新设备有四向磁吸点，和业务 NIC 数组索引分别管理。last_node 追踪源资源ID，随 draw 保存，失败保留，成功只清除该提交批次。

节点配置 PATCH 的 URL 使用画布 UUID，body 合并原 nodeInfo、编辑值并强制 config_info.node_id。配置通过 `/front/node/template/define/` 按 engin 驱动，覆盖 object/array、number/integer/string/boolean/enum、read_only/maxLength/info/big/default/required星号；不添加原实现没有的普遍必填验证。数量唯一来源 `schema.properties._config.port_numbers`；engin10禁止数组增删。数组 schema 的 port_type 为 port 时，新行 MAC 沿用原十进制末节+1算法，未将其推广为可靠MAC规范。镜像详情 GET `/front/node/image/list/{images_id}/` 返回单对象 name，显示只读名称；security_groups缺少原选项加载，保留原值；data-url原上传空实现，明确不可用。节点图标按 FormData file/mode=node_template 上传，status1.data.url 写回 logo。网关空字符串按原转换 null。

业务链路禁止环路，允许多重连线，但同一节点 NIC 不能重复占用；0是合法网卡值。创建 POST edge 时，API dst对应画布 source，src对应target；topo_nodea/topo_nodez使用 data_id。线路只支持 normal/orth，编辑时两端网卡只读，不调用原入口未使用的 PATCH edge。保留已有 vertices/router/connector/attrs与未知字段；显示NIC标签。原入口没有独立折点编辑器证据，因此只保留折点，不添加编辑控件。

选中工具栏、双击、右键、Delete/Backspace统一遵守 readOnly/shared/lock；业务节点右键按 UUID GET `/front/topo/{uuid}/`，status1.data才开放菜单，失败可重新右键重试。删除 POST edge_node 使用 node_list/edge_list业务行ID；成功才移除画布对象及关联边（包含未渲染边），同步父 children。组的编辑/删除菜单未在02开放。节点/连线请求期间拦截离页，失败保留表单/画布；表单编辑同样纳入未保存保护。

数组支持逐行删除：ports行i会改变任一已连NIC索引>=i时禁删并解释原因，其余行可删；非ports可删除中间行。表单以稳定行身份保留未知字段，生成配置时按当前行次序重组数组，不将已删除行的字段混入剩余项。蓝军设置独立从图元data.is_blue初始化，节点PATCH成功后写图元data.is_blue=boolean||null，随draw保存，不写入nodeInfo；失败保留开关值。图保存仍由显式“保存拓扑”完成，业务节点/链路请求成功不被冒充为 draw 已保存。真实 schema 响应及线上失败响应样本未获验证，静态已知分支用确定样本验收；未请求原站或执行真实写入。

### 02静态证据与验证

复用已完成的有界研究，不重读原bundle。Unicode偏移：B3a6882945、资源API6077260/6077670、分组6068562/6841573；拖放7579263、节点API6082200、P3a6875713/M3a6865000、保存7575548；数量路径6866363/6870391；镜像单对象6865100/6084146；链路D3a68798xx/Qe7578xxx、删除7570xxx/6081900。权限与原入口裁剪沿01记录，未把残留共享API当可达功能。

TDD红灯：draw漏last_node；资源面板不存在；画布不能创建业务设备；schema默认值只显示不进入PATCH；右键菜单超出视口不可点击；业务节点菜单未先读取状态。修复后对应公共API/浏览器行为均通过。

- Vitest：topology/topology-resources API、x6-adapter、topology-page共4文件13项通过；覆盖资源数组契约、镜像详情、三类ID、NIC0/src-dst反向、删除ID与失败判定、图往返。
- Playwright focused：S06共10项通过，新增资源加载恢复、设备配置失败重试/连线/编辑/删除/HTTP重开、schema及engin10、占用端口与多重边/删除恢复、HTML拖入失败与锁定；右键GET失败及已连接末项保护另作定向回归。服务仅4175、MSW关闭、真实代理清空，pageerror检查为空。
- Node24.14.0离线frozen安装，无依赖变化；web类型及改动文件ESLint/Prettier、diff空白检查通过。未跑根check、全量测试或生产构建。

### 02双轴审查修复

固定diff `59e2982...a606a5f`：Spec提出蓝军设置缺失（可达控件Unicode6879200）与数组仅删末项两项，Standards提出已有损坏配置被默认值吞掉一项。三项均修复：配置形状由API域适配函数在编辑边界按schema规范化一次；已有对象字段非对象、数组非数组或已知对象数组项损坏均返回带字段路径的契约错误，阻止配置表单和PATCH，保留原图；合法缺失仍用schema默认。没有添加原实现不存在的普遍required/minLength/integer业务校验；普通关闭弹窗沿原maskClosable语义。

TDD红灯分别为蓝军switch不存在、没有逐行删除按钮、ports字符串损坏却仍开放配置表单。修复后定向浏览器8项（新5项与直接受影响旧3项）通过，覆盖开关失败保留/关开后draw重开、非ports中间删除、未连中间NIC删除及所有会移动已连索引的行保护、损坏配置无PATCH与合法缺失默认。新增场景通过`s06.spec.ts`导入后实际执行，无独立失配测试文件。API域Vitest3项通过（含结构错误/默认/未知字段不变）；web类型和改动文件lint/格式通过，其余未变结果复用。未启动03/04或真实请求。

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
