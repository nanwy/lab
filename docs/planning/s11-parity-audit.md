# S11 原bundle对照审计（2026-10-24）

当前结论：本轮6项行为差异及1项过严契约风险均已修复，双轴复查无未决发现。下文保留初审证据和边界；实际改动与验证见文末修正记录，真实ZIP协议与产物仍未取样。

范围：规格基线4e3d684，已提交HEAD b455497，加本轮工作区中的create_time修复、统一Loading及用户明确追加的会话处理。排除无关S08修改。原件以docs/evidence-query.md规定的有界入口核对，verify通过；没有新增业务测试或真实后端操作。后续Loading与会话变更单独评价，不作为S11原始范围扩展。

## Standards

基线：`4e3d684`；审查当前 HEAD `b455497` 加 worktree。只读审查，未执行测试或真实请求，未修改仓库。排除用户已有 S08 修改。读取根 / web / ui AGENTS、GLOSSARY、development-workflow、两票与资料契约记录。

### 可行动问题

### [P2] ZIP 的可选 status 被添加了无本域证据的成功值约束

- 文件：`apps/web/src/api/detection-materials.ts:99–101`，重点第 100 行。
- 实现除了已选定的 `download_url` 唯一来源，还添加了 `status: z.literal(1).optional()`。也就是说 `{download_url: "/valid.zip", status: 200}` 会被整体拒绝，即使客户端已接受 HTTP 结果，地址本身合法。
- 依据：`.scratch/s11-detection/material-contracts.md:7–15` 明确该域没有 schema / HAR / 响应取样，原消费者只尝试地址字段；其他网盘域的 status:number 不可外推。当前资料与工单把该限制记录成“静态支持”并不能补出值 1 的原始证据。
- 根规则要求按字段具体消费位置确认，再确认真实类型；未知业务状态不得从其他域或自造 fixture 推导。本限制属于未证实的额外协议设计，与本次 altertime 故障具有相似风险，但**尚未证明真实 ZIP 响应触发该问题**。
- 建议：在获准真实 ZIP 取样后将实际业务状态协议落实到适配器 / 客户端；补证前不得把 status=1 当已确认成功协议。若此静态分支明确只依据原 `download_url` 消费，应仅以该地址约束实现分支，并将尚不能确认业务成功语义保留为缺口，不能凭未知 status 推断成功或失败。
- 分类：契约证据不足 / 过严校验，非已复现线上 bug。用户已确认的“单一 download_url”窄协议本身不是此次审查发现。

### 未发现需整改的过度设计

- `Loading` 是用户明确要求的共享展示能力，组件只包含 label / block-inline / className，复用既有 Spinner，未携带业务数据或请求逻辑，支持状态播报与减少动画；没有必要删除。
- `file-presentation.tsx` 是网盘已有图标与字节格式函数的原样提取，两个直接消费者均使用；没有借此合并网盘与检测资料协议，无猜测性的泛化框架。
- `CatalogSession` / `MaterialsDirectory` 的分层与 key 重挂载分别承载分类选择、工具详情及目录选择生命周期。当前三层结构有实际状态清理职责，不构成无职责转发层。
- 账号、实验、分类、工具、路径进入 Query key，读取传 AbortSignal；目录重挂载及 `usePageSignal` 取消导出等待；未发现迟到响应串到新工具的明显缺陷。没有新增自动轮询或写入自动重试。
- 已处理 ApiError 不再显示 error.message；重试按钮与摘要态属于恢复 UI。没有发现重复 toast 的新增路径。
- `scripts/s11-preview.mjs` 与专项 Playwright 配置服务于隔离手动验收 / 本地字节下载验证，端口与原 API 分离、关闭 MSW，未接入正式业务请求；规模不大，没有理由判为业务过度设计。五类复用工具 A/B 只是隔离样例，不能当真实业务还原证据。
- router 五类共用实现、单一映射，不复制五套页面；没有添加检测执行、任务状态机、报告、工具管理或镜像启动。

### 待确认，不能当确定缺陷

