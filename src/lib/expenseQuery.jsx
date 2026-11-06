import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, expenseDecimal, expenseError, expenseToday, parseExpenseAmount, validExpenseDate } from "./expenseModel";

export const EXPENSE_DATE_PRESETS = ["all", "today", "last7", "month", "custom"];
export const EXPENSE_SORTS = ["date_desc", "date_asc", "amount_desc", "amount_asc", "created_desc"];
export const DEFAULT_EXPENSE_FILTERS = Object.freeze({ datePreset: "all", dateFrom: "", dateTo: "", category: "", paymentMethod: "", search: "", minAmount: "", maxAmount: "", sort: "date_desc" });

function amountBound(value) {
  if (!value.trim()) return "";
  try { return expenseDecimal(/^0{1,12}(?:\.0{1,2})?$/.test(value.trim()) ? 0 : parseExpenseAmount(value)); }
  catch { throw expenseError("EXPENSE_FILTER_AMOUNT_INVALID"); }
}
export function normalizeExpenseFilters(input = {}, now = new Date()) {
  const value = { ...DEFAULT_EXPENSE_FILTERS, ...input };
  if (Object.keys(DEFAULT_EXPENSE_FILTERS).some((key) => typeof value[key] !== "string")) throw expenseError("EXPENSE_FILTER_INVALID");
  if (!EXPENSE_DATE_PRESETS.includes(value.datePreset) || !EXPENSE_SORTS.includes(value.sort)
    || (value.category && !EXPENSE_CATEGORIES.includes(value.category))
    || (value.paymentMethod && value.paymentMethod !== "unrecorded" && !EXPENSE_PAYMENT_METHODS.includes(value.paymentMethod))) throw expenseError("EXPENSE_FILTER_INVALID");
  let dateFrom = "", dateTo = "";
  if (value.datePreset === "custom") { dateFrom = value.dateFrom; dateTo = value.dateTo; }
  else if (value.datePreset !== "all") {
    dateTo = expenseToday(now);
    if (value.datePreset === "today") dateFrom = dateTo;
    else if (value.datePreset === "last7") { const start = new Date(now); start.setDate(start.getDate() - 6); dateFrom = expenseToday(start); }
    else { dateFrom = dateTo.slice(0, 8) + "01"; const end = new Date(now); end.setMonth(end.getMonth() + 1, 0); dateTo = expenseToday(end); }
  }
  if ((dateFrom && !validExpenseDate(dateFrom)) || (dateTo && !validExpenseDate(dateTo))) throw expenseError("EXPENSE_FILTER_DATE_INVALID");
  if (dateFrom && dateTo && dateFrom > dateTo) throw expenseError("EXPENSE_FILTER_DATE_RANGE");
  const minAmount = amountBound(value.minAmount), maxAmount = amountBound(value.maxAmount);
  if (minAmount && maxAmount && Number(minAmount) > Number(maxAmount)) throw expenseError("EXPENSE_FILTER_AMOUNT_RANGE");
  const search = value.search.trim();
  if (Array.from(search).length > 1000 || search.includes("\0")) throw expenseError("EXPENSE_FILTER_SEARCH_INVALID");
  return { dateFrom, dateTo, category: value.category, paymentMethod: value.paymentMethod, search, minAmount, maxAmount, sort: value.sort };
}
// PostgREST imatch uses PostgreSQL's ~*: escape regex syntax for literal substring search.
export const expenseSearchPattern = (text) => text.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
export const hasExpenseFilters = (filters) => ["dateFrom", "dateTo", "category", "paymentMethod", "search", "minAmount", "maxAmount"].some((key) => !!filters[key]);
