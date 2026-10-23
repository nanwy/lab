# S09 文件与预览实施记录

日期：2026-10-24。集成分支 `integration/s09-files`，起点 `ce9b024`。当前切片进度统一见[实施计划](page-rebuild-implementation.md)，本记录保存实际实现、证据和验证边界。五张本地工单及视觉要求见[分析](../../.scratch/s09-files/analysis.md)。

## 交付与原行为

- 目录基础：公开/个人两个数据域、列表直接数组及一次路径编码、根/上级/深层面包屑、目录行双击、名称入口、排序、多选、文本获取、MP4 弹窗与直接下载。账号/域/目录通过明确的 Query key 和组件生命周期隔离。Office 类型沿原 Ks 的末扩展判断，包含 wps、et、dps，不凭图标支持范围新增预览器。
- 个人整理：创建文件夹、重命名、分享、单项及批量确认删除，成功后重读当前目录。原名称过滤、trim、50 字上限、必填与成功提示保留；不新增配额、重名、格式或角色规则。is_shared_file 禁用单项动作，批量仍可选共享项，服务端拒绝沿统一错误处理。
- 上传：多文件 attached 与提交时 parent_path、原 30 分钟超时、真实字节进度、等待响应最多 99%、成功 100%、取消和失败恢复。XHR 只作为统一请求客户端内的上传传输，复用原认证/CSRF、响应解析及错误处理；不引入 Axios、队列、断点续传或自动重试。
- Office：独立 hash 入口读取 filePath/mode 和平台配置，500ms 后打开原服务 /web-apps/；保留完整嵌套 URL 和根相对文件参数。等待配置、参数切换、StrictMode 去重、卸载取消旧动作与手动恢复；现有 Wireshark 指南直连保持可用。

保留原个人 jf 与公开 $E 两套下载命名算法，包括个人多点文件名截断和公开别名可能重复扩展名的原瑕疵；没有静默替换成统一算法。原 KWs 清理引用未定义 script 的缺陷不复制；原 filePath 拼接会截断嵌套查询，改用完整参数编码并验证。

实际消费者暴露并修正表格生命周期问题：每轮创建的列 cell 回调经 flexRender 作为组件类型，会重挂载有状态动作并关闭重命名弹窗。动作单元格改为稳定组件直接渲染，后台刷新回归确认不再卸载。新网盘导航使用注册路由，消除旧 /basic/$ 模板生成同 URL 的警告。

## 契约补证与未完成流程

独立补证笔记保存于 `/tmp/s09-notes/contracts.md`。所有原始证据使用 evidence_query.py 有界查询，源 SHA 检查通过；偏移单位为 Unicode。

| 流程       | 已确认事实                                                              | 未确认与处理                                                                                                                                       |
| ---------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 公开打包   | pZr @1827333，POST resource_network_disk/export_zip/，body resource_ids | 唯一直接消费者在 @12645456 使用 download_url / url / string 候选，无版本或响应判别。未任选字段，不执行未知产物生成；入口暂不可用，01 整票不关闭。  |
| 个人打包   | gZr @1827469，POST my_profile/files/export_zip/，body file_ids          | @12646073 同样存在候选响应，其他同构消费者不能证明本端点契约。02 整票不关闭。                                                                      |
| 知识库阅读 | AI 引用提供 id/fid/cid，QWs @13320916 消费标题、正文和可选定位          | getFileView @2065667 为 await (void 0)(n)，当前证据缺失请求 URL。不能挪用普通 knowledge detail 或网盘接口；05 未领取实现，不以阅读壳替代成功链路。 |

用户表示没有类型结构，可提供测试账号进行主动调用。已请求登录方式和指定公开/个人对象各打包一次的范围，以及知识库引用链接；取得对象和授权前不自行调用真实生成接口。原前端字段访问只能证明 UI 容许状态，不能冒充实际服务端 schema。

## 定向验证

沿用户工单已确认的公开边界进行 TDD：业务 API 契约与隔离浏览器流程。每票在自己的 worktree/分支实施后合入 integration。临时测试服务、缓存和产物独立，不与日常开发或其他代理共用默认产物目录。

| 范围 | 已有验证                                                                                                | 证据                                                         |
| ---- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 01   | 3 项 API 契约；两域浏览、获取、目录切换及加载/空/错误/播放器；导航警告修复后 3 项浏览器流程             | `/tmp/s09-notes/01.md`、`/tmp/s09-notes/integration-prep.md` |
| 02   | 2 项 API 契约；4 项浏览器流程，含字段校验、失败恢复、分享、共享项批删、切域取消及后台刷新不卸载动作     | `/tmp/s09-notes/02.md`                                       |
| 03   | 5 项上传浏览器检查、24 项已有客户端测试；真实本地 HTTP 字节事件验证进度，系统边界模拟不当作真实后端操作 | `/tmp/s09-notes/03.md`                                       |
| 04   | 4 项 Office 流程及 2 项相邻 Wireshark 流程；桌面/平板/手机、参数切换、配置失败、弹窗失败与恢复          | `/tmp/s09-notes/04.md`                                       |

各票通过 Web 最小类型检查和显式文件 lint/格式检查。未跑全量测试或生产构建。初期因宽泛 API route 匹配源码路径、或 page.route 不产生真实上传字节事件导致的测试失败已修正，不把这些环境/测试问题作为业务红灯；各票笔记保存重新取得的有效红灯与绿灯。

