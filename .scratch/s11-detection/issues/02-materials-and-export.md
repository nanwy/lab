# S11-02：工具相关资料与下载导出

**Type:** AFK

**Status:** resolved（代码及隔离验收；真实服务契约与产物仍未验证）

**User stories:** US034；F040 的相关资料子能力。

## What to build

在选中工具的“相关资料”页签中浏览目录、选择文件、下载、播放视频并批量导出ZIP。沿该工具独立资料接口贯通请求、界面、产物地址与隔离验收。范围及原始证据见[共同分析](../analysis.md)。

## Acceptance criteria

- [x] GET tools/{id}/materials/ 发送工具 id 与 parent_path，读取独立资料契约；不直接套用网盘响应、接口或对象归属。切换工具回到根目录，清空旧选择和资料，迟到响应不串工具。
- [x] 无分页表格显示名称、大小和修改时间；名称/大小/时间排序保留原语义，create_time显示与altertime排序不混淆。支持双击目录、上级、根目录及面包屑，长路径按原末三级规则展示；上级行禁止选择/下载，目录下载按钮禁用。
- [x] 文件名链接、单文件下载及命名沿原 attached 来源和原下载命名规则；视频名称打开播放器，关闭/离页释放本地资源。Office名称保持普通文本，不新增编辑器/预览器；文件类型图标和链接/文件夹/普通文件大小展示分别处理。
- [x] 选择状态及已选数量正确，空选择禁用批量导出，提交前排除上级等无效项；切目录或重新取得列表清选择，资料页签卸载清选择。POST tools/{id}/materials/export_zip/ 的 body 仅 material_ids，执行中禁重复提交。
- [x] 依据[资料契约补证](../material-contracts.md)，在适配边界只支持原消费者明确首选读取的 download_url 静态协议；不得实现 download_url/url/字符串逐个猜测。缺地址、类型错误或业务失败不显示下载成功。隔离下载核对ZIP文件字节和内容；真实唯一响应形态及真实ZIP产物保持未验证，不以fixture或点击锚点冒充真实验收。
- [x] 正常、空目录、加载、读取/导出失败、契约错误、访问拒绝及恢复可验证；错误提示一次，失败不切换数据源或伪报成功。工具/实验/账号变化、切页及关闭视频不残留旧资源和选择。
- [x] HTTP与隔离浏览器覆盖目录进退/面包屑、排序、选择/重置、单下载、视频/Office区别、ZIP参数与失败恢复、切工具交错响应；只回归直接影响的目录/阅读消费者。记录真实响应及产物的未验证边界，不执行未获授权的真实导出。

## Blocked by

[S11-01](01-tool-catalog-and-reading.md)已实际交付并验证的工具选择、详情上下文和资料页签接入点。本票按原消费者首选字段的静态分支实施并隔离验收；若该静态分支仍有无法补证的契约缺口，明确阻塞相应流程，不宣称完成。真实协议与产物验证独立记录。

## 交付与验证（2026-10-24）

- 独立 `detection-materials` 适配器只读取 `results`；文件/目录与 UI 上级行分离，`is_file` 接受 boolean/0/1，`size` 接受数值及数值字符串。`create_time` 显示与 `altertime` 排序保留独立来源，重复或哨兵 ID、文件缺地址、可执行 URL 明确失败。
- 原 `d8s` @12722200 将活动页签保存在目录层，按此保留切工具时的资料页签；资料组件按工具、路径重挂载，清旧目录、选择和播放器，Query 与导出请求离页取消。原 `Ks` @1803278 仅以 attached 的 mp4 扩展名打开视频；Office 名称保持普通文本。
- ZIP 只接受 `download_url` 非空 HTTP(S)/相对地址，不猜 `url`、字符串或无地址。可选 `status` 仅静态支持字面量 1，其他值视为契约错误；这不定义本域业务状态码，也不证明真实服务字段。错误统一提示一次，不显示“导出成功”。命名沿 `jf(attached)` 的原算法，忽略 displayName。
- 从网盘原样提取纯 `FileTypeGlyph` / `formatBytes` 到 `files/file-presentation.tsx`，两页面共享展示，不引入网盘资料对象或请求协议。
- 有效 red → green：资料读取最初返回 envelope 导致公共结果断言失败；ZIP 最初返回对象导致地址断言失败；资料页签只有待交付占位导致表格用户行为断言失败。随后逐条实现并通过。测试环境命令错误、下载 route 截获限制和排序预期纠正不计作功能红灯。
- 验证：`fnm exec --using 24.14.0 pnpm --filter @xueyuan/web test src/api/detection-materials.test.ts src/api/detection-tools.test.ts`，10 通过。`pnpm exec playwright test --config=playwright.s11.config.ts`，目录/阅读/资料 8 通过；补强名称/大小排序、精确日志筛选后资料专项 4 通过。浏览器检查没有未预期 pageerror/console.error，仅排除本资料端点精确 HTTP 500/403 预期日志。
- 共享展示直接消费者：`PLAYWRIGHT_S11_MATCH=s09-files.spec.ts PLAYWRIGHT_S11_OUTPUT=/tmp/s11-shared-file-regression fnm exec --using 24.14.0 pnpm exec playwright test --config=playwright.s11.config.ts --grep '文件类型可辨识'`，1 通过。web 类型及显式改动文件 ESLint/Prettier 通过，未运行全量测试。
- 下载验收使用独立本地 HTTP 产物服务器，实际读取单文件字节与 ZIP 下载文件，核对 ZIP 字节、PK0304 文件头与 `S11 isolated ZIP` 文件内容。Playwright route 仅隔离 API 响应，不将锚点点击或被 Vite 回退的 HTML 当成下载成功。
- 截图：`/tmp/s11-final-materials/s11-materials-相关资料目录、选择、附带命名下载和视频-Office区别/materials.png`。手动路径由共同 [测试页面与路径](../testing.md) 提供。
- 未验证：真实资料字段/空值/账号范围、本域唯一 ZIP 响应协议、真实 ZIP 实物。未访问原后端或执行真实导出；模拟与隔离文件均不关闭这些缺口。

## 审查修复（2026-10-24）

- 已修复 Standards/Spec 审查发现：文件与 ZIP 地址拒绝纯空白；同因工具附件可选空串保持合法、非空纯空白拒绝。读取与导出共用资料 ID 契约，数值 `0` 可提交，空选择、空串、`..` 及非有限数字在请求前拒绝。
- 资料/ZIP 契约错误保留脱敏端点和最多五项 Zod 字段路径/错误码，工具 ID 使用 `{toolId}`，不包含目录、原始资料内容、URL 或凭据；重复资料 ID 单独报告 `results.id:duplicate_id`。保持单次错误提示与唯一 `download_url` 静态协议。
- 每类修复先观察到公共行为红灯再实现；初次依赖缺失不计作有效红灯。HTTP 两文件 15 例通过；资料隔离浏览器 4 例通过，涵盖错误提示、恢复及真实本地产物字节；web 类型、显式文件 ESLint/Prettier 通过。未运行全量测试，未访问原后端；真实服务响应/ZIP 产物缺口保持不变。
