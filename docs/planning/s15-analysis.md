# S15 公开课程调用链与拆票依据

日期：2026-10-27。对应 F005、F006、F007、US036–042、R006/R007。本文保存补证与实施边界，用户确认的[4 张本地票](../../.scratch/s15-courses/README.md)已落盘；不代表业务实现，实施状态只维护在[实施计划](page-rebuild-implementation.md)。

## 证据口径与结论

现有静态资料已经足够形成有明确边界的实施票，不需要重新讨论产品范围。真实响应、权限、媒体和环境连通仍未实测；课程导出响应及 confront 缺失接线必须单列缺口，不能把全部子项写成无阻塞的完整契约。

用户已确认：实现与隔离验收、真实联调分别记录；未实测部分不宣称真实闭环通过。该口径不允许以模拟成功、候选接口或猜字段关闭缺失能力。

- 原件：仓库外 `rea-analysis/xueyuan/artifact/index-DECk1PRe.js`，SHA-256 `c4bde20475eadb9265c4cd737aeb37e994e382e1a42d538b75e75ae6ccc226a5`。
- 父 REA Evidence：`ev_eee5b8cdca3dce16a76218bec4abf98a2bfbafed17b9fb7f1eee2ef62c86885d`；摘要：`ev_dcfc810c78d9d1c503df2977502950a0974a12cef3d996a918a7fbda2c8b6127`。复用磁盘证据和原文，未重新运行全量语义图分析；原语义图存在内存限制，不能称完整调用图。
- 下文 `@` 均为从零开始的 **Unicode 字符偏移**，不是行号、byte 或 UTF-16 偏移。查询遵循[有界查询规则](../evidence-query.md)；分片不可执行或手改。
- `python3 scripts/evidence_query.py verify` 已通过。只读取静态代码，没有运行原 bundle、请求真实业务接口或生成后端产物。
- 详细查证记录：[列表、目录与视频](../../.scratch/s15-evidence/video.md)、[测试、实操与环境](../../.scratch/s15-evidence/practice.md)、[资料、评论与笔记](../../.scratch/s15-evidence/support.md)。这些记录是查证索引，不替代原件。

字段消费只能证明原前端怎样使用数据，不证明服务端必填、类型、合法空值或授权。`status===1` 的业务判据与 HTTP 状态分开记录。

## 最小实现边界

用户明确要求：只还原原 bundle 的可达功能和正常行为，修复有依据的实际缺陷，尽量精简实现。下列规则约束后续拆票，详细补证记录不等于新增建设要求。

- S15 只实现公开课当前调用链。直接复用现有请求、笔记编辑和控制台能力；不预建 S16/S17 的通用运行时框架、插件体系或多业务配置层。后续消费者出现时再提取真正相同的代码。
- 保留原接口、参数、交互、触发时机和完成规则；只有实际缺陷才作局部修正。不增加自动续播、暂停/离页上报、操作项目选择器、额外确认、表单限制或新的重试策略。
- 视频分片使用当前页面/章节内的最小缓存即可；原 localStorage 的 AES 是本地编码，不是请求签名协议，不要求为还原它新增持久化层。保留后端消费的日志内容和 MD5 签名，不做离线恢复、后台补报队列或多标签页同步。
- 只修正已确认的错接线、数据串用、迟到响应、资源清理和无效分页。未实测的服务器行为、共享字段差异、原生 HLS 日志链缺失只记限制，不自动升级成重设计任务；原明确拒绝的 0 秒笔记驻点也不因偏好改成新能力。
- 接口缺证时明确保留缺口；不新增猜测接口、兼容字段、后端规则或补全原来不可达的功能。课程环境和课程笔记的专属请求是还原必需的少量接线，不是建设新平台。
- 验收只覆盖本次还原行为与实际缺陷。仅在原链路已有重读时保留重读，不为每个本地更新统一增加请求、状态机或测试矩阵。

## 成熟库与已有能力的选用

用户要求优先使用成熟库，避免重复实现通用能力。以下选型随相应业务票接入，本轮不安装依赖，也不另建基础库或播放器框架。

