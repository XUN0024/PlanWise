# PW AI 支出助手第一版

2026-11-08 后续更新：单月限制已扩展为日期范围、多月趋势和可选期间对比；英文 January 2026 会解析为正确的 1 月。当前上线与验收以 [支出范围修复](./EXPENSE_RANGE_SETUP.md) 为准，下方保留首版历史实现。

2026-11-08 更新：界面已并入 [统一聊天与参考范围](./UNIFIED_AI_SETUP.md)，独立 Tab 已移除。月份和条件位于“＋参考 → 我的支出”，统计卡片作为回答出现。下方保留底层统计、权限和历史验收说明。

更新：2026-11-07（Asia/Kuala_Lumpur）。本轮按用户要求先新增独立 Expenses Assistant Tab，之后再与笔记、任务统一聊天入口。

## 范围与当前状态

- 已实现代码：普通对话 / 笔记助手 / 支出助手；2026-11-08 另新增独立 [任务助手](./TASKS_ASSISTANT_SETUP.md) Tab。在 Expenses 页面打开 PW AI 默认进入支出助手。
- 消费回顾：完整匹配范围的总额、笔数、均值、日历日均、分类占比、小额累计、按规范化描述的高频分组、每日/星期分布和代表性大额记录。
- 期间变化：总差额、增长率、每个分类的正负差额与两期大额记录。精确数据先显示为卡片，模型负责解释。
- 可选择月份、分类、描述关键词、小额标准；首版小额默认单笔 ≤ RM 20，可设 RM 0.01–10,000.00。
- 支出新增、修改或删除后，新请求读取新快照。报告指纹涵盖两期全部匹配记录的 ID/版本，避免只用 max(updated_at) 漏掉删除。
- 待完成：线上 SQL、Edge Function 部署及真实账号/模型验收；疑似重复、周期性支出、OCR、统一 RAG 入口仍待实施。Tasks Assistant 第一版代码见独立说明。

## 上线步骤

现有 Expenses CRUD 和 payment/time 迁移应已完成。本轮不会改动账单表字段、现有账单、收据或权限策略，只增加只读 RPC。

1. 在目标项目 Supabase SQL Editor 执行 [20261107_expenses_assistant.sql](../database/migrations/20261107_expenses_assistant.sql)。无需填写用户 UID。
2. 执行 [20261107_expenses_assistant_verify.sql](../database/migrations/20261107_expenses_assistant_verify.sql)。应依次得到 **false / true / false / true / true**：匿名不可调用、登录用户可调用、不使用 definer、只读 STABLE、账单 RLS 已开启。
3. 部署更新后的函数：

```powershell
npx.cmd supabase@latest --workdir "C:\Users\jiaxu\PlanWise" functions deploy ask-planwise --use-api --remote=lfvlxzjspvfxbnkdunay
```

无需新增 Cloudflare Secrets。保留 verify_jwt=true，当前账号需有 PlanWise_new 部署权限。如果手动通过 Dashboard 部署，当前需要同目录的七个文件：index.ts、handler.mjs、note-context.mjs、expense-context.mjs、expense-report.mjs、task-context.mjs、task-report.mjs；不能遗漏导入依赖。

4. 更新/刷新前端，打开 PW AI → 支出助手。选择月份后点击“分析本月消费/分析所选月份”或“解释期间变化”；也可在该范围内继续提问。快捷按钮直接发送一次分析，不需要再次点击发送。

若 SQL 尚未执行或仍是旧版 Edge Function，界面会显示初始化提示，不将普通聊天回复当成支出分析。

## 口径

- 金额始终是 PostgreSQL numeric/整数分；接口使用十进制字符串，浏览器以 BigInt 格式化，模型收到服务端准备的 *_myr 和 *_percent 字符串。
- 同一次 RPC 以一致快照计算两期数据，不从当前页 25 条列表合计，也不让模型运行任意 SQL。
- 当前月份比较“本月至今”与“上月同期”；历史月份比较完整月份。上月较短时截到该月最后一天，界面标明日数不同；今天可能未结束。
- 所有消费日期使用 expense_date 和马来西亚日历；不按补录时间 created_at 判断消费月份。
- 上期总额为零时增长率为 NULL，展示“不可计算”，不显示无限大。无匹配数据时金额为零，模型不能编造习惯。
- 日均按范围内全部日历日计算；active_days 单独记录。小额包含等于阈值的账单。
- 高频分组只做描述大小写和空白规范化，取出现至少两次的前 5 组；不是商家识别或重复账单判定。星期键按 ISO 周一=1、周日=7。
- 每期只选金额最高的 5 笔作为来源示例。示例不代表完整账单；分类、频率和小额统计仍覆盖全部匹配记录。
- 付款方式未记录保持 unrecorded；没有时间不视为午夜。用户没有预算/收入数据时不判断超预算、浪费或还款状态。

## 请求与权限

客户端只发送问题及 `context: {type:'expenses', action:'review'|'compare', month:'YYYY-MM', smallAmount:'20.00', search:'', category:''}`；不发送账单列表或用户 ID。

Edge Function 验证登录后，用当前用户 JWT + Supabase 公钥调用 get_expense_insights；RPC 使用 auth.uid()、显式 owner 条件和现有 RLS。服务端管理凭据仍只负责 AI 额度请求，不用于绕过账单权限。

返回报告经过分组总额、计数、均值、差额、日期范围和来源校验，剔除 owner_id 后再交给模型/前端。账单描述仅作为不可信资料，不能改变系统指令；模型没有写入权限或工具。

每次重试先重新读取报告，再尝试复用现有回复缓存。若指纹改变，返回 AI_EXPENSE_CHANGED，用户重试生成新分析。普通聊天、笔记、支出及不同月份/筛选/任务的会话分别保存于当前账号内存，刷新、退出或换账号后不保留旧账号资料。

来源链接打开 `/expenses?expense=<id>`，按当前登录账号重新读取指定账单，支持当前分页外的账单；保留原有未保存修改确认，不因异步来源读取覆盖编辑草稿。

## 模拟数据验收

若已导入 [历史模拟数据包](./EXPENSES_AI_DEMO_DATA.md)，选择 2026-10，并在描述筛选输入 `PWDEMO-20261107-V1`，避免与真实账单混合。

- 10 月：41 笔，总额 **RM 4,228.15**；9 月：41 笔，总额 **RM 2,292.83**。
- 净增加 **RM 1,935.32**，增长率 **84.41%**。
- 10 月最高单笔 **RM 2,499.00**，不应将它直接说成全部净增长；同时解释其他类别的增加和抵消。
- 2026-11 的分析按实际生成日截止；模拟数据只到 11 月 6 日。固定 11 月 7 日的测试与完整 10 月比较不是同一口径。

本地测试可核对精确计算、空数据、闰年/月末、用户隔离、缓存失效和组件交互；真实模型的中文解释质量仍需要线上人工验收。

2026-11-07 本地结果：全量 **232 项测试通过**；生产构建通过，保留原有 **4 项警告**。本轮未执行线上 SQL，也未部署函数；按上方顺序完成上线后再验收真实模型回答。
