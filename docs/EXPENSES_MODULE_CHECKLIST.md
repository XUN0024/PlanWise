# Expenses module 实施清单

更新日期：2026-11-06（Asia/Kuala_Lumpur）。本轮范围：数据规则、增量 SQL、真实 CRUD。

## 当前已实现

- [x] MYR 单币种，界面统一显示 RM；每笔金额为正数。
- [x] 前端按整数分处理，写入规范十进制字符串，支持 RM 0.01–999,999,999,999.99。
- [x] 数据库 numeric + 金额范围/两位精度 CHECK，直接 API 写入 1.005 会拒绝，避免隐式舍入。
- [x] 描述 1–1000 个 Unicode 字符，七种固定分类，真实日历日期。
- [x] 日期默认用户设备当天，按 YYYY-MM-DD 保存；数据库默认日期采用马来西亚时区。
- [x] 创建 UUID 由草稿固定，丢失创建响应后重试不会重复创建相同记录。
- [x] 新增、读取、编辑、确认删除均连接 Supabase。
- [x] 每页 25 条，按新增时间从新到旧；新增回到第一页，删除末页最后一条后回到前页。
- [x] updated_at 版本检查，冲突保留输入；禁止直接改归属和服务器版本字段。
- [x] RLS 及 restrictive owner fence；账号切换后屏蔽旧列表和旧请求结果。
- [x] 加载、空状态、失败重试、防重复提交、保存成功后列表读取失败的区分。
- [x] 手动保存、取消草稿确认、刷新/离开提示、键盘对话框及焦点恢复。
- [x] 移除模拟记录、固定演示日期、假附件、占位图表和未接通筛选控件。

## 数据库部署步骤

1. 在 Supabase SQL Editor 执行 [预检查](../database/migrations/20261106_expenses_preflight.sql)。
   空结果表示未发现需要核对的记录；若有结果，先核对金额、分类、日期、描述与币种。
2. 执行 [增量迁移](../database/migrations/20261106_expenses_crud.sql) 全文。
   无需重建数据库或重跑 fresh_setup.sql。脚本可重跑，保留已有有效金额和创建时间。
3. 执行 [验证脚本](../database/migrations/20261106_expenses_verify.sql)。RLS 为 true，
   权限结果应为 `false / true / true / false / false`。
4. 刷新 Expenses 页面。无需修改 .env、OAuth 或 Storage。

迁移遇到旧负数、零、超精度/超范围金额、未知分类、空描述、异常日期或非 MYR 币种
会回滚，并报 EXPENSE_LEGACY_REVIEW_REQUIRED。先修正核对过的旧数据再重试；
脚本不会取绝对值、四舍五入、删除记录或编造描述。

currency 新增时旧记录按用户确认的 MYR 初始化。若旧记录实际使用其他币种，须先
人工核对原始账目。现有 currency 字段的非 MYR 记录不会自动换算或改写。

## 边界与持久化

- 记录字段：id、user_id、amount、currency、note（描述）、category、expense_date、created_at、updated_at。
- 前端服务只提交可编辑字段；数据库金额不使用浮点类型。
- 金额数据库不用 numeric(14,2) typmod，因为该类型会在 CHECK 前舍入超精度输入；
  numeric 与范围/精度约束提供等价的金额边界，并拒绝超过分的精度。
- 修改/删除匹配完整的原始 updated_at，保留微秒精度。创建重试只识别同 UUID 且内容
  完全一致的已提交记录，不覆盖已被其他窗口改过的记录。
- 成功写入后重新读列表。若随后读取失败，显示已保存/已删除通知和加载失败，
  重试仅重新读取，不重新提交写入。
- 草稿当前只在内存；失败后输入保留，刷新会有离开提示，不提供持久化离线草稿。
- 未来日期允许手动选择；本轮不实现收入、退款、多币种、汇率或自定义分类。

## 验收

- [x] 完整本地测试 117 项通过，生产构建通过（有资源体积及既存配置警告）。
- [x] 本地 PostgreSQL：迁移重跑、数据保留、金额精度、约束、RLS、归属/版本权限、冲突和异常旧数据回滚。
- [x] 服务/页面：CRUD、刷新读取、固定 UUID、防双击、失败保留、提交后读失败、分页、账号切换。
- [x] React DOM：表单字段、MYR 展示、保存失败保留输入、忙碌禁用、键盘及焦点恢复。
- [x] 用户提供线上 Supabase 策略查询截图，五条策略名称、类型和操作与迁移脚本预期一致（见下方记录）。
- [ ] 线上权限布尔值 `false / true / true / false / false` 的查询结果尚未在截图中确认。
- [ ] 线上执行 SQL 后，用两个账号通过界面和直接 API 验证隔离。
- [ ] 新建 RM 0.29、编辑至 RM 20.10、刷新、删除再刷新；保留正确日期和分类。
- [ ] 断网保存/删除重试、多窗口版本冲突、历史日期补记、移动端及 Electron 交互。

本地测试使用 PGlite 的 PostgreSQL、模拟 Supabase 请求和真实 React DOM；并未修改线上数据库。

### 用户提供的线上策略记录（2026-11-06）

依据：用户提交的 Supabase SQL Editor 结果截图。

| policyname | permissive | cmd |
|---|---|---|
| expenses_select_own | PERMISSIVE | SELECT |
| expenses_insert_own | PERMISSIVE | INSERT |
| expenses_update_own | PERMISSIVE | UPDATE |
| expenses_delete_own | PERMISSIVE | DELETE |
| expenses_owner_fence | RESTRICTIVE | ALL |

此结果确认五条策略已存在且类型/操作符合预期。截图没有展示策略表达式、
表 RLS 开关或权限布尔值，因此尚未将这些检查及双账号实际隔离测试标记为通过。

若迁移因旧数据核对失败、编辑器随后提示事务已中止，先执行 `ROLLBACK;`，再运行
预检查并核对记录。创建响应丢失后若更改草稿内容再重试，同 UUID 的不同内容会提示冲突，
应重新读取并编辑已创建的记录，避免自动覆盖金额。

## 后续阶段

- [ ] 日期/分类/关键词筛选、金额与日期排序。
- [ ] 全量筛选统计、真实分类分布及趋势图。
- [ ] 收据附件及 expense_attachments、鉴权上传、预览、下载、清理。
- [ ] Dashboard 真实支出联动。