| 能力                   | 采用方案                                                   | 接入边界                                                                                           |
| ---------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 课程 HLS 视频          | hls.js + 原生 video controls                               | 使用库的加载、分片事件与媒体恢复能力；少量代码衔接原日志、驻点和生命周期，不手写流媒体解析或控制条 |
| MP4 与实验视频         | 原生 video controls                                        | 原来已有直接播放路径，不统一套 HLS 或大型播放器                                                    |
| 日志 MD5               | js-md5                                                     | 保持原签名拼接与输出，使用现成算法；不手写摘要，不为此引入整个加密工具包                           |
| 拖拽弹窗               | 已有共享弹窗与 NiceModal；实际需要拖拽时接 react-draggable | 保留原标题拖动、边界和关闭行为，使用 nodeRef；不自建拖拽引擎，不新增原来没有的缩放功能             |
| 笔记/手册/图片         | 复用现有 Quill、Viewer.js、DOMPurify 和富文本组件          | 接课程协议即可，不再引入另一套编辑器或图片查看器                                                   |
| 表格、表单、请求与弹层 | 现有 TanStack Table/Form/Query、Zod、shadcn 和 NiceModal   | 保留原业务交互，不另写通用表格、校验、缓存和弹层管理器                                             |
| PDF/TXT、Office        | 原 iframe 与现有 Office 入口                               | 无原需求支撑时不引入 PDF.js、react-pdf 或自建文档渲染器                                            |
| 文本/图形控制台        | 已有 xterm、Guacamole 及其业务组件                         | 仅衔接课程环境返回的节点标识，不另造终端协议或图形连接器                                           |

