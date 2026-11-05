# 笔记附件：Supabase Storage 基础

## 执行步骤

1. 打开当前 PlanWise Supabase 项目的 SQL Editor。
2. 执行 20261104_note_attachments_storage.sql 的全部内容。
3. 执行 20261104_note_attachments_verify.sql，检查以下结果：
   - bucket note-attachments 存在，public = false。
   - file_size_limit = 15728640，configuration_ok = true。
   - note_attachments 表启用 RLS，包含 3 条业务表策略。
   - Storage 有本脚本创建的 6 条策略（读、写、删和 3 条限制策略）。
   - 最后查询为 false / false / true。
4. 在 Storage Settings 确认 Global file size limit 不小于 15728640 字节。
   全局上限低于 bucket 上限时，以较低限制为准。

脚本可重复执行，不重建笔记表，也不修改笔记正文及 notes 的 RLS。
bucket 若已存在，会配置为私有、15MB 上限、暂不限 MIME 类型。
不要重新执行 fresh_setup.sql。

数据库脚本仅准备存储和关联表；当前前端已接入拖拽、标准/TUS 上传、进度、
图标、鉴权下载及删除清理。附件通过 note_attachments.note_id 关联 notes.id。
前端仍使用现有 Supabase URL 和 publishable/anon key，无需新增 service-role key。

## 数据与权限

- 单个文件上限：15 × 1024 × 1024 = 15,728,640 字节。
- bucket 为私有；上传、读取、删除必须属于当前用户的现有笔记。
- 原文件名（可含中文）保存在 original_name；object_name 仅接受字母、
  数字、点、下划线、连字符，默认 file。
- storage_path 由数据库生成：用户ID/笔记ID/附件ID/安全对象名。
  客户端不能更改关联、所有者或路径。
- 同名文件通过不同附件 UUID 分别保存，上传时使用 upsert: false。
- status 默认为 pending；客户端不能直接 UPDATE 附件记录。
- 上传成功后调用 complete_note_attachment，检查用户、笔记、真实对象
  和真实大小，再将状态置为 ready。
- 私有附件使用 SDK 鉴权下载或短时签名链接，不使用永久公开 URL。
- 附件操作不更新笔记 updated_at，不制造正文自动保存的版本冲突。

## 后续前端接口顺序

以下约定不会随 SQL 自动执行：

1. 前端先验证每批最多 5 个文件，每个文件不大于 15728640 字节。
2. 笔记必须已保存。为每个文件生成稳定的附件 UUID。
3. 向 note_attachments 插入以下字段并 select().single() 获取返回记录：
   id、note_id、user_id、original_name、object_name、size_bytes、mime_type。
   不传 storage_path、status、created_at、uploaded_at，使用数据库生成值。
4. 使用返回的 storage_path 上传到 note-attachments bucket。
   标准 SDK 调用为 storage.from("note-attachments").upload(path, file,
   { upsert: false, contentType: file.type || "application/octet-stream" })。
5. 上传成功后调用 supabase.rpc("complete_note_attachment",
   { p_attachment_id: attachment.id })。
6. 正式附件列表展示 ready 记录；pending 记录用于上传任务及失败恢复。

不大于 6MB 的文件使用 Supabase SDK 标准上传，显示不确定进度条；
超过 6MB 的文件使用 tus-js-client，以 6MB 分块进行 TUS 可恢复上传，
显示实际传输进度。两条路径都支持取消，最多两个并行任务，
使用数据库返回的同一 storage_path，保留相同的 RLS 和完成校验。
每批最多 5 个已在前端和上传服务入口校验，本脚本不限制笔记累计附件数，
也不声称 bucket 能限制一次选择的文件数量。

## 删除顺序

1. 调用 storage.from("note-attachments").remove([storage_path])。
2. 成功后删除对应 note_attachments 记录。
3. 全部附件清理后再删除笔记。

对象存在时，触发器拒绝删除附件记录；附件记录存在时，外键阻止删除笔记。
笔记删除 UI 已接入该顺序，先核对笔记版本，再清理附件，最后删除笔记。
Storage 与数据库无法组成一个事务；清理中途失败会保留笔记，已清理的
附件不会自动恢复，界面会明确提示并允许重试。
没有部署后台清理任务。刷新后未完成的 pending 记录会显示在附件列表，
可以手动移除；刷新后原始本地 File 不再可用，需要重新拖入文件。
不要用 SQL 删除 storage.objects，那不会删除实际文件。

## 在线权限验收

SQL Editor 和 Storage Dashboard 的管理员操作不能代替以下登录用户 SDK 测试：

1. 用户 A 登记自己的笔记附件、上传小文件、完成确认和下载。
2. 用户 B 无法读取 A 的记录、上传到 A 的路径或下载 A 的文件。
3. 未登录请求无法访问该 bucket 的文件。
4. 未登记的路径上传失败；错笔记/错用户路径上传失败。
5. 超过 15,728,640 字节被 Storage 拒绝。
6. 没有真实对象或登记大小不匹配时，完成确认失败。
7. 直接 UPDATE status/所有者/路径失败。
8. 文件存在时直接删附件记录失败；正确顺序删除成功。

本地未连接在线数据库，脚本尚未在线执行或完成上述验收。

## 拖拽前端验收

- 普通状态没有投放区和空附件占位；只有真实附件/上传任务会显示列表。
- 文件拖入当前笔记详情或编辑区域时，出现 Drag and drop here 高亮层；
  拖出、放下或取消拖拽后消失；普通文本拖拽不触发。
- 新笔记先完成首次自动保存（或手动保存）再上传，未保存时提示先保存。
- 超过 5 个或任一文件大于 15MB 时，整批拒绝，不写入附件记录。
- 上传开始即固定用户、笔记和附件 UUID；上传期间锁定笔记切换、删除和退出，
  正文仍可编辑和自动保存。可以停止上传，失败项可以重试或移除。
- 完成后点击附件名进行鉴权下载；图标按 MIME/扩展名区分类型。
- 刷新可恢复附件列表；各账号只能访问各自笔记的附件。
- 断网或完成确认失败后重试，沿用原 UUID，不重复创建附件。

参考：
- https://supabase.com/docs/guides/storage/buckets/creating-buckets
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/storage/schema/design
