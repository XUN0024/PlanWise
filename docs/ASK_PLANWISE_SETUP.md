# PW AI：Cloudflare Workers AI 第一阶段

更新：2026-11-07，Asia/Kuala_Lumpur。

## 当前状态

- [x] 用户截图确认 Supabase 自定义 Secrets 中已有 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID；没有读取它们的值。
- [x] 固定接入 @cf/zai-org/glm-4.7-flash，服务端 REST 调用；前端不会收到 Cloudflare 或 Supabase 管理密钥。
- [x] Dashboard、Tasks、Notes、Expenses 顶栏全局 PW AI；右侧聊天，手机全屏，跨页面保留当前账号会话。
- [x] 普通聊天、中文输入法、发送/停止等待/重试/清空、错误提示及账号切换清理。
- [x] 登录验证、用户/全局限额、并发限制、短回复缓存与重复请求保护。
- [x] 2026-11-07 用户截图确认 ask-planwise 部署成功，目标为 PlanWise_new / lfvlxzjspvfxbnkdunay；此前 CLI 403 部署阻断已排除。
- [x] 2026-11-07 用户确认普通聊天可以回复，前端 → Edge Function → Cloudflare 的真实调用已跑通。
- [ ] 线上 SQL 权限查询、中文回答质量、延迟、Neurons 用量与限流仍需分别验收。
- [x] 笔记助手前端：自动识别 Notes 当前查看/编辑的笔记，可更换/搜索笔记，准备问题或总结草稿，中英文与未保存状态提示。
- [x] 笔记助手总结/问答代码：按当前用户权限读取指定笔记，检查版本、转换富文本和清单、显示来源；自动保存后再发送，隔离每篇笔记/版本的对话。
- [ ] 最新笔记助手函数部署及真实账号线上验收；待办提取另行实施。
- [ ] 业务查询、RAG、来源引用、操作预览确认、Groq 故障切换。

## 笔记助手总结与问答（2026-11-07）

Notes 将当前笔记的 ID、标题、版本和保存状态共享给 PW AI，不共享正文。打开 PW AI 自动显示当前笔记；新建草稿和未保存标题也会同步。
用户可更换为另一篇笔记，在同一个页面笔记上下文中保留手动选择；页面打开另一篇笔记时，默认跟随新笔记。
没有当前笔记时显示选择入口。选择器优先使用 Notes 已加载的列表；其他页面按当前用户只读获取笔记 ID/标题/更新时间，支持搜索、空列表、加载失败和重试。
普通聊天和每篇笔记/已保存版本的对话分别保存在内存，不写入 localStorage；退出或切换账号后清空。离开 Notes 后不会继续自动引用上一页笔记。
“提问”聚焦输入框，“总结”填入可编辑的问题，再按发送。当前笔记未保存时等待现有 800ms 自动保存完成（最多等待 15 秒），失败保留问题，不调用模型；其他笔记直接使用其已保存版本。
前端请求只增加 context: {type:"note", noteId, version, action:"ask"|"summarize"}，不上传正文。Edge Function 使用用户 JWT + Supabase 公钥，通过 notes RLS 及显式 user_id/id 条件读取，额度 RPC 继续使用服务端凭据。
服务端保留 Postgres 微秒精度原始 updated_at 进行严格版本比较，再转换正文的已知富文本节点，保留列表、换行和清单完成状态。标题/正文/清单文字合计最多 12,000 个 Unicode 字符，空正文和空清单拒绝；附件不读取。
笔记作为不可信资料放入用户消息，服务端 system 规则明确区分资料与指令。普通聊天输出上限保持 512 tokens，笔记模式为 1024；复用现有请求数额度及重复请求保护。
本轮不新增 SQL：notes 和 AI 额度表保持原状，来源由服务端从授权笔记构造。指纹包含笔记 ID/版本、操作类型和实际内容。重试先重新检查权限和版本，再复用现有 reply 缓存并重建来源；笔记删除、权限失效或版本变化后不返回旧缓存。
回答中的来源跳转 /notes?note=<id>；目标笔记仍按当前账号读取，切换前保留原有未保存修改确认。页面另存新版本后，旧版对话不作为新问题的历史。

### 启用本轮功能

已运行原有 AI SQL 且 Notes 正常工作的项目，不需要重跑 SQL，也不需要新 Secrets。更新前端并重新部署函数：

```powershell
cd C:\Users\jiaxu\PlanWise
npx.cmd supabase@latest functions deploy ask-planwise --use-api --remote=lfvlxzjspvfxbnkdunay
```

