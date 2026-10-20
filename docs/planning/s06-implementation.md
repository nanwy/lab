# S06 实施记录

## 04范围补证：节点模板与视觉导出（2026-10-20）

复用既有有界静态研究 `contracts-02-04.md`，本节保存结论以免依赖临时目录。位置为原bundle的Unicode全局字符偏移；未执行bundle或追加真实写入。

- 当前实验入口为 Ojs（12682300）→QOe（8018585）→M4a（8007455）→r$a（7554565），`model=topo, task_type=6, id=experiment.topo_id`。设备配置 P3a（6875713）支持“保存并设为模板”：节点PATCH成功后POST `/front/node/template/`，发送完整nodeInfo并覆盖当前name/config_info/logo；成功以响应id确认。我的节点GET `/front/node/list/?nopage=0`，拖入仍经新业务节点创建，不复用模板ID作为业务行ID；删除DELETE `/front/node/list/`，body为`{id_list:[资源ID]}`，status=1后刷新资源。
- 画布导出 Pe（7569929）先检查graph cells非空；菜单key1调用SVG、key2调用PNG。两者输入均为实际画布DOM container，`cacheBust:true`，输出下载名“拓扑.svg”“拓扑.png”。它们是视觉产物，不是含设备配置的可恢复文件协议。空图提示“请绘制拓扑图！”，重建的失败反馈不得吞掉错误。
- `getTopoTemplate`（6842295）仅有定义，无当前资源面板调用；残留template拖入分支（r$a）没有面板来源。nPa（69158xx）的完整拓扑save_as窗口经更多菜单case0打开，但N3a（6861798）的实际菜单没有key0，故当前入口不可达。不能因接口或死分支存在补按钮。
- 隐藏file input是向运行节点`node_run/{UUID}/upload_file/`上传文件，不是拓扑导入。`blocking_template`由流量拦截界面使用，内容为name/script/strategy（protocol/src_ip/dst_port），不是分块拓扑。此处不实现完整拓扑/分块模板管理或拓扑文件导入，也不编造PNG/SVG恢复流程；相关流量能力仍归S08。

F036/F042目录、JSON/CSV与代码对照同步上述入口范围，修正F042误写的离线课程包描述；原始路由和源码摘录不变。

### 04交付与验证

功能提交`484eac7`，合并集成后`6be4507`。节点表单使用既有TanStack Form结构增加“保存并设为模板”；PATCH失败不创建模板，模板失败保留表单和已成功PATCH阶段，同一快照重试不重复PATCH。模板成功即结束写入，资源刷新失败只提供读取重试，不重复创建。我的节点删除成功后更新资源缓存并清除待放置资源，不删除已创建画布实例；失败保留资源可显式重试，请求卸载取消，写入不自动重试。复用沿原创建链生成新UUID与新业务行ID，保留未知配置，draw保存后HTTP重开核对。

使用固定`html-to-image@1.11.13`捕获实际画布DOM生成SVG，并由该SVG生成PNG，不新写示意图渲染器。该库无运行依赖或peer；依赖和锁文件同时提交，未升级已有依赖。导出先核对图片可读取性与字体状态，检查内嵌产物仍含外部资源时拒绝下载；资源恢复后可重试，失败保留设计。锁图仍允许无写入的视觉导出，readOnly/shared不显示导出入口；模板写遵守统一编辑权限。

TDD先验证缺少模板保存/删除/导出入口的行为红灯，再逐条完成：

- API资源Vitest 4项通过，覆盖既有资源契约及新增完整模板配置/name映射、资源ID删除与失败判定。
- 专项Playwright新增5项、直接影响旧流程3项共8项通过：模板创建失败重试/复用新ID/HTTP重开、删除失败恢复且不删实例、PNG/SVG实际产物/空图、图片及字体失败恢复、PATCH失败与资源刷新失败/锁权限；旧流程选择设备CRUD、schema配置与拖入失败/锁定。未受影响结果沿用前三票，不重跑全套。
- 下载SVG、PNG实际打开，分别验证绿色图标和红色连线像素均超过100；PNG另经人工目视核对。产物和截图保存在`/tmp/s06-04-final-browser/`，不是恢复设备配置的文件。
- Node24.14.0，offline frozen安装、web类型、8个代码/测试文件ESLint、定向Prettier及diff检查通过。集成目录按同一锁文件离线安装通过，没有构建或根check。全部写入验证仅4175隔离服务（MSW关闭、代理清空、确定性HTTP模拟），未请求原站或真实写入，未重启/刷新5173页面。

