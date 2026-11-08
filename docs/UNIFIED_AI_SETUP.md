# PW AI 统一聊天与参考范围

更新：2026-11-08，Asia/Kuala_Lumpur。本说明取代旧版 General / Notes / Expenses / Tasks 聊天 Tab 的界面流程。

## 本轮实现

- 一个全局 PW AI 入口、一条对话流；新对话默认自动范围，各页面的全局按钮不再自动切换助手。关闭和重新打开保留当前会话，换页面也保留；新对话清空消息和参考，退出或换账号清空全部内存状态。
- 参考范围位于输入框上方，支持我的笔记、最多三篇指定笔记、全部/指定任务、支出月份及条件；不同模块可以组合。指定笔记与“我的笔记”互斥，任务与支出各保留一组条件。
- “＋参考”打开选择面板，条件只在面板内出现；保存后收起为可修改、可移除标签。移除全部标签恢复自动范围。修改范围不会隐藏旧消息，每条问题保留自己的范围快照。
- 新问题只携带同一范围内的近期会话历史，防止把已排除资料的旧回答送入新请求。旧消息仍在界面可见，旧回答不作为当前业务事实。
- 回答按需显示 SQL 支出统计、任务进度/查询结果、笔记匹配片段和实际来源。每个回答注明本次查询过哪些模块，普通对话明确显示没有查询应用资料。检查过但没有结果的模块仍显示在“本次查询”中，不伪装成成功找到来源。
- 笔记和任务页面新增“询问 PW AI”入口，自动带上对应标签；笔记在发送前等待现有自动保存，并使用最新已保存版本。全局入口始终维持当前统一会话，而不是自动引用正在打开的笔记。
- 顶部提供新对话、展开/收起、关闭；手机使用全屏宽度。语音按钮仅显示前端提示，不录音、不申请麦克风权限、不发送音频。
- 电脑资料展示“连接文件夹”入口和未接入说明，按钮不可用。不读取文件、不保存路径、不假装已建立连接。长期资料连接与当前参考选择保留为不同概念，真正的本地索引与连接管理待后续实现。

## 各资料的查询方式

### Notes

指定笔记继续使用现有只读版本校验和富文本转换，最多 12,000 个 Unicode 字符。我的笔记使用新 SQL 从标题、正文和清单进行字面关键词检索；富文本先提取可见文字，不把样式、JSON 字段名等当成正文。查询覆盖当前账号全部笔记，而不是最近一页。

查询词最多 8 个，采用不区分大小写的全部关键词匹配。英文和中文有简单停用词处理；引号内的词优先。返回最多 5 篇真实匹配笔记，每篇最多 1,500 字符片段，正文中的匹配位置附近优先；找不到关键词时显示无匹配，不能编造笔记。普通查找没有关键词时返回 5 篇最近笔记；计数和概览使用下面的独立查询，不受 5 篇搜索结果限制。

2026-11-08 笔记数量/概览修复：

- “how many notes do I have and what is each of them about?”、“我有多少篇笔记，每篇讲什么？”识别为整库概览，不把 how/many/each/them 等问句词当成搜索关键词。带明确主题的数量问题（例如 about TAI）仍查询相应主题，不把主题条件丢弃。
- `get_workspace_note_overview` 返回当前账号可见笔记的精确总数。只问数量时不返回正文；要求概览时每页 10 篇、每篇最多 1,200 字符的已保存内容摘录，模型逐篇简述本页。按创建时间和 ID 稳定排序，完整数量不受分页限制。
- 页面独立显示“已保存笔记总数”和本次页范围；有下一页时显示“继续查看笔记”。翻页使用整库内容指纹；笔记新增、删除或编辑导致指纹变化时提示重新从第一页读取，不把不同版本的页拼成完整清单。翻页动作将当前参考收窄到“我的笔记”。
- 搜索结果同时保留 `libraryTotal`（全库数量）、`total`（匹配数量）和实际摘录数量；0 个匹配不代表笔记库为空。指定笔记只有一条来源，不能由此推断全库只有一篇。
- 发给模型的 `reference_scope` 明确区分 automatic / selected，并给出本次已授权、成功读取的模块。空参考数组表示自动选择，不是缺少权限。真正的登录、权限或查询失败在调用模型前返回应用错误；成功的空结果不能编造为权限不足。
- 对模型回答中明确的权限编造（包括 read:notes）和常见的错误总量断言增加校验；触发时用本次数据库数量及真实摘录构造回答，再保存重试缓存，不再额外调用模型。不把这种文本校验当成完整的语义证明，实际概览质量仍需线上验收。

