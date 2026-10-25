# S13-02：剧本蓝军编排与终端配置

**Type:** AFK  
**Labels:** ready-for-agent  
**Status:** todo  
**User stories:** US035；F041 模拟蓝军；R089 内部流程  
**Blocked by:** [S13-01](./01-entry-and-initial-situation.md)

## What to build

从选中剧本蓝军完成编排图、连线/判断/分支、能力动作、已有模拟节点配置和终端管理；保存后可重新打开核对。

本票内子流程一起交付，不再拆成独立基础设施或配置抽屉票。

## Acceptance criteria

### 剧本编排画布保存闭环

- [ ] 通过剧本详情?source=2确定scenario身份，读取draw.topo_json；保留节点/边业务字段与原形状、标签、端口及坐标，不能挪用实验拓扑保存协议。
- [ ] 提供原开始、数据分支、判断、指令能力动作、结束五种拖拽形状；拖放即提交，连接先更新本地、显式保存再提交；右键删除边保留原本地更新语义。
- [ ] 无配置弹窗打开时Delete/Backspace删除选中元素并提交；清除有确认并提交空图；POST采用data.topo_json，失败保留草稿且不提示成功。
- [ ] 已有type7/type8节点保留数据与显示；type8配置由本票模拟节点子流程交付；type7右键明确说明原链缺失，不调用缺失方法、不增加创建形状或自造指令库接口。
- [ ] 为本票各配置子流程提供按nodeData.data.id及edgeData.data.id打开配置的接点；切剧本和离页清图、监听及旧请求，不修改原剧本数据归属。
- [ ] 浏览器验证拖放/连接/保存重开、键盘与右键删除差异、取消/确认清除、保存失败保留、type7不崩溃及切实验不串图；本票全部配置子流程交付前不宣称编排整体完成。

### 编排连线判断与数据分支

- [ ] 连线GET/POST使用连线业务ID；weight允许0且为0–100整数，brief最多50字，sign成功/失败；保存更新边数据、标签、样式并提交draw，备注优先作标签。
- [ ] 判断读取last_variate与decision；恢复data_define_id/id/value，提交data_list；支持加删行，遵守原添加前完整检查，不发明保存时新的必填规则。
- [ ] 分支加载branch、branch/action、last_variate及数据类型；提交data_list和transform_list全部字段；匹配、下一步动作、转换规则和select_defines按原表单校验。
- [ ] 配置保存失败保留输入、不得更新图或执行后续成功回调；修正原branch在status=2仍return true的缺陷并写差异记录。
- [ ] 浏览器验证连线0权重及重开、判断多行、分支匹配/转换与无效输入、业务失败不误成功、切节点清理；所有检查属于本票。

### 编排能力动作与指令参数

- [ ] 读取instruction/cascade与action；POST action_id后刷新指令、同步节点名称/背景并保存图；status=2不得进入成功回调，记录原错误return true差异。
- [ ] 指令分页消费results/count，启用PATCH use；双击优先级编辑，Enter/失焦PATCH weight并重读；范围0–100000整数；修正原分页未定义filter错误。
- [ ] 执行次数UI0–10整数，PATCH retry_count；原详情没有回填retry_count的适配证据，明确记录原行为，不能猜字段来源或为样例补必填值。
- [ ] 能力输入/输出详情从subtolgy读取，按field_type递归展示参数与样例，不自造执行或运行接口。
- [ ] 浏览器验证选择能力后重开、指令翻页、启用/优先级/次数请求、失败保留和无假成功、递归样例、切节点清理；未验证服务端持久性如实记录。

### 已有模拟节点的工具与上传配置

- [ ] 仅已有type8右键可进入；GET behavior_simulate与工具版本cascade；不增加原拖拽栏没有的创建形状。
- [ ] 名称trim非空、最多50字，独立rename成功后同步图；工具模式选工具及版本，提交tool_detail为tool_id/version_ids，选择整个工具包含全部版本。
- [ ] 上传模式POST FormData file与mode=behavior_simulate，只有status=1取data.url；可移除文件；提交tool_detail为file URL。切模式清工具与文件，至少配置一项。
- [ ] 解释器bat=1/bash=2/Python=3；content不额外设必填。实验入口没有topo_params，不显示执行节点或读取拓扑，不将topo_node新增为必填。
- [ ] 浏览器验证工具多版本、上传实际文件请求及失败、移除/切模式、rename和重开；关闭/切节点清请求和表单；不执行真实上传或工具。

### 剧本终端提取分页与删除

- [ ] 按scenario身份读取instruction/terminal和terminal分页，消费results/count；系统与工具展示使用tool__name/version__name，不混读智能终端字段。
- [ ] 提取共性终端POST common，status=1才刷新；status=2提示失败，不假装已经创建终端。
- [ ] 删除有确认，成功后重读；末页仅一行且page>1时退一页；失败保持当前列表与选择。
- [ ] 编辑弹窗和PATCH定义无可达打开事件，本票不新增编辑、控制台、启动或接入网络按钮。
- [ ] 浏览器覆盖空数据、提取/删除正常与失败、分页及末页删除、切蓝军隔离；卸载清适配终端/列表/页码/详情/表单/错误。

## 证据与共同约束

必读[本地票索引与共同验收](../README.md)、[S13主分析](../../../docs/planning/s13-analysis.md)、[配置补证](../../../docs/planning/s13-configuration-evidence.md)。以下按子流程定位原符号与协议，实施时按有界查询复查原件。

- 配置补证“可编辑编排画布”“已有type=7”，Dgo/Lgo、B2n/eXr。
- 配置补证“连线vgo”“判断ygo”“数据分支bgo”；区分画布ID与业务ID。
- 配置补证“动作能力_go”，Ug/action/instruct/级联及subtolgy消费者。
- 配置补证“已有type=8模拟配置Mgo”；原已有节点范围。
- 配置补证“蓝军终端”“终端编辑可达性已闭合”，Bgo。

本票包含全部子流程所需适配、UI及定向验证。失败/拒绝/合法空值、重复操作与旧请求清理按共同规则验收；合并票后检查覆盖本票直接影响范围，不按子流程反复跑同一检查，不默认全量check。真实写入不在授权范围，不得把原缺失链或真实联调标成已完成。
