# S15 章节测试、课程实验与环境补证

日期：2026-10-27。仅静态证据，没有运行原 bundle、请求真实接口或验证账号权限。下列偏移均为原 bundle 的 Unicode 全局字符偏移，通过 `python3 scripts/evidence_query.py query ...` 获得；字段消费不等于后端必填 Schema。

## 已回答的调查问题

| 问题                         | 结论                                                                                                               | 证据                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 章节测试有哪些题型、如何保存 | `option_type` 1单选、2多选、3判断；每次选择POST `{option: string[]}`，成功才更新本地答案；整节提交和重置独立请求   | bEi @3557490附近；bF @2454827                                     |
| 实验页面是只有Flag吗         | 否。普通视频节通过PEi“本节实验”弹窗，实验节通过BEi正文接入h3；含检查点、题目作答、环境、手册、附件及控制台         | PEi @3590200、BEi @3592900、h3 @3588890附近                       |
| 能复用S07整套环境API吗       | 不能。S07适配固定topo_id/task_type6；课程是resource_type16独立env协议，需要新增课程环境适配。文本/图形控制台可复用 | `apps/web/src/api/topology-runtime.ts`；wEi @3565679；S07记录票01 |
| h3六类型是否都闭环           | 映射六种test_type，但confront的check/上传在课程调用方缺submitCheck/checkUrl，不能宣称闭环                          | h3、kEi @3582722；BEi/PEi完整props                                |
| 需要提前实现S18吗            | 无此证据。S18的_He/wHe入口与课程h3不同；可共用控制台、日后提取真正相同协议，不把task_type6参数改名冒充课程         | 实施计划S15/S18边界；现API；原wEi协议                             |

## 章节测试：独立于实验检查点

公共课程前缀 `P=/api/front/learn/task/self_study/open_courses/{courseId}`。

| 动作         | 请求                                                                       | 响应消费与UI                                                                                           |
| ------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 取整节题目   | GET `P/section/{sectionId}/test/?size=1000`                                | bF消费顶层`results`，页面消费`done`及各题`id/name/option_type/content/user_option/status/answer/parse` |
| 保存某题选择 | POST `P/section/{sectionId}/test/{questionId}/`；body `{option: 选项数组}` | `status===1`才写本地克隆结果；已done直接返回，不允许继续作答                                           |
| 提交整节     | POST `P/section/{sectionId}/test/finish/`；无显式body                      | `status===1`提示提交成功，并重新GET整节题目；`status===2`提示message                                   |
| 重新测试     | POST `P/section/{sectionId}/test/reset/`；无显式body                       | `status===1`重新GET；不显示额外确认框，也未见客户端重试次数限制                                        |

`done`后禁选，按钮由“提交答案”变为“重新测试”。结果`status===1`显示正确，`===0`未答，其余错误；不是正确时展示答案，始终显示解析。无题时显示“该小节暂无自测题”。未见“必须全部作答才可提交”的客户端拦截，不发明额外必填或计分规则。

证据：API函数nei/rei/iei/aei @1909608–1910150附近；bEi @3557490附近（查询@3556900前后1800、@3559000附近）；bF相关方法@2457000–2458300。

## 实验与检查点

### 可达链路与ID

- 视频小节type1且`experiment`真时，HEi工具栏显示“本节实验”，PEi读取当前节operate列表；实验小节type2在正文渲染BEi。
- `courseOperat` GET列表后把`taskId`设为首项ID；BEi/PEi只渲染该taskId的一个h3。本次查到的两完整调用体未发现可切换其他operate项目的UI，不据“返回数组”扩展选择器。
- `courseId → sectionId → operateId → checkpointId`各有独立请求归属。h3接`resource_type:16`，practice.id初期用operateId，后续以GET详情为准；环境`resource_id`取这个practice.id，不能传courseId或topoId。
- h3映射`experiment:0 / ctf:1 / through:2 / loophole:3 / scene:4 / confront:5`。此映射仅证明渲染分支存在，不证明真实课程数据包含每个值，也不证明缺失回调分支可用。

### 请求与完成状态

令`O=P/section/{sectionId}/operate/{operateId}`。

