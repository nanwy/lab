# S10 共享内容与实验域静态契约

日期：2026-10-24。全部偏移为原 bundle 的 Unicode 字符位置，经 `scripts/evidence_query.py query` 有界查询；原件是事实源。本文是调查摘要，不是后端实测或实施结果。

## 可复现入口

- `query --offset 3538482 --context 6500 --max-chars 14000`：Ys 编辑器、图片上传及其前后代码。
- `query --text 'rpt=' --context 900 --limit 1`：保存前图片检查 @1804959。
- `query --text 'GQr=' --context 1100 --limit 1`：实验笔记封装 @1818284。
- `query --offset 12696999 --context 2200 --max-chars 6500`：$js store、Fjs 场景笔记及 Ujs 入口。
- `query --offset 12698055 --context 3400 --max-chars 8500`：Ujs 场景说明完整编辑分支。

## Ys 编辑器

原实现为 React Quill / Quill；输入输出为 HTML 字符串，不能用 Markdown 或自有 JSON 替代后端正文。输入先替换 `&para` 为 `&amp;para` 再经过 filterXSS。还原需核对实际历史 HTML 的样式、图片尺寸和格式往返，不照搬可能丢样式的净化行为而不做验证。

工具栏：1/2/3 级标题及正文；粗体、斜体、下划线、删除线；引用、代码块；ordered/bullet/check 列表；缩进；上下标；图片；RTL；文字色/背景色；对齐；清格式。还有图片 blotFormatter、图片预览和可编辑态全屏；只读使用 bubble，编辑使用 snow。原没有表格、附件上传、协同编辑、自动保存或版本历史入口，不据常见编辑器能力新增范围。

选择文件 `accept=image/*`；drop 取第一个文件；粘贴 base64 图片先转 File 上传，不把 base64 当持久化正文。上传 FormData：`image`、调用者指定的 `mode`，仅调用者存在 uuid 时加 `uuid`。POST 指定 URL，30 分钟超时，显式 X-CSRFToken。原走 ul 而非带 Ae Token 拦截器的实例；项目实施需在统一客户端的显式认证策略内复现，不照常规业务请求默认加 Token。原读取 Axios 响应 `response.data.data.url`，即响应体唯一来源 `data.url`；不能误把传输层与业务层 data 再包一次。服务端大小和 MIME 限制未实测，不发明限制。

成功在当前选区插入图片，无选区原插到 0；异步完成后的对象/会话/编辑会话归属必须校验，不能把旧上传插到新对象。卸载清理 drop/click/fullscreen/clipboard 和插件资源。原静态代码不能证明上传进度或取消 UI 存在，不把 S09 网盘的整套上传交互强制加入本票。

原粘贴检查使用 host 字符串包含判断；保存前 rpt 用 HTML 正则搜图片，其中包含 http/https/file 且整个 HTML 不包含当前 host 时拒绝。该实现可能被正文的 host 文本绕过。对于原调用 rpt 的操作，实施应按图片 URL 的明确来源校验并记录此缺陷修正；个人笔记普通正文保存原不调用 rpt，不因复用而额外新增这项业务限制。安全净化不能使原合法内容静默丢失。若真实图片服务返回外部源，先确认证据与允许来源，不能为通过检查而随意放行。

## F039 场景笔记

- GET `/api/admin/simulation/experiment/{experimentId}/user/note/`；原直接消费响应体 `id` 和 `content`。仅有 id 时更新本地 noteId/editorState；无 id 的实际空值协议仍未实测，不能把任意坏响应当空笔记。
- POST 同路径，body `{content: HTML}`；原 status=1 成功、status=2 业务失败。原保存成功不重取 noteId；新建后导出可能使用空 ID，实施应重读确认持久化及有效 noteId，再允许导出。
- POST `/api/admin/simulation/experiment/{experimentId}/user/note/{noteId}/export/`；无 body；原 status=1 后取响应体 `data.file_path`，并沿 jf 命名下载。
- 图片 POST `/api/front/upload_image/`，`mode=scene`，此消费者不传 uuid。
- Fjs 固定 `readOnly=false`，未发现可据此新增前端角色或实验运行状态门控的条件；真实所有权与拒绝由后端验证及统一错误处理。
- 实验 ID 改变时重新加载，卸载清空正文、noteId 和 loading。不得因后台刷新覆盖未保存内容，失败保留当前草稿，旧请求不得覆盖新对象。

## 实验说明

Ujs 展示 experiment.overview；编辑入口把已保存 overview 写入 editorData；取消退出并清空草稿；确定经 rpt 检查后调用 experimentEdit `{id: experiment.id, data: {overview: HTML}}`，成功退出并重取实验。图片同样 `mode=scene`，不传 uuid；没有独立 Word 导出入口。

原封装 D2n 为 PATCH `/api/front/simulation/experiment/{id}/?more=1`。现有实验适配器已覆盖此路径，但 saveExperiment 输入类型不接受 overview，需增加明确的说明编辑业务入口或收窄类型扩展，不能塞入名称/描述/标签等无关字段，也不能让说明草稿覆盖基本信息。当前 Ujs 本身未见编辑入口权限分支，不能添加推测门控。

## 验证边界

已确认的是静态请求与消费者契约；没有执行真实读取、上传、保存、分享、评分、删除或导出。现有 S09 对象级授权不延伸至 S10。真实 Word 的正文与图片有效性、服务端响应字段类型、空笔记协议、角色权限仍需对应证据；隔离 HTTP 测试只证明前端契约与交互，不等于真实产物验证。