以上描述原有查询路径。新增三模块关键词＋语义混合检索已接入同一个会话，通过 `PW_RETRIEVAL_ENABLED` 开关启用；精确计数、概览、任务重点和金额统计继续使用结构化 SQL。向量迁移、后台队列、Secrets、实测与部署步骤见 [HYBRID_RETRIEVAL_SETUP.md](HYBRID_RETRIEVAL_SETUP.md)。未启用新开关时，保留上述原有行为。

### Tasks

今日重点和指定任务内容继续复用 `get_task_insights`。一般任务查询使用新 `query_workspace_tasks`，支持完成状态、优先级、标题/描述关键词及提醒起止日期；总数覆盖全部匹配记录，最多显示 30 项。

日期是提醒日期，不能说成截止日期或逾期。已有主任务及子任务完成状态分别读取；拆解只输出建议预览，不自动写入。来源仍按当前账号重新读取，编辑草稿不会被替换。

### Expenses

2026-11-08 后续修复：统一参考已支持日期范围、多月趋势及任意基准期间，不再限制单月。默认全部日期，支持英文月份解析，纯计数直接用 SQL 答案。当前实现和上线步骤见 [支出范围修复说明](./EXPENSE_RANGE_SETUP.md)；下面的首版月度限制已被本次实现取代。

复用 `get_expense_insights`，精确金额和统计由 SQL 计算，模型只解释。当前仍支持月份、分类、描述和小额阈值；本月同比上月同期、历史月份比较整月。单据样例不是全部账单，模型不能用它们重新心算总额。

显式选择的日期和条件限制查询范围。用户问题可在范围内进一步缩小，超出范围时提示修改标签。支持日/月趋势及任意日期期间，不能把未查询的期间说成零记录。

## 自动范围与协议

前端统一发送：

```json
{
  "type": "workspace",
  "version": 1,
  "references": []
}
```

空数组表示自动，非空表示允许范围。参考类型：

- `{type:'notes'}`：当前账号笔记库；翻页请求内部可附 offset 和整库 version，不需要用户手填。
- `{type:'note',id,version}`：一篇已保存笔记。
- `{type:'tasks',taskId:null|uuid,status:'all'|'unfinished'|'completed',priority:'High'|'Medium'|'Low'|'',search,from,to}`。
- `{type:'expenses',month:'YYYY-MM',category,search,smallAmount:'20.00'}`。

第一版自动路由使用服务端中英文规则，不调用额外模型做规划：明确的笔记查找→笔记检索，任务/今日重点→任务查询，消费/支出→精确统计，普通问候或一般知识问答→不查资料。同一范围的简短追问可借助上一条用户问题判断模块；自动支出解析本月、上月及明确年月，今天的任务查询可以按提醒日期筛选。

这不是通用自然语言查询器，复杂日期、表达歧义、多个时间段或未识别的意图可能需要用户补充或手动选择参考。后续可增加受约束的模型工具规划，继续通过相同权限边界执行，而不是把模型生成的任意 SQL 直接运行。

显式选择只允许其中的模块，用户文字或历史消息不能扩大范围。所有查询使用当前用户 JWT + Supabase 公钥、显式 user_id/auth.uid() 和既有 RLS；管理凭据只用于现有 AI 额度登记。无写入工具，笔记文字和历史对话都不是 system 指令。

