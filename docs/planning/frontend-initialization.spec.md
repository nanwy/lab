# Monorepo与前端工程初始化规格

状态：工程初始化已完成，验收结果见[实施状态](../implementation-status.md)。本文独立承载工程决策；业务功能范围和103条用户故事保留在[功能还原规格](spec.md)。

## Problem Statement

当前只有原站静态分析资料和功能规划，没有Git仓库、可维护的前端子应用或统一开发检查入口。需要先建立可运行、可验证的工程基础，再按功能规格逐阶段还原业务，避免将技术初始化与整个平台功能交付混在一起。

## Solution

创建独立pnpm monorepo，初始化本地Git，建立按账号能力呈现入口的统一前端应用。使用已确认的Vite、TanStack系列、shadcn/ui、Tailwind CSS、fetch和React Flow，交付应用骨架、适配边界、模拟入口和必要检查，不在初始化阶段实现正式业务页面。

## User Stories

1. As a developer, I want to use one workspace and lockfile, so that dependencies and commands remain consistent.
2. As a developer, I want to run and build the unified frontend locally, so that I can begin implementing the platform.
3. As a developer, I want to use type-safe routing and preserve existing hash links, so that restored pages have predictable navigation.
4. As a developer, I want to use shared request, data, table and form boundaries, so that business modules do not duplicate infrastructure.
5. As a developer, I want to render custom React Flow nodes, so that the topology implementation has a verified starting point.
6. As a developer, I want to validate original topology data through an adapter, so that changing the graph library does not silently lose backend data.
7. As a developer, I want to run deterministic checks and a browser smoke test, so that the initial foundation is reviewable.
8. As a project owner, I want to keep specifications in version control without credentials or large reverse-engineering artifacts, so that the repository is useful and safe to share within its intended scope.

## Implementation Decisions

### 仓库与应用边界

- 使用独立仓库，初始化本地Git，仅创建统一前端应用；不同账号的菜单、路由和操作由能力及资源范围驱动，不按学员/教师/管理员拆前端应用。
- 首期仅本机单人运行，业务范围仍按功能还原规格确定；统一工程不意味着自动扩展教师或管理员功能。
- 按实际需求提取公共包，不为了monorepo预设空后端或大量公共包。

### 已确认的前端技术栈

| 职责             | 选型                         | 约束                                                                         |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| 工作区与依赖     | pnpm workspace               | 独立monorepo、根包私有、统一锁文件；仅有实际复用需要时提取公共包             |
| 应用与构建       | React、TypeScript、Vite      | 先创建统一前端骨架；运行时采用支持工具链的Node.js LTS                        |
| 路由             | TanStack Router              | 保留hash深链、类型化参数与查询条件、路由错误和导航阻止                       |
| 接口传输         | 原生fetch及统一客户端封装    | 不引入Axios；认证、错误、取消、响应类型在客户端统一处理                      |
| 服务端状态       | TanStack Query               | 管理缓存、分页数据、刷新、查询取消及请求状态；与路由加载协作，不重复维护缓存 |
| 业务表格         | TanStack Table + shadcn/ui   | 支持列、排序、筛选、多选与后端分页；单页数据不得冒充完整数据进行全量排序     |
| 表单与校验       | TanStack Form + Zod          | 处理表单值、校验、动态/嵌套字段和服务端字段错误；业务约束仍以原后端为准      |
| 组件与样式       | shadcn/ui、Tailwind CSS      | 业务逻辑与呈现分开；本阶段只完成必要样式，后续统一翻新                       |
| 拓扑             | React Flow                   | 与原X6格式建立双向适配，保持功能和持久化语义                                 |
| 客户端交互状态   | Zustand及组件局部状态        | 图编辑器状态来源唯一；不重复存储Query响应、Form字段或React Flow已有内部状态  |
| 主流程与接口模拟 | Playwright、MSW              | 浏览器业务行为为主要测试边界，模拟响应确定且可重置                           |
| 必要补充测试     | Vitest                       | 用于接口契约转换、拓扑数据适配及浏览器难以精准覆盖的必要逻辑                 |
| 静态质量检查     | TypeScript、ESLint、Prettier | 初始化时统一入口并完成检查                                                   |
| 开发调试         | Router及Query对应Devtools    | 仅开发环境启用                                                               |
| 长列表优化       | TanStack Virtual             | 实际出现长列表/日志性能需求时引入，不作为初始化必装依赖                      |

- 暂不引入Turborepo或Nx。当前一个前端应用，使用pnpm工作区命令调度；后续应用/包增多或构建检查显著变慢时再评估任务缓存。
- 暂不额外引入TanStack Store、DB、Pacer等库，不为统一品牌重复已有职责。
- 具体依赖版本在初始化时按实际发布与peer依赖组合验证并锁定，不沿用旧bundle版本，也不盲目跟随文档latest。

### fetch客户端契约

- 参考已有统一ApiClient的封装方式，传输层与按业务域划分的接口函数分开；不照搬参考项目的认证协议，不将全站接口堆入单一大类。
- 原站应用认证使用Token方案，CSRF Cookie和请求头需按原站契约核对。不能照搬参考项目的Bearer、工作区头或CSRF命名。上游HTTP认证与应用认证仍分别处理。
- 使用标准Headers合并调用方请求头；仅在实际发送JSON时设置相应Content-Type。FormData由浏览器生成multipart边界，不强制JSON头。
- 显式处理HTTP失败与已确认的业务失败，将错误归一化为保留状态、消息和必要脱敏字段详情的类型；不能将所有403都视为退出登录。
- 分别支持JSON、空响应、文本、Blob下载及流式读取。用于Query的成功查询不能以undefined表示数据，空结果按接口语义归一化；无响应体的写操作可保持独立返回契约。
- 透传TanStack Query提供的AbortSignal，并支持请求级超时；取消与超时有可区分的错误结果。传输层不叠加盲目重试，Query的自动重试也按业务语义设置，未知副作用操作不得自动重复执行。
- Cookie携带策略按实际同源/代理与CSRF契约设置，不认为credentials配置能自动解决跨域与认证。
- 日志不记录Token、Cookie、密码或原始敏感业务内容；未知后端不应擅自添加要求服务端配合的追踪请求头。
- 上传进度等特殊协议需求在出现时单独评估，不为预设需求引入Axios。

