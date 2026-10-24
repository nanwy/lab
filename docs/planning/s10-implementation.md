# S10 内容与笔记实施记录

日期：2026-10-24。集成分支 `integration/s10-content`，起点 `114190ba4b88536392227889a065014346618bb3`。本地工单见[分析与工单](../../.scratch/s10-content/analysis.md)，当前进度只维护在[实施计划](page-rebuild-implementation.md)。

## 交付范围与协议

- 共享 Quill 2.0.3 内容编辑器，直接接入 DOM，避免旧 React wrapper 的兼容限制；图片 formatter2 3.2.0、DOMPurify 3.4.17 精确锁定。HTML 输入输出保留标题、行内格式、引用、代码、三类列表、缩进、上下标、方向、颜色/背景、对齐、清格式与图片尺寸。提供单击预览、编辑全屏、图片缩放，以及只读消费者。
- 图片选择、拖入、base64 粘贴均走统一上传适配；FormData 为 image/mode/可选 uuid，唯一响应字段 data.url，30 分钟超时。统一客户端显式 csrf-only 策略保持原 ul 与 Ae 的 Token 差异；保留 CSRF，不新增请求旁路。账号/对象/编辑会话变化取消旧上传并清理插件/事件。
- 场景笔记使用原 admin 路径，POST 仅 content，回读确认有效笔记 ID 与正文，导出使用已保存 ID 和唯一 data.file_path；保留 jf 下载命名及未保存草稿也可导出已保存版本的语义。
- 实验说明独立 PATCH overview，不携带基本信息字段。阅读、编辑、取消、保存刷新、失败保稿与未保存离页确认接入共享内容能力；有缓存详情时后台刷新失败不卸载编辑器。
- 我的笔记保留默认训练归档/自定义目录区别、目录及笔记增删改查、原名称必填和50字限制、搜索与无分页列表、mode=notes 图片、正文保存重开、个人 Word 与课程驻点上下文。不同业务端点及参数分支显式适配，不复用网盘整理规则。
- 共享笔记仅默认归档提供分享页签和开关；分享 truthy 草稿随 share 一起提交。共享列表/详情/个人评分独立读取，只读正文、推荐度、1–5整数评分、驻点与失败恢复；没有共享正文编辑或 Word 入口。取消分享清除共享缓存。

S10 对 S09 的依赖按用户确认细化到已交付的客户端基础，不受 S09-05 知识库阅读阻塞。F032 误植网盘的范围/API已在功能目录、JSON/CSV和页面索引中同步纠正。

## 原实现差异与审查修正

原图片来源检查以整篇 HTML 是否包含 host 判断，可能被正文文本绕过；现按每张图片的 URL origin 校验。只在原本具有检查的业务动作及编辑器粘贴/上传边界执行，个人普通正文保存不新增 rpt 业务限制。输入净化保留允许格式，不把未经确认的服务器限制当本地规则。

原场景保存未刷新 noteId，现重读后再导出；保存中继续输入不被响应覆盖。formatter2 destroy 在 StrictMode 重复清理时存在 toolbar 父子关系异常，现以窄兼容清理后调用插件 destroy，浏览器异常哨兵覆盖。

双轴审查固定原始范围 `114190b...a7cf9ac`；最终04提交918bb8d只增加分享回归测试。Standards 发现1项P2（旧详情请求覆盖新缓存），Spec发现2项P1（回读旧文仍报成功、列表刷新卸载草稿），集中修复在 faf3017：保存后写缓存前精确取消同key旧查询，回读正文与提交不一致时保留草稿并报错，自动首选固定有效ID及活动草稿身份。增量审查另检出干净空列表保留旧详情的P2，d28518e 将保留条件限定为 dirty/busy/uploading/sharing，会话干净时清理空详情。相关三项相邻浏览器回归通过，Spec 增量复查关闭全部发现；Standards 原 P2 也已复查关闭。

附带修复基线已有 FileDrivePage TS2538：hasOwn 分支内明确索引非空，仅类型收窄，不改变文件页运行行为。

两轴报告归档见[S10 双轴审查](s10-parity-audit.md)。最终共7个相关单测文件51项、S10四文件26项不同浏览器用例通过；重复红绿、组合冒烟与相邻复测不累计为新增用例。S05直接消费者另有5项既有回归通过。

## 真实只读取样

用户在本地 `http://127.0.0.1:5173/#/login` 自行登录，明确授权代理自行测试接口。仅通过现有浏览器会话导航和观察已发出的读取响应；没有提取或记录 Token/Cookie/密码，没有上传、保存、分享、评分、删除、启动资源或导出。

- 场景笔记 GET HTTP200，响应 keys 为 content/id/name；id 为有效 number，content 为长度0的 string，空白编辑器实际打开。这确认合法空正文为有效 ID 加空字符串，不需要构造无 ID 的首次创建协议；缺 ID 等坏响应继续明确报错。原“首次空协议未确认”缺口解除，不外推到未知协议版本。
- 个人目录 GET HTTP200，直接数组；id/type 为 number，name 为 string，courses 为数组，子项 id/name 为 string。当前选中目录的个人笔记列表为空，仅确认空数组形态，不冒充验证了所有个人详情实体字段。
- 共享列表、详情及个人评分 GET 均可读取；详情 id/section_id 为 string、content 为 string、synthesis_score 为 number、extend 为 object；评分响应为 status/message/data，唯一 data.note_score 为 number。页面显示只读正文与评分。只记录结构与类型，未保存原始业务正文。

该取样不证明全部账号权限、分享可见范围、真实写入、目录级联删除、图片服务或 Word 产物。隔离测试和真实只读明确区分。

