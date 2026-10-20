# 学员端功能与逻辑还原规格

本文维护已确认的全站业务规格；当前实施顺序和进度见[实施计划](page-rebuild-implementation.md)，历史验证与真实后端联调记录见[实施记录](../implementation-status.md)。
目标issue tracker尚未配置，不能猜测目标项目或创建无关issue。

## Problem Statement

用户希望重建现有网络攻防训练平台的整个学员端，保留真实业务功能和操作逻辑，后续再翻新样式。现有输入只有已部署前端的主JavaScript bundle和静态分析资料，没有可维护的应用源码、完整后端契约或已验证的账号权限表。

仅复刻某个页面或只实现拓扑拖拽，不能满足最终目标。全站包含课程学习、考核、装备、演练、资源、个人工作空间、实验台，以及控制台、AI和态势等独立入口；权限与状态分支会影响每个操作的实际可用性。

用户当前还需要可分阶段交付的完整规格：每阶段可以只还原明确的一部分功能，但必须持续覆盖全站，区分已实现、待联调、阻塞和不适用，避免把单阶段完成误报为整个平台完成。

## Solution

在本机单人运行的环境中重建学员端，通过统一适配层对接原后端。第一个实现单元是 F001“登录与会话”；完成并验收 F001 后，再完成实验台、拓扑编辑、节点配置、保存并重新打开的首条跨功能流程，随后按阶段补齐全站功能。教师端和管理员端只作为发布、分配、配置、评价等上游业务关联，不在本次界面重建范围。

功能还原覆盖页面、表单、校验、状态迁移、接口、权限分支、异步任务、错误处理和持久化结果。应用直接连接真实接口；读取和写入分别验收，写操作在明确测试账号与对象范围后开放。视觉层先满足可用，后续独立翻新。

本次规划以49个功能组和104条原始路由定义为基线。路由定义包含容器、重定向与默认子路径，不能当作104个独立页面；536个已提取的URL表达式只是部分接口候选，尚未形成完整服务契约。后续发现的隐藏功能和动态调用必须增补台账。

## User Stories

### Access and shared navigation

1. As a learner, I want to sign in with the required account fields and verification challenge, so that I can access the platform using my existing account.
2. As a learner, I want to receive actionable validation and authentication errors, so that I can correct failed sign-in attempts.
3. As a learner, I want to open an authorized page directly and refresh it, so that I can resume work through bookmarked links.
4. As a learner, I want to have expired sessions handled explicitly, so that I can reauthenticate without mistaking stale data for current results.
5. As a learner, I want to distinguish inactive-account, forbidden-resource and signed-out states, so that I understand why an action is unavailable.
6. As a learner, I want to see the navigation and platform configuration applicable to my account, so that I can find the features available to me.
7. As a learner, I want to view my homepage recommendations and learning overview, so that I can choose my next activity.
8. As a learner, I want to view notices, inspect details and mark them read, so that I can keep track of relevant updates.
9. As a learner, I want to manage my permitted to-do items and favorites, so that I can organize ongoing work.
10. As a learner, I want to sign out and clear account-specific client state, so that another session does not inherit my information.

### Experiments and topology

