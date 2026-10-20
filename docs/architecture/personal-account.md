# 个人资料与密码契约

边界：S03 / F044 的资料、头像、统计和改密。收藏、消息完整管理属于 S04；虚拟资源业务属于操作机相关切片，不以页签占位计作完成。

## 原 bundle 证据

输入为仓库外 `rea-analysis/xueyuan/artifact/index-DECk1PRe.js`，SHA-256 沿用 `c4bde20475eadb9265c4cd737aeb37e994e382e1a42d538b75e75ae6ccc226a5`。下列为 UTF-16 偏移，不与规划索引的 Unicode 字符偏移混用。

- `tgi` @ 2451828：合法 type 为 `info / enshrine / message / resource`，其他类型进入 404；公共头部展示当前用户头像、账号、工号及五项学习统计。
- `Kpi` @ 2440681：用户名只读；姓名、单位、手机、邮箱最大长度分别为 20、32、11、100；岗位多选存于 `extend_info.position`。资料 PATCH 仅发送 `{extend_info,realname,unit,phone,email}`；头像使用 FormData 的 `logo` 字段，同一接口返回当前用户对象。
- `UJr` @ 1847441：改密来自用户菜单弹窗，非 `/personal/password` 路由。字段为 `cipher / password / confirm_password`，非其他未调用 store 中的 `old_password / repeat_password`。三个字段非空、最大长度 100；改密成功后退出并返回登录。
- `g2n` @ 1807722：POST `/api/front/user/password/` 使用 `e.data || {}`，结合弹窗调用得到扁平请求体，不额外包裹 `data`。

## 数据与生命周期

- GET/PATCH `/front/user/info/` 复用 S01 当前用户 Query 缓存；表单只保留编辑值，不另建用户 store。保留未知 `extend_info` 字段，避免保存岗位时丢失其他账号配置。可选资料字段的 null/缺失归一化为空输入。
- GET `/front/exam/ability_appraisa/study_situation/` 解析 `{status:1,data:{login_day,study_length,finished_course,finished_subject_scene,finished_assessment}}`。静态 UI 只证明标量显示，本地接受 string/number，不宣称已验证真实类型。
- 头像不超过 5 MiB，JPG/JPEG/PNG；上传与资料提交相互禁用。头像更新不重置未保存的资料；资料保存成功后重置表单基线。未保存离页复用共享 Dialog 确认。
- Query 使用自身取消信号；保存、头像与改密使用组件取消信号，卸载后的结果不更新会话或跳转。公共布局中的改密弹窗绑定打开路由，切换后关闭并清除打开状态。
- 改密状态 1 才成功，状态 2 为失败。成功后禁用原表单；退出失败时原按钮仅重试退出，不重复改密。首次退出等待由 `isSubmitting` 禁用；重试等待使用 LoadingButton 的 Promise loading。已知未登录 403 视为退出完成，其他权限失败复用全局分支。

## 明确差异与验证边界

- 新增本地确认密码一致校验；原弹窗只校验非空。头像额外校验 MIME，原上传处理只显式检查大小，格式限制来自 input.accept 和提示。未推测邮箱、手机格式或密码强度规则。
- 原改密成功先关闭弹窗再退出；本地保留原弹窗以提供退出失败恢复。使用共享 shadcn 样式，不声称逐像素还原。
- MSW 模拟资料仅保存在当前标签页 sessionStorage，刷新可重开；模拟密码只保留于 handler 内存，整页刷新后恢复初始模拟密码。生产包不启动 MSW。这是模拟服务状态，不是业务用户缓存，也不是后端持久化验证。
- 契约测试见 `apps/web/src/api/profile.test.ts`；生产与关闭 MSW 的浏览器回归见 `tests/modes/s03.spec.ts`、`forms.spec.ts`；MSW 完整往返见 `tests/browser/personal.spec.ts`。不执行原后端写入，不把测试 fixture 当作线上事实。
