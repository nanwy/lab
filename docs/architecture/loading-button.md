# LoadingButton

`packages/ui/src/components/loading-button.tsx` 是基于共享 Button 与 Spinner 的通用组合组件；参考 Mysterious-Realm-v2 的自动 loading 按钮，未修改官方基础组件。

点击回调返回 Promise 时自动展示 Spinner、设置 `aria-busy` 并禁用按钮，成功或失败后恢复。使用原生 disabled 阻止等待期间的用户点击，不增加额外的 ref 锁或挂载标记。同步回调保持普通点击行为。支持 Button 的样式、尺寸、ref、显式 disabled 等原生按钮属性，默认 `type="button"`。

```tsx
<LoadingButton onClick={() => save()} onError={handleError}>
  保存
</LoadingButton>
```

外部 `loading` 为 true 时同样显示 Spinner 并禁用；与内部未完成的 Promise 取并集，外部 false 不会提前解除尚在执行的自动 loading。显式 disabled 不被 loading 恢复覆盖。异步错误交给 `onError`；未提供时交给浏览器 `reportError`，不将失败当成功或生成无人处理的 `finally` 派生 Promise。不负责取消调用方任务。

表单由 Form 管理提交状态。登录使用 `<LoadingButton type="submit" loading={submitting}>登录</LoadingButton>`，保留原生表单提交与 Zod 校验，点击和 Enter 都由 `form.handleSubmit()` 处理，按钮不另建提交真相源。Spinner 对辅助技术隐藏，按钮由 `aria-busy` 表示状态，保留“登录”的可访问名称。

不提供 `asChild`：loading 按钮始终具有原生 button 的 disabled 与提交语义。