- `detection-tools.ts:47–69` 对详情所有分支全量校验：例如镜像工具也会校验未被 UI 消费的 carrier_path，附件工具也校验 image_info 的形状。静态材料没有证明所有真实分支都满足这些约束；若出现未消费分支的遗留值，可能整体拒绝工具详情。建议真实只读取样覆盖两种载体，再决定是否采用按 tool_carrier 判别的分支模型。当前没有真实反例，不列为硬违反。
- `DetectionMaterials.context: (string|number)[]` 为三个 query-key 字段的有界传递，不值得只为消除“primitive obsession / data clump”再造公共 Context 类型；日后增加消费者才考虑命名。

### 会话修复单独备注

ProtectedShell 当前用户读取失败跳登录是后续用户明确要求，与 S11 原始页面还原分开。不得将这项行为计为 S11 自行扩大范围。Loading 也属于后续明确追加，不是对原 bundle 的无授权扩展。

## Spec

只读审查范围：4e3d684..b455497，并包含工作树中的真实 create_time 修复与统一 Loading。未修改仓库、未运行测试、未访问真实后端或导出。原 bundle 仅通过 evidence_query 有界查询。

### 可行动差异

1. **P2 ZIP 响应中的 filename 被丢弃，下载统一改名。** `apps/web/src/api/detection-materials.ts:99-104` 将结果缩为 download_url 字符串；`apps/web/src/detection/DetectionMaterials.tsx:106-108` 固定 `download.zip`。原 w2 exportFile @Unicode 12707907附近在同一个 download_url 分支读取 `r.filename || "download.zip"`，故不是被明确排除的 url/直接字符串备用协议。触发：返回 `{download_url,filename:"某工具资料.zip"}`；影响：下载名称不再保留服务器语义，无法从文件名辨认多份资料包。可在已支持的唯一 download_url 协议中显式定义可选 filename，并传到下载动作。真实 filename 类型尚需确认，不能扩成多 key 猜测。

2. **P2 切分类会强制回到基本信息，原页保留当前页签。** `DetectionToolsPage.tsx:59` 的 CatalogSession key 包含 category.type，导致 `:104` tab 初始化为 info。原 d8s @Unicode 12721000-12723400 内 `useState("1")`，h8s 在同一路由参数变化时继续渲染同一 d8s，未以 type 设置 key；列表 getList 依 c 变化，页签 state 保留。触发：在使用手册/相关资料时切另一分类；影响：额外点击页签，跨分类查阅流程不等价。可将页签状态提升到分类 key 之外，同时保留工具/资料请求隔离。资料路径与选中项隔离是已要求行为，不能因此连活动页签一起重置。

3. **P2 工具卡片的可点击范围缩小。** `DetectionToolsPage.tsx:128-147` 外层卡片没有 click，只有名称 Button :132-136 有 click。原 Xjs @Unicode 12709300附近整个卡片 div `onClick:()=>p(g)`；标签和卡片空白也能选工具。触发：点击另一工具的标签/卡片边缘；影响：看起来是卡片的交互区域无响应。应恢复整卡片单一可访问交互区域，避免用嵌套按钮补丁。

4. **P2 视频新增自动播放。** `DetectionMaterials.tsx:384` 有 autoPlay。原 c8s 打开 Sb；Sb @Unicode 3021385 附近仅 `<video src controls>`，没有 autoPlay。触发：点击 MP4 文件名；影响：原页只打开播放器，现在自动播放，可能直接发声。移除 autoPlay；关闭时卸载 video 的资源清理仍应保留。

5. **P3 工具附件名称未沿原 jf 去散列。** `DetectionToolsPage.tsx:247` 直接显示 URL 末段；原 Zjs @Unicode 12711436附近使用 `jf(carrier_path)`，jf @1800433 按 `_` 末段去除及点分段规则显示。触发：附件名形如 `tool_abcd.zip`；影响：原页显示 tool.zip，新页显示 tool_abcd.zip。已存在 detectionDownloadName 的同源算法可复用，注意这里是显示文本不是修改 href。

6. **P3 ZIP 成功分支缺少原“下载开始”反馈。** `DetectionMaterials.tsx:106-112` 点击锚点后没有提示。原 w2 exportFile @12707907附近明确 `ue.success("下载开始")`。触发：ZIP 返回有效 download_url；影响：生成完成与浏览器开始下载之间缺少状态反馈，按钮复原后用户可能再次提交。应只提示“下载开始”，不能声称真实产物下载成功。