11. As a learner, I want to browse current and historical experiments with supported filters, so that I can find the experiment I need.
12. As an authorized experiment editor, I want to create an experiment from the permitted scene and configuration, so that I can prepare a training workspace.
13. As an authorized experiment editor, I want to edit experiment metadata, tags and supported release settings, so that I can keep the experiment configuration accurate.
14. As an authorized experiment editor, I want to delete only experiments I am allowed to delete with the documented effects, so that I can manage obsolete experiments.
15. As a learner, I want to open experiment details and its available subpages, so that I can work within one consistent experiment context.
16. As an authorized topology editor, I want to browse available devices and place nodes on the canvas, so that I can construct a scene.
17. As an authorized topology editor, I want to move nodes and navigate the canvas through zoom and pan, so that I can arrange and inspect the topology.
18. As an authorized topology editor, I want to connect valid device ports and configure links, so that I can express the intended network structure.
19. As an authorized topology editor, I want to inspect and edit supported device and node properties, so that I can configure the scene correctly.
20. As an authorized topology editor, I want to select multiple objects and use supported grouping, resizing and rotation, so that I can manipulate complex scenes efficiently.
21. As an authorized topology editor, I want to use supported annotations, drawing elements and topology templates, so that I can document and reuse scene designs.
22. As an authorized topology editor, I want to use context menus and toolbar actions available for the selected object, so that I can perform the correct operation in context.
23. As an authorized topology editor, I want to save a topology and reopen its nodes, links, positions and configuration, so that I can trust that my work is persisted.
24. As an authorized topology editor, I want to retain unsaved edits when saving fails and receive an unsaved-work warning when appropriate, so that I can recover from interruption.
25. As a read-only experiment viewer, I want to inspect a shared or locked topology without editing actions being incorrectly enabled, so that I can review the scene within my permissions.
26. As an authorized experiment operator, I want to start, stop, release or extend a permitted environment, so that I can manage my training resources.
27. As an authorized experiment operator, I want to see asynchronous environment and node states, errors and refresh results, so that I can tell whether an operation actually succeeded.
28. As an authorized experiment operator, I want to open an authorized device console and reconnect when appropriate, so that I can interact with a running device.
29. As an authorized experiment operator, I want to use supported capture, traffic simulation and mirroring controls, so that I can inspect network behavior in my permitted scene.
30. As a learner, I want to inspect capture records and obtain permitted capture files, so that I can review experiment observations.
31. As a learner, I want to read the experiment overview and scene instructions, so that I understand the training context.
32. As an authorized note editor, I want to read, edit and save experiment notes, so that I can retain my observations.
33. As an authorized note editor, I want to upload supported images and export experiment notes to Word, so that I can produce usable experiment documentation.
34. As an authorized experiment participant, I want to use each available detection category and inspect its actual results, so that I can complete the supported detection workflow.
35. As an authorized experiment participant, I want to follow attack-teaching activities and configure permitted simulated-blue-team resources, so that I can complete the scene-specific training workflow.

### Courses, tasks and learning routes

36. As a learner, I want to search and filter public courses and inspect course details and catalogs, so that I can choose suitable learning material.
37. As a learner, I want to receive accurate course-entry and course-unavailability feedback, so that I do not enter content unavailable to my account.
38. As a learner, I want to watch course videos and resume at the supported playback position, so that I can continue an interrupted lesson.
39. As a learner, I want to have learning progress recorded under the correct course, chapter and task, so that my results are not mixed across contexts.
40. As a learner, I want to complete chapter exercises and use permitted reset and retry actions, so that I can practice according to the course rules.
41. As a learner, I want to use course practical resources, self-tests, checkpoints and flag submissions, so that I can demonstrate the required skills.
42. As a learner, I want to access permitted course attachments, comments, recommendations and favorites, so that I can use the supporting learning resources.
43. As a learner, I want to find and claim tasks when claiming is permitted, so that I can begin assigned or available learning work.
44. As a learner, I want to open teaching-task details and the associated course and topic views, so that I can follow the required curriculum.
45. As a learner, I want to inspect teaching-task progress and results, so that I can understand my completion status.
46. As a learner, I want to browse virtual subjects and enter permitted subject activities, so that I can perform the relevant practical training.
47. As a learner, I want to inspect a learning route and its stages, courses, subjects and equipment activities, so that I understand the intended learning sequence.
48. As a learner, I want to have route-specific learning results attributed to the correct route task, so that my progress reflects the work I actually completed.
49. As a learner, I want to open practical-training tasks and subjects from each supported navigation entry, so that I can reach the same authorized activity consistently.
50. As a learner, I want to submit supported practical answers, manual work and associated files, so that I can complete the training requirements.
51. As a learner, I want to view learning points and rankings with their supported scope and filters, so that I can understand my recorded standing.

### Assessment and practice