返回 `workspace: {schema:'pw-workspace-v1',scope,checked,cards}` 及服务端构造的 sources。客户端复核范围、各模块报告和来源匹配。重试重新读取授权数据，完整事实进入请求指纹；变化时提示 AI_WORKSPACE_CHANGED 并以新请求重试。旧客户端的单模块 context 仍可使用。

## 上线

1. 确认已执行原有 AI 额度、Notes、Expenses Assistant SQL。上一轮任务助手若尚未运行，先执行 [任务 SQL](../database/migrations/20261108_tasks_assistant.sql) 及对应 verify。
2. SQL Editor 运行 [20261108_workspace_assistant.sql](../database/migrations/20261108_workspace_assistant.sql)，无需 UID，不修改现有记录或 RLS。
3. 运行 [20261108_workspace_assistant_verify.sql](../database/migrations/20261108_workspace_assistant_verify.sql)。三个函数每行均应为 **false / true / false / true**；随后 notes/tasks/subtasks 的 RLS 均应为 true。
4. 执行 [20261108_notes_overview.sql](../database/migrations/20261108_notes_overview.sql)，再运行 [20261108_notes_overview_verify.sql](../database/migrations/20261108_notes_overview_verify.sql)。两个函数每行均应为 **false / true / false / true**，notes RLS 为 true。已经上线统一聊天的项目本次只需执行这组增量 SQL，无需重跑之前的迁移或配置新权限字符串。
5. 执行 [20261108_expense_range.sql](../database/migrations/20261108_expense_range.sql) 和对应 verify，启用日期范围、跨月趋势及正确的英文月份路由。已上线项目只需执行尚未运行的增量 SQL，详见 [支出范围说明](./EXPENSE_RANGE_SETUP.md)。
6. 部署更新后的函数：

```powershell
npx.cmd supabase@latest --workdir "C:\Users\jiaxu\PlanWise" functions deploy ask-planwise --use-api --remote=lfvlxzjspvfxbnkdunay
```

无需新增 Cloudflare Secrets。CLI 上传导入依赖；若通过 Dashboard 手工部署，需要 index.ts、handler.mjs、note-context.mjs、expense-context.mjs、expense-report.mjs、task-context.mjs、task-report.mjs、workspace-context.mjs、workspace-report.mjs、expense-range.mjs、expense-query.mjs、expense-range-context.mjs 十二个文件。

7. 更新/刷新前端并新建对话，分别在自动范围和“我的笔记”重测原始数量/概览问题，再测试纯计数、TAI 关键词、无匹配、空账号和翻页。普通问候、今日重点、任务条件、支出分析及组合参考仍需保留回归。部署旧函数或缺少 SQL 会明确提示设置未完成，不把普通聊天假装成业务查询。

本轮未执行线上 SQL、未部署、未读取 Secrets，也未调用真实模型；回答相关性、复杂意图和真实延迟仍待线上验收。

本地验证（2026-11-08）：全量 **253 项测试通过**；最新生产构建通过，保留原有 **4 项警告**。覆盖 PostgreSQL 富文本/清单检索、全部匹配计数、RLS、旧任务/支出能力、统一 HTTP 与客户端协议、混合参考限制、笔记保存等待、会话范围切换、来源跳转、取消、账号切换及语音/目录占位界面。

数量/概览修复后：全量 **262 项测试通过**，生产构建通过，保留原有 4 项警告。新增覆盖用户原始问句、主题计数、真实 PostgreSQL 全库统计与分页、零匹配但非空笔记库、指纹变化重启、客户端页范围校验，以及模型编造权限/错误总量时的最终回复和缓存内容。未执行线上增量 SQL或重新部署函数。

## 参考

- [Supabase 数据库函数与权限](https://supabase.com/docs/guides/database/functions)
- [Supabase 全文检索](https://supabase.com/docs/guides/database/full-text-search)：后续可选增强；当前使用字面关键词查询。
- [PostgreSQL JSON 数据处理](https://www.postgresql.org/docs/current/functions-json.html)