### 覆盖摘要

- 五分类、type 1-5、实验归属深链；列表只传 tool_type；详情按工具 id；非空首项；工具 tags、描述、附件/镜像、账号、只读手册：实现存在。
- 资料独立 tools/{id}/materials/，id,parent_path；目录双击、上级、根、末三级面包屑；文件类型、Office 普通文本、mp4 播放、attached 来源下载及 jf 单文件命名；选择、ZIP body material_ids：实现存在。
- 名称/时间默认先降序，大小先升序，随后反序与取消；当前 TanStack 显式 sortDescFirst 配置匹配原列意图。原时间按 altertime 排序但真实无该字段，改 create_time 是用户明确授权修正，不列未还原。
- 同工具页签切换销毁资料，清选择/目录；切工具保留活动页签而资料根重置：两者均存在。新组件路径 key/工具 key 和取消信号属于明确要求的旧响应隔离，不应称过度设计。
- 未扩展检测执行、结果、轮询、创建/删除/重命名、开放/回收、other 占位：这些未在原可见入口中提供，本次范围排除合理。

### 额外行为与边界

- 刷新资料是原可见页没有的新按钮（DetectionMaterials.tsx:258-267），属于恢复/重新读取便捷入口，低成本，不是新增业务系统。Loading 与错误/403/重试/账号隔离来自明确要求，不是过度设计。
- ZIP 仅支持 download_url、拒绝 url/直接字符串/无地址对象，是已确认的有意窄协议，仍意味着不能声称所有原 exportFile 响应分支还原。status 仅接受 1 也是静态限制，原消费没有该判断；真实 ZIP 响应/状态仍未取样，不能据此确认真实可用。
- 前端解析严格于原JS直接消费；工具 image_info.name、资料 path/size/create_time 等仍需基于实际空值核对，不能把静态可能性当已证实故障。
- 新布局没有原资料表 scroll.y=400 与原卡片分类背景图，属于展示差异；本轮重点行为，不将视觉未还原写成业务缺失。
- 未验证真实ZIP唯一契约、真实文件/ZIP字节、全部五类详情与手册格式。既有模拟测试通过不证明这些真实分支完备。

## 收口判断

- Standards：1项P2（本域无依据的status=1约束），尚未证明真实服务触发。
- Spec：4项P2（ZIP命名、跨分类页签、卡片点击范围、视频自动播放），2项P3（附件显示命名、下载开始反馈）。均可由原消费与当前代码直接对照，不以真实接口已触发为前提。
- 有意差异：create_time统一展示/排序为用户确认的真实契约修正；download_url单一静态支持为已确认的窄协议，不代表全部原分支兼容。
- 未验证：真实ZIP响应与产物、全部五类数据及各载体的空值类型。示例和既有定向测试不能填补这些证据缺口。
- 建议整改以现有模块小改为主，无需建立新的通用框架。先处理ZIP契约/命名及可见交互差异，再按受影响路径定向验证。

## 对照修正与复查（2026-10-24）

7项全部关闭：ZIP不再校验原消费者未读取的status，按原download_url分支返回地址和可选filename（缺名沿download.zip）；前端以该名字下载并提示“下载开始”。整卡片改为单一原生按钮，标签/空白和键盘均可选择。视频只打开播放器，由用户启动。工具附件文字沿jf命名算法，href不变。

跨类别保留页签还需处理外壳NiceModal.Provider按完整路径重挂载页面的问题：仅将同一实验检测范围的tab状态置于该Provider之外；保留弹窗销毁、账号/实验/离页重置及分类/工具/目录请求隔离。没有持久化store或扩大通用框架。原Loading、create_time修正、错误恢复和隔离预览继续保留。

各行为均先取得有效红灯再转绿。S11两文件14项浏览器通过；页签实现精简后，跨分类/账号2项复测通过；直接外壳2项通过。资料API9项通过，按用户显式implement技能末尾执行完整单测一次，39文件174项通过。web类型与显式文件lint/格式通过。独立审查快照bd8b955...fdb388e覆盖本轮增量，Standards/Spec均无发现；新报告见[S11整改复查](s11-remediation-review.md)。未执行真实ZIP生成或下载、全站浏览器、生产构建或根check。
