# S10 与原 bundle 的功能对照审计

日期：2026-10-24。被审提交：`c5cfded5db3917f0a6b3991dda3c3c1a7abcb222`；变更起点：`114190ba4b88536392227889a065014346618bb3`。范围仅为本次 S10：共享富文本/图片、场景笔记、实验说明编辑、个人及共享笔记。五处既有未提交改动不在范围内。

## 结论

主要业务路径已覆盖，但不能认定全部还原。本轮重新查询原 bundle，确认6项行为差异（2项P2、4项P3），另有1项P2过强成功判据的工程判断。未发现缺失整个笔记管理、分享或评分模块的P1。此前交付审查的“未决0”是当时检查范围的历史结论，不能替代本次对照；实施计划据新发现恢复“进行中”。本轮只做审计及文档状态修正，未修改业务代码或提交修复。

## 已覆盖的主要能力

| 域       | 原 bundle 可见能力                                                                                                  | 当前判断                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 富文本   | 标题、粗斜下划线删除线、引用、代码、三类列表、缩进、上下标、RTL、文字/背景色、对齐、清格式；图片上传/缩放/预览/全屏 | 工具栏与基本编辑已覆盖；预览交互、粘贴粒度及全屏机制有差异，不能把工具栏齐全当完整还原 |
| 场景笔记 | 原 admin GET/POST、content、原保存前图片检查、已存noteId的Word导出、卸载清理                                        | 请求路径、正文、导出和隔离已覆盖；保存确认新增了未证实的字符串相等条件                 |
| 实验说明 | overview阅读、编辑/取消/确定、原PATCH仅overview、成功刷新、mode=scene                                               | 主闭环已覆盖；受共享编辑器差异影响                                                     |
| 个人笔记 | 默认归档/自定义目录、目录及笔记管理、名称必填/50字、无分页搜索、独立元信息/正文URL、mode=notes、Word、课程驻点      | 核心请求分支和门控匹配；初始自定义子目录默认选择有边界遗漏                             |
| 共享笔记 | 默认归档共享页签及开关、truthy草稿随分享提交、独立列表/详情/评分、只读、推荐度、1–5星、驻点，无Word                 | 核心分支匹配；搜索300字上限遗漏。推荐度由星级改为数值/5属于展示差异，信息仍在          |

默认训练归档不能在聚合页直接新建笔记，是原 mkn 的 `!all || type>4` 加 rjs 的 `all=true` 所决定，属于正确还原；新建入口在自定义目录中，不应为简化操作擅自放开默认归档。

## Standards：过度设计与约束

### D1 [P2，工程判断] HTML逐字符相等被升级为保存成功条件

位置：`apps/web/src/api/personal-notes.ts:163–168`，`apps/web/src/api/experiment-notes.ts:41–46`。

当前在写响应成功之后额外GET，并要求 `saved.content === submittedContent`。原 `BI.EditNote` Unicode **3004042** 根据PATCH响应id确认；原 `$js.noteAdd` Unicode **12696250** 根据POST status=1确认，均没有HTML逐字符不变的条件。

示例：提交 `<p>A &amp; B</p>`，服务端返回可见语义一致的 `<p>A &#38; B</p>`，现实现会报告保存失败并保留dirty状态。回读单独失败也会把已经成功的写入整体呈现为失败。实际服务端是否规范化HTML、是否存在读写延迟，本轮没有真实写入证据，不能宣称现网已故障；额外限制本身可以由代码确认。

建议区分写成功、刷新失败与尚未确认的持久化状态，接纳有契约依据的服务端规范化正文，保留提交后继续输入的内容；不能简单删除保稿保护，也不能用HTML字符串相等替代服务端版本/确认契约。场景首次导出前获取有效noteId有实际需求，不能将该GET与不必要的逐字符要求混为一谈。

未发现需要大规模重构的框架或库堆叠。Quill、formatter和DOMPurify承担不同职责；共享内容组件已有三个编辑域及只读消费者。账号/对象隔离、取消旧请求、草稿保护、未保存导航是明确工程要求，不归入过度设计。局部parse/错误处理重复不足以支持再造通用CRUD框架。

## Spec：已确认还原差异

### F1 [P2] 图片预览缺少原有缩放、旋转和翻转

位置：`apps/web/src/content/RichContentEditor.tsx:374–382`。

原 Ys 调用 `eht` 图片预览；`eht` 包装见 Unicode **1171003**，注入 `CSn` 的rotateLeft/rotateRight/zoomIn/zoomOut/flipX/flipY；底层 `K3r` Unicode **1144500** 附近默认构造这些操作，不需业务额外配置。

当前Dialog只渲染受max-height/max-width约束的img，没有对应控件、缩放或平移交互。长图、实验截图可打开却不能像原站放大查看细节。编辑器里的图片缩放是改变正文尺寸，不能替代预览缩放。

### F2 [P2] 粘贴含外链图片时连正常文字一起拒绝

位置：`RichContentEditor.tsx:235–265`。