正式页面组合已合入 `a1d2001`：12 条定向浏览器流程通过（网盘 4、个人管理 4、Office 4）；加上上传专用传输 5 条与 Wireshark 直接消费者 2 条，累计 19 条不同浏览器检查。API 关键契约 5 项及统一客户端既有 24 项通过；未将多次红绿重复运行累计为额外用例。最终组合记录为 `/tmp/s09-notes/integrated.md`。

组合验证修复第二处竞态：初始目录请求未完成时上传成功，原 refetch 会复用旧请求，导致显示 100% 但列表仍空。现在精确取消旧目录查询后 invalidate 当前 active 消费者，已用延迟初始空响应验证不污染新文件。普通刷新不卸载重命名弹窗的既有回归同时通过。

## 最终双轴审查

固定审查范围为 `git diff ce9b024...a1d2001`，排除用户已有五处 S08/规则未提交变化；Standards 和 Spec 分别由只读代理审查。

### Standards

发现 1 项 P1：上传传输 harness 依赖开发服务器的源码导入、专用来源及上传代理，却被登记到普通开发和生产 preview 项目中，已提交配置不能复现该专项。要求提交独立开发专项配置，从不适用的项目移除 harness；正式页面上传用户流程继续保留在业务项目。

未发现其他确认的规范问题或有实际后果的过度抽象；统一 XHR 管线、动作单元格身份及表单遵循项目边界。

### Spec

发现 1 项 P2：名称列没有显式 comparator，TanStack auto 对目录大小和内容选择不同算法，混合大小写/数字可能偏离原 `name.localeCompare`。要求指定原 comparator 并用已知名称排序补红绿验证。公开/个人导出及知识库阅读是已声明阻塞，不重复当作隐藏缺陷。

两轴发现由同一个修复代理在 `796713e` 修正并合入 `a0ec543`。上传专项提交为 `playwright.upload.config.ts`，默认和替代端口各 5 项通过；名称与时间显式使用原 localeCompare，两域名称升降序用户回归先红后绿。新增 1 项不同浏览器检查，累计为 20 项；重复的端口运行不重复计数。修复证据为 `/tmp/s09-notes/review-fixes.md`。Standards P1 与 Spec P2 均经各自增量只读复查关闭，未发现新直接问题；不以一轴通过抵消另一轴问题。

可复现命令（通过 fnm 使用项目 Node 24.14.0）：

```bash
pnpm exec playwright test s09-files.spec.ts s09-personal.spec.ts s09-office.spec.ts --config=playwright.focused.config.ts
pnpm exec playwright test --config=playwright.upload.config.ts
pnpm --filter @xueyuan/web test src/api/files.test.ts src/api/personal-files.test.ts src/api/client.test.ts
pnpm --filter @xueyuan/web typecheck
```

专项上传配置只启动隔离开发服务，生产项目不再尝试导入测试源码。没有因此增加全量测试、生产构建或真实接口操作。

## 视觉依据与验收边界

方向为暖白、墨绿、衬线中文标题和细线表格的资料档案室；不改造无关应用外壳，不建设通用文件平台。参考 [Dropbox Brand](https://brand.dropbox.com/) 的明确字级、细线对齐与动效节制，转为适合资料表格的密度。

[Webby 官方条目](https://winners.webbyawards.com/2025/websites-and-mobile-sites/features-design/best-visual-design-function/333662/dropbox-brand-website)确认其 2025 UX 与移动响应式获奖，视觉功能分类为提名；[Awwwards 官方索引](https://www.awwwards.com/inspiration_search/design-agencies/?page=4)展示其 2025 年 2 月 SOTM 与 Developer Award。FWA 官方页面不可访问，仅核对到[设计者一手自述](https://www.linkedin.com/posts/tahahossain_in-the-spirit-of-pausing-to-celebrate-winshere-activity-7313197791646744576-njfD)的 Site of the Day，未冒充官方验证。

已检查正式工具栏组合后的桌面、700px 与 390px 实际截图，以及目录加载/空/错误、删除确认/失败、上传反馈和 Office 配置/窗口失败。八维自审记录见 `/tmp/s09-notes/integrated.md`：字体层次、留白、主次、状态色与文字、轻动效及 reduced-motion、焦点/取消/恢复、窄屏折行及独立表格滚动、档案室视觉表达均检查，当前未识别仍未修复的本地布局差距。参考作品的获奖事实不等于本地界面获奖，不以功能测试通过替代视觉评审。外部 Office 服务本身的界面、真实渲染及授权不在本地截图验证范围。

## 真实环境边界

本轮迄今没有执行真实上传、删除、分享、打包或知识库访问。真实服务端字段、下载内容及签名、Office 跨域与渲染、部署窗口策略、非 Chromium 浏览器仍未验证；隔离 HTTP、XHR 和窗口 stub 的结果不能冒充真实联调完成。

本地工单 03、04 按已验证范围关闭；01、02 因各自导出响应未确认保留 blocked，05 因阅读请求缺失保留 blocked。用户原有 S08/AGENTS 五处未提交改动保持原样，不纳入 S09 提交。没有创建外部 issue、PR 或推送远端；后续真实取样仍等待具体登录方式与对象范围。
