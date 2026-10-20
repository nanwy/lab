# 04: 模板与导入导出

**What to build:** 学员在实验入口保存设备为节点模板，通过“我的节点”浏览、拖入复用和删除，并将当前画布 DOM 导出为 PNG/SVG 视觉产物。本票属于 S06、F042 的模板/导入导出部分及 F036 的相关能力；流量模拟和镜像仍归 S08。

**Blocked by:** 03: 分组、图元与高级画布交互。

**Status:** implemented-pending-review

- [x] 入口/task_type 调用链已确认：完整拓扑模板、分块模板和拓扑文件导入在当前实验入口不可达，不新增按钮。证据见 [S06 适用范围](../../../docs/planning/s06-implementation.md) 与已有研究 `/tmp/xueyuan-s06-notes.50KSb2/contracts-02-04.md`。
- [x] 节点配置“保存并设为模板”先成功 PATCH 节点，再 POST 完整 nodeInfo 到 `/front/node/template/`，name 取 config_info.base_info.name，保留 logo/config_info 与未知字段；失败保留编辑和已成功阶段。
- [x] “我的节点”沿既有资源浏览/拖放复用，并通过 DELETE `/front/node/list/`、`{id_list:[resourceID]}` 管理。覆盖加载、空数据、失败重试与权限；删除模板不删除画布实例。
- [x] 复用生成新图元 UUID、device_id/config_info.node_id 及服务端 data_id，不串改原对象；保留节点配置，draw 保存后重新读取一致。
- [x] PNG/SVG 导出整个实际画布 DOM；产物能打开且可见节点、图标、连线。空图及导出失败明确提示，失败后保留原设计并能重试。
- [x] 写操作遵守 readOnly/shared/lock，未知副作用操作不自动重试；模板保存和删除不改变其他流量能力状态。
- [x] 定向测试覆盖节点模板保存—复用—HTTP重开、实际PNG/SVG内容、ID分离、失败恢复和权限。PNG/SVG不是可恢复设备配置的拓扑文件；“文件导入—保存—重开”因当前入口不可达而不适用，不能将视觉产物当作该闭环。