52. As an assigned assessment participant, I want to browse assessments and inspect their entry requirements and current state, so that I know which assessment I can take.
53. As an assigned assessment participant, I want to start or resume an eligible assessment, so that I can complete it within the permitted rules.
54. As an assigned assessment participant, I want to answer each supported theoretical, practical and scene-based question type, so that I can complete the full assessment.
55. As an assigned assessment participant, I want to have answers saved and restored according to the original contract, so that I can recover from permitted page refreshes and interruptions.
56. As an assigned assessment participant, I want to see timing, completion and submission requirements accurately, so that I can manage the assessment correctly.
57. As an assigned assessment participant, I want to submit the assessment without accidental duplicate submissions, so that I can reliably finish my attempt.
58. As an assigned assessment participant, I want to use required scene environments, checkpoints, flags and report uploads, so that I can complete practical assessment requirements.
59. As a learner, I want to see results and explanations only when they are available to me, so that I can review outcomes without bypassing publication rules.
60. As a learner, I want to view authorized assessment statistics, ability information and rankings, so that I can understand my performance.
61. As a learner, I want to practice supported question and scene types separately from formal assessments, so that practice does not alter my examination results.

### Equipment and rehearsals

62. As a learner, I want to browse equipment on the supported map and in the equipment list, so that I can locate available training equipment.
63. As an authorized equipment user, I want to inspect equipment details, subjects and training tasks, so that I can prepare the correct equipment activity.
64. As an authorized equipment user, I want to complete equipment videos, self-tests, flags, manual work and logs, so that I can finish the equipment-training workflow.
65. As an authorized equipment user, I want to access supported equipment topology and threat-simulation views, so that I can use the equipment-specific training tools.
66. As an eligible equipment user, I want to view booking calendars, availability and my existing reservations, so that I can choose a valid training slot.
67. As an eligible equipment user, I want to create or cancel permitted reservations with accurate conflict feedback, so that I can manage my bookings reliably.
68. As an eligible equipment user, I want to inspect and manage permitted booking messages, so that I can follow reservation updates.
69. As a learner, I want to browse each supported public rehearsal subject category and its details, so that I can select appropriate rehearsal training.
70. As an assigned rehearsal participant, I want to complete subject activities, videos, exercises, flags and manual submissions, so that I can satisfy rehearsal requirements.
71. As an assigned rehearsal participant, I want to follow applicable emergency flow diagrams and attack-subject routes, so that I can understand the prescribed training progression.
72. As an assigned rehearsal participant, I want to open drill tasks, their subjects and subtasks, so that I can perform my assigned rehearsal work.
73. As an assigned support-task participant, I want to open support tasks and use the actions permitted for my assignment, so that I can fulfill the support workflow.
74. As an assigned task member, I want to use the applicable seat, message, evaluation and outcome features, so that I can collaborate within the task rules.
75. As a learner, I want the rehearsal statistics and ranking routes to reproduce their original placeholder pages, so that the bundle-visible navigation remains complete without inventing unavailable functionality.

### Resources and personal workspace

76. As a learner, I want to browse technique classifications, tactic views and technique details, so that I can learn the relevant techniques.
77. As an authorized learner, I want to use technique-linked environments and exercises where actually available, so that I can practice the supported technique workflow.
78. As a learner, I want to browse tool categories, types and details and obtain permitted resources, so that I can find the right training tools.
79. As a learner, I want to search vulnerability information and inspect available classifications and details, so that I can understand the relevant vulnerabilities.
80. As a learner, I want to browse and read knowledge-library content, so that I can consult reference material.
81. As a learner, I want to use my consolidated task center without losing task-specific state, so that I can navigate all my assigned work.
82. As a learner, I want to view my learning routes and their stage progress, so that I can plan my continuing study.
83. As a learner, I want to inspect learning statistics and knowledge, skill and position profiles, so that I can understand my development needs.
84. As a note owner, I want to create, organize, rename and delete permitted note folders and notes, so that I can maintain my learning records.
85. As a note owner, I want to edit rich-text notes with supported images and export them, so that I can produce reusable learning documentation.
86. As an authorized note participant, I want to share, read or rate notes according to the original visibility rules, so that I can collaborate without exposing private notes incorrectly.
87. As a learner, I want to browse public materials and my personal materials as separate data scopes, so that I can find files without confusing ownership.
88. As an authorized file owner, I want to create folders, upload, rename, delete, share and export supported files, so that I can manage my training materials.
89. As a learner, I want to preview or download authorized files and Office documents, so that I can use materials in supported formats.
90. As an eligible learner, I want to create, inspect, obtain and delete permitted offline course packages, so that I can prepare offline study.
91. As an eligible learner, I want to synchronize supported offline learning records without incorrect progress attribution, so that my online records reflect completed offline work.
92. As a learner, I want to view and update editable profile information and follow the password-change workflow, so that I can maintain my account.

