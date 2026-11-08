# PW AI 三模块混合检索

状态：代码、本地 SQL/权限测试和聊天接入已实施。用户已反馈配置 Secrets，并在当前 Cloudflare 账号完成真实 Embedding API 小样本测试；结果、发现的排序问题及修正见 [实测记录](RETRIEVAL_EVALUATION_20261108.md)。没有替用户运行生产 SQL、部署函数或回填生产记录；Edge 环境、真实业务及两个账号的验收仍待完成。

后续队列偏向支出、句尾追问漏路由、零索引误解释和候选账单漏行问题已做本地修正，见 [队列与追问修正](RETRIEVAL_QUEUE_AND_FOLLOWUPS.md)。已有线上项目需应用独立的 `20261110_retrieval_fair_queue.sql` 并部署新版 `ask-planwise`；旧的历史索引不必重建。

实测后的排序修正已通过 **293/293** 本地测试。如果之前已执行旧版主迁移，部署前补跑 `20261109_hybrid_retrieval_ranking_fix.sql`，再运行权限验证 SQL；尚未执行主迁移的项目，直接使用最新版 `20261109_hybrid_retrieval.sql` 即包含修正。此修正无需重新生成向量。

开发初次验证（2026-11-08）：`node --test` **290/290 通过**；`npm run build` 通过，仍有原来的 4 类构建警告（NODE_ENV、资源大小、入口大小、子编译）。新增 16 项测试包含真实 pgvector 数据库、三模块聊天链路、原文读取、索引乱序/续处理/失败、前端卡片和客户端来源验证。主迁移、权限验证 SQL、填写测试 UID 后的检索示例均已在本地 PostgreSQL/PGlite 执行；Cron/pg_net/Vault 调度须在 Supabase 验收。后续真实 API 小样本已完成，但线上时延、实际账单和生产数据回填仍未验证。

## 改了什么

继续使用同一个 PW AI 会话和原来的 `workspace/version:1/references` 协议。新增 `retrieval` 回答卡；不增加聊天 Tab、业务写入工具、OCR、语音或本地目录读取。

- Notes：标题、可见正文、清单文字、`note_tags` 真正关联的标签。`pw_note_plain_text` 处理已有富文本格式。长文按约 1,000 个 Unicode 码点切分，优先换行边界，重叠 120 字；保留根记录、子任务 ID 和原 section 中的起止码点位置。
- Tasks：主任务标题/描述和各子任务文字；结果按主任务去重，子任务命中仍打开所属主任务。状态、优先级和提醒日期由 SQL 过滤。提醒日期不等于截止日期。
- Expenses：现有描述和分类名称；没有虚构商家、商品、预算等字段。日期、金额、分类、付款方式和字面描述条件继续是 SQL 条件。明确的金额语句支持 at least/at most/over/under 等和对应中文，不超过 RM 20 包含 20，低于 RM 20 则排除 20；超过两位小数拒绝，避免静默四舍五入。
- 指定笔记仍读取完整原文并核对保存版本。检索后要求总结时，最多再读取 3 篇原文，每篇遵守原来的 12,000 字符限制；太长/空笔记明确保留摘录状态，其余记录不声称读过全文。
- 精确数量/概览、今日重点、指定任务拆解、支出日期统计和趋势沿用原有结构化 SQL。普通问候/通用知识不查个人记录。
- 自动范围按本轮问题选择相关模块；未带模块名的“找我以前关于……的资料”可以同时查三个模块。选择参考资料后，只查询选定模块、记录及其条件内的数据。
- 不采用完整 Agentic 多轮工具循环。可复用入口是 `readHybrid()`、`pw_hybrid_search()` 和便于将来包装成工具的统一候选卡。

## 模型选择和配置

默认模型：`@cf/baai/bge-m3`，1024 维，索引版本 1。聊天仍使用原来的 GLM 模型，GLM 不生成这些向量。

依据官方资料，BGE-M3 支持多语言，原始模型说明支持 100 多种语言和 8192 token。Cloudflare 当前页面则标注 60,000 token；两者有差异，本实现不依赖这个较大的数字。应用限制：文档片段约 1000 码点，单输入最多 1400 码点，一次最多 8 段；查询超过 1400 码点时仅语义输入截取前 1400，关键词仍从完整问题提取。官方没有在该模型的普通 text-array API 页面明确给出本应用可依赖的批次上限，8 是本应用的保守限制，不是供应商承诺的最大值。

REST API：`POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/baai/bge-m3`，请求 `{text:[...]}`，验证响应 `result.data` 的行数、有限数值、非零向量及 1024 维。不使用重排序 query/contexts 接口，不把聊天响应当向量。

查询和索引共享 NFKC、换行统一、去空字符和首尾空白规范。不加只适用于其他 BGE 模型的英文 query instruction。客户端不接触供应商密钥。