固定diff`b4f249b...6be4507`独立双轴审查：Standards无发现，Spec无发现，无需代码修复。实施工作树在干净且提交可由集成分支追溯后清理，集成工作树保留；原工作区、远程均未改动。真实模板写入、删除与当前线上资源/CORS仍未验证；不将隔离模拟当作真实后端联调完成。

## 03：分组、图元与画布交互（2026-10-20）

恢复Meta/Ctrl多选、拖框选择、创建/解除分组、组整体移动和成员相交拖入/拖出。选择集合只取React Flow的node.selected；单对象ID仅用于检查器焦点。分组与成员操作先序列化原X6绝对坐标，再由唯一适配边界转回React Flow父级相对坐标；移除原对业务组成员的extent约束，使成员可以拖出。parent/children同步重建，不更改业务ID或关联边。点击组下沉、普通图元置前，层级随draw保存。

区域、人员、六类防御岗位及文本框来自原静态资源类别，不请求业务节点创建API；人员/岗位名称沿原trim非空规则，区域名称允许空值，文本原位textarea在blur写回data.name。区域/分组及type3文字开放尺寸拖动，设备与人员不开放resize；旋转沿原允许对象范围，但readOnly/shared/lock统一禁用。调整尺寸以中心固定的局部旋转轴计算，旋转手柄、选中轮廓、四向端口同步变化；显式计算旋转后磁吸点并更新React Flow内部测量，连线端点取磁吸点中心。拖框结束用分离轴检测实际旋转矩形，覆盖视觉区域超出未旋转矩形的情况。

纯图元端点连线直接创建图边，不请求业务edge API；线路编辑不要求不存在的业务NIC，只保存normal/orth路由。文本右键仅删除，人员/岗位编辑/删除，组编辑/解除分组；组合菜单、删除、快捷键和手柄均遵守统一编辑权限。原可达Ctrl/Meta+A/C/V已接入；粘贴按次数偏移50，重建画布UUID、端口ID、父子与边引用。业务节点/业务边先创建新服务端对象后使用新data_id，并同步device_id/config_info.node_id，修复原复制复用业务引用缺陷；若中途创建失败，已成功对象显示在草稿中，未成功对象不伪装创建。原没有独立折点编辑器或富文本颜色控件，未添加这些入口。

视图工具提供每次0.2缩放、居中、Ctrl+背景左键平移，查看模式普通拖动平移。锁/解锁为明确的专用draw提交动作，readOnly/shared不能调用；普通save仍拒绝锁图，未增加通用allowLocked绕过参数。锁切换提交当前设计快照及last_node，成功后才推进锁状态与保存基线，失败保留原锁状态和设计。其余图操作沿既有显式“保存拓扑”闭环，保存失败不丢草稿，重开重新GET校对；并发保存快照、离页取消/提示沿01实现。指针监听在pointerup/cancel/lostcapture和卸载清理。

### 03证据、验证与限制

复用既有有界静态研究 `/tmp/xueyuan-s06-notes.50KSb2/contracts-02-04.md` 的03部分，无新原站请求或bundle扫描。原X6位置6567271/6568xxx、分组7571xxx、embedding7558xxx、变换7560xxx、选择与剪贴板7554565–7589031、文本6894743、工具栏6861798；Unicode全局字符偏移，未执行原bundle。

TDD红灯确认文本形状未渲染、尺寸/层级不写回、分组入口缺失、粘贴未创建新业务对象、原全局button样式撑大变换手柄、连线错误连接磁吸点外缘、旋转视觉区域框选漏选、纯图边编辑误要求NIC、锁切换入口缺失。修复后：

- 适配/API定向Vitest 2文件11项通过，原/topology样本组件1项通过；包括默认尺寸/组名只读不补字段，未知字段不丢失，文本/尺寸/角度/层级保存重开及普通锁图保存拒绝。
- 新增7个Playwright行为流程分别通过：多选/框选分组解组与HTTP重开，组移动/成员拖出及相交拖入，文本编辑/尺寸/旋转端口与SVG连线坐标/保存失败恢复，旋转区域框选，人员岗位区域文本与纯图边/编辑/删除/锁权限，业务复制新ID，专用锁切换失败恢复与重开解锁。
- 旧S06直接影响7项通过：设备配置/链路保存重开、磁吸点方向、移动失败保留与锁定、保存期间新修改、占用NIC与组内删除失败保护、拖入失败与锁写入口。未受影响结果复用，未跑全套测试或build/check。
- Node24.14.0离线frozen依赖，无升级；web类型、改动文件ESLint/Prettier与diff空白检查通过。全部浏览器仅4175、MSW关闭、代理清空、确定性HTTP响应，未操作5173真实服务或真实写入。几何截图保存于 `/tmp/xueyuan-s06-notes.50KSb2/03-rotation-text.png`，已目视核对。

