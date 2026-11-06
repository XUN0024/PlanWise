import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, expenseError, validExpenseDate } from "./expenseModel";

export const EXPENSE_TREND_MODES = ["auto", "day", "month"];
const integer = (value) => typeof value === "string" && /^(?:0|[1-9]\d{0,63})$/.test(value);
export function formatStatisticRM(cents) {
  const value = BigInt(cents), whole = (value / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `RM ${whole}.${(value % 100n).toString().padStart(2,"0")}`;
}
export const formatStatisticCount = (count) => count.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// Only the bounded display ratio becomes a Number; money stays in exact integer cents.
export const statisticRatio = (part, total) => BigInt(total) === 0n ? 0 : Number(BigInt(part) * 10000n / BigInt(total)) / 100;
export function expenseStatisticsFromRow(value) {
  const invalid = () => { throw expenseError("EXPENSE_STATS_INVALID"); };
  if (!value || !integer(value.count) || !integer(value.total_cents) || !integer(value.average_cents)
    || !["day","month"].includes(value.granularity)) invalid();
  const count = BigInt(value.count), total = BigInt(value.total_cents);
  if (BigInt(value.average_cents) !== (count === 0n ? 0n : (total + count / 2n) / count) || total < count || (count === 0n && total !== 0n)) invalid();
  function groups(items, keyName, validKey) {
    if (!Array.isArray(items)) invalid();
    const seen = new Set();let sum = 0n, records = 0n;
    const result = items.map((item) => {
      if (!item || !validKey(item[keyName]) || seen.has(item[keyName]) || !integer(item.count) || !integer(item.total_cents)
        || BigInt(item.count) === 0n || BigInt(item.total_cents) === 0n) invalid();
      seen.add(item[keyName]);sum += BigInt(item.total_cents);records += BigInt(item.count);
      return { [keyName]: item[keyName], count: item.count, totalCents: item.total_cents };
    });
    if (sum !== total || records !== count) invalid();
    return result;
  }
  const categories = groups(value.categories,"key",key=>EXPENSE_CATEGORIES.includes(key));
  const methods = groups(value.methods,"key",key=>[...EXPENSE_PAYMENT_METHODS,"unrecorded"].includes(key));
  const trend = groups(value.trend,"date",date=>validExpenseDate(date) && (value.granularity!=="month" || date.endsWith("-01")));
  if (trend.some((item,i)=>i>0 && item.date <= trend[i-1].date)) invalid();
  return { count: value.count, totalCents: value.total_cents, averageCents: value.average_cents, granularity: value.granularity, categories, methods, trend };
}
