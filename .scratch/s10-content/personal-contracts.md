# S10 F032 个人与共享笔记静态契约调查

日期：2026-10-24。只读调查原 bundle，没有执行后端请求，没有取得真实服务响应或生成 Word。下列 `data` 指 Ae 返回对象经解构的业务数据，不代表原始 HTTP JSON 已实测。偏移均为 Unicode；通过 `scripts/evidence_query.py query` 查询，未直接读取原件。

## 证据入口与复现

| 内容                           | 查询                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------- |
| 目录 store、目录表单、rjs 页面 | `query --offset 12638360 --context 6500 --max-chars 13500`                      |
| 我的笔记 mkn、添加/改名 mEi    | `query --text 'mkn=' --context 5200 --limit 1 --max-chars 11000`，命中 3546429  |
| 共享笔记 vkn                   | `query --text 'vkn=' --context 4500 --limit 1 --max-chars 10000`，命中 3551828  |
| 笔记 store BI                  | `query --text 'BI=Sr' --context 6500 --limit 1 --max-chars 13500`，命中 3003261 |
| API 包装                       | `query --offset 1811870 --context 1100 --max-chars 2400`                        |
| 外链图片检查 rpt               | `query --text 'rpt=' --context 600 --limit 1 --max-chars 1600`，命中 1804959    |

现 function-catalog.md:319–327 的 F032 仍错误写成网盘操作/API，不能据此实施；page-feature-code-map.md:442–450 和 feature view 已纠正。

## 目录与归属

- `sfr` 默认过滤 `{nopage:1,search:""}`；目录搜索输入 maxLength=300，改变 filter 即重取，无分页组件。
- `$Yr`: GET `/api/front/learn/task/my_notes/folders/?${Vt(filter)}`。业务响应直接数组，每项读取 `id,name,type,courses`；courses 每项读取 `id,name`。原转换 top key 为 `A-${folder.id}`，child key 为 `B-${course.id}-${folder.id}`，child 继承父 type。
- type 1–4 为默认归档：图标分别 courseStudy、practiceStudy、equipmentStudy、emergencyStudy；只允许选择子目录，父目录仅展开。type>4 为自定义文件夹，允许选择父目录、改名、删除。不要由图标自行增补后端枚举中文名。
- 默认展开全部父目录，首个目录有可选子项时默认选首个；自定义目录可直接选父目录。空列表显示暂无目录，未选目录显示点击目录查看笔记。原 type<=4 且首项没有 children 的默认选择拼接存在脆弱性，应以显式空态处理，不能发 undefined ID 请求。
- 新建目录入口始终可见。`BYr` POST `/api/front/learn/task/my_notes/folders/create/`，表单发送 `{name}`。改名入口仅 type>4，`FYr` POST `/api/front/learn/task/my_notes/folders/${id}/rename/`，原 body 是表单完整对象 `{id,name}`。两者成功检查业务 `data.id`，关闭表单并通过更新 filter 触发重取；error 作为字段错误来源。
- 目录名称仅 `!name` 必填检查，输入 maxLength=50；没有 trim、重名、字符白名单或本地配额规则。
- 删除仅 type>4，确认文案明确“删除文件夹及其下笔记，删除之后不可恢复”。`jYr` POST `/api/front/learn/task/my_notes/folders/${id}/delete/`，无 body；成功检查 `data.id`，toast `data.message`、重取；若删除当前父目录则清理当前选中和 type。
- rjs 把所选父目录或默认子课程 ID 记为 course_id；自定义父目录下的选中子项记为 section_id。个人列表 URL：`/api/front/learn/task/my_notes/folders/${type>4?selectedParentId:type}/courses/${type>4?0:selectedCourseId}/notes/`；共享列表末段为 `shared_notes/`。
- 页面我的笔记页签始终存在；共享笔记页签仅 `type<=4`。因此自定义文件夹不展示共享列表及共享切换，不能套用网盘分享操作。

## 我的笔记列表、元信息、正文

