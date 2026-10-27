# S15 配套功能定向补证

日期：2026-10-27。只读静态调查；未访问真实接口，未修改业务实现。所有偏移均为原 bundle 的 Unicode 字符偏移，通过 `scripts/evidence_query.py query` 读取。

## 可达性结论

| 功能                            | 公开课程 HEi 的触发与挂载                                                          | 结论                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 收藏/取消收藏                   | 标题 `onClick:()=>Q(e.is_collect)`；Q 更新 classInfo.is_collect                    | 可达，纳入 S15                                                 |
| 评论/回复/删除自己的一级评论    | 侧栏 H(1) → Hgt(mode=open_courses)                                                 | 可达，纳入 S15；不是只读评论                                   |
| 课程资料目录、下载、批量导出    | 侧栏 H(2) → Ugt(id=p)，不传 mode，进入公开课接口分支                               | 可达，纳入 S15                                                 |
| 本节讲义、附件、工具            | 小节 attachment 各字段控制出现；lecture 还要求 type=1，tool_attachment 要求 type=2 | 条件可达，纳入 S15                                             |
| 实验视频                        | section.type=2 且 video_attachment；打开原生 video 弹窗                            | 条件可达，纳入 S15                                             |
| 相关课程                        | 侧栏 H(5) → FEi → getRelevantCourse                                                | 可达，纳入 S15                                                 |
| 课程我的笔记/共享笔记/评分/驻点 | 侧栏 H(3) → BI.setVisible(note,true) → jae(type=1) → mkn/vkn                       | 可达，纳入 S15；需要复用 S10 基础但另接课程协议                |
| 截图自动创建笔记                | H 的 ee===4 分支有截图/上传/创建实现，但 HEi 完整 JSX 只触发 H(1/2/3/5)            | 当前公开课程页面没有可达入口；不凭函数定义加按钮或列为必须交付 |
| 学习模板 xlsx 导入              | H 的 ee===6 分支和 jEi 挂载存在，但无 H(6) 或其它本页设置 import=true 的入口       | 当前公开课程页面没有可达入口；不凭组件挂载新增功能             |

证据：HEi 定义 @3598190；操作分支与 JSX @3604348–3615500 左右。精确全文有界搜索 `H(4)`、`H(6)` 均无命中；`"import",!0` 的公开课命中仅 H 的 ee===6 分支（@3604448）。该否定结论限定为本版公开课程 HEi 调用树，不推断其它课程入口同样不可达。

## 收藏与评论

收藏 Q：未收藏 POST `/api/front/user/collect/`，body `{attribute:1,object_id:courseId}`；取消 POST `/api/front/user/collect/batch/`，body `{attribute:1,ids:[courseId]}`。bF.collectCourse 用返回 data.status===1 判成功，成功后反转本地 is_collect；status===2 提示消息。H2n/V2n 包装 @19086xx，Q @36047xx。

评论请求包装 Lei/Pei/Dei/$ei @19145xx–19159xx；Hgt @3026777，状态层 wRn @3019455：

| 操作     | 请求                                                                                   | 消费及 UI                                                                                                    |
| -------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 读取     | GET `/api/front/learn/task/self_study/open_courses/{courseId}/comment/?page=1&size=10` | 外层 data 的 results/count；翻页不换 size，关闭重置第一页及输入                                              |
| 一级评论 | POST 同列表地址 `{content}`                                                            | 仅拦截空字符串，不 trim、不加新长度规则；返回有 content 判成功，清输入并刷新当前分页                         |
| 回复     | POST `comment/{commentId}/` `{content}`                                                | 对每个一级评论提供回复；一次展开一个；返回有 content 判成功并刷新                                            |
| 删除     | POST `comment/delete/` `{level1:[commentId]}`                                          | 按 comment.username===userInfo.username 显示一级评论删除确认；成功 status===1 重新取页；未见二级回复删除入口 |