部署后用一篇自己的笔记测试：总结、已知内容问答、未提及的问题、来源跳转；编辑后立即发送，确认等待保存并使用最新内容。
再验证笔记切换、版本变化、保存失败、删除、两个账号数据隔离、重试无重复调用。当前笔记超过长度上限时明确提示，不静默截断。
若收到 AI_NOTE_SETUP_REQUIRED，说明客户端没有收到匹配的笔记来源；旧版函数会忽略 context，必须先部署新版，不能将普通聊天回复展示为笔记答案。

本地验证：211 项测试通过，生产构建通过（保留原有 4 项警告）。包括真实 chatService 与 Edge handler 的无网络串联测试、用户权限、微秒版本、列表转换、缓存来源、自动保存等待和笔记对话隔离；不代表已完成线上模型质量验收。

本轮部署记录：2026-11-07 已尝试向 PlanWise_new / lfvlxzjspvfxbnkdunay 部署当前三个文件，Supabase 部署接口返回 403，未部署成功。随后只读 projects list 的结果中没有目标项目，仅有旧账号/授权范围下的其他项目；当前进程和用户级 SUPABASE_ACCESS_TOKEN 均未设置（仅检查存在性，没有读取凭据内容）。
需要在用户终端登录拥有目标项目权限的 Supabase 账号，再确认 projects list 包含上述 ID 后重新部署。没有执行线上 SQL，没有修改 Cloudflare Secrets。

### 入口文件找不到（400 / Entrypoint path does not exist）

若先出现 `failed to read file: open supabase/functions/ask-planwise/index.ts: no such file or directory`，说明 CLI 没能读取本地入口；随后服务器的 `/tmp/...` 入口报错是未上传入口文件的后续结果。
2026-11-07 已检查当前工作区：config.toml、index.ts、handler.mjs、note-context.mjs 均存在，配置 entrypoint 与官方相对路径格式一致。截图本身没有给出当前执行目录，不能据此断定文件被删除。
先在用户 PowerShell 执行 `Test-Path 'C:\Users\jiaxu\PlanWise\supabase\functions\ask-planwise\index.ts'`，应为 True；再使用绝对工作目录，避免当前目录或父级配置查找影响：

```powershell
npx.cmd supabase@latest --workdir "C:\Users\jiaxu\PlanWise" functions deploy ask-planwise --use-api --remote=lfvlxzjspvfxbnkdunay
```

检查三个文件均有 Uploading asset 记录，并以 Deployed Functions 成功行作为部署完成依据。若绝对 Test-Path 为 False，先核对终端是否使用了同一台机器/项目副本，不能用空入口文件覆盖现有代码。此次错误不需要重跑 SQL 或更改 Cloudflare Secrets。

## 现在如何上线并测试

### 1. 执行数据库 SQL

在 PlanWise 对应 Supabase 项目的 SQL Editor 依次执行：

1. [20261107_ai_chat.sql](../database/migrations/20261107_ai_chat.sql)
2. [20261107_ai_chat_verify.sql](../database/migrations/20261107_ai_chat_verify.sql)

验证最后五项应为 `false / false / false / true / true`。
脚本新建私有额度表与两个仅服务端可执行的函数，不修改现有笔记、任务或支出。可重跑，保留已经调整的额度配置。

### 2. 部署函数

在项目目录 C:\Users\jiaxu\PlanWise 打开终端：

```powershell
npx.cmd supabase@latest login
npx.cmd supabase@latest functions deploy ask-planwise --use-api --remote=lfvlxzjspvfxbnkdunay
```

项目引用来自当前前端 Supabase URL；部署前应确认 Secrets 也配置在同一项目。
`--use-api` 使用服务端打包，不依赖本机 Docker。登录凭据只交给 Supabase CLI，不要发到聊天。
CLI 3 使用 `--remote=<ref>` 指定项目；`--project-ref` 当前仍可用，但会出现弃用警告。
部署时核对 Target 为上述项目，确认提示时再选择 Yes。
保留 supabase/config.toml 的 verify_jwt=true；函数内部还会向 Supabase Auth 验证当前用户。

若通过 Dashboard 代码编辑器部署，函数名必须是 `ask-planwise`，同时添加：

- `index.ts`：[入口](../supabase/functions/ask-planwise/index.ts)
- `handler.mjs`：[处理器](../supabase/functions/ask-planwise/handler.mjs)
- `note-context.mjs`：[笔记解析与上下文](../supabase/functions/ask-planwise/note-context.mjs)

三个文件放在同一级；不要只复制 index.ts 而遗漏其依赖文件。

