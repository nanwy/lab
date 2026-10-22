# 学员端重建

学员端统一前端的 pnpm monorepo。当前实施顺序、依赖和进度统一见[实施计划](docs/planning/page-rebuild-implementation.md)，历史交付与验证结果见[实施记录](docs/implementation-status.md)。

## 环境

- Node.js 24.14.0 LTS（或兼容的 24.x LTS）
- pnpm 10.32.1

使用 Corepack 激活仓库锁定的 pnpm 版本：

```sh
corepack enable
corepack install
pnpm install --frozen-lockfile
```

## 命令

```sh
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
pnpm test:browser:modes
pnpm check
```

`pnpm dev` 启动统一前端，生产构建输出到 `apps/web/dist`。工程决定与完整功能范围见 [`docs/planning`](docs/planning/README.md)。

`pnpm check` 顺序执行类型、lint、格式、Vitest、生产构建和 Chromium 检查。
首次运行浏览器检查需安装上述 Chromium；失败时保存 trace 和截图至忽略的测试产物目录。
`pnpm format` 用于修复格式。自动化测试使用隔离配置，不执行真实业务写入。

正常开发直接使用真实接口。环境变量示例位于 `apps/web/.env.example`，
本机配置位于已忽略的 `apps/web/.env.development.local`。
`VITE_API_BASE_URL` 指定浏览器访问的 API 地址，默认 `/api`；
Vite 通过服务端变量 `LOCAL_API_TARGET` 转发 API、媒体及文本终端 `/ws/dockerssh/`、`/ws/vpcssh/` 到后端，并按需使用 `LOCAL_API_BASIC_AUTH`。文本终端沿原协议使用页面同源 WS/WSS 和浏览器 Cookie，不在 URL 中附加 Token。
所有 `VITE_` 变量都会进入浏览器代码，只配置公开参数，凭据仅保存在服务端变量中。
修改代理配置后重启开发服务。应用认证与 CSRF 见[账号契约](docs/architecture/account-session.md)。

通用组件通过 shadcn 官方 CLI 安装到 `packages/ui`，由 `@workspace/ui` 导出；主题和 `cn` 工具也在该包维护。
应用统一通过 `@workspace/ui/components/*` 引用组件，不在 `apps/web` 保存基础组件副本。
后续安装组件使用 `pnpm dlx shadcn@latest add <名称> --cwd packages/ui`。
根入口进入登录或恢复会话后的首页；工程概览位于 `/#/overview`，样例入口为 `/#/diagnostics/data`。正式业务及真实 X6 兼容范围见实施记录。
