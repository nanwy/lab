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
```

`pnpm dev` 启动统一前端，生产构建输出到 `apps/web/dist`。工程决定与完整功能范围见 [`docs/planning`](docs/planning/README.md)。