- mkn 默认 `noteFilter={nopage:1,search:""}`，随 section_id 更新；过滤请求有 200ms debounce。列表响应直接数组，最少消费 `id,name`，编辑元信息时把该行整对象复制入 addData，额外使用 `share,extend`。无分页 UI、排序或批量选择。
- 有显式 URL（rjs）的列表查询 body-to-query：`{...noteFilter,section_id}`；type 2/3/4 再附 `course_id,type`；type1 不在查询额外补 type；自定义 type>4 不附 course_id/type。查询由 HYr GET `${url}?${Vt(data)}`。
- 列表自动选第一个 ID，选中调用 `VYr` GET `/api/front/user/note/${id}/`。详情成功有 `data.id` 时写入完整详情和 `data.content || ""`。正文为 HTML string；可见内容消费 `id,content,share,extend.breakpoint_time,section_id`。
- 新建按钮仅 `!all || type>4`；rjs 设置 all=true，所以个人聚合页默认归档不能直接新建，只有自定义目录可新建。既有笔记每行改名、删除均显示，无按 owner/role 附加 gate。
- 添加/改名 mEi 名称必填 `!name`，输入 maxLength=50，无 trim/重名规则。新增初始值 `{name:"",share:false,extend:{breakpoint_time:""}}`。
- 元信息请求基础 `{name,share,extend,taskId}`；type2/3/4 加 `{course_id,type}`，type1 加 `{type}`；无显式 URL 才再加 `{course_id,section_id}`。rjs 没传 taskDetailId，taskId 为 undefined，实际序列化是否删除 undefined 复用项目客户端已确认约定，不应发送字符串 undefined。
- 新建 zYr POST 到显式目录 notes URL；成功检查 `data.id`，关闭对话框并刷新列表。改名 UYr PATCH 到显式 `${notesUrl}${id}/`；同一元信息 body，成功检查 `data.id`，回调刷新。
- 正文保存和共享切换**不传目录 URL**：UYr PATCH `/api/front/user/note/${id}/`。保存 body `{content:editorHtml}`，成功检查 `data.id`。共享切换 body `{share:boolean}`，若当前 editorHtml truthy 额外携带 `{content}`；保存成功更新详情 share。不要把默认内容保存端点误改成目录端点。
- 共享切换只在 type<=4 显示（原 JSX `!type || type<=4 && Switch`，rjs 总提供 type）；自定义目录没有切换。
- 删除 GYr POST `/api/front/user/note/delete/` body `{ids:[id]}`，逐项确认“是否删除笔记，删除之后不可恢复”；status=1 提示删除成功并刷新。原 store status=2 提示 message 却返回 true 的瑕疵不应作为模拟成功复制。
- 选笔记后的编辑器 `Ys` 可编辑、height=auto、上传配置 `{url:"/api/front/upload_image/",mode:"notes"}`；没有 uuid。与场景笔记 mode=scene 区分。
- 原仅共享切换前调用 rpt，正文保存 P 直接 PATCH content；应记录此差异，不凭常识宣称原所有保存按钮都有外链检查。
- 原目录、选中、列表/详情清理靠卸载、section_id effect 和 key；重建应补必要的账号/目录/笔记身份隔离和请求取消，避免旧响应回写。不能复制原共享筛选持久残留和旧请求竞态。

## Word 导出

- WYr POST `/api/front/user/note/${id}/export/`，无 body。
- BI 检查业务 status=1 后导航 `window.location.href = data.data.file_path + '?' + Date.now()`；status=2 toast message。
- 导出已有已保存笔记 ID，不带当前未保存 editorHtml。原共享笔记详情没有导出按钮，不能为了复用给共享页增加导出。
- 已确认唯一静态响应字段为嵌套 `data.file_path`（业务结果对象内），无需候选 key 猜测；但未验证真实 JSON、URL 可达、下载 MIME、Word 文件结构与图片可用性。

## 共享列表与评分

