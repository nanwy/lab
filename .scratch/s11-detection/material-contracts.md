# S11 资料契约只读调查

2026-10-24；未访问原后端，未修改仓库。依据为有界 evidence_query 查询的原 bundle Unicode 偏移，以及仓库已存 S09 实测记录。

## ZIP 结论：独立域仍缺证

- HZr @1829805 定义 POST `/api/front/wqzb/detection_front/tools/${id}/materials/export_zip/`，body 只有 `{material_ids}`；@1830023 仅映射 `E2.exportFile`。
- 全 bundle 查询 `HZr` 只有上述两处，`E2.exportFile` 仅命中 w2 @12707907。该消费依次尝试 `download_url || url`、直接字符串，以及没有链接也提示“导出成功”。这是旧消费容错逻辑，不能确定唯一响应形态；`filename` 也只有候选读取，不能证明必填、可选或空值语义。
- `materials/export_zip/` 另一个命中 @1919241 属于 guidance_control/training_task 的阶段资料接口；URL、对象归属不同，不能证明检测工具域。
- Evidence 有界检索 `detection_front` 未命中。仓库未发现本域 schema、HAR 或响应取样文件。
- `docs/planning/s09-implementation.md` 的“获准的最小写入取样”确认的是公开 resource_network_disk 与个人 my_profile/files 两端点：HTTP 201/200，`status:number,message:string,download_url:string`；公开 ZIP 实体 2,690,756 字节且文件头 PK0304。该记录明确协议来自实际端点取样，不能向 detection_front 域外推。个人 ZIP 实体也尚未验证。

需要区分“可实现的静态支持协议”和“实际服务唯一协议已确认”。本域原消费者明确首选读取 download_url，可以据此将本次实现限定为唯一支持 download_url:string 非空的窄协议，拒绝 url、直接字符串和无地址对象，不保留候选探测。这有本域直接消费证据，与凭 S09 类推有实质区别；先前建议必须禁用整个入口过严，已更正。

隔离测试可验证该静态分支、请求 material_ids 及 ZIP fixture 字节；fixture 不证明真实服务响应或真实产物。文档应写“仅支持原消费首选 download_url 静态协议，真实服务唯一形态及产物未验证”，不能写“已取样确认唯一协议”。本轮明确将静态分支实现与真实取样分层验收：票02只支持有本域直接依据的 download_url，拒绝其他候选；真实唯一形态及产物持续记录为未验证，不勾选为已取样。该约束已同步到分析与票02。name/account 等字段同样来自静态消费，但只有单一读取来源；ZIP 同一消费者显式存在三种候选形态，因此对“唯一实际形态”无法作同等肯定。

真实 POST 属于生成产物，当前未授权执行。

## 资料响应与字段：消费约束，不是实测类型

UZr @1829751：GET tools/{id}/materials/，params 原样传入；c8s 以 `{id:tool.id,parent_path:directory}` 调用。w2 @12707560 直接读取 `data.results`。没有 count、分页字段需求；原表格 pagination:false。

| 字段        | 本域静态事实与限制                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id          | 原表格 rowKey、选择值、material_ids 来源；未对真实条目做数值运算，没有证据锁定 string 或 number。前端自己插入的上级行 id='..' 不能证明服务端 id 类型。 |
| name        | `.split('.').pop().toLowerCase()`、`localeCompare` 和标题显示；消费要求字符串。没有空值兜底。                                                          |
| path        | 双击目录 `b(S.path)`，与 '..' 比较；请求 parent_path 及面包屑按 '/' 分割。消费要求目录 path 为字符串；没有真实文件 path 空值证据。                     |
| attached    | 文件 href、视频 URL、Ks 类型判断、jf 命名唯一来源；真实文件的消费要求可用字符串。前端上级行人为置 null，不能据此宣称真实目录 attached:null。           |
| is_file     | 只做真假判断，目录下载禁用；前端上级行人为置 0。未证明服务端 boolean 或 0/1，可在本域边界以消费真值协议进行显式校验归一，但不得以网盘类型为据。        |
| size        | `i0(size)` 先 parseFloat，排序 `a.size-b.size`；消费能接受数值及数值字符串，真实响应类型未定。前端上级行是 0。                                         |
| type        | 仅 `type === 'text/plain'` 控制文件名锚点 download；未证明服务端必填或可为空。前端上级行是空串。                                                       |
| key         | 排序时用 key==='..' 排除上级；真实 rowKey 仍是 id。无法证明真实条目必有 key；不要将 key 当 id 替代来源。                                               |
| isLink      | 只做真假判断控制链接图标及隐藏大小；未证明实际 boolean、number、可选/空值。上级行甚至没提供该字段。                                                    |
| create_time | 仅用于修改时间列原值显示；字符串最合理但静态 ReactNode 消费本身不证明类型/空值。                                                                       |
| altertime   | 原时间排序直接 `.localeCompare`，消费要求字符串；不可与 create_time 合并或用后者兜底。前端上级行为 ''。                                                |

前端上级行是原 w2 自行 unshift：`{disabled:true,altertime:'',attached:null,id:'..',size:0,is_file:0,name:'..',parent_path:'..',path:'..',type:'',key:'..',is_show:0}`。这是 UI 合成模型，须在服务端模型解析后另建，避免把其空值与哨兵类型混入后端契约。

## 下载命名补证

jf @1800433 只接收一个参数；c8s 虽调用 `jf(C.attached,C.name)`，第二参数被忽略。逻辑：取 attached 最后一个 '/' 段，按 '.' 分割，取第一段名字；若含 '_'，去掉最后一个 '_' 段；后缀直接取 split 的第 2 段；返回 `${name}.${extension}`。这不是按条目 name 重命名，亦不是 S09 的另一个 $E 帮助函数规则。原 c8s 明确使用 jf，不能无意替换成网盘命名。