### 3. 核对服务端环境变量

用户已经配置的两项保持原名称：

| 名称 | 来源 |
|---|---|
| CLOUDFLARE_API_TOKEN | 当前 Cloudflare 账号的 Workers AI Read + Edit Token |
| CLOUDFLARE_ACCOUNT_ID | Cloudflare Account ID，32 位十六进制；不是 Supabase project ref |

SUPABASE_URL、Supabase 公钥及管理密钥使用 Edge Runtime 的默认环境变量。支持传统键，以及 SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS 的 default 项。
不要将管理密钥、Cloudflare Token 或任何服务端 Secret 写入 React 根目录 .env。

默认允许的应用来源是 `http://localhost:3000`、`http://127.0.0.1:3000` 和 Electron 本地页面的 `null` origin。
如果网页部署在其他域名，在 Supabase Secrets 添加 `AI_ALLOWED_ORIGINS`，填写逗号分隔的完整 origin，例如：

```text
http://localhost:3000,http://127.0.0.1:3000,null,https://your-app.example
```

这里的示例域名需要替换成实际网页域名；来源不包括路径。CORS 不代替登录验证。

### 4. 从 PlanWise 发起真实调用

1. 启动或刷新 PlanWise，使用已经验证过的 Google 账号登录。
2. 点顶栏 PW AI。手机窄屏显示星形按钮，聊天面板显示“普通对话”。
3. 发送：`请用两句话介绍你自己，并说明你目前能否读取我的笔记。`
4. 检查回答正常、说明尚未接入业务记录，并显示剩余请求次数。
5. 在 Cloudflare Workers AI Dashboard 检查本次用量；记录实际耗时与中文回答质量。
6. 关闭聊天、切换模块再打开，会话应保留；刷新清空本地会话，换账号不能看到上一账号内容。

不需要在前端粘贴 Cloudflare Token。Supabase Dashboard 的函数测试若使用公钥作为 Bearer，会被应用层验证拒绝；优先通过已登录的 PlanWise 测试。

## 设置助手身份、人设与语气

当前全局身份由 supabase/functions/ask-planwise/handler.mjs 顶部的 SYSTEM 常量定义，服务端将它作为第一条 role=system 消息发送给模型。
无需新增 Custom Secret 或重跑 AI SQL。当前没有单独的人设设置页面。

2026-11-07 已按用户要求将本地默认提示词改为英文，分为 Identity、Communication Style、Current Capabilities 和 Response Boundaries 四段，可直接编辑。仍跟随用户的语言回答，不强制使用英文：

| 部分 | 当前默认 |
|---|---|
| 身份 | PW AI，PlanWise 中的个人效率 AI 助手 |
| 表达方式 | 专业、友善、直接，跟随用户语言，先重点后解释 |
| 当前能力 | 普通聊天基于对话；笔记模式可总结和问答一篇服务端授权提供的笔记，不读取附件或其他模块 |
| 回答边界 | 不编造个人资料或来源，不声称已读资料库或执行应用操作；被问模型时如实说明 |

修改身份名称、主要职责或语气时，编辑该常量对应段落，保留反引号语法及其余处理代码。
提示词设置影响模型的表达和行为倾向；真实资料访问和业务操作能力必须由后续代码/RLS 接入，不能靠“你能够读取笔记”等文字获得。
固定身份不要放进每次用户输入，也不要允许客户端任意提交 system 消息替换服务端规则。

该提示词是所有账号共用的默认身份。用户姓名、称呼、回复语言偏好等私人设置应按当前用户存入数据库，登录后在服务端读取允许的字段再注入，不要把个人信息写入全局 SYSTEM。
本轮未新增个人偏好字段或管理界面。

本地修改后部署：

```powershell
npx.cmd supabase@latest functions deploy ask-planwise --use-api --remote=lfvlxzjspvfxbnkdunay
```

部署成功后，在聊天面板清空旧对话，分别测试：

- “你是谁？请简短介绍自己。”
- “我想准备一次项目汇报，帮我拆成三个步骤。”
- “你现在能看到我的笔记或替我创建任务吗？”
- “你使用什么底层模型？”

用户已确认旧版普通聊天连通；这次本地人设更新需要重新部署后，才会影响线上新请求。

## 默认额度与成本口径

