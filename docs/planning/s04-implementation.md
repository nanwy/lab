# S04 实施前判断

## 范围与证据

F004 / US008–009。原 bundle 与 SHA 同 S03 架构文档；以下为 UTF-16 偏移。

- 通知适配函数 @1817492–1817720；`jEe` @1849912、头部 `cti` @1924950 附近、个人页 `qpi` @2439000：列表 `{count,results}`，字段 `id/title/pub_time/is_read`；GET 详情 `/front/user/notice/:id/` 展示 `content` 并触发已读刷新。POST `notice/read/` 无请求体，全部已读；count 接口读取 `{status:1,data:数值}`。分页 `page/size`，筛选 `is_read=1` 已读、`2` 未读，不传表示全部。
- `sti` @1920440–1924750：待办 GET `todo/?nopage=1` 返回全量数组；创建 POST `{content,set_time}` 返回新对象；`todo/batch/` POST `{ids,otype}`，1 删除、2 完成，status 1 成功。原 UI 每次传一个 ID，通过批接口提交，不据此新增跨页批量选择功能。月份/年份日历、当天/当月过滤、删除确认、未完成数量 `{status:1,data:{count}}`。
- `Qpi` @2443760 附近：收藏分页 GET `collect/?page&size&search` 返回 `{count,results}`，记录 `id/attribute/is_status/object_id/extend_info.name`。属性 1/2/3/4 为课程/虚拟科目/实操/应用；仅属性 1 有进入课程调用，下线时提示不可查看。当前页未发现搜索输入或批量取消按钮；不因存在 batch 接口就擅自加操作。
- F004 台账中的“收藏筛选和批量操作”是初步摘要，按实际调用链收窄；课程内部的收藏/取消归课程切片，不复制进公共收藏页。

## 组件与数据取舍

- 新增弹窗用 `@ebay/nice-modal-react` 的 create/show/useModal，组合共享 Dialog、AlertDialog；Provider 位于受保护路由壳，随账号/路由卸载，关闭移除组件以取消请求。不自建弹窗管理器，不顺带重构旧切片弹窗。
- 依赖固定为 1.2.13，官方 peer 为 React/ReactDOM >16.8.0，本项目 React 19 下以浏览器实际挂载验证；以当前 workspace store 完成 frozen-lockfile/offline 校验。库只管理显隐，样式仍由共享组件承担。
- 列表使用 TanStack Table + 共享 Table；服务端分页/筛选，不对当前页伪做全量筛选。三域适配器各自定义协议，Query 单一来源；写入刷新通知列表/计数、待办全量/计数和首页投影，不新增 store。
- 待办表单严格参考 LoginPage 的官方 TanStack Form 写法；共享 Textarea、Input、Field、LoadingButton。已有 Calendar 和年月视图模式复用；不引入另一套日期库。
- 通知详情纯文本展示，不注入 HTML。用例只使用合成数据与隔离代理；没有真实服务写入授权。

## 验证与收口

沿用已确认的 API 适配契约、浏览器用户行为两个测试边界，按纵向行为 red→green。只测 S04 和受影响的首页/个人页消费者，UI 有改动才做对应交互和窄屏检查，不执行全量测试。

按 implement 技能执行 Standards/Spec 双轴审查后提交当前分支。用户已授权相关 S03 前置代码一并提交，保留无关改动；不推送。

## 实现差异与验收说明

- 原通知预览是头部下拉，本地为同风格共享 Dialog；详情以纯文本显示。原收藏为卡片，本地按用户要求使用 TanStack Table + 共享 Table，不声称像素级一致。
- 待办时间使用原生 datetime-local，适配为原协议的空格分隔秒级字符串；月份/年份视图与首页复用同一个 TodoCalendar。创建时仅做内容非空和时间格式校验，不推测后端长度、强度等限制。
- GET 通知详情有已读副作用：仅显式打开或重试触发，不预取/自动重试/重连重取。成功后刷新列表与数量并回第一页；全部已读也回第一页，防止未读末页清空后留下越界页码。全部已读原调用不消费响应体，本地不虚构必填响应字段，只处理 HTTP 失败与明确 status 2。
- MSW 使用合成通知、收藏和标签页内的模拟待办数据；刷新保留已读与待办变更。模拟 handler 排在只读首页 fixtures 前，避免新建后又读回旧 fixture。不意味着真实后端持久化已验证。
- 专项配置默认 mock-disabled；设置 `PLAYWRIGHT_FOCUSED_PROJECT=production` 可只启动生产预览，运行所选测试，不同时启动三套服务。全量模式配置保持可用，本轮未执行全量。
- Standards 审查无可操作发现。Spec 审查发现“未读末页读完后不回第一页”，以失败用例复现后修复并复查关闭。主题截图等待文字颜色过渡结束再采集，避免把过渡帧当作暗色渲染缺陷。

验收命令和数量保存在实施记录；当前完成状态只在页面还原实施计划维护。