原 Ys 的img clipboard matcher Unicode **3538482** 针对不合法图片返回 `ops=[]`，只去掉该图片，文字与其他合法节点仍进入Quill。当前capture阶段preventDefault后，对整段HTML执行validateImageSources；任何外链图片都会return，文字和已收集的合法base64图片也不再插入/上传。

触发：粘贴 `<p>实验步骤</p><img src="https://outside.invalid/a.png">`。原站保留“实验步骤”并提示图片问题，现整次粘贴为空。修正整篇host绕过应保持逐图片粒度，不能扩大为整段内容拒绝。

### F3 [P3] “全屏编辑”只铺满网页，未还原浏览器全屏

位置：`RichContentEditor.tsx:329–351`，`apps/web/src/content/content.css:24–34`。

原 Ys Unicode **3541850** 调用requestFullscreen/exitFullscreen并监听fullscreenchange；当前仅React布尔状态加fixed inset:0，浏览器工具栏仍存在，document.fullscreenElement不会变化。Escape改变本地状态不等于原Fullscreen API生命周期。此为机制/交互差异，不能描述为缺少编辑器铺满页面能力；可恢复原API或明确记录经确认的替代设计。

### F4 [P3] 上传失败时丢失原image字段错误说明

位置：`apps/web/src/api/content.ts:18–26`，`apps/web/src/api/client.ts:313–321`。

原 Ys 上传catch Unicode **3541289** 读取HTTP响应体image并提示；当前统一客户端仅从error字段取HTTP文案，且上传端点未声明image错误来源。只读本地probe使用真实createApiClient配合合成HTTP400 `{image:'合成样本：图片格式不支持'}`，返回message为“请求失败（400）”，说明原具体原因丢失。

这是反馈细节遗漏，不是没有上传失败态。应按端点的已确认错误字段在统一边界适配，保持单次提示，不能额外在页面重复toast或逐key猜字段。

### F5 [P3] 共享搜索遗漏300字上限

位置：`apps/web/src/notes/SharedNotes.tsx:65–69`。

原 vkn Unicode **3553590** 明确 `maxLength:300`。当前输入无长度限制，getSharedNotes原样传search；粘贴301字符时请求边界不同。不能据此推定后端必定拒绝。个人和目录搜索已保留相应上限，不需新增抽象校验层。

### F6 [P3] 首个自定义目录有子级时，默认未选原首子级

位置：`apps/web/src/notes/PersonalNotesPage.tsx:88–96`。

原 rjs Unicode **12638932** 在首次响应首项type>4且children非空时，额外选择首个子级并通过section_id查询。当前defaultContext对type>4直接返回父级上下文，不带sectionId。此响应顺序下原展示首子级笔记，现展示整个父目录。手选子级已实现；常见响应若默认四类始终排前，该边界不触发。

## 验证边界与建议顺序

本轮使用evidence_query有界查询及verify，未执行原bundle、未新建UI测试/截图、未修改业务代码，未进行真实后端操作。复用既有测试记录，但它们未覆盖本次发现的原预览工具、混合外链粘贴、原Fullscreen状态及两处目录/搜索边界。仅新增一个临时Node内存probe确认上传错误文案，没有新增测试文件或访问网络。

真实只读取样的既有结论仍有效：场景有效数字id+空字符串content、目录数组类型、共享正文/推荐度/评分字段结构已确认。个人非空详情share类型、服务端HTML规范化、图片返回URL/CDN、真实写入、Word正文图片实物、全部权限仍未验证；这些不能计为已确认代码遗漏，也不能算已验证通过。

优先处理F1/F2及D1的成功语义，再补F3–F6，分别在相关公共行为补回归。不要为这些局部差异重建笔记模块、重写编辑器或新增通用框架。本报告只建议修复范围，不表示已经执行。

## 证据复现入口

所有原件位置使用Unicode字符偏移，通过仓库脚本读取，不直接检索大型原始文件。

```bash
python3 scripts/evidence_query.py query --offset 3538482 --context 500 --max-chars 1400
python3 scripts/evidence_query.py query --offset 1144500 --context 1600 --max-chars 3600
python3 scripts/evidence_query.py query --offset 1171003 --context 1750 --max-chars 3800
python3 scripts/evidence_query.py query --text 'getElementById("jsmind_container")' --context 800 --limit 1 --max-chars 2400
python3 scripts/evidence_query.py query --text 'I.image&&ue.error' --context 380 --limit 1 --max-chars 1100
python3 scripts/evidence_query.py query --text 'EditNote:async' --context 500 --limit 1 --max-chars 1400
python3 scripts/evidence_query.py query --text 'noteAdd:async' --context 350 --limit 1 --max-chars 1100
python3 scripts/evidence_query.py query --offset 3553590 --context 550 --max-chars 1400
python3 scripts/evidence_query.py query --offset 12638932 --context 1000 --max-chars 2400
```

## 修复追踪

本报告保留审计时点结论；后续修复按[三张本地工单](s10-remediation-tickets.md)执行，结果与审查见[专项实施记录](s10-implementation.md#原-bundle-对照专项修复2026-10-24)。不以本轮模拟验证替代真实服务契约取样。