在 Supabase → Edge Functions → Secrets 配置：

| Secret | 用途 |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | 现有 Cloudflare 账号 ID |
| `CLOUDFLARE_API_TOKEN` | 保留现有聊天 Token |
| `CLOUDFLARE_EMBEDDING_API_TOKEN` | 专用于 Workers AI 的账号级 Token，确认具有 REST 调用要求的 Workers AI Read/Edit；当前专用 Token 已通过本机 Embedding API 测试，Edge 中保存的值仍待后台实测 |
| `PW_EMBEDDINGS_ENABLED` | 完成模型测试后设 `true`；缺失/false 时明确降级关键词 |
| `PW_RETRIEVAL_ENABLED` | 完成迁移后设 `true`；缺失/false 时保留原有查询路径，便于上线顺序和回退 |
| `PW_INDEX_WORKER_SECRET` | 自行生成足够随机的至少 32 字节服务器密钥；Cron 和后台维护调用 worker 使用 |

Supabase 的 `SUPABASE_URL`、公开 key 和服务端 key 使用现有 Edge 环境。不要将 service role、Cloudflare Token 或 worker secret 放进 React/Electron、聊天消息或仓库。

模型已在当前账号完成 9 个中英混合样例的真实 API 初测：原混合第一名命中 8/9，关键词 4/9；修正排序后复用原相似度离线重排为 9/9。它支持继续做受控业务验收，但不代表生产准确率，也未充分校准阈值。若要更换模型/维度，需要新的增量迁移、索引版本和完整重建；仅修改 Secret 不会切换模型，避免查询与索引不兼容。

