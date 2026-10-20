# 原 bundle 与逆向证据的有界查询

原始 bundle、REA Evidence、页面代码索引、API 表和路由表都保留为不可变的事实源。日常调查通过仓库外的 `rea-analysis/xueyuan/query-bundle/` 查询副本完成，避免压缩后的超长单行或单行 JSON 整体进入上下文。

## 生成与验证

```bash
pnpm evidence:generate
pnpm evidence:verify
```

生成器按 65,536 个 Unicode 字符建立无重叠 `.txt` 分片，并在 manifest 中保存每片的 byte、Unicode、UTF-16 全局范围和 SHA-256。`verify` 要求：

- 所有分片按顺序拼接后与原件逐字节相同，整体 SHA-256 不变；
- 重组后的 JavaScript 通过 `node --check`；
- 页面代码索引绑定的 bundle SHA、全局偏移、symbol snippet 和 route excerpt 仍与原件一致；
- Evidence 父子引用、application graph 的 node/edge/root 引用可解析；
- feature、route、story、API candidate 和 Evidence record 数量未漂移。

分片是查询数据，不是独立 JavaScript 模块。不得单独执行，也不得用业务摘录替换原始 bundle。

## 查询

统一入口默认最多输出 8,192 个 Unicode 字符，硬上限为 65,536；异常时直接失败，不回退为全文输出。

```bash
# 按功能、路由、API、符号或 Evidence 查询
pnpm evidence:query --feature F001
pnpm evidence:query --route /login
pnpm evidence:query --api /api/front/user/info/
pnpm evidence:query --symbol Ppi
pnpm evidence:query --evidence-id ev_eee5b8cdca3dce16a76218bec4abf98a2bfbafed17b9fb7f1eee2ef62c86885d

# 按原有全局偏移读取；默认单位是 Unicode 字符
pnpm evidence:query --offset 2425935 --context 1200
pnpm evidence:query --offset 2426203 --unit utf16 --context 1200

# 跨分片文本搜索；不会漏掉恰好跨越分片边界的字符串
pnpm evidence:query --text 'Ae=ul.create' --context 1000 --limit 3
pnpm evidence:query --source evidence --text 'coverage' --context 400 --limit 5
```

`--source` 可选 `bundle`、`evidence`、`page-map`、`api`、`routes`。扩大输出时显式传 `--max-chars`，但不能超过硬上限。已有规划索引默认使用 Unicode 字符偏移；少数架构补证使用 UTF-16，查询时必须明确传 `--unit utf16`，不能把字符偏移当成 byte offset。

## 文件职责

- `raw/*/chunk-*.txt`：固定大小、无重叠、可精确重组的物理分片。
- `views/features/F*.json`：按 49 个功能组织的业务入口。
- `views/routes/R*.json`、`views/stories/S*.json`：路由和故事入口。
- `views/api-inventory.jsonl`：一行一个 API candidate，避免单次文本命中输出整表。
- `views/evidence-records.jsonl`：Evidence 关系、coverage、限制、unknown 和图计数摘要；完整内容仍从原文分片查询。
- `views/shared-symbols.json`：被多个功能引用的共享原始符号，不复制或假定模块边界。

派生目录不进入应用仓库。原件内容变化后，查询会因 SHA 不一致而拒绝执行；重新生成并通过全部门禁后才能继续使用。