| 动作           | 请求                                                                   | 当前课程调用链                                                |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| 操作项目列表   | GET `P/section/{sectionId}/operate/?nopage=1`                          | QJr，设首项taskId                                             |
| 操作项目详情   | GET `O/`                                                               | XJr，r.id存在时写practice                                     |
| 检查点列表     | GET `O/checkpoint/?nopage=true`                                        | oei；回调传`{nopage:true}`，最终编码以Vt为准；数组写checkList |
| 检查点题目详情 | GET `O/checkpoint/topic/{checkpointId}/`                               | sei，消费题目对象                                             |
| 检查点作答     | POST `O/checkpoint/topic/{checkpointId}/answer/`；`{option: 选项数组}` | lei，status1成功，随后重读详情                                |
| 检查点提交     | POST `O/checkpoint/topic/{checkpointId}/finish/`                       | uei，status1后重读详情/检查点并将本地操作项目done设true       |
| 检查点重置     | POST `O/checkpoint/topic/{checkpointId}/reset/`                        | cei，status1后重读详情/检查点并将操作项目done设false          |
| Flag提交       | POST `O/checkpoint/flag/{checkpointId}/finish/`；`{flag: 输入文本}`    | dei，status1清输入、重读检查点，并将操作项目done设true        |

API证据@1908803–1911200；课程调用方PEi/BEi@3590200–3594900；bF@2454827；TEi/OEi@3577500–3580880。

旧API包装中还有`self_test`列表/详情/finish、flag/info，以及store的getCourseTestList等；BEi/PEi实际接给h3的是`checkpoint`系列，不能把候选URL清单的全部包装都列为这条课程入口必须调用的请求。

### 分支与权限

- `through`且`extended_content.stage_mode`真时，跳到第二及之后的关卡要求前一项done，否则提示“请先完成上一关卡”。
- checkpoint.mode1/2使用Flag；done后禁输入及提交。没有客户端Flag非空校验。
- mode4使用题目详情，option_type同1/2/3；done后禁止作答/重复提交；resource_type15/16才显示重新测试，本课程16符合。
- mode3标签显示check，但实际check按钮还要求`moduleType===5`（confront）。不能把所有mode3都当有可点击check。
- `fromModule==='practical_train' && prohibited`的禁用逻辑存在于共享组件，但课程未传这两个值，不能凭共享组件推断公开课程有该规则。
- 实验手册普通路径：EEi根据write_up/write_up_option/write_up_time显示手册或倒计时，xEi读envVisible.manual。write_up_time结束1.1秒后刷新practice。课程handleBuy为空函数，不能发明购买接口。
- 关卡手册路径另有接线缺陷，见下文；附件为tool_attachment/question_file/test_environment.attachment直接下载。

## 课程环境协议与状态机

证据：wEi @3565679及后续；cf store @3560000附近；API lYr/v2n/y2n/z1/PI/fYr @1808416–1809000。

| 动作          | 协议                                                                   | 语义                                                     |
| ------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| 运行环境列表  | GET `/api/front/env/runs/?nopage=1&shared=false`                       | 首次进入查询；启动/释放成功后store再刷新列表             |
| 状态查询      | POST `/api/front/env/status/`                                          | status1时写data为envStatus，返回data.status              |
| 启动          | POST `/api/front/env/start/`                                           | status1后刷新环境状态                                    |
| 释放          | POST `/api/front/env/stop/{runId}/`；body `{run_id,resource_type:16}`  | 成功500ms后重读状态；也是倒计时结束回调                  |
| 延时          | POST `/api/front/env/delay/{runId}/`；body `{run_id,resource_type:16}` | 不带delayed_time输入，成功重读状态；不能发明延时时长表单 |
| 节点状态/刷新 | GET `/api/front/scene/{runId}/status/?task_type=16`                    | envStatus.status3且run_id存在时读取；手动刷新复用        |

状态/启动body共同字段：`resource_type:16,resource_id:practice.id,env_type:currentCheck.task_type,env_id:currentCheck.task_type===1?currentCheck.env:currentCheck.topo,start_type:2,assist:{start_new_type:1,...}`。through(moduleType2)在assist额外带`check_id:currentCheck.id`；confront(moduleType5)额外带`confront:true`。课程调用方未传额外assist，因此不补course_id/task_id等猜测字段。查询的share取`practice.shared||false`；启动的share取`practice.test_environment.shared||false`，原代码来源不一致，应明确保留证据，实测前不能把它们随意合并。

