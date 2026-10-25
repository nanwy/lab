# 统一前端规则

本文件适用于 `apps/web`，同时遵守根目录 `AGENTS.md`。

## 技术边界

- 使用当前 React + TypeScript + Vite、TanStack Router hash 路由；本应用没有 Next.js、RSC 或服务端渲染层。
- 接口沿 `src/api/client.ts` → 按业务域划分的接口函数 → TanStack Query 接入；组件不绕过客户端裸写 fetch，不引入 Axios。
- 表单使用 TanStack Form + Zod；表格使用 TanStack Table，样式使用 Tailwind CSS。新增职责重叠的库前先检查现有实现。
- UI 从 `@workspace/ui/components/*` 复用，通用样式合并使用 `@workspace/ui/lib/utils`。业务规则、接口和权限不进入共享 UI 包，应用不保留基础组件副本。
- 新增或修改接口加载态时统一使用 `@workspace/ui/components/loading` 的 `Loading`：模块使用默认居中布局，行内使用 `variant="inline"`，业务提示通过 `label` 传入；表格放在跨列单元格内，`colSpan` 对应实际列数，等待期间不显示空态。占位尺寸通过 `className` 调整，保留组件的状态播报和减少动态效果支持；提交按钮继续使用 `LoadingButton`。不再另写加载段落或自建旋转样式，其他旧页面在修改对应加载态时迁移。
- shadcn/ui 配置及主题以 `packages/ui` 为权威来源；新增组件使用官方 CLI 和该包 `components.json`。调整基础组件时检查旧全局样式是否污染其 `data-slot`。
- Router 和 Query Devtools 仅开发环境启用。配置、API 地址与模拟模式应有明确入口，避免在多个页面重复推断模式。

## 表单格式（新增与修改时必读）

本节是表单写法的唯一规则来源。新增或修改表单前，先读 [LoginPage.tsx](src/auth/LoginPage.tsx) 的 `username` 字段及提交按钮，按该结构实现；已有示例足够时直接复用，无需重新查官网。来源为用户指定的 [shadcn TanStack Form 示例](https://ui.shadcn.com/docs/forms/tanstack-form)。

- `useForm` 来自 `@tanstack/react-form`，通过 `validators: { onSubmit: schema }` 接入 Zod；UI 使用共享包的 `FieldGroup`、`Field`、`FieldLabel`、`FieldError`。分组和说明按需使用 `FieldSet` / `FieldLegend`、`FieldDescription`。
- 每个 `form.Field` 使用 `children={(field) => { … }}`，内部声明 `const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid`。该值同时用于 `Field.data-invalid`、输入控件的 `aria-invalid`，以及 `{isInvalid && <FieldError errors={field.state.meta.errors} />}`；不改成错误数组长度判断或手写错误展示。
- 单输入的 `id`、`name`、标签的 `htmlFor` 都使用 `field.name`；绑定 `value`、`onBlur={field.handleBlur}` 和 `onChange`。多选组每项保留独立 ID。仅当接口已确认字段错误契约时，服务端字段错误使用 `{ message }` 交给同一个 `FieldError` 展示；普通请求错误遵守根 AGENTS 的单次提示规则。
- 原生 `form` 提交时 `preventDefault()` 后调用 `form.handleSubmit()`；提交按钮沿用 `LoadingButton`，通过 `form.Subscribe` 传入 `isSubmitting`。不同结构的业务字段分别写清楚，不在循环中堆叠三元表达式。
- 属性保持示例所需及明确业务所需；不额外添加 `aria-describedby`、错误元素 ID 或已有 `FieldLabel` 时重复的 `aria-label`。`autoComplete` 仅在语义适用时使用：账号 `username`、已有密码 `current-password`、新密码及确认密码 `new-password`；图片验证码不使用 `one-time-code`。
- 业务表单不引用共享包的 RHF `components/form.tsx`，也不手工将它改造成 TanStack 版本。验收包含未提交时不显示错误、首次提交显示错误、修正后重提，以及原有业务提交行为。

## 状态与数据流

- Query 管理服务端数据、缓存、分页、刷新和取消；Form 管理字段与校验；React Flow 管理图节点与边；Zustand 仅管理必要的跨组件客户端交互状态。每项状态只有一个权威来源。
- 路由加载与 Query 协作时复用同一查询定义和缓存，不另造 loader 缓存。保留类型化路径参数、search、hash 深链、错误边界和未保存导航阻止。
- 后端分页的排序、筛选交给后端或模拟服务完成；不能把当前页当全量数据。行身份和跨页选择绑定稳定业务 ID。
- 轮询、增量数据及并发更新需验证排序稳定、按 ID 去重、迟到响应不覆盖新数据；卸载/切换对象时清理请求、定时器和连接。
- 请求沿用 Query 的 AbortSignal，区分取消、超时、HTTP 与业务失败；读取响应体和流式消费也属于错误契约范围。未知副作用操作不得自动重试。

## 拓扑适配

- `src/topology/x6-adapter.ts` 是原始图与编辑器模型的边界。保留未知字段，检查节点、端口和分组引用；无法支持的图元或关系明确报告，禁止静默丢弃。
- 适配变更验证读取 → 编辑 → 序列化 → 重开，覆盖业务 ID、组内坐标、端口、折点、旋转、路由/连接器和自定义样式。
- 内存往返转换不等于持久化保存；模拟 X6 样本不等于真实后端格式兼容。完整分组、旋转、折点、标注和模板交互按业务规格逐项实现与验证。

## 测试与验收

- 测试范围遵守根 `AGENTS.md` 的定向验证规则：只测本次改动及直接影响；仅修改 UI 时运行相关 Playwright 用例，不默认启动整套浏览器测试。MSW 响应应确定、可重置并与真实服务明显区分。
- Vitest 用于必要的客户端契约、适配逻辑及浏览器难以精确覆盖的行为；测试公共输入输出，避免断言私有结构或复刻实现。
- 局部类型检查用 `pnpm --filter @xueyuan/web typecheck`；受影响测试用该包的 `test` 命令传入文件。格式和 lint 使用根级工具并显式列出改动文件。
- UI 验证包含加载、空数据、错误和成功状态；错误提示遵守根 AGENTS 的归属规则，统一 toast 或会话跳转已覆盖时无需追加行内文案；表单包含字段错误及修正提交；图编辑包含挂载、交互和卸载。预期错误日志精确断言，其他运行时异常仍使测试失败。
- 浏览器测试默认验证开发服务；仅在本轮改动涉及生产模式、MSW 或 API 配置时，定向验证受影响模式，不每次重复全部模式。
- 修改环境配置、模拟模式、路由加载、流式消费或错误详情时，逐项验证对应契约；实际缺口和验证结果维护在 `docs/implementation-status.md`，不能用检查命令通过代替规格覆盖。