评论显示一级/二级条目的 username、logo、role、created、content；role===1 显示学员，其余显示教员，这是原显示分支，不是后端角色授权结论。一级条目 `.comment` 是子回复数组；字段消费不能直接证明每份真实响应都必填。

原删除分页回退要求 n.type===1，但本页 Hgt 删除未传 type；这是可复现的静态缺陷线索，实施时应测试末页最后一项删除，不复制无意义参数假设。

## 资料、讲义与相关课程

Ugt @3022021，wRn @3019455：

- GET `/api/front/learn/task/self_study/open_courses/{courseId}/resource/?parent_path={encodedPath}`（Bei @19159xx）。内部先 encodeURIComponent(path)，查询正好编码一次；请求只在弹窗打开、目录变化时触发。外层 data 直接赋 fileData，不能套网盘分页契约。
- POST `/api/front/learn/task/self_study/open_courses/{courseId}/resource/export/`，body `{attachment_ids:[...]}`（Hei @19169xx），不是 S09 公开网盘的 resource_ids。根路径 `/`；目录行双击进入；面包屑支持根和深层；关闭重置路径/列表/选择。
- 表格：name.localeCompare、size 数值比较、altertime.localeCompare；显示 name/size/altertime；文件项 attached 为直接地址，type===video/mp4 打开 Sb video 弹窗，其余非 Office 名称为 target=_blank 链接；下载按钮文件可用、目录禁用，批量导出支持文件/目录选择，上级项 id=".." 禁选。
- 原 Office 项名称仅渲染 span，无 Office 点击回调，资料表 onRow 仅对目录双击。不能将 S09 的 Office 打开能力无条件补到该表；讲义的 Office 分支则确实调用 xG。
- 导出返回处理原存在 `download_url || url || string` 三种猜测及“其它对象也报导出成功”。这是静态客户端行为，**不能成为新适配器的多字段兜底**。S09 已实测的 download_url 属于另一端点，不能直接当课程导出的已验证协议；无真实课程响应时单列真实联调缺口，不能报成功。
- 章节讲义：type=1 且 attachment.lecture；pdf/txt 为 iframe 弹窗及局部全屏，word/ppt/excel 通过 xG 打开 Office（filePath=origin+lecture、mode=view），其它后缀 target=_blank。section_attachment 直接 download；type=2 的 tool_attachment 直接 download。HEi @3606xxx–3609xxx。
- 推荐 FEi @35945xx：GET `/api/front/learn/task/self_study/open_courses/{courseId}/recommend/`（W2n @1911207）；status===1 后取 data 数组，空态“暂无相关课程”；卡片显示 image、type=1/2/其它的专题类型、name、progress、difficulty、tag_list；点击直接导航公开课程详情，原未再次调用 can_enter。

## 课程笔记与 S10 的具体接点

jae @3555596 在 HEi 以 type=1、course_id、section_id、section_type、catalog、VideoBreakPoint、skipBreakPoint 挂载，展示我的笔记/共享笔记；共享页读推荐度 synthesis_score、当前评分 note_score，允许1–5星评分。弹窗可拖拽/局部全屏；关闭重置页签和边界。新建、改名、删除、编辑保存、分享、Word 导出、搜索、笔记驻点可达。

原课程端点与个人归档端点不同（包装 HYr/zYr/UYr/qYr 等 @18118xx–18128xx；mkn @3546429、mEi @3543728、vkn @3551828、BI @3003261）：