查证日期：2026-10-27。[hls.js 事件](https://hlsjs.video-dev.org/api-docs/hls.js.events)包含 FRAG_LOADED，[实例 API](https://hlsjs.video-dev.org/api-docs/hls.js.hls)提供媒体接入和销毁；与原公开课分片日志接点一致。本轮推荐直接采用该层级，原页面没有需求要求额外引入完整播放器 UI。[Video.js React](https://videojs.org/docs/guides/installation/react)提供完整组件；[Vidstack 官方安装页](https://vidstack.io/docs/player/getting-started/installation/)目前建议新项目迁往 Video.js 10，不再作为本项目新增播放器的优先项。[js-md5](https://github.com/emn178/js-md5)用于原摘要算法，[react-draggable](https://github.com/react-grid-layout/react-draggable)提供拖动句柄、边界和 nodeRef。

版本在实际接入时核对当前 React/TypeScript、peer 约束和稳定版本后锁定；先复用现有依赖，确需新增才加入。成熟库负责通用能力，课程端点、原日志拼串、业务成功判据和进度归属仍需按原证据接线。

## 调查闭合情况

| 问题                           | 本轮结论                                                        | 剩余边界                                        |
| ------------------------------ | --------------------------------------------------------------- | ----------------------------------------------- |
| 哪些页面和功能实际可达         | 已查明列表、详情、目录、视频、测试、实验及配套入口              | 仅针对本版公开课调用树，未运行原站              |
| 是否需要截图笔记和模板导入     | 有定义及挂载，但未见公开课触发入口；不纳入必须交付              | 不推断其它课程入口同样不可达                    |
| 筛选、准入、目录和日志如何工作 | 已查明参数、分支、上报和驻点来源                                | 服务端计算与返回结构未实测                      |
| 自测和实操是否同一套请求       | 章节测试与实验检查点是两套协议                                  | 不能把旧 self_test 包装全部当可达调用           |
| 环境能否直接复用 S07           | 课程必须新增 resource_type=16 环境适配；复用控制台连接消费者    | S07 的 task_type=6 拓扑运行接口不能替代课程协议 |
| 是否受 S09 知识库阻塞          | 当前调用链不依赖知识库阅读；依赖已交付的文件/Office 基础        | 课程资料列表和导出仍要单独适配                  |
| 笔记能否直接使用 S10 归档 API  | 复用编辑、详情、分享、评分等已确认能力，新增课程列表/元数据适配 | user/note 与 my_notes/folders 不同协议          |
| 是否所有分支都有完整契约       | 否：confront 缺回调/上传地址；导出下载地址无法唯一确认          | 两项必须在票中显式保留，不能猜补                |

## 页面与上下文

R004/R005 是容器；R006 `/basic/training/course` → `lgi @2459691`；R007 `/basic/training/course/:id` → `HEi @3598190`，路由定义在 `@13323401–13323561` 附近。没有独立章节子路由。当前仓库课程页仍由 `apps/web/src/router.tsx` 的 `FutureBusinessPage` 占位。

| 标识         | 来源和用途                                                   | 不得混用                   |
| ------------ | ------------------------------------------------------------ | -------------------------- |
| 课程 ID      | 路由 id；详情、目录、日志、课程资料/评论/笔记                | 不是课程环境的 resource_id |
| 章节 ID      | 选中 section.id；视频、测试、实验、笔记驻点                  | 不是 chapter 容器 ID       |
| 操作项目 ID  | operate 列表首项 → taskId → practice.id                      | 不是教学任务 ID 或 topo_id |
| 检查点 ID    | 当前 checkpoint.id；作答、Flag、through 环境 assist.check_id | 不是整节题目 ID            |
| 环境 ID      | 当前检查点 task_type 决定 env 或 topo                        | 不从课程 ID 推断           |
| 运行 ID      | envStatus.run_id；释放、延时、节点状态                       | 不与环境模板 ID 混用       |
| 笔记 ID/驻点 | 笔记 id、section_id、extend.breakpoint_time                  | 不当作服务端最后播放位置   |

后续共享边界有原始证据：公开课程使用 `bF/HEi`；教学任务课程使用 `KTe @5926932` / `wla @5937123`，API 位于 `/center_task/teaching_task/{taskId}/course/{courseId}/`，原路径还存在 `operat` 与公开课 `operate` 的拼写差异；路线课程使用 `xq @5963671` / `Gla @5980075`，`UXr/HXr/VXr @1823209–1823443` 使用 `/guidance_control/train_route_task/{taskId}/task_course/{courseId}/`，taskId 来自 `taskDetailId` 查询参数。

S15 只实现公开课行为及当前需要的请求函数，切换课程/章节时清理旧数据和异步资源。S16/S17 的差异在此留证，后续接入时保持各自端点和归属，不提前设计全部上下文或抽象层；课程域只保留一份实际使用的行为实现。

## 列表、目录和进度

- 列表默认 page=1、size=12；筛选变化回第一页，200ms 防抖。方向并入 tag 后删除 course_direction，数组以重复 query key 编码。等级 difficulty 为数字 1–5，难度 grade 为字符串 1/2/3，不能合并成一个枚举；岗位来自会话 jobList。
- 列表进入调用 `/{id}/brief/` 并读取 is_open；笔记跨页驻点调用 `/{id}/can_enter/`。详情深链直接读取详情和目录，不能把不同入口写成统一的 can_enter 前置调用。
- 目录 mode=1 是平铺小节，进度消费 finish_rate；mode=2 是章下 section，完成状态消费 finish。section.type=1 视频、type=2 实验；点击视频小节还 POST `catalog/{sid}/play/`，是增加播放次数的写操作。
- 视频日志每 40 秒提交，结束时再提交；暂停不触发立即提交，切章/离页原清理也不主动最终上报。上报的是 HLS 已加载分片 relurl→duration，不等于已观看秒数。
- 日志 body 为 video_log、sum_duration、timestamp、token；sum_duration 来自媒体总时长向下取整，timestamp 为毫秒，token 是按原拼接顺序计算的 MD5；缓存编码是 AES，两者不得混淆。
- 已证实的断点来源是笔记驻点：路由 state.section_id/breakpoint_time 或当前页回调。未发现 HEi 读取后端最后播放秒数，不能增加“关闭后自动恢复到最后一秒”的无证据验收要求。
- 原生 HLS 分支仅设置 src，没有与 HLS.js 等价的分片收集及总时长更新链路；跨浏览器日志兼容不能冒充已建立。

## 章节测试、课程实验和环境

完整 URL、body、响应消费及状态分支见[实操报告](../../.scratch/s15-evidence/practice.md)。章节测试前缀为公开课 `section/{sectionId}/test/`；每题保存 `{option: 选项数组}`，整节 finish/reset 独立 POST。题型 1 单选、2 多选、3 判断；done 后禁选并可重新测试，未见客户端“必须全部作答”或重试次数限制。

视频节的“本节实验”经 PEi 弹窗，实验节经 BEi 正文接 h3(resource_type=16)。原两处调用只使用 operate 列表首项，未见项目切换器。检查点使用 `operate/{operateId}/checkpoint/` 系列，不能混用整节 test 或仅在旧包装里出现的 self_test 系列。

h3 映射 experiment/ctf/through/loophole/scene/confront 六种 test_type；这只能证明共享渲染分支存在。through 的 stage_mode 限制前关未完成时进入后关；检查点 mode1/2 为 Flag，mode4 为题目，mode3 的 check 还受 confront 条件约束。单个检查点成功在原前端把当前操作项目 done 置真，不等于后端整课进度完成。

课程环境使用 `/api/front/env/{runs,status,start,stop,delay}/`（stop/delay 带 runId），以及 `/api/front/scene/{runId}/status/?task_type=16`。状态和启动参数包含 resource_type=16、resource_id=practice.id、env_type、env_id、start_type=2、assist.start_new_type=1；through 另带 assist.check_id，confront 另带 assist.confront。原查询 share 来自 practice.shared，启动 share 来自 practice.test_environment.shared，两个来源必须分别记录，不能自行合并。

原环境状态 1/4 可启动、2 启动中、5 释放中、3 展示节点及运行操作；2/5 每 2 秒查询。倒计时结束会真实释放，包括 shared 环境，而手动释放仅非 shared 显示；卸载清本地状态不等于释放远端环境。进入课程或播放视频也可能触发写入，因此本轮没有借“只读补证”进入真实运行页。

## 配套功能的可达边界

| 纳入 S15                    | 证据和实现边界                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 收藏/取消                   | user/collect 与 collect/batch，attribute=1；更新 is_collect                                                                      |
| 评论                        | 读取、创建、回复、删除自己的一级评论；无二级回复删除入口                                                                         |
| 课程资料                    | course resource 列表、目录、直接下载、MP4 弹窗、批量导出；body 是 attachment_ids，不是 S09 resource_ids                          |
| 章节讲义/附件/工具/实验视频 | 按章节字段和 type 显示；讲义 pdf/txt iframe、Office 跳转、其余直接地址；课程资料表 Office 名称没有同样点击接线，不擅自补预览入口 |
| 相关课程                    | recommend 请求和卡片跳转；空数据有真实空态                                                                                       |
| 课程笔记                    | 我的/共享、搜索、新建/改名/删除、正文、分享、Word 导出、评分、驻点；课程列表和新建走 user/note、share/note，不套归档列表地址     |

**校正前轮候选范围**：HEi JSX 只触发 H(1/2/3/5)，未见 H(4) 或 H(6)。截图创建笔记的函数分支和 jEi 模板导入组件虽存在，本版公开课未见可达触发；两者不列为必须实现，不新增按钮。这里不代表已运行验证不可达，也不扩大到其它课程入口。

## 已有能力与实际依赖

| 前置能力                       | 已有交付证据                                                                                            | S15 自己承担                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| S02 请求、会话、路由和生命周期 | 应用壳及统一客户端                                                                                      | 课程路由、错误/空/加载分支和上下文隔离                                     |
| S07 文本/图形控制台            | terminal.ts、desktop.ts 及既有控制台页面；[S07记录](s07-implementation.md)                              | 新增课程 env 协议与节点消费；不复用 task_type=6 拓扑 API，不新增操作机业务 |
| S09-01/04 文件与 Office 基础   | [S09记录](s09-implementation.md)及其目录、下载、Office 验收                                             | 课程目录、attachment_ids 导出及章节媒体接线；不依赖 S09-05 知识库阅读      |
| S10 笔记/富文本/驻点           | [S10记录](s10-implementation.md)；personal-notes.ts、shared-notes.ts、RichContentEditor、NoteBreakpoint | 课程列表/新建/元数据显式适配和运行页驻点；不把 my_notes/folders 当课程协议 |

依赖已在实施计划精确声明；本轮不改变 S09 的阻塞结论，不把 S15 标为业务进行中或完成。

## 原缺陷、协议缺失与验收处理

| 编号 | 已观察的问题                                                      | 后续处理边界                                                                                                 |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| D01  | 固定 logData 跨上下文共享，成功删除整个缓存，可能误删新分片       | 用当前课程/章节内缓存避免串用，成功只清已提交分片；不做持久化、补报队列或服务器去重                          |
| D02  | HLS 匿名监听、恢复定时器、实例和在途请求未完整清理                | 使用既有取消与生命周期边界，不复制旧响应覆盖、重复监听或轮询泄漏                                             |
| D03  | 路由驻点只查顶层目录，无法定位章下小节                            | 按实际目录层级定位对应小节；保留原笔记驻点规则，不增加自动续播或放开 0 秒驻点                                |
| D04  | 关卡手册 envVisible/visible 错域，关闭使用不存在的 envUpdates     | 修复已有手册显示/关闭接线，不需要新业务接口                                                                  |
| D05  | 评论末页删除的回退条件依赖本页没传的 type                         | 定向验证删除最后一项后的有效页，不照搬失效分支                                                               |
| U01  | 课程导出原有 download_url/url/string 兜底，没有版本判别或唯一协议 | S09 导出实测不能替代课程端点证据；取得脱敏响应/独立契约前明确保留契约缺口，不猜 key 或报成功                 |
| U02  | confront check 和上传缺 submitCheck/checkUrl                      | BEi/PEi 未传所需参数；不能把通用 loophole_range/check 候选端点当课程协议，保留明确不可用原因，补全需独立证据 |
| U03  | 原生 HLS 日志链不完整、共享环境 share 来源有差异                  | 保留原分支与差异记录，不新增跨浏览器日志方案，不编造观看日志或合并字段来源                                   |

其它未实测项包括：真实字段类型/缺失/空值、实际课程题型与环境类型、课程权限和下线语义、评分与重试/次数规则、媒体可用性、日志去重与进度计算、延时/自动释放、控制台连通、下载产物。它们不再是泛泛的“待讨论需求”；每项应绑定对应动作的联调证据或明确阻塞。

## 已确认拆票

用户已确认合并为 4 票并写入本地文件：01 课程浏览与配套内容，02 视频学习与课程笔记，03 章节测试，04 课程实验与环境。01 无前置票，02–04 均仅依赖 01，彼此不阻塞。票目、范围、成熟库和缺口归属见[本地票索引](../../.scratch/s15-courses/README.md)，每票单独成文件；不另拆公共层、接库、预重构或收尾测试票。

每票写清原入口、调用和状态分支、本票实际缺陷、必要验收及未实测项即可；沿用原成功后更新/重读行为，不强制额外读回或增加独立设计票。U01/U02 不能被普通模拟通过掩盖；不可达截图/导入不计遗漏。已有跨切片范围和路由归属维持原计划，S18 无须提前实施。

## 复核

本轮验证限于证据完整性、文档格式/相对链接和台账一致性；未改业务代码，不运行应用测试、类型检查、构建或浏览器截图。

结果：原查询副本 verify 通过；同步页面—功能索引后重新 generate --force 并 verify 通过。新增分析及三份明细、修改的 Markdown/JSON 均通过定向 Prettier 检查；F005–F007 的 Markdown/JSON/CSV 数据一致，功能条目总数仍为 49，其余功能目录条目未改；217 个本地文件链接存在，git diff --check 通过。这里没有验证真实服务，U01–U03 保留。

```bash
python3 scripts/evidence_query.py query --route /basic/training/course/:id
python3 scripts/evidence_query.py query --offset 3598190 --context 2100 --max-chars 4500
python3 scripts/evidence_query.py query --offset 1914400 --context 3000 --max-chars 6200
python3 scripts/evidence_query.py query --offset 1823209 --context 800 --max-chars 1800
python3 scripts/evidence_query.py verify
```