- vkn 默认 `shareNoteFilter={nopage:1,search:""}`、随 section_id 设置；200ms debounce，直接数组响应，无分页。
- qYr GET 显式 shared_notes URL 的 query：`{course_id,...shareNoteFilter,taskId}`；type2/3/4 再加 `{course_id,type}`；有显式 URL 时加 `share:true`。rjs 不提供 taskId。默认 type1 仍带 course_id；与个人列表规则不同。
- 选择共享笔记后同时请求 KYr GET `/api/front/share/note/${id}/`、YYr GET `/api/front/share/note/${id}/score/`。详情业务对象有 id 才接受，消费 `content,synthesis_score,extend.breakpoint_time,section_id`；评分 store 返回业务对象，UI 读取其 `data.note_score`，所以评分响应的 note_score 在业务对象下一层 data 内。
- 推荐度显示 `synthesis_score`，星级控件 disabled；您的评分初始本地值0，获取后为 `response.data.note_score`，`allowClear:false`，原没有额外 owner/角色/重复评分 gate。没有显式 count；后续定位 wd @1289263 → JSn → f4r @1285256，默认 count=5、allowHalf=false，结合 allowClear=false，用户可提交1–5整数评分，不新增0分取消或任意小数。
- QYr POST `/api/front/share/note/${id}/score/`，body 仅 `{note_score:value}`（UI 传 taskId 但包装没有使用）；status=1 成功，toast 评分成功、刷新详情、更改当前用户分值；status=2 返回 false，不额外制造成功。
- 共享详情 Ys readOnly=true，没有正文保存、新建、改名、删除、导出。原只基于目录 type 显示共享页签，不证明服务端所有权策略或任意账号都能读取。

## 训练驻点与其他切片接点

- 聚合页若 note.extend.breakpoint_time truthy，会显示驻点并调用 BI.getCourseDetail(courseId)（封装 nQr）检查 can_enter；可进入时导航 `/basic/training/course/${courseId}`，state `{section_id:note.section_id,breakpoint_time:note.extend.breakpoint_time}`；否则提示专题已下线。目标课程正式运行属于后续切片，S10 应保留原上下文跳转，不提前实现课程运行。
- mEi 驻点新建只在 type=1 且 section_type=1（课程视频上下文）显示；rjs 没有 section_type、VideoBreakPoint，因此 S10 个人聚合页面不创建视频驻点。共享组件未来课程消费者不可把聚合模式持久化归属和业务字段混用。
- 后续查询 `query --text 'function nQr' --context 450 --limit 1 --max-chars 1500`，定位 @1813373：GET `/api/front/learn/task/self_study/open_courses/${courseId}/can_enter/`。BI @3005144 直接返回业务对象；调用方读取 can_enter 后执行上述导航。该读取接点属于 S10 驻点入口，课程运行归后续切片。

## 真正剩余缺口与验证边界

1. 静态可据以建契约：目录/个人/共享数组形态、实际使用字段、CRUD URL/请求体、共享门控、评分嵌套、导出单字段均已定位。原 UI 不消费的额外字段及服务端必填/可空规则不应编造；类型检查应在适配边界以实际最低契约明确报错。
2. 真实未验证：各对象字段真实类型（ID 数字或字符串、score 类型、extend 可空等）、空详情结果、字段错误对象、服务端实际权限/分享可见范围、目录删除级联、Word 产物与图片。需要获准测试账号/对象后才能确认，当前没有执行写入。
3. 原默认目录 type1–4 归档的详细中文名按原目录响应 name 展示，不从图标猜业务名。评分默认值已通过 `query --text 'function f4r' --context 1150 --limit 1 --max-chars 2800` 补证；不据常识扩展分值规则。
4. 原 rpt 不是严格逐图同源验证：提取 img src 中含 http/https/file 的项后，仅以整篇 HTML 是否 includes(window.location.host) 判定。编辑器粘贴 matcher 的外链检查更严格。复刻时需明确是否保留原兼容行为或修正漏洞，不能把更严格规则伪称原行为。
5. 本文无真实请求、UI 实现或测试运行；模拟契约通过不能抵扣真实 Word 有效性与真实后端持久化验证。