| 操作                 | 原课程端点与参数                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 我的笔记列表         | GET `/api/front/user/note/?nopage=1&search=...&course_id={id}&section_id={sid}`                                                 |
| 新建                 | POST `/api/front/user/note/` `{name,share,extend,type:1,course_id,section_id}`；仅名称必填，输入 maxLength=50                   |
| 笔记元数据/正文/分享 | PATCH `/api/front/user/note/{noteId}/`；元数据同上，正文 `{content}`，分享 `{share,...内容非空时content}`                       |
| 我的笔记详情         | GET `/api/front/user/note/{noteId}/`，返回 id/content/share/extend/section_id 等实际消费字段                                    |
| 删除/导出            | POST `/api/front/user/note/delete/` `{ids:[id]}`；POST `note/{id}/export/`，status===1→data.file_path                           |
| 共享列表             | GET `/api/front/share/note/?course_id={id}&section_id={sid}&nopage=1&search=...`；本入口未主动加 share=true、type 或有效 taskId |
| 共享详情/评分        | GET `/api/front/share/note/{id}/`；GET/POST 同地址加 `score/`，POST body `{note_score}`，读取外层 data.note_score               |

驻点：新建/编辑只有 type=1 且 section_type=1 才展示勾选；回调暂停视频并取 currentTime，0 时拒绝；extend.breakpoint_time 保存秒数。已有笔记驻点点击调用 skipBreakPoint（HEi 内当前仅设置播放器 currentTime，未按 section_id 自动切节）。从个人归档进入课程是另一个分支，由 can_enter 接口检验后携带路由 state.section_id/breakpoint_time。

现仓库已有：`apps/web/src/api/personal-notes.ts` 的详情/保存正文/删除/导出、`api/shared-notes.ts` 的详情/评分/分享、`content/RichContentEditor.tsx`、`notes/NoteDialogs.tsx`；`notes/NoteBreakpoint.tsx` 已向课程路由传 section_id/breakpoint_time。其 `getPersonalNotes/saveNoteMetadata/getSharedNotes` 使用 `/learn/task/my_notes/folders/...` 协议；不能直接拿当前 NoteContext 的归档列表函数访问课程端点。课程应显式增加上下文适配、复用渲染与正确动作，不复制 S10 功能，也不改归档 API 以猜测兼容。

## 依赖与可拆程度

- S09 仅需已交付文件呈现/直接下载、文件类型识别、Office 跳转基础；课程目录/导出请求属于课程域。知识库阅读没有出现在上述调用链，不应阻塞 S15；计划应细化依赖。
- S10 需要列为已交付笔记编辑/共享/驻点组件能力依赖，具体课程 API 接线仍属于 S15。
- 配套功能静态触发、参数和消费位置已足以拆票。截图/导入应作为已查明的不可达分支记录，不再当作产品范围歧义提问。
- 真实课程导出返回格式、评论/笔记权限及响应可空字段、Office/媒体真实可用性仍未实测；与实现验收分开记录。尤其课程导出只拿到静态多字段兜底，实施时不能宣称已获得单一真实下载地址契约。

## 复查命令

```bash
python3 scripts/evidence_query.py query --offset 3610900 --context 6500 --max-chars 13500
python3 scripts/evidence_query.py query --offset 1914700 --context 2600 --max-chars 5600
python3 scripts/evidence_query.py query --offset 3023900 --context 1900 --max-chars 4200
python3 scripts/evidence_query.py query --offset 3028650 --context 1900 --max-chars 4300
python3 scripts/evidence_query.py query --text 'wRn=' --context 2000 --limit 1 --max-chars 4300
python3 scripts/evidence_query.py query --offset 3548500 --context 2300 --max-chars 5000
python3 scripts/evidence_query.py query --offset 3544950 --context 1250 --max-chars 2800
python3 scripts/evidence_query.py query --offset 3553000 --context 1400 --max-chars 3100
python3 scripts/evidence_query.py query --text 'async function HYr' --context 900 --limit 1 --max-chars 2000
python3 scripts/evidence_query.py query --text 'H(4)' --context 300 --limit 8 --max-chars 3000
python3 scripts/evidence_query.py query --text 'H(6)' --context 300 --limit 8 --max-chars 3000
python3 scripts/evidence_query.py query --text '"import",!0' --context 100 --limit 8 --max-chars 1500
```