| 限制 | 默认 |
|---|---|
| 每用户每天 | 20 次 |
| 每用户每分钟 | 3 次 |
| 全局每天 | 50 次 |
| 全局每分钟 | 10 次 |
| 同一用户进行中 | 1 次 |
| 全局同时进行中 | 3 次 |
| 当前问题 | 最多 2000 字符 |
| 发送上下文 | 最近至多 6 轮，合计至多 6000 字符 |
| 模型输出上限 | 512 completion tokens，关闭 thinking |
| 模型请求超时 | 45 秒 |

这些是应用的请求次数限制，不是 Cloudflare Neurons 的精确预算。模型参数固定在服务端，客户端不能更换更贵模型或提高输出上限。
默认值用于小规模验证，不能保证任意 Cloudflare 账号都永远免费；同账号的其他应用也会消耗免费额度。
Cloudflare 当前提供每日 10,000 Neurons 免费额度，UTC 00:00（马来西亚 08:00）重置。Free 额度用尽会失败；Paid 方案可能产生超额费用。
应用的每日计数也按 UTC 日界重置。多个 API key 不会给同一账号创造独立免费额度。

限额可由项目管理员在 SQL Editor 调整，例如停用新的模型调用：

```sql
UPDATE public.ai_chat_settings SET enabled=false WHERE id=1;
```

表和额度函数对 anon/authenticated 撤销权限，只有 Edge Function 的服务端管理凭据能够使用。用户 ID 来自 Auth 验证结果，不从请求体读取。
额度预留持有全局配置行锁，在不同用户/函数实例之间串行检查并写入；失败或停止的已预留请求也保守计入次数，不作自动退款。

## 数据、缓存和重试

- 普通聊天只发送对话，不查询业务记录。笔记模式只读一篇授权笔记，sources 为服务端生成的笔记来源；不写 notes/tasks/expenses/Storage，actions 仍为空。
- 聊天状态在 React 全局组件内存中；关闭面板或路由切换保留，刷新、退出或换账号清空。
- 为避免重复付费调用，服务端记录用户/请求 UUID、SHA-256 指纹、状态、token 用量、耗时和短回复缓存；不存整段输入会话。
- 原请求重试若已成功则复用缓存；进行中不发起第二次推理；明确失败后允许用户再次重试创建新请求 ID。
- 相同 ID 携带不同内容会冲突，不能覆盖原请求。回复落库尚未确认时继续检查原 ID，不直接重复调用模型。
- 回复缓存只在一天内可复用。后续预留请求时清空超过一天的回复、删除超过七天的额度记录；目前为惰性清理，没有定时删除任务，因此没有后续流量时不承诺到点物理删除。
- “清空对话”清空当前窗口，不删除服务端重试缓存。后续可按需要增加独立删除和定时保留策略。
- 提供停止等待和请求取消；断开连接不保证供应商不计费，服务端仍保留已预留次数。
- 模型文本按纯文本渲染，不能执行 HTML、JavaScript 或模型声称的业务操作。
- 日志仅记录请求 ID 和固定错误码，不记录 Token、请求正文、原始供应商错误或模型回复。
- Webpack 只允许两个明确的 Supabase 公开配置进入 renderer，不再将整个 .env 注入前端。

## 排错

### CLI 部署返回 403

2026-11-07 用户截图：CLI 3.0.0 找到了 index.ts 与 handler.mjs，但部署接口返回
`Your account does not have the necessary privileges to access this endpoint`。
本次部署未完成；截图不能判断具体是账号、项目范围还是个人访问 Token 权限。

先在发生问题的同一个 PowerShell 执行：

```powershell
npx.cmd supabase@latest projects list
```

- 看不到 `lfvlxzjspvfxbnkdunay`：核对 Dashboard 项目引用、CLI 登录账号和 Token 允许访问的项目范围。
- 能看到但部署 403：核对 Supabase PAT 的 Edge Functions Read-write 权限，以及成员在该项目的函数管理权限。
- 账号和权限均确认正确但 CLI 仍失败：可使用同一账号在 Dashboard 的 Edge Functions 编辑器部署当前三个文件，以区分 CLI 凭据/调用问题与项目权限问题。

`supabase login` 的浏览器登录使用 Supabase 管理账号。它与 PlanWise Google 登录、Cloudflare API Token 都不同。
如需更换 CLI 账号，可执行 logout 后重新 login，并在浏览器选择能管理该项目的 Supabase 账号。
若自己的终端设置了 `SUPABASE_ACCESS_TOKEN`，它会优先于保存的登录凭据；确认它是不是预期 Token，不要输出或发送其值。
原有 AI migration/verify 只管理数据库权限，重跑不会增加 Management API 的部署权限。
`--project-ref` 弃用警告不是这次 403 的原因；改用 `--remote=` 只更新命令格式。

