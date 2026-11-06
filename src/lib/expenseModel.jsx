export const EXPENSE_CATEGORIES = ["Food", "Transport", "Bills", "Entertainment", "Shopping", "Health", "Other"];
export const EXPENSE_PAYMENT_METHODS = ["cash", "debit_card", "credit_card", "bank_transfer", "e_wallet", "other"];
export const EXPENSE_PAGE_SIZE = 25;
export const MAX_EXPENSE_CENTS = 99999999999999;
export const expenseError = (code) => Object.assign(new Error(code), { code });

export function parseExpenseAmount(value) {
  const text = typeof value === "string" ? value.trim() : String(value);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(text)) throw expenseError("EXPENSE_AMOUNT_INVALID");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 1 || cents > MAX_EXPENSE_CENTS) throw expenseError("EXPENSE_AMOUNT_INVALID");
  return cents;
}
export const expenseDecimal = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
export const formatExpenseRM = (cents) => {
  const [whole, fraction] = expenseDecimal(cents).split(".");
  return `RM ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
};
export function validExpenseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1
    && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export const expenseToday = (now = new Date()) => `${String(now.getFullYear()).padStart(4, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
export const expenseCurrentTime = (now = new Date()) => `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
export const validExpenseTime = (value) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const timeFromRow = (value) => {
  if (value == null) return "";
  const time = typeof value === "string" && /^\d{2}:\d{2}:00(?:\.0+)?$/.test(value) ? value.slice(0, 5) : value;
  if (!validExpenseTime(time)) throw expenseError("EXPENSE_DATA_INVALID");
  return time;
};
export function expensePayload(draft) {
  const description = typeof draft.description === "string" ? draft.description.trim() : "";
  if (!description || Array.from(description).length > 1000) throw expenseError("EXPENSE_DESCRIPTION_INVALID");
  const cents = parseExpenseAmount(draft.amount);
  if (!validExpenseDate(draft.date)) throw expenseError("EXPENSE_DATE_INVALID");
  if (!EXPENSE_CATEGORIES.includes(draft.category)) throw expenseError("EXPENSE_CATEGORY_INVALID");
  if (draft.currency !== "MYR") throw expenseError("EXPENSE_CURRENCY_INVALID");
  const time = draft.time ?? "", method = draft.paymentMethod ?? "";
  if (time !== "" && !validExpenseTime(time)) throw expenseError("EXPENSE_TIME_INVALID");
  if (method !== "" && !EXPENSE_PAYMENT_METHODS.includes(method)) throw expenseError("EXPENSE_PAYMENT_METHOD_INVALID");
  return { note: description, amount: expenseDecimal(cents), currency: "MYR", category: draft.category, expense_date: draft.date,
    expense_time: time ? time + ":00" : null, payment_method: method || null };
}
export function expenseFromRow(row) {
  if (row.currency !== "MYR" || !validExpenseDate(row.expense_date) || !EXPENSE_CATEGORIES.includes(row.category)
    || !row.note?.trim() || !row.updated_at) throw expenseError("EXPENSE_DATA_INVALID");
  const cents = parseExpenseAmount(row.amount);
  if (row.payment_method != null && !EXPENSE_PAYMENT_METHODS.includes(row.payment_method)) throw expenseError("EXPENSE_DATA_INVALID");
  return { id: row.id, description: row.note, cents, amount: expenseDecimal(cents), currency: "MYR",
    time: timeFromRow(row.expense_time), paymentMethod: row.payment_method ?? "",
    category: row.category, date: row.expense_date, createdAt: row.created_at, updatedAt: row.updated_at };
}
export const expenseIsDirty = (draft, base) => ["description", "amount", "date", "category", "time", "paymentMethod"].some((key) => (draft[key] ?? "") !== (base[key] ?? ""));
export const expenseErrorKey = (error, fallback = "expensesPanel.saveError") => {
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(error?.code)) return "expensesPanel.setupRequired";
  return ({ EXPENSE_AMOUNT_INVALID: "expensesPanel.amountInvalid", EXPENSE_DESCRIPTION_INVALID: "expensesPanel.descriptionInvalid",
    EXPENSE_DATE_INVALID: "expensesPanel.dateInvalid", EXPENSE_CATEGORY_INVALID: "expensesPanel.categoryInvalid",
    EXPENSE_TIME_INVALID: "expensesPanel.timeInvalid", EXPENSE_PAYMENT_METHOD_INVALID: "expensesPanel.paymentMethodInvalid",
    EXPENSE_FILTER_INVALID: "expensesPanel.filters.invalid", EXPENSE_FILTER_DATE_INVALID: "expensesPanel.filters.dateInvalid",
    EXPENSE_FILTER_DATE_RANGE: "expensesPanel.filters.dateRangeInvalid", EXPENSE_FILTER_AMOUNT_INVALID: "expensesPanel.filters.amountInvalid",
    EXPENSE_FILTER_AMOUNT_RANGE: "expensesPanel.filters.amountRangeInvalid", EXPENSE_FILTER_SEARCH_INVALID: "expensesPanel.filters.searchInvalid",
    EXPENSE_STATS_SETUP_REQUIRED: "expensesPanel.statistics.setupRequired", EXPENSE_STATS_INVALID: "expensesPanel.statistics.dataInvalid",
    EXPENSE_RECEIPTS_SETUP_REQUIRED: "expensesPanel.receipts.setupRequired", EXPENSE_RECEIPT_CLEANUP_FAILED: "expensesPanel.receipts.cleanupError",
    EXPENSE_CURRENCY_INVALID: "expensesPanel.currencyInvalid", EXPENSE_CONFLICT: "expensesPanel.conflict",
    EXPENSE_AUTH_REQUIRED: "expensesPanel.authError", EXPENSE_DATA_INVALID: "expensesPanel.dataInvalid" })[error?.code] || fallback;
};
