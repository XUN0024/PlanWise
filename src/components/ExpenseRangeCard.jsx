import React from "react";
import { useTranslation } from "react-i18next";
import { expenseMoney } from "./ExpenseAssistantPanel";
import { ExpenseTrend } from "./ExpenseStatistics";
const percent=value=>{if(value===null)return "—";const n=BigInt(value),a=n<0n?-n:n;return(n<0n?"−":"")+(a/100n)+"."+String(a%100n).padStart(2,"0")+"%";};
export default function ExpenseRangeCard({report,action}){
  const {t}=useTranslation(),s=report.scope,p=report.current;
  const trend={granularity:p.granularity,trend:p.trend.map(row=>({date:row.date,count:row.count,totalCents:row.total_cents}))};
  return <section aria-label={t("askPlanwise.expensesRange.title")} className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm space-y-3">
    <h3 className="font-medium text-violet-900">{t("askPlanwise.expensesRange.title")}</h3>
    <p className="font-medium">{s.date_from} → {s.date_to} · MYR</p>
    {s.partial&&<p className="text-xs text-amber-800">{t("askPlanwise.expensesRange.partial",{date:s.as_of})}</p>}
    {s.category&&<p className="text-xs">{t("expensesPanel.categories."+s.category)}</p>}{s.search&&<p className="text-xs break-words">{t("askPlanwise.expenses.search")}: {s.search}</p>}
    {s.paymentMethod&&<p className="text-xs">{t(s.paymentMethod==="unrecorded"?"expensesPanel.notRecorded":"expensesPanel.paymentMethods."+s.paymentMethod)}</p>}
    {(s.minAmount||s.maxAmount)&&<p className="text-xs">RM {s.minAmount||"0.00"} – {s.maxAmount||"∞"}</p>}
    <dl className="grid grid-cols-2 gap-3">{[["count",p.count],["total",expenseMoney(p.total_cents)],["average",expenseMoney(p.average_cents)],["dailyAverage",expenseMoney(p.daily_average_cents)]].map(([key,value])=><div key={key}><dt className="text-xs text-gray-500">{t("askPlanwise.expenses."+key)}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>
    {p.count==="0"?<p>{t("askPlanwise.expenses.empty")}</p>:<>
      <p className="text-xs">{t("askPlanwise.expenses.small",{amount:expenseMoney(s.small_amount_cents)})}: {p.small.count} · {expenseMoney(p.small.total_cents)} · {percent(p.small.share_basis_points)}</p>
      <ul className="space-y-1">{p.categories.map(row=><li key={row.key} className="flex justify-between gap-2"><span>{t("expensesPanel.categories."+row.key)} · {row.count}</span><span>{expenseMoney(row.total_cents)}</span></li>)}</ul>
      {action!=="count"&&<div className="rounded-xl border bg-white p-3"><h4 className="font-medium mb-2">{t("expensesPanel.statistics.trend")}</h4><ExpenseTrend key={report.data_version+s.granularity} data={trend}/></div>}
    </>}
    {report.previous&&<div className="border-t border-violet-200 pt-3 space-y-2">
      <p className="text-xs">{t("askPlanwise.expenses.previousPeriod")}: {s.previous_from} → {s.previous_to}</p>
      {s.previous_partial&&<p className="text-xs text-amber-800">{t("askPlanwise.expensesRange.comparisonPartial",{date:s.as_of})}</p>}
      {p.days!==report.previous.days&&<p className="text-xs text-amber-800">{t("askPlanwise.expenses.unequalDays")}</p>}
      <p>{t("askPlanwise.expenses.previousTotal")}: {expenseMoney(report.previous.total_cents)} · {report.previous.count}</p>
      <p>{t("askPlanwise.expenses.change")}: <strong>{expenseMoney(report.comparison.delta_cents)}</strong> · {report.comparison.change_basis_points===null?t("askPlanwise.expenses.noPercentage"):percent(report.comparison.change_basis_points)}</p>
      <ul className="text-xs space-y-1">{report.comparison.categories.map(row=><li key={row.key} className="flex justify-between"><span>{t("expensesPanel.categories."+row.key)}</span><span>{expenseMoney(row.delta_cents)}</span></li>)}</ul>
    </div>}
    <p className="text-xs text-gray-500">{t("askPlanwise.expensesRange.exact")}</p>
  </section>;
}