2026-11-07 用户的 projects list 显示其他项目名称，怀疑 CLI 用了另一账号。仅名称不足以确认，应比较项目 ID。
`Cannot find project ref. Have you run supabase link?` 也可能表示本地目录尚未关联；link 不能替错误账号增加项目访问权。
先在浏览器确认能看到 PlanWise 的 Supabase 管理账号，再逐条执行：

```powershell
Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
```

```powershell
npx.cmd supabase@latest logout
```

```powershell
npx.cmd supabase@latest login
```

浏览器授权时选择上述账号，然后检查：

```powershell
npx.cmd supabase@latest projects list
```

确认目标 ID 可见后，再执行上方 --remote= 部署命令。
每次等命令完成、PowerShell 提示符回来再执行下一条；安装/退出/部署确认处只输入 y。
移除 Env 变量只影响当前终端的凭据覆盖；logout/login 不会删除项目、数据库或 Custom Secrets。

| 提示 | 核对 |
|---|---|
| AI_DEPLOY_REQUIRED | 函数名、部署是否成功、前端是否连接同一 Supabase 项目 |
| AI_SETUP_REQUIRED | 是否执行 AI SQL，两个 RPC 是否已创建且授予 service_role |
| AI_AUTH_REQUIRED | 重新登录；Authorization 应是用户 JWT，不能使用 Cloudflare Token/公钥替代 |
| AI_SERVER_CONFIG | 两项 Cloudflare Secret 名称/内容、默认 Supabase 服务端环境；不要贴出值 |
| AI_PROVIDER_AUTH | Token 对应 Cloudflare 账号、Account ID、Read + Edit 权限 |
| AI_MODEL_UNAVAILABLE | 账号对模型的可用权限、模型是否更名/下架/需要其他方案；代码不会自动切换付费模型 |
| AI_PROVIDER_LIMIT | Cloudflare 账号 Neurons / rate limit；应用请求计数不能代表供应商实际用量 |
| AI_ORIGIN_DENIED | 网页实际 origin 是否在 AI_ALLOWED_ORIGINS |
| AI_IN_PROGRESS / AI_RESULT_PENDING | 稍后重试原请求，避免重复推理 |

## 验证与后续

- [x] 完整本地测试 194 项通过，生产构建通过；保留既有 NODE_ENV、资源体积和子编译警告。
- [x] 本地 PostgreSQL：权限、重复 ID、缓存、用户/全局额度、并发状态、UTC 日界、过期和迁移重跑。
- [x] 服务端模拟：Auth、CORS、输入限制、固定模型、密钥分离、供应商错误、回复解析及保存失败。
- [x] React DOM：跨路由保留、换账号清理、中文输入法、防双击、停止、重试、纯文本渲染及焦点恢复。
- [x] 用户 CLI 输出确认两个函数文件上传并成功部署到目标项目。
- [x] 用户确认线上普通聊天回复成功。
- [ ] 新版身份提示词重新部署与回答验收，中文延迟及 Neurons 消耗、线上多用户同时请求、生产域名/Electron 验收。
- [ ] 当前笔记读取，随后任务/支出数据库查询、文件提取与 RAG；业务数据继续按当前用户 RLS 读取。
- [ ] 操作助手必须先展示可确认的业务操作预览，不能直接执行模型生成的 SQL 或工具调用。

代理没有读取线上 Secrets 的值、执行线上 SQL 或调用真实模型。用户已通过本机 CLI 成功部署，并确认普通聊天可用；后续身份提示词调整和业务接入仍分别验收。

## 官方参考（2026-11-07 核对）

- [GLM-4.7-Flash 模型与 REST 参数](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)
- [Cloudflare 官方模型 schema，含 enable_thinking](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/workers-ai-models/glm-4.7-flash.json)
- [Workers AI 免费额度](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI REST API 权限](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)
- [Workers AI 错误码](https://developers.cloudflare.com/workers-ai/platform/errors/)
- [Supabase 函数身份验证](https://supabase.com/docs/guides/functions/auth-headers)
- [Supabase 默认环境变量](https://supabase.com/docs/guides/functions/secrets)
- [Supabase CLI 部署及 --use-api](https://supabase.com/docs/reference/cli/supabase-functions-deploy)
- [Supabase CLI v3 参数迁移](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)
- [Supabase 个人访问 Token 权限及优先级](https://supabase.com/docs/guides/platform/personal-access-tokens)
- [部署接口所需 Edge Functions 权限](https://supabase.com/docs/reference/api/v1-deploy-a-function)