### Independent views and reliability

93. As an authorized AI user, I want to select available assistants and create, reopen, rename or delete my conversations, so that I can organize AI-assisted learning.
94. As an authorized AI user, I want to send messages, receive streaming responses and interrupt generation, so that I can use the assistant interactively.
95. As an authorized console user, I want to use VNC, KVM and full-screen console modes with accurate session state, so that I can operate the assigned training device.
96. As an authorized scene participant, I want to open applicable blue-team, defense or guidance situation views, so that I can inspect the scene from my permitted perspective.
97. As a learner, I want to receive clear loading, empty, validation, network and service-error feedback, so that I know what happened and how to continue.
98. As a learner, I want to switch accounts, tasks and experiments without stale state leaking between them, so that I can trust the displayed context.
99. As a learner, I want to have polling, requests and real-time connections cleaned up when leaving a page, so that obsolete work does not corrupt my current session.
100.  As a local reconstruction user, I want to distinguish simulated actions, real reads and verified real writes, so that I understand which backend behavior has been exercised.
101.  As a project owner, I want to track coverage of every discovered route, operation and permission branch, so that no module is silently dropped during phased delivery.
102.  As a project owner, I want to receive a declared scope and remaining gaps for each delivery, so that I can distinguish a finished phase from a finished platform.
103.  As a project owner, I want to replace the visual design later without reimplementing business logic, so that I can modernize the interface independently.

## Implementation Decisions

### 已确认的范围与交付决策

- 全部学员端是最终范围。每个功能组记录入口、操作、输入校验、状态变化、接口、数据域、账号能力、依赖、证据缺口和验收场景。
- 工程采用统一前端应用，按账号能力、资源范围和状态呈现菜单、路由及操作，不将学员身份固化为单独应用边界。首期业务仍为完整学员端；教师和管理员功能后续另行补充，不因统一应用而自动扩大本规格范围。
- 首阶段在本机单人运行，不进行多人内网部署。原后端维持业务数据与执行能力，本阶段不重建后端或虚拟化调度。
- 样式翻新后置；维持原有正常业务规则，明显缺陷修正并记录原证据、旧行为、新行为、理由与验证结果。
- 不依据压缩变量名、菜单文字或接口中admin前缀发明角色。按会话、任务分配、对象归属、共享、只读、锁定、任务类型、设备能力与业务状态建立权限调查矩阵。
- 所有候选权限初始为未知；组件中存在操作不代表该学员入口实际开放。UI呈现与后端授权分别验证。

### 模块与接口边界

