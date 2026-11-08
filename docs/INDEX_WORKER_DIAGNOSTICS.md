# 索引 worker 的运行时诊断

适用场景：控制台三项 Embedding Secrets 已确认，但队列中仍看到 `embedding_not_configured`。`last_error` 保留上一次处理失败，不会因修改 Secrets 自动清除；它直到任务实际成功才清除。仅靠旧队列表不能判断当前函数读到了什么。

新增受 `PW_INDEX_WORKER_SECRET` 保护的 `POST /index-workspace?action=diagnose`。返回部署版本、公开项目 ref，以及配置读取结果的布尔值；不返回 Account ID、Token、worker secret、服务端 key、密钥长度/前缀/hash。不会领取任务、预留预算、调用 Embedding 或写入业务记录。

## 操作顺序

1. 本地诊断代码需要部署一次（这次部署是发布新诊断功能）：

```powershell
npx.cmd supabase@latest --workdir "C:\Users\jiaxu\PlanWise" functions deploy index-workspace --use-api --remote=lfvlxzjspvfxbnkdunay
```

不需要重新运行主迁移，不需要重新输入 Cloudflare Token，`PW_RETRIEVAL_ENABLED` 保持 false。

2. 在 Supabase SQL Editor 运行 `database/diagnostics/index_worker_request.sql`。它内部使用已保存的 Vault 值，只输出 `diagnostic_request_id`。

3. 完成上一次运行后，稍后在**另一次 SQL Editor 执行**下面语句，将 123 替换为上一步返回的 ID：

```sql
SELECT id,status_code,timed_out,error_msg,content
FROM net._http_response
WHERE id=123;
```

`pg_net` 需要事务提交后才发送请求，因此不能在同一次执行中要求响应已经存在。若暂时没有结果，稍后重跑这条查询；不要重复提交诊断请求。如果请求已过响应保留时间，再提交一次新请求。

4. 检查 `content`：

- `workerVersion` 应为 `2026-11-08-runtime-diagnostics-v1`。若没有该字段，不能当成新诊断结果；可能访问了旧部署，停止反复调用并检查部署目标。
- `projectRef` 应为 `lfvlxzjspvfxbnkdunay`；该字段是公开项目标识，不是 Cloudflare Account ID。
- `embedding.enabled`：函数实际读到的 `PW_EMBEDDINGS_ENABLED` 是否严格等于字符串 true。
- `embedding.accountIdPresent`、`embedding.tokenPresent`：对应值是否被读到且不是空白。它们不验证 Token 是否有权限，也不验证 Account ID 是否正确。
- `embedding.configured`：以上三项同时满足。
- `database.urlPresent`、`database.serverKeyPresent`：内置数据库配置是否存在；仅说明存在，不证明数据库请求成功。
- HTTP 401：worker 请求未通过认证，检查两处 worker secret 的一致性；无需发送任何密钥值。
- HTTP 404：检查部署函数和请求项目；超时/5xx 查看该请求与函数日志。

5. 当新部署诊断 `configured=true`，说明当前不缺这三项配置。队列中的旧错误仍需等待重试成功。可选择在 SQL Editor 运行 `database/diagnostics/index_worker_retry_config.sql`，仅将 pending/failed 且上次为该配置错误的任务重新安排重试；保留 last_error，不修改 working 租约、其他错误、内容版本、向量或业务记录。

6. 再观察队列中 ready 是否增加；新的错误可能变成 `embedding_auth_failed`、`embedding_rate_limited` 等，应按实际新错误继续处理。全部索引准备好前不要开启统一聊天的新检索开关。

## 验证范围

本地测试覆盖认证前不读配置、只返回布尔值/公开 ref、不触发任务/模型/预算、分别缺配置的判定、正常处理时安全重试，以及两份诊断 SQL 的参数和状态修改边界。SQL 请求测试用本地模拟 `pg_net` 检查构造，没有代替真实 Supabase 网络调用；云端运行结果仍需按上述步骤取得。

本轮实际执行 `node --test`：**299/299 通过**。未执行线上部署、诊断请求或队列重置；当前环境此前的 Supabase CLI 403 仍未解决。
