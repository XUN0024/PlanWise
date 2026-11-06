import { supabase } from "../lib/supabase";
import { EXPENSE_PAGE_SIZE, expenseError, expenseFromRow, expensePayload } from "../lib/expenseModel";
import { expenseSearchPattern, normalizeExpenseFilters } from "../lib/expenseQuery";
import { EXPENSE_TREND_MODES, expenseStatisticsFromRow } from "../lib/expenseStatistics";
const FIELDS = "id,note,amount,currency,category,expense_date,expense_time,payment_method,created_at,updated_at";
async function requireUser(userId) {
  if (!userId) throw expenseError("EXPENSE_AUTH_REQUIRED");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data?.session?.user?.id !== userId) throw expenseError("EXPENSE_AUTH_REQUIRED");
}
export async function getExpenses(userId, page = 0, filters = {}) {
  await requireUser(userId);
  if (!Number.isSafeInteger(page) || page < 0) throw expenseError("EXPENSE_PAGE_INVALID");
  const options = normalizeExpenseFilters(filters);
  let query = supabase.from("expenses").select(FIELDS).eq("user_id", userId);
  if (options.dateFrom) query = query.gte("expense_date", options.dateFrom);
  if (options.dateTo) query = query.lte("expense_date", options.dateTo);
  if (options.category) query = query.eq("category", options.category);
  if (options.paymentMethod === "unrecorded") query = query.is("payment_method", null);
  else if (options.paymentMethod) query = query.eq("payment_method", options.paymentMethod);
  if (options.minAmount) query = query.gte("amount", options.minAmount);
  if (options.maxAmount) query = query.lte("amount", options.maxAmount);
  if (options.search) query = query.filter("note", "imatch", expenseSearchPattern(options.search));
  if (options.sort === "created_desc") query = query.order("created_at", { ascending: false });
  else {
    if (options.sort.startsWith("amount_")) query = query.order("amount", { ascending: options.sort === "amount_asc" });
    query = query.order("expense_date", { ascending: options.sort === "date_asc" })
      .order("expense_time", { ascending: options.sort === "date_asc", nullsFirst: false });
  }
  const { data, error } = await query.order("id", { ascending: false })
    .range(page * EXPENSE_PAGE_SIZE, page * EXPENSE_PAGE_SIZE + EXPENSE_PAGE_SIZE);
  if (error) throw error;
  return { items: (data || []).slice(0, EXPENSE_PAGE_SIZE).map(expenseFromRow), hasMore: (data || []).length > EXPENSE_PAGE_SIZE };
}
export async function getExpenseStatistics(userId, filters = {}, granularity = "auto") {
  await requireUser(userId);
  const options = normalizeExpenseFilters(filters);
  if (!EXPENSE_TREND_MODES.includes(granularity)) throw expenseError("EXPENSE_FILTER_INVALID");
  const { data, error } = await supabase.rpc("get_expense_statistics", {
    p_date_from: options.dateFrom || null, p_date_to: options.dateTo || null,
    p_category: options.category || null, p_payment_method: options.paymentMethod || null,
    p_search: options.search || null, p_min_amount: options.minAmount || null, p_max_amount: options.maxAmount || null,
    p_granularity: granularity,
  });
  if (error && ["PGRST202","42883"].includes(error.code)) throw expenseError("EXPENSE_STATS_SETUP_REQUIRED");
  if (error) throw error;
  return expenseStatisticsFromRow(data);
}
export async function createExpense(draft, userId) {
  const payload = expensePayload(draft);
  await requireUser(userId);
  const { data, error } = await supabase.from("expenses").insert({ ...payload, id: draft.id, user_id: userId }).select(FIELDS).single();
  if (error?.code === "23505") {
    const existing = await supabase.from("expenses").select(FIELDS).eq("id", draft.id).eq("user_id", userId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      const note = expenseFromRow(existing.data);
      const stored = expensePayload(note);
      if (Object.entries(payload).every(([key, value]) => stored[key] === value)) return note;
    }
    throw expenseError("EXPENSE_CONFLICT");
  }
  if (error) throw error;
  if (!data) throw expenseError("EXPENSE_SAVE_FAILED");
  return expenseFromRow(data);
}
export async function updateExpense(draft, userId, version) {
  const payload = expensePayload(draft);
  await requireUser(userId);
  if (!version) throw expenseError("EXPENSE_CONFLICT");
  const { data, error } = await supabase.from("expenses").update(payload)
    .eq("id", draft.id).eq("user_id", userId).eq("updated_at", version).select(FIELDS).maybeSingle();
  if (error) throw error;
  if (!data) throw expenseError("EXPENSE_CONFLICT");
  return expenseFromRow(data);
}
export async function deleteExpense(record, userId) {
  await requireUser(userId);
  if (!record.updatedAt) throw expenseError("EXPENSE_CONFLICT");
  const { data, error } = await supabase.from("expenses").delete().eq("id", record.id)
    .eq("user_id", userId).eq("updated_at", record.updatedAt).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw expenseError("EXPENSE_CONFLICT");
}
