# 学员端重建

学员端统一前端的 pnpm monorepo。当前阶段只建立工程骨架，不代表登录、实验台或其他业务功能已经完成。

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

`pnpm check` 顺序执行类型、lint、格式、Vitest、生产构建和真实 Chromium
冒烟检查。首次运行浏览器检查需安装上述 Chromium；Playwright 使用独立的本地开发服务和确定性
MSW 响应，各测试在独立浏览器上下文中执行，不访问真实业务接口。测试捕获未处理异常与
console.error，失败时保存 trace 和截图至忽略的测试产物目录。`pnpm format` 用于修复格式。

环境变量示例位于 `apps/web/.env.example`，本地覆盖写入该目录的 `.env.local`。
`VITE_API_BASE_URL` 指定统一客户端地址；`VITE_ENABLE_MSW` 只接受 `true` 或 `false`，开发默认启用，生产始终禁用。
所有 `VITE_` 变量会进入浏览器代码，只配置公开参数，不放凭据。认证与 CSRF 仍等待原服务契约确认。
`pnpm test:browser:modes` 分别启动生产预览和关闭模拟的开发服务，验证样例不发送真实请求。

通用组件通过 shadcn 官方 CLI 安装到 `packages/ui`，由 `@workspace/ui` 导出；主题和 `cn` 工具也在该包维护。
应用统一通过 `@workspace/ui/components/*` 引用组件，不在 `apps/web` 保存基础组件副本。
后续安装组件使用 `pnpm dlx shadcn@latest add <名称> --cwd packages/ui`。
当前样例入口为 `/#/diagnostics/data`；正式业务及真实 X6 兼容范围见实施记录。