### React Flow与原拓扑格式兼容

- 原前端使用X6是分析事实，新实现采用React Flow是本次确认的设计决策，两者不能混为一谈。
- 原后端仍可能存储X6序列化数据。建立原始图数据与编辑器模型的双向适配，覆盖节点/边ID、设备业务标识、坐标、分组父子关系和组内坐标、端口ID、连线端点、折点、路由/连接器、旋转及自定义样式。
- 对未知字段保留原始信息，避免保存一次就无意删除后端字段；遇到无法支持的图元或关系明确报告，不静默丢弃。
- 分组吸附/脱离、旋转及端口几何、折点编辑、图元标注和模板按原功能要求补齐并验证，不能因React Flow默认不具备某项交互就缩减需求。
- 采用开源React Flow运行时；付费示例不作为本规格的默认依赖。复杂交互通过开源API实现或在获得明确授权后另作决定。
- 在真实拓扑样本尚未提供时，只能先验证确定的模拟样本；生产格式兼容状态明确为待验证，不声称已实现无损迁移。

### 首次工程初始化的交付边界

- 创建独立monorepo并初始化本地Git，仅创建统一前端子应用；预留公共包容纳位置但不制造无使用者的空包，不创建空后端。
- 将已确认规格、功能目录、权限矩阵和路由覆盖资料纳入文档；不默认提交原始主bundle、大型分析产物、凭据或本地缓存。
- 交付可启动的应用骨架、路由与基础布局、环境配置、fetch适配边界、Query/Form/Table等必要接线、基础React Flow挂载验证、模拟接口入口、测试入口及忽略规则。
- 首次初始化不实现登录、实验台等正式业务页面；实际业务按P1后续交付。骨架示例不得被标记为业务完成。
- 验证依赖安装、开发启动、生产构建、类型检查、lint、格式检查及浏览器冒烟测试。浏览器至少确认应用加载、路由渲染及图节点挂载/卸载没有运行错误。
- 本地Git初始化不意味着创建GitHub等远程仓库或推送；未指定远端时不自行创建远程项目。

## Testing Decisions

- 用户已确认浏览器完整业务流程为主测试边界，统一适配层提供确定的模拟响应；少量真实接口契约检查补充兼容性，真实写入限于明确测试账号与对象范围。
- 当前没有已有应用测试可复用。初始化阶段只建立必要边界并验收骨架，不编写尚未实现业务的镜像测试。
- Playwright验证浏览器完整流程，MSW提供确定的模拟接口；Vitest用于必要的契约转换和纯逻辑测试。初始化先运行骨架冒烟检查，不提前为未实现的业务编写镜像实现测试。
- fetch契约测试关注认证/CSRF、HTTP与业务错误、空响应、FormData请求头、取消/超时及实际使用的响应类型，不依赖客户端采用类或函数等内部形式。
- React Flow兼容测试使用含分组、端口、旋转、折点和未知字段的图样本，检查读取→编辑→保存→重开不丢失必要业务信息；几何交互在浏览器验证，数据映射在必要的纯逻辑边界补测。

### 初始化完成标准

1. 依赖安装成功并锁定实际验证的版本；运行时和包管理器要求明确。
2. 开发服务可启动，应用与hash路由可在浏览器加载。
3. React Flow自定义节点可挂载及卸载，没有运行时错误；这不是完整拓扑功能验收。
4. 生产构建、类型、lint和格式检查通过，浏览器冒烟测试通过。
5. 模拟接口可按配置启用且可重置，未知真实写操作不会因初始化自动执行。
6. Git已初始化，忽略规则有效，规格文档纳入工程；不默认创建远程仓库或推送。

## Out of Scope

- 登录、实验台、课程、考试等正式业务页面实现；这些属于功能规格中的后续阶段。
- 多人内网部署、后端子应用、后端数据库或虚拟化调度重建。
- 远程仓库创建或推送，Turborepo/Nx、没有实际复用需要的公共包。
- 默认引入付费React Flow示例、提前处理尚无需求的上传进度或长列表优化。
- 默认提交原始bundle、大型证据、真实凭据、缓存或生成产物。
- 本阶段的视觉翻新及未经测试样本验证就声称原X6格式已无损兼容。

## Further Notes

- 用户确认的目标仓库目录为 `/Users/nanfugongmeiying/Desktop/project/lab/xueyuan-rebuild`，统一前端子应用为 `apps/web`；`packages`按实际复用提取，`docs`承载规格、架构决策和还原进度。已有逆向资料继续保留在目标仓库外。
- 请求客户端参考资料为 `/Users/nanfugongmeiying/Desktop/project/multica/packages/core/api/client.ts`，只借鉴封装方式，不复制Multica业务接口、认证约定或修改该项目。
- 旧报告中React Router、Ant Design、X6和Axios属于原站事实或早期候选；新工程选型以本文技术栈表为准。
- 初始化属于功能规划的P0.1前置工程阶段；不得把骨架示例记作业务功能完成。
- 本文只拆分已确认的工程决定，不新增业务需求。功能范围、权限调查和业务验收见[功能还原规格](spec.md)。
- 当前没有项目issue tracker配置，本文仅为本地规格，未发布issue。