## 定向验证

全部命令使用 `fnm exec --using 24.14.0 pnpm ...`；各票在独立 worktree/分支TDD实施后由合并代理集成。公共测试边界为已确认的业务 HTTP 适配与隔离浏览器，不测试内部实现细节。

| 范围      | 验证结果                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| 01        | 客户端/图片/HTML/场景API 4文件35项单测；最终7项浏览器（含场景迟到缓存回归）通过                                   |
| 02        | experiments API5项；说明4项浏览器及直接受影响S05既有5项；桌面/390px阅读编辑4张截图已查看                          |
| 03        | personal-notes API7项；最终11项浏览器（含回读/重排/交错响应及干净空态回归）通过；桌面/390px截图已查看             |
| 04        | shared-notes API4项；只读评分、失败隔离、驻点、分享副作用与撤销缓存4项浏览器；桌面/390px截图已查看                |
| 集成      | 四消费者主闭环4项组合冒烟通过，不重复计入不同用例数；web最小类型检查、显式修改文件lint/格式、git diff --check通过 |
| 依赖/证据 | frozen-lockfile安装通过；evidence_query verify确认逐字节重组、索引与Evidence引用有效                              |

浏览器配置为 `playwright.s10.config.ts`，显式传入本票测试文件；用 `PLAYWRIGHT_S10_PORT` 与 `PLAYWRIGHT_S10_OUTPUT` 隔离服务/产物。报告保留 `/tmp/s10-notes/01.md` 至 `04.md`、`review-fixes.md`，截图在 `/tmp/s10-notes/screenshots/` 与各票产物目录；这些临时文件不替代仓库中的本记录。

未运行全量测试或生产构建；本轮未修改构建配置或生产模式。未验证非 Chromium、真实上传/保存/评分/分享、Word正文和图片实物、服务器隐藏字段及全部权限。课程正式运行属于后续切片，仅交付驻点入口与上下文。没有创建外部issue/PR、推送远端；用户原有五处未提交改动保持。

## 原 bundle 对照专项修复（2026-10-24）

本轮起点 `c5cfded5db3917f0a6b3991dda3c3c1a7abcb222`，在当前分支 `integration/s10-content` 实施。依据[对照审计](s10-bundle-parity-review.md)，将已确认方案落为[三张本地工单](s10-remediation-tickets.md)；无外部 tracker，不发布外部 issue。

- R1：接入 Viewer.js 1.15.2（MIT、零运行依赖、无 React wrapper），恢复预览缩放、移动、左右旋转、水平/垂直翻转、重置、关闭/重开及焦点恢复；只读和卸载清理验证通过。保留现有 Quill/formatter/DOMPurify。粘贴使用 IMG matcher 逐图过滤，文字格式、同源图片及异步上传的 base64 图片保留；相邻 base64 图片使用 DOM 集合快照遍历，避免删除节点后跳项。编辑全屏改为原生 Fullscreen API，监听实际状态并处理 Escape、退出及权限拒绝。
- R2：个人 PATCH id、场景 POST status=1 确认写成功；独立回读接受服务端规范化，不再比较 HTML 字符串。写失败保稿；写成功但回读失败显示“已保存，内容刷新失败”，允许单独重读，不重复写入；回读期间的新输入保留。场景回读取得有效 noteId 前禁止导出。保存/分享均同步成功基线，避免旧重读入口覆盖分享后的编辑。
- R3：上传端点显式声明 HTTP 文案来源 image，统一客户端处理一次；共享搜索 maxLength=300；首个自定义目录有子项时默认选首子项并携带 section_id。

测试沿已确认 HTTP 和浏览器边界逐行为 red → green。确认红灯包括上传错误字段、混合粘贴、相邻 base64、预览操作缺失、原生全屏缺失、保存刷新状态、共享搜索/首子级以及分享后旧重读入口。一次实现中的语法错误和服务依赖预优化失效属于修复过程，未当作行为红灯或验收通过。

验收：全量单测37文件158项通过（`pnpm test`）；web类型检查、显式修改文件lint/Prettier、`git diff --check`及`pnpm install --frozen-lockfile`通过。S10四文件共35项不同浏览器用例分批通过：首轮33项中31项通过，修正原生全屏退出/旧CSS断言后对应2项及预览/只读/权限拒绝5项通过，新增分享后旧重读状态及相邻图片回归通过；直接受影响S05概述/说明与详情切换另2项通过。不重复累计红绿/复测数量。

命令均加 `fnm exec --using 24.14.0`：`pnpm exec playwright test --config=playwright.s10.config.ts s10-content.spec.ts s10-personal.spec.ts s10-shared-notes.spec.ts s10-explanation.spec.ts`，后续用 `--grep` 定向复测改动行为；S05使用 `playwright.focused.config.ts` 与 `--grep '深链概述|实验详情切换'`。日志在 `/tmp/s10-remediation-*.log`，预览截图 `/tmp/s10-remediation-preview.png` 已查看。没有生产构建或全站浏览器回归。

[双轴审查](s10-remediation-review.md)以本轮起点对选定暂存差异进行：Standards 无发现；Spec 检出1项P2（保存回读失败后分享成功未清旧重读状态，可能覆盖后来编辑），已先复现红灯、修正成功基线与刷新状态、补回归并由两轴增量复查关闭，最终无未决发现。未引入CRUD框架或编辑器迁移。真实上传、保存、分享、评分、Word 实物及非 Chromium 仍未验证；本轮全部写入为隔离响应，未操作真实后端。