官方依据（查阅时点：本轮开发）：[Cloudflare BGE-M3 API](https://developers.cloudflare.com/workers-ai/models/bge-m3/)、[BAAI 模型说明及维度](https://huggingface.co/BAAI/bge-m3)、[Workers AI REST Token](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)、[限流](https://developers.cloudflare.com/workers-ai/platform/limits/)、[Supabase pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)、[Cron](https://supabase.com/docs/guides/cron)。EmbeddingGemma 当前存在即将弃用的提示，因此没有选作新的默认模型。

## 排序、范围和统计边界

`pw_hybrid_search` 先通过 `auth.uid()` 限定账号，再限制模块/指定记录/结构化条件，从当前业务记录生成候选文字。没有使用只适合英文的 stemming。关键词采用 Unicode 字面匹配，保留英文标识，并补充中文连续文字的双字片段。

有效向量要求来源仍存在、归属当前账号、源 hash 与当前内容一致、模型和索引版本正确。混合检索合并“至少一个关键词命中”和 cosine ≥ 0.42 的候选，按根记录去重；采用关键词排名和向量排名的 RRF，`1/(60+rank)` 相加。完整缩写/编号命中优先，普通英语单词不会获得这层保护；再按融合分数、语义相似度、关键词命中数和 ID 排序。最佳匹配片段优先包含关键词，其次考虑相似度。0.42 尚未用足够样本校准，并非相关性保证。

`eligibleCount` 是结构化范围内的记录数；`candidateCount` 是满足当前字面/相似度规则的根记录数；`rows.length` 是展示数（最多 8）。它们不等同于用户某种行为的完整记录数，`exhaustive` 固定为 false。父/子任务不混算。零候选不代表数据库没有记录或没有授权。

**语义支出只展示候选账单，不计算这些候选的“全部总额”、平均值、差额。** 如果用户问含糊概念的总额，应先展示候选并澄清可穷尽的分类/描述规则。明确的日期/分类等统计继续由原有数据库函数计算完整集合，列表页和语义 Top 8 都不是统计依据。已有统计回归测试继续覆盖超过一页的金额和日期边界。

SQL 当前对账号和条件范围内的有效向量做精确扫描，保证候选数量不来自 ANN Top-K。提供 HNSW、owner 和队列索引，但不声称当前查询必然走 HNSW；数据量大时需要压测及进一步检索优化。不得为了速度把 ANN 展示结果的数量当成完整匹配数量。

当前自动路由仍是可测试的规则识别，不是完整意图规划器：已补充主题任务计数、未带模块名的个人资料查找、Netflix 等描述主题及中英混合检索。复杂省略和多义表达仍可能需要澄清；回答注明实际查询模块，不能声称查过未触达的资料。

## 保存和索引同步

业务保存只在同一数据库事务内更新轻量队列，不等待网络 Embedding。`notes/tasks/expenses/subtasks/note_tags` 变化及标签重命名有触发器。归属和结构化事实也参与源 hash；无有效内容/元数据变化不会重复排队。

一条根记录只有一条任务，连续自动保存将 generation 合并更新，并将 due_at 推迟 3 秒。旧 lease/generation/hash 不能覆盖新来源。删除立即清理投影；检索再次核对当前来源，防止触发器延迟、旧索引或模型生成期间更新被引用。生成回答后再查一次候选，变动则返回 `AI_WORKSPACE_CHANGED`，用户用新请求 ID 重试。

worker 每次最多 claim 2 条任务，`FOR UPDATE SKIP LOCKED`，lease 3 分钟。每条记录每轮最多生成 2 批 × 8 段；每批向量立即 checkpoint，长文下一轮继续。相同文字 hash 复用已有向量，修改元数据不需要重新支付全部 Embedding。每篇最多 256 段；超出时保留失败任务并显示关键词结果，需要拆分记录或以后扩展分段上限。

网络超时 15 秒/批、403、429、响应错误保留任务，指数退避从 30 秒增加至最多 1 小时；8 次失败后标记 failed，记录错误代码而不记录密钥/原始供应商错误。应用预算耗尽则每 15 分钟重试，不耗尽重试次数。过期 lease 自动重新领取；部分进度保留。查询侧失败则立即关键词降级，不在交互请求中反复调用模型。

默认应用预算（UTC 日）：全局 2,000,000 输入码点，worker 1,800,000，每用户查询 20,000；全局 60 请求/分钟，worker 50，每用户 6。查询和批量索引共用原子预算，失败尝试也占预算。聊天原有日额度/并发/请求缓存保留；Embedding 在缓存检查前可能发生，受独立预算控制。不将码点预算当作 token/neurons 或免费额度保证。

Cloudflare 页面当前标价 BGE-M3 输入 $0.0118/百万 token，实际免费额度、限流、模型可用性和费用以账号控制台为准；与聊天共享账号资源，不能视为另有无限免费池。本实现不轮换 Token 绕额度。维护/评测脚本同样会占实际供应商额度。

## 上线顺序

1. 检查前置迁移已执行：Notes checklist/richtext、`20261105_note_tags.sql`、Expenses CRUD/payment/statistics、`20261108_tasks_assistant.sql`、`20261108_workspace_assistant.sql`、`20261108_notes_overview.sql`、`20261108_expense_range.sql`。本次不会重复执行 fresh_setup 或删除业务数据。
2. 若已有 pgvector 安装在非 `extensions` schema，迁移会明确停止而不移动现有扩展；先审核该项目的扩展位置，避免破坏其他用途。在 SQL Editor 审核并运行 `database/migrations/20261109_hybrid_retrieval.sql`，然后运行独立的 `20261109_hybrid_retrieval_verify.sql`。匿名不可调用；客户端只可调用 `pw_hybrid_search`，其他索引 RPC 仅 service role；投影表均开启 RLS 且客户端不能直接读写。可另用 `20261109_hybrid_retrieval_queries.sql` 填入测试 UID，验证三个模块及带向量的权限范围（该脚本也已在本地执行）。检索 RPC 是显式检查 `auth.uid()` 的 SECURITY DEFINER，业务表原有 RLS/字段权限没有改动。
3. 配置上表 Secrets。`PW_RETRIEVAL_ENABLED` 暂不启用。先验证专用 Token 的真实 Embedding 响应与相关性（下一节），再启用 `PW_EMBEDDINGS_ENABLED=true`。
4. 部署索引 worker，然后部署聊天函数：

```powershell
npx.cmd supabase@latest --workdir "C:\Users\jiaxu\PlanWise" functions deploy index-workspace --use-api --remote=lfvlxzjspvfxbnkdunay
npx.cmd supabase@latest --workdir "C:\Users\jiaxu\PlanWise" functions deploy ask-planwise --use-api --remote=lfvlxzjspvfxbnkdunay
```

`index-workspace` 在 config.toml 关闭网关 JWT 校验，但函数本身严格要求 `Authorization: Bearer <PW_INDEX_WORKER_SECRET>`；普通用户 JWT 和匿名请求都不能触发索引。聊天函数保留原有 JWT/登录验证。

5. 回填已有记录。管理员终端用本地环境变量设置 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`PW_INDEX_WORKER_SECRET`，不要把值发到聊天。执行：

```powershell
node scripts/retrieval-maintenance.mjs backfill
node scripts/retrieval-maintenance.mjs drain
```

backfill 每页最多 100 条，把游标保存在被 gitignore 排除的 `.pw-backfill-cursor.json`；中断后重跑可继续。drain 最多调用 100 次 worker；遇限额/失败停止，不绕过退避；没有到期任务时返回 0，不能据此断言整个队列已完成。

不想设置本地 service role，可在 SQL Editor 手工分批调用：

```sql
SELECT public.pw_search_backfill('',100,false);
-- 将结果中的 cursor 复制为下一页的 p_after；直到 done=true。
-- 本步骤只是入队，Embedding 由已部署的 worker 执行。
```

6. 后台持续执行：在 Supabase Vault UI 创建 `pw_supabase_url` 和 `pw_index_worker_secret` 两个 secret，后者值与 Edge Secret 相同。审核并运行 **独立可选** `20261109_hybrid_retrieval_cron.sql`，每分钟调用一次 worker。它读取 Vault，不在仓库或 cron SQL 中写明文密钥。默认主迁移不会替你创建调度或存储密钥。
7. 查看 verify SQL 的各模块 pending/working/ready/failed；回填完成后设 `PW_RETRIEVAL_ENABLED=true`，前端发布最新构建，然后执行三模块及两个账号验收。先允许关键词降级上线也可以，但不要标成语义实测通过。

## 实测、维护和回退

如果控制台配置确认正确，但队列仍显示 `embedding_not_configured`，请使用 [索引 worker 运行时诊断](INDEX_WORKER_DIAGNOSTICS.md)。它通过已保存的 Vault 密钥检查当前部署读到的配置，仅输出布尔值，不泄露密钥，也不调用模型；旧 last_error 不会随配置变更自动清除。

本地自动化：`npm test`，新增 `hybrid-database.test.cjs` 使用真实 PGlite pgvector（非伪造 vector 类型），`hybrid-chat.test.cjs` 覆盖三个模块实际经过 handler、模型输入、来源、预算、降级、后置版本检查及 worker。浏览器 UI 与 chatService 测试验证候选卡/来源和账号切换。生产构建：`npm run build`。

真实效果评测（不是应用前端）：管理员终端设置 Cloudflare 的三个 Embedding 环境变量后执行：

```powershell
node scripts/evaluate-retrieval.mjs
```

输入为 `tests/fixtures/retrieval-relevance.json` 的虚构资料，不读取生产账号；列出 9 个可重复问题和预期来源 ID，涵盖英文/中文/混合、精确课程编号、正文主题、子任务、通勤/视频会员等同义表达。脚本真正调用 Embedding，输出关键词与混合的 hit@1、recall@5、每个候选 cosine 和输入量，保存被忽略的 `retrieval-eval.local.json`。它是小规模模型相关性评测，不是生产 RLS/数据库端到端测试；权限和 SQL 另由自动化及下面的线上账号验收检查。审查误命中和精确 ID 排名，必要时修改阈值并重新测，不仅检查 HTTP 200。

重试 failed：`node scripts/retrieval-maintenance.mjs retry`（每次最多 200）；然后 drain 或等待 Cron。完整重建：先移除本地 `.pw-reindex-cursor.json`（如果是一次新的重建），运行 `node scripts/retrieval-maintenance.mjs reindex`，再 drain/等待 Cron。重建只影响索引任务，业务记录不变；同模型同文本可复用向量。旧索引不会覆盖较新内容。

回退：将 `PW_RETRIEVAL_ENABLED=false` 恢复原有统一聊天路径；也可仅 `PW_EMBEDDINGS_ENABLED=false` 保留实时关键词新路径；需要停止后台时在 Cron 控制台停用 `pw-index-workspace`。业务记录仍是权威源，不需要删除业务表或撤销已有权限。

## 线上验收清单（当前待执行）

- [ ] Notes：用标题不相关、正文相关的中文/英文/TAI 混合资料；用真实标签和清单查询；来源打开正确笔记，片段和版本与原文一致。长文后部命中应带正确位置。
- [ ] Tasks：只有子任务提到主题；返回主任务与子任务标记；状态、High/Low、提醒日期、指定任务严格限制。今日重点/拆解仍能使用且不写入任务。
- [ ] Expenses：Grab ride/“通勤”、Netflix/“视频会员”对照；先看候选，不把它们合计。January 2026 查询使用一月，不回到当前月；跨月趋势、精确 COUNT/SUM 沿用已有 SQL。
- [ ] 两个账号各建相似记录；普通 JWT 不能调用索引写入 RPC 或读投影表；检索没有对方 ID/片段/向量；修改参考范围不能扩张已选条件。
- [ ] 35 条匹配记录：显示 8 条，候选数量为 35；精确 SQL 统计覆盖 35 条，不从展示页求和；主任务和子任务分别计数。
- [ ] 自动保存连续更新、重命名标签、子任务修改/删除、主记录删除；待索引时旧向量立即无效，关键词可找到新文本，旧 lease 不能覆盖新版本。
- [ ] 关闭 Embedding/模拟 429/预算用尽：明确显示关键词降级和覆盖不足；SQL 失败显示错误，不能显示“0 条记录”；空候选不声称没有权限。
- [ ] 无参考选择可以查资料；指定笔记、组合参考、普通聊天、历史消息、刷新/切换账号不回归。索引在后台处理，保存不等待 Embedding。
- [ ] 真实相关性报告及线上响应耗时已记录，误命中和费用可接受；审核后再将此功能标记为线上验收通过。