moduleType非2在进入后约200ms触发状态请求，through在当前检查点ID改变后约100ms触发；状态2/5每2秒重查。1/4显示启动，2显示启动中，5释放中，3显示已运行资源、倒计时、释放/延时/刷新。原组件卸载清timeout及共享cf状态；不能把清本地状态当远端释放。自动倒计时使用`times`秒，结束会发释放请求（包括shared环境），手动释放仅`!practice.shared`显示；这是待真实联调验证的原副作用边界，不能在真实补证阶段播放/进入环境来“只读检查”。

资源展示过滤bridge_net；课程resource_type16显式允许地址、账号、控制台展示（共享组件其他业务可受network/account_type/vnc裁剪）。节点字段消费：float_ip、system_user、app_user、type、console_type、name、console_port；这些不是所有节点必填。

### 控制台可复用能力

- 节点docker/docker_webide→文本docker；vpcs/dynamips/qemu→文本vpcs；libvirt系列console_type=telnet→文本vpcs，否则打开`#/kvmvnc/vnc/{nodeId}/{name}`。其他类型原使用`console_type://domain:console_port`，不擅自归并成VNC。
- 现`api/terminal.ts`已有textConsoleType、textConsoleHref、连接参数校验与WS路径；`api/desktop.ts`已有desktopHref等；`router.tsx:522`、`:541`、`:553`有文本、图形、fullscreen入口。可复用这些连接消费者，课程环境节点ID必须来自新适配的scene响应。
- 现`api/topology-runtime.ts`是`/front/topo/{id}/...task_type=6`协议；既没有env/start/status/delay/stop，也没有课程环境状态1/2/3/4/5契约。S07实施记录明确学习/考核环境归后续消费者。报告不得将“共享原cf”写成“当前仓库已有通用cf服务”。
- 当前课程链未发现操作机配置/调用，不以S07存在操作机全局面板为由给S15新增操作机业务。

## 已证明的缺陷与不可凭空补全的链路

1. **confront缺回调/上传URL**：kEi的check会调用submitCheck，防御上传会向checkUrl发POST；但BEi/PEi传给h3的完整props都没有这两个参数。因此六种test_type映射不等于六类操作完整可用。已有通用`cf.submitCheck`的`/api/front/task/loophole_range/check/`并不自动构成课程协议，不能拿它填空。实现应显示明确不可用原因并记录原缺链；若要补齐真实业务，仍需独立协议证据。
2. **关卡解答手册状态错域**：kEi调用`cf.changeVisible('quill',true)`写envVisible，NEi却读cf.visible.quill；NEi关闭还调用不存在的cf.envUpdates。全bundle有界文本查询envUpdates只返回这个selector/消费共3个位置。普通xEi/manual链正常。修复已有手册可见语义不需要新接口，但必须记录原行为/修正。
3. **事件及异步清理风险**：kEi注册resize监听未返回移除；wEi只清当前timeout，已在途status请求回来仍可能再排timeout或覆盖新环境；释放后的500ms timeout未登记清理。应按课程/章节/操作项目/检查点上下文隔离请求与状态，不照搬缺陷。
4. **操作项目完成状态过度乐观**：单个Flag或题目finish成功即将整个taskList当前项目done设true，不等同于全部检查点完成、更不等于后端整课进度已完成。还原时保持已确认的展示含义，真实归属/完成规则需实测，不拿本地布尔值伪造服务器学习进度。

## 未实测与拆票结论

已足够拆出章节测试、课程实验/检查点、课程环境与控制台三条可执行闭环；必须在票里显式写明confront缺链，不以共享组件候选能力冒充正式交付。没有新的产品范围决策需要用户回答。

未实测：真实响应类型/空值/必填字段、课程实际包含的test_type/checkpoint.mode、状态1/4实际原因、评分/重试/次数规则、环境共享share差异、自动释放/延时服务端语义、控制台可用性与授权。根据已确认口径，隔离实现验收和真实联调分别记录。

复查入口示例：

```bash
python3 scripts/evidence_query.py query --offset 3556900 --context 1800 --max-chars 4000
python3 scripts/evidence_query.py query --offset 3565679 --context 7200 --max-chars 15000
python3 scripts/evidence_query.py query --offset 3594600 --context 1700 --max-chars 3700
python3 scripts/evidence_query.py query --text 'async function nei' --context 3300 --limit 1 --max-chars 7000
python3 scripts/evidence_query.py query --text 'envUpdates' --context 100 --limit 4 --max-chars 1100
```