- 应用壳负责导航、hash深链、会话、公共状态和异常入口。账号失效、拒绝访问与未激活必须分别处理。
- 功能域包括实验台/拓扑、环境与节点、课程/训练进度、考核、装备/预约、演练/协作、资源、个人资料/笔记/网盘/离线、文件服务、AI、控制台及态势。
- 页面与业务模块通过原后端适配层交换规范化业务对象。旧URL、参数编码、CSRF、Token、Cookie及响应语义由适配层承接，不能将所有请求硬编码进页面。
- 前端技术选型、请求客户端、拓扑格式适配与工程初始化单独定义在[前端工程初始化规格](frontend-initialization.spec.md)。富文本业务仍以原内容和图片能力兼容为验收要求。
- 原站HTTP认证与应用Token登录是两层认证，不能把前者简单替换为新应用表单。
- 不变更原后端Schema。前端实体契约至少分离用户会话、实验元数据、拓扑设计、运行环境、节点运行状态、任务上下文、学习记录、答案/结果、预约、文件、笔记和消息流；真实字段、枚举与必填规则先补证，禁止猜测为已确认契约。
- 共享组件必须保留任务、课程、章节、路线、科目、资源等上下文标识，避免不同入口复用造成数据串写。
- 控制台、文件下载/预览、AI流与状态轮询作为真实依赖能力交付，不能用静态页占位宣称接通。

### 关键交互与副作用

- 拓扑编辑覆盖适用的设备选择/放置、拖动、端口连线、设备配置、图元/分组、多选、缩放平移、工具栏/右键菜单、保存重开及模板等分支。只读、共享、锁定、运行中条件分别恢复。
- 实验设计和运行状态分开。环境启动、停止、释放、延期、节点配置和控制台连接遵循原状态条件；切换实验清理旧选择、缓存、请求和轮询。
- 笔记读取/保存、图片上传、共享/评分、Word导出分别接通。网盘区分个人、公开、课程及共享数据域，不假定相同操作范围。
- 视频日志、领取任务、答题/交卷、报告、评价与作业属于写入业务，自动化测试与真实接口验收分别记录。学习进度与正式考试结果不得被其他上下文污染。
- 原接口中存在GET删除，禁止仅依据HTTP方法判断只读或批量探测。导出、下载产物生成和已读等也需判断副作用。
- 正常开发直接连接真实接口；不自动发起未授权或副作用未知的写操作，写入验收指定账号、对象和动作范围。
- 凭据只在用户本机使用，不写入仓库、样例、日志或规格。账号权限和当前工具访问策略都必须遵守，不能通过代理、CDP或其他方式绕过被阻止的站点访问。
- 对动态前缀、上传、AI消息、WebSocket及共享调用补充契约，现有静态接口目录不能当作穷尽清单。

### 实施阶段

| 阶段 | 交付范围                                                                  | 验收界限                                 |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------- |
| P0   | 全站范围、功能/路由/权限台账、证据缺口、测试边界                          | 规格可评审；所有已知入口有归属           |
| P0.1 | 前置工程初始化，详见独立规格                                              | 独立工程规格验收通过，不计作业务功能完成 |
| P1   | 登录与应用壳、实验列表管理、拓扑编辑与配置、保存重开                      | 浏览器完成首条闭环；真实联调状态单独声明 |
| P2   | 实验详情其余页、环境/节点生命周期、控制台、流量、检测、攻击教学、模拟蓝军 | 每个适用动作有状态/权限/失败验收         |
| P3   | 课程、视频/进度、教学任务/结果、路线、虚拟/实操科目、自测/作业/积分       | 不同学习上下文分别完成闭环               |
| P4   | 考核/练习/结果、装备/预约、演练/保障/席位/协作及统计                      | 各类型任务、题目和权限条件均有验收       |
| P5   | 资源库、首页配套、个人路线画像、笔记网盘、离线、个人设置与预览            | 文件、进度、个人数据域与产物正确         |
| P6   | AI、态势、剩余独立入口及全站回归                                          | 所有适用功能通过；阻塞项不能算完成       |

阶段结束必须列出已还原、待联调、依赖阻塞、不适用及理由。最终功能验收不因先实现实验台而缩减。视觉翻新是后续独立规格。

## Testing Decisions

用户已确认以下测试边界。

