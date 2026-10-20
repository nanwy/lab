# S01 账号与会话契约及验收

日期：2026-10-19。范围按实施计划 S01 / F001；后端运行情况与前端复刻验收分别记录。

## 证据与实现

原始证据为 `rea-analysis/xueyuan/artifact/index-DECk1PRe.js`，索引见规划目录 `page-feature-code-map.md`。下述为静态源码观察，没有执行原站 bundle 或访问原站服务。

| 原 bundle 观察                                                                                                              | 本次实现                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Ppi` 与 `opt`：提交 `username`、`password`、`code`，三个字段必填                                                           | TanStack Form + Zod；字段错误、修正、提交中禁用                                              |
| `/api/captcha/?time=...`；点击及登录失败后刷新                                                                              | 沿统一 API 前缀读取图片；点击刷新、失败刷新、图片加载失败重试                                |
| `XKr` POST `/api/front/login/`；`status === 1` 才进入                                                                       | 域适配器验证成功条件；失败不建立已登录 UI                                                    |
| `opt` 保留响应字段消费代码，未确认真实服务端字段错误协议                                                                    | 登录不声明字段错误映射，HTTP `error` 统一由 API 实例 toast 展示                              |
| `p2n` GET `/api/front/user/info/`；用户 ID 判断会话                                                                         | Query 是当前用户唯一缓存；登录后读取用户，刷新恢复、异常重试                                 |
| `ZKr` GET `/api/front/logout/`；`status === 1`                                                                              | 成功后清理 Query 与本地 Token；失败保留会话并可重试                                          |
| localStorage `token` → `Authorization: Token ${encodeURIComponent(token)}`；变更方法读取 Cookie `csrftoken` → `X-CSRFToken` | 统一 requestPolicy 实现；不推测登录响应中的 Token 字段                                       |
| 403 `error` 区分“未登录”“您无权访问”“未激活”                                                                                | 白名单归一化；只有“未登录”清理会话并回登录；完整权限路由行为由 S02 承接                      |
| 挂载调用 `tYr` GET `/api/admin/system/background/`，组件仍使用固定背景                                                      | Query 读取配置，失败可重试；本地真实只读补证后使用 `front_background`，空字符串保留 CSS 背景 |

S01 当前用户归一化投影最初仅包含 `id`；S02 在同一适配器扩展首页 username 与首次进入所需 extend_info。S03 继续扩展个人资料字段，不另建用户存储。缺 ID 或无效 JSON 是契约错误，不用模拟用户兜底。

## 错误提示契约补证（2026-10-20）

对同一 SHA-256 的原 bundle 定向读取：`Ae.interceptors.response.use` 位于 UTF-16 偏移 1806231，HTTP 400 读取 `response.data.error` 并通过 `ue.error` 提示（`未查询到信息` 除外）；HTTP 403 的三个已知权限原因走导航，其余读取 `data.error` 提示。200/201 交给业务层，业务失败可见 `status === 2` 配合 `ue.error(result.message)`（例如偏移 1939045 的环境操作）。登录 `opt.submitLogin` 位于偏移 1845927，调用 `XKr`，失败刷新验证码并保留响应字段供表单消费；这不能证明真实接口返回了 username/password/code 字段错误，模拟样本不作为协议依据。原始摘录见仓库外 `rea-analysis/xueyuan/source-excerpts.md:9`。这是本地静态核对，没有执行原站；本次 REA 会话没有同摘要的保留记录，未重复全量解析。

当前统一客户端明确区分两种协议：HTTP 失败读取 `error`，已声明的业务失败读取 `message`；不在多个 key 之间猜测。缺少有效字符串时使用通用文案。API 实例的 `onError` 直接调用 `toast.error(error.message)` 并标记 `ApiError.handled`，没有单独通知工具或 WeakMap。组件仅对未处理的适配异常、本地校验或额外业务信息直接使用 toast，不重复提示已处理的请求错误。仅本地校验错误交给 Form；服务端字段错误协议未确认，已删除客户端字段映射及按字段错误静默的分支。取消和已交给公共权限分支的 403 不弹 toast。共享 `Toaster` 和 `toast` 都从 `@workspace/ui/components/sonner` 消费，应用不新增 Sonner 依赖。保留当前 rejection 和权限处理语义，不照搬原 bundle 的失败 resolve 或无权访问时清会话行为。

权限处理已收敛到同一个实例 `onError`：未登录清空 Query 缓存与 Token，替换 hash 到 `/login?reason=expired`；未激活到 `/activate`；无权限到 `/forbidden` 并保留会话。查询和命令共用此入口，不再通过 QueryCache 订阅或组件 hook 补跳转。改密后退出显式传入 `allowExpiredSession`，只豁免“未登录”的全局跳转，由原业务流程按已退出收尾并保留 `password-changed` 提示。

普通表单的 `onSubmit` 直接 await 请求，提交事件入口消费 `form.handleSubmit()` 的 rejection；未处理的适配异常在该入口 toast。激活的验证码恢复和改密后退出恢复保留局部 catch，处理后重抛；不再为不存在的服务端字段错误增加 catch。登录页采用下述已确认的内层消费方案。Form 自行恢复 `isSubmitting`；没有新增通用表单组件或提交框架。

登录页简化试行（2026-10-20）例外：用户明确选择在 `onSubmit` 内消费错误，原生提交事件只调用 `form.handleSubmit()`，不再重抛。后续按用户确认删除登录服务端字段错误映射、表单写错分支及相应模拟协议；HTTP 失败统一读取 `error` 并由 API toast 提示，三个字段只保留本地必填校验。保留离页取消和成功导航保护。本页不消费 `isSubmitSuccessful`，接受捕获失败后该内部状态为 true 的取舍；其他表单尚未迁移。移除背景配置重试及会话检查过程文案，保留接口图片。

## 切片交接与差异

- `/login` 成功后到 `/basic/home`；当前落点提供会话与退出。完整首页、导航、激活、全局权限路由归 S02。
- `Ppi` 成功回调中的工具/漏洞启用配置属于 F003 公共壳配置，在 S02 统一加载，避免重复存储。
- 原背景图片未随工程提供；保留左右分区、标题和表单操作，用 CSS 背景，390px 使用单列布局。未宣称像素级一致。
- 用户信息没有本地持久化副本。生产模式沿同源 Cookie / 现有 Token 恢复；未观察到登录响应写 Token 的动作，不发明响应字段或有效期。
- 服务 5xx 显示服务失败；退出失败不报告已退出。明确退出或失效后不重复检查已失效会话。

## 验证

命令：`fnm exec --using 24.14.0 pnpm check`。

- 账号契约：三个 403 原因、未知 403、缺失 ID、请求字段、Token 编码、CSRF、退出非成功响应。
- 客户端：HTTP error／业务 message 提示、权限处理、响应读取、取消和超时回归。
- 开发 Chromium：必填 → 错验证码 → 错密码 → 修正登录 → 刷新恢复 → 失效重登；退出清理。
- 浏览器回归覆盖 503 恢复、退出重试、普通 403 不清 Token；自动化测试与真实接口验收分别记录。
- 桌面与 390×844：登录、错误与按钮可见，无横向溢出、无未处理异常。运行模式测试生成 `test-results/runtime-*/login-desktop.png`、`login-mobile.png`，已目视检查。

未验证：原后端登录/退出、HTTP 认证部署、Cookie Domain/SameSite、跨域凭据、真实验证码算法与会话期限。没有执行真实后端写入。
