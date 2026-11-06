import { supabase } from "../lib/supabase";
import { EXPENSE_PAGE_SIZE, expenseError, expenseFromRow, expensePayload } from "../lib/expenseModel";
const FIELDS = "id,note,amount,currency,category,expense_date,created_at,updated_at";
async function requireUser(userId) {
  if (!userId) throw expenseError("EXPENSE_AUTH_REQUIRED");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data?.session?.user?.id !== userId) throw expenseError("EXPENSE_AUTH_REQUIRED");
}
export async function getExpenses(userId, page = 0) {
  await requireUser(userId);
  if (!Number.isSafeInteger(page) || page < 0) throw expenseError("EXPENSE_PAGE_INVALID");
  const { data, error } = await supabase.from("expenses").select(FIELDS).eq("user_id", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .range(page * EXPENSE_PAGE_SIZE, page * EXPENSE_PAGE_SIZE + EXPENSE_PAGE_SIZE);
  if (error) throw error;
  return { items: (data || []).slice(0, EXPENSE_PAGE_SIZE).map(expenseFromRow), hasMore: (data || []).length > EXPENSE_PAGE_SIZE };
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
      if (Object.entries(payload).every(([key, value]) => key === "amount" ? note.amount === value : existing.data[key] === value)) return note;
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
