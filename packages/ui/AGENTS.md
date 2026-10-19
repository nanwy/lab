# 共享 UI 组件

同时遵守根目录 `AGENTS.md`。本包承载 shadcn 官方 registry 的通用组件、hooks、主题和工具；业务请求、权限与业务规则由应用维护。

- 应用通过 `@workspace/ui/components/*`、`@workspace/ui/hooks/*`、`@workspace/ui/lib/*` 和 `@workspace/ui/globals.css` 消费，保持一个组件来源。
- 使用本包 `components.json` 更新组件。官方源码可按项目必要性修正类型、无障碍或兼容问题，记录与官方的差异；不以手写近似实现替代官方组件。
- `form` 是官方兼容组件，依赖 react-hook-form；应用业务表单仍按 `apps/web/AGENTS.md` 使用 TanStack Form + Zod。安装完整 registry 不代表切换应用状态方案。
- 修改默认行为或样式前搜索消费者；验证共享包类型检查和至少一个真实消费者。主题 token 与 Tailwind 扫描入口统一维护在 `src/styles/globals.css`。
- 本包组件安装与源码类型检查通过，不代表每个复杂组件的业务组合都已完成浏览器验收。应用使用时补充对应交互验证。
