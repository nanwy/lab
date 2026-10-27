# S15 列表、目录与视频进度补证

日期：2026-10-27。全部结论为原 bundle 静态观察/推断，没有访问真实接口、执行媒体或验证服务端业务。坐标均为 Unicode 字符偏移；查询入口为 `python3 scripts/evidence_query.py query`。原 bundle 与派生查询副本的校验由主调查统一记录。

## 入口与范围

- R006 `/basic/training/course` → `lgi @2459691`；R007 `/basic/training/course/:id` → `HEi @3598190`；路由定义 `@13323521`。详情无独立嵌套章节路由。
- 列表读取 `bF @2454827`，详情同时使用该课程 store 与 `BI` 笔记 store。路由上下文、笔记驻点与公开课学习日志属于不同对象，不能仅使用全局“当前章节”。

## 列表与准入

| 行为      | 原请求/字段与分支                                                                                                                    | 依据                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| 列表      | GET `open_courses/list/?${Vt(filter)}`；消费响应 data.results、count                                                                 | `z2n @1908120`，`bF @2454827` |
| 筛选枚举  | GET `open_courses/filter/`；category_lists → 分类，course_direction_lists → 方向；原还存 system_lists，但列表没有对应可见筛选        | `U2n @1908215`、lgi           |
| 岗位      | 复用账号 `jobList`，按id筛选；本人extend_info.position只用于提示“这是我的岗位方向哟”                                                 | lgi                           |
| 默认参数  | page=1、size=12、search空、course_direction/tag/difficulty/type/complete/position为空数组；grade第一次筛选时才加入                   | bF、lgi                       |
| 课程等级  | difficulty数字1–5，展示一星至五星                                                                                                    | `igi`，lgi前                  |
| 课程难度  | grade字符串1/2/3，初级/中级/高级                                                                                                     | `sgi`，lgi前                  |
| 类型/状态 | type数字1视频/2实验/3混合；complete字符串1已完成/0未完成                                                                             | `agi/ogi`，lgi前              |
| 编码      | 请求前tag拼接tag与course_direction，再删除course_direction；`Vt @1799924` 用重复query key编码数组，省略空字符串和空数组，保留0/false | lgi、Vt                       |
| 筛选交互  | 改筛选或搜索重置page=1；complete单选，其余多选；列表刷新200ms防抖；搜索maxLength=300；分页size可选12/24/48/96                        | lgi、`@2467200`               |
| 进入课程  | 卡片图片/名称 → `getCourseStatus` → GET `/{id}/brief/`，data.is_open真才导航；否则提示“该课程已被关闭”                               | lgi D、`q2n @1911501`、bF     |
| 空状态    | results为空显示“暂无公开课程”；卡片消费id/name/type/image/progress/difficulty/grade/tag_list                                         | lgi末尾                       |

公开课程准入不能统一写成调用can_enter：`nQr @1813382` 的 `/{id}/can_enter/` 被 `BI.getCourseDetail @3005190` 调用；笔记个人/共享驻点在跨页返回课程时读取其can_enter。列表本身用的是brief/is_open。详情HEi直接按URL读取详情与目录，没有再调用上述两种前置检查，最终错误走原请求层。

## 目录与章节

- 详情首次按id取课程详情 `qJr` 和目录 `KJr`；GET `/{id}/` 与 `/{id}/catalog/`。详情data.id成立才写入classInfo，目录只在Array.isArray(data)时写入。不能把这些原消费者条件冒充完整服务端Schema。
- `taskCourseCatalog` 无type=1时选默认小节：依次扫描顶层目录，首个非空section取其第一项；顶层项无section时直接选该项。有type=1则只刷新catalog，不自动选小节。
- `classInfo.mode===1`：目录平铺；消费小节id、name、type、video_length、finish_rate、play_count。进度为finish_rate乘100取整，0/缺值显示0%；finish_rate===1染完成色。视频章节附加播放次数。
- `classInfo.mode===2`：章标题与section子列表；消费小节finish布尔语义，显示完成/未完成，不使用finish_rate显示百分比。空目录显示“未关联小节”。
- `section.type===1`渲染视频，type===2渲染课程实验。视频可有讲义、附件、test、experiment；实验可有工具、附件、video_attachment。实验视频是独立HTML video弹窗，不走本页HLS学习日志。
- 点击章节时，如testLoading/testDetailLoading为真则忽略；否则清空taskId，切换sectionInfo；type1还POST `/{id}/catalog/{sid}/play/`增加次数，然后取目录(type=1)刷新。`fei @1911395` 是写操作，不能当播放前只读取样。
- 路由state.section_id存在时，初始目录type=1；随后HEi只在顶层t.forEach里比较ee.id，无法定位mode2的内层section。这是原可见定位缺陷，重建宜修复并记录，不应另造新路由。

## 视频与日志协议

依据：HEi `@3598190–3605500`、`YJr @1908486`、`s2e @3003249`、`FEe/Y_ @1802794`。