本票功能与修复提交 `dfac8ba`、`b5d71fe` 已合入 `integration/s06-topology`。双轴只读复查 `dfac8ba...b5d71fe`，Standards两项、Spec三项发现均关闭，无剩余阻塞；实施工作树清理，集成工作树保留，未覆盖原工作区。S06仍进行中，04未开始。原站在线响应、复制新对象及锁写入的真实后端联调未验证；本轮证据为静态契约与隔离模拟验收，未将其表述为真实后端完成。

### 03双轴审查修复

固定diff `ea67963...dfac8ba`：Standards发现未知透传子图元被组children重建遗漏、文字只在blur写图导致输入期缺少离页保护；Spec发现Meta取消选择后的旧焦点仍可删除、人员/岗位缺少图符、基础元素到无NIC设备的纯图连线被业务校验误挡。五项均在同一实施工作树修复，未启动04：

- children汇合当前编辑器成员与仍以该组为parent的透传图元；明确删除或移出不再加入，公共from→to→from保留未知成员和可渲染父组。
- 文字内容仍按原blur语义写图，输入期间按图元ID登记待提交状态，参与状态提示和beforeunload/导航保护；失焦与卸载清理登记。合法缺省lock继续保持undefined，消除无操作时错误补false导致的初始假dirty。
- 检查器焦点只在当前selection内解析，删除、编辑与解组不能使用已取消选择的旧ID。右键先显式选中目标，组结构转换保留合法选择；Meta取消节点导致React Flow移走DOM焦点时，画布接收后续快捷键，文字输入仍保有原焦点。
- 未找到仓库内原人员/岗位图像，新增明确的语义SVG符号：人员轮廓与岗位防护盾，未冒称原美术资产。资源logo在创建时同时进入data.logo与nodeInfo并随图保留；截图 `/tmp/xueyuan-s06-notes.50KSb2/03-static-symbols.png` 已目视核对。
- 合法连接先检查环路与端点，再对任一基础元素端点走纯图分支；仅两端均业务设备时要求NIC。基础元素连接无NIC设备仍是零业务API的图边。

红灯实际复现children丢失、Meta取消后删除错误、基础边无法创建及data.logo缺失。修复后API/适配2文件12项通过；新增取消选择删除、未失焦文字刷新保护、无NIC纯图连线3项与原图元流程增强的图符往返检查分别通过，直接影响的组操作、设备配置链路CRUD和锁切换3项通过。web类型、6个改动代码/测试文件ESLint、定向Prettier及diff检查通过（SVG显式使用HTML格式解析）；复用其余未变结果，未重跑原7+7全套。仍仅4175隔离模拟服务，未请求原站或真实写入。

## 本地真实只读入口修复（2026-10-20）

用户报告实验详情和平台标识读取失败。在用户现有 Chrome 会话中重试，实验详情与标识接口均返回 HTTP 200；未输出 Cookie、凭据或完整业务响应。根因是详情 `tags_category` 以空字符串表示未分类，及未配置品牌时 `platform_name/front_logo/icon` 被省略，旧契约分别错误要求非空标识和全部品牌字段。仅放宽这两个已观察语义：保留空分类原值，不放宽其他实体 ID；品牌字段可缺省，但存在时仍校验字符串。

API 回归先复现 `tags_category:too_small` 和品牌契约拒绝，再修复；`experiments.test.ts`、`portal.test.ts` 共6项通过，web类型、四个改动代码文件lint/格式及diff检查通过。未修改UI或运行全量测试。使用原本地代理配置恢复5173，在现有会话只读确认详情、拓扑8节点/连线和资源面板均加载成功；未保存、创建、删除或启动真实实验。本轮真实只读不改变此前模拟写入验收的边界。

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

修复提交 `dca12ed` 已合入 `integration/s06-topology`；双轴只读复查 `a606a5f...dca12ed`，Spec 两项与 Standards 一项均关闭，无剩余阻塞。实施工作树清理后保留集成工作树，未合并或覆盖原始脏工作区。

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