- 主要测试边界是浏览器可见的完整业务流程，通过统一适配层访问真实接口；接口契约检查验证兼容性。真实写入只在明确测试账号及对象范围内执行。
- 原 bundle 静态可见的页面、操作、状态分支和请求调用是业务复刻边界；不新增 bundle 外功能，也不要求通过真实环境追加业务验证。
- 构建、类型检查和必要自动化测试用于保证新工程实现可工作，不将静态推断冒充当前线上后端契约或扩张复刻范围。
- 好测试验证用户行为和外部结果：保存后重开是否一致、无权限是否被正确阻止、失败是否保留编辑、提交是否改变正确对象的状态。不得测试压缩变量名、内部组件层级或复制实现细节。
- 当前已经具备应用源码、单元测试和浏览器测试入口，正式业务按切片增加浏览器流程及必要契约测试，实际覆盖见实施状态，不为每个内部store或组件另造测试边界。
- 在统一适配层验证少量关键契约的参数、认证/CSRF、响应转换和错误含义；不把全量接口探测当测试，也不以GET当无副作用保证。协议专属能力如WS重连或视频进度算法，仅在浏览器主边界不足以准确定位问题时补充必要的协议/纯逻辑测试。
- 测试范围覆盖所有业务域、独立入口、状态清理、错误恢复及账号能力组合；按阶段增量验收并保持此前通过的业务回归。

### 首条流程的验收场景

1. 使用指定的测试账号登录，进入实验列表，创建或打开可编辑测试实验。
2. 添加至少两个测试节点，编辑属性、移动位置并连线；保存后离开并重开，校验节点、边、坐标和已支持配置一致。
3. 以共享只读、锁定等测试状态进入，确认编辑动作按规则不可用；后端拒绝时不得显示成功。
4. 验证保存失败/断网，保留编辑并展示明确错误；恢复后可重新保存。
5. 切换实验、刷新深链、退出再登录，验证上下文与会话状态不串用。

### 后续重点验收

- 课程：不同入口的进度归属、断点恢复、视频日志重复上报及练习/检查点结果。
- 考核：理论/实操/场景题、状态/时段/次数、刷新恢复、交卷与结果发布；未知规则待真实契约确定。
- 环境：异步启动/停止/释放/延期、失败与离页/重连，模拟结果与真实执行分开记录。
- 装备预约：时间冲突、重复操作、取消资格和日历/详情一致性。
- 文件与笔记：数据域、上传/保存/导出/分享、失败恢复以及实际产物可用性。
- AI/控制台/态势：连接/流式输出、取消/过期/重连、权限及离页清理。
- 所有业务至少覆盖正常、无数据、校验错误、拒绝访问、网络/服务失败和重复操作。

## Out of Scope

- 教师端、管理员端及相应后台管理界面的重建。
- 原后端业务、数据库、虚拟机/容器调度、评分与AI模型服务的重新实现。
- 首阶段多人内网部署、多租户改造或替换原身份体系。
- 本规格内的视觉翻新、像素级复刻或新的业务规则设计。
- 未经确认操作原账号的真实业务数据、改变成绩或执行真实环境变更。
- 绕过原站认证、服务端权限或工具访问限制。
- 将静态bundle分析冒称为后端源码恢复、全量权限验证或真实功能已接通。

## Further Notes

- 本规格由已确认对话与本地资料综合形成，不新增需求访谈。
- bundle静态分析已确认主要前端技术和业务入口；REA在语义图阶段因内存限制未完成全覆盖。已保存的源码摘录与独立核对支持局部业务结论，不支持全局执行可达性结论。
- 已确认完整枚举原始104条路由定义；49个功能组是当前覆盖基线。隐藏按钮、任务类型和配置裁剪仍要补证并增补操作条目。
- 真实角色名称、权限字段、计分/进度/次数、状态枚举、下载/预览/WS契约及后端测试范围均是调查事实，不能靠推测定稿。
- 当前已有本地Git仓库，但没有远程仓库或项目issue tracker配置；目标确定前不发布issue。本地完成不等同issue已发布。
- 用户已确认测试与证据边界；工程与已交付切片的正式业务测试已经建立。已验证的原后端只读请求与未获授权的真实写入分开记录，详见实施状态。