1. 原 `<video controls onEnded>` 没有自定义禁止拖动、倍速或播放前校验。用户主动pointerdown、seeking/seeked会影响原“异常自动暂停恢复”逻辑，但不是学习时长的业务限制。
2. 当前section有m3u8且有id时设置媒体源；未finish章节每40秒执行一次日志上报；已finish章节不设周期上报。视频结束也上报并停止定时器。
3. HLS支持分支建立HLS实例，选项enableWorker=true、lowLatencyMode=true、backBufferLength=90。FRAG_LOADED按frag.relurl记录frag.duration；同url覆盖，从而对当前缓存里的相同分片去重。它记录的是**加载的分片**，不能据此宣称已观看秒数或反作弊有效。
4. 分片map存到localStorage固定key `logData`，FEe/Y_使用AES-CBC、Pkcs7及原bundle固定参数；输出为大写hex、读取时解码。固定值位置可按偏移复查，报告不复制硬编码参数。
5. loadedmetadata取 `Math.floor(video.duration)`，写入sum_duration。上报对象为 `{video_log, sum_duration, timestamp, token}`；timestamp是毫秒时间。sum_duration为空、section id为空或video_log无key时不发请求。
6. token是MD5：原签名串将timestamp、原固定分隔串、course id、section id、JSON.stringify(video_log)、sum_duration按原顺序连接。s2e来自js-md5导出；不是AES签名。实现须按原串及JSON顺序兼容，不应猜另一个摘要算法。
7. POST `/{courseId}/section/{sectionId}/video/log/`，data.status===1视成功；成功删除整个logData，失败保留现有缓存。没有服务端去重或重试上限的静态保证。
8. 原在章节effect清理中停止定时器、重置video_log/sum_duration并删除logData；**切章/离页清理不主动最终上报**。不能写成“原必定离页保存进度”。
9. HLS fatal network→startLoad，fatal media→recoverMediaError；非fatal缓冲卡死尝试跳1秒与play，并延迟恢复；fragLoop/manifest错误尝试重新加载。原未给这些恢复设置总次数上限。
10. HLS不支持而浏览器原生支持m3u8时仅赋src，未收集分片、也没有同等loadedmetadata更新路径。因此原生HLS分支的日志闭环不能宣称已建立；保留该限制，不在S15另建跨浏览器日志方案，也不编造时长日志。

## 断点来源与边界

- HEi仅从路由state.breakpoint_time或笔记组件skipBreakPoint回调设置video.currentTime；loadedmetadata后还延迟100ms再次设置state断点。
- BI的个人/共享笔记驻点使用extend.breakpoint_time；来自课程外时先can_enter，再携带section_id/breakpoint_time导航至详情；来自当前课程则调用skipBreakPoint。
- 本范围未观察HEi从服务端“最后播放位置”字段恢复，也没有把视频currentTime存到本地用于下次自动续播。现有目录里“断点续播”应具体落为**已证实的笔记驻点跳转**，不能直接推导为关闭后自动恢复到最后播放秒数。真实服务若另有恢复契约，需取样后另记。
- “暂停”本身不触发日志上报；原onEnded才立即上报。未发现beforeunload/pagehide专门刷新日志。

## 原缺陷与实现验收约束

以下区分可据证修正的问题与原行为边界，不把每项观察都变成改造任务。实施以[最小实现边界](../../docs/planning/s15-analysis.md#最小实现边界)为准：

- 固定logData跨课程、章节、账号、标签页共享；迟到成功响应删除整个key，可能删除另一个上下文或正在累计的新分片。采用当前页面/章节内分片缓存，成功只清已提交部分即可；无需新增持久化、离线队列或多标签页同步。AES仅用于原本地缓存编码，不是后端请求契约；MD5请求签名仍按原协议保留。
- 原章节effect清理无flush并清缓存，不能宣称原来有离页保存保证。保留原上报时机，不额外增加暂停/切章/离页flush和后台补报。
- 原loadedmetadata监听由LEVEL_LOADED反复加匿名函数，未完整清理；HLS只在新源创建时销毁旧实例，未见卸载统一destroy；恢复timeout未统一取消。需要跟随课程/章节生命周期销毁，防旧回调操作新上下文。
- 请求未见版本/归属隔离，详情与目录迟到响应可污染新课程；使用既有请求取消边界。
- 路由驻点对嵌套目录定位失败，按实际目录层级修正。0秒被truthy判断忽略属于原行为，且笔记创建明确拒绝0秒；没有证据要求新增0秒驻点支持，不再列为必须修复的缺陷。
- 原章节刷新替换sectionInfo引用时可能重新创建媒体与计时；实现应按课程/章节身份管理资源，不把无关元数据刷新当换片。

## 拆票前剩余项

静态事实已足够将列表、目录、媒体与日志拆为明确任务。真实响应字段类型/必填与空值、原视频媒体可用性、服务器日志去重及进度统计、原生HLS日志兼容、未取样课程的实际目录结构仍未实测，保留记录即可；不因此增加独立平台或兼容方案建设。当前项目既有Chromium定向验证边界不能冒充跨浏览器验证。

复查命令示例：

```bash
python3 scripts/evidence_query.py query --offset 2459691 --context 7500 --max-chars 15500
python3 scripts/evidence_query.py query --offset 3603400 --context 5100 --max-chars 10500
python3 scripts/evidence_query.py query --offset 3612800 --context 2500 --max-chars 5400
python3 scripts/evidence_query.py query --text 's2e=' --context 900 --limit 5
python3 scripts/evidence_query.py query --text 'FEe=' --context 600 --limit 2
python3 scripts/evidence_query.py query --text 'nQr(' --context 450 --limit 5
python3 scripts/evidence_query.py query --route /basic/training/course/:id
```
