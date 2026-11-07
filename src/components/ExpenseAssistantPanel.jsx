import React, { useId } from "react";
import { useTranslation } from "react-i18next";
import { EXPENSE_CATEGORIES, malaysiaDay, validateExpenseContext } from "../../supabase/functions/ask-planwise/expense-report.mjs";

export function expenseMoney(cents) {
  const number=BigInt(cents),abs=number<0n?-number:number;
  return `${number<0n?"−":""}RM ${(abs/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,",")}.${String(abs%100n).padStart(2,"0")}`;
}
const percentage=value=>{if(value===null)return "—";const n=BigInt(value),abs=n<0n?-n:n;return `${n<0n?"−":""}${abs/100n}.${String(abs%100n).padStart(2,"0")}%`;};
export default function ExpenseAssistantPanel({scope,onChange,onRun,busy}) {
  const {t}=useTranslation(),id=useId(),thisMonth=malaysiaDay().slice(0,7);
  let valid=true;try{validateExpenseContext(scope);if(scope.month>thisMonth)valid=false;}catch{valid=false;}
  return <section aria-label={t("askPlanwise.expenses.scope")} className="rounded-xl border border-violet-200 bg-white p-4 space-y-3">
    <h3 className="font-semibold text-gray-900">{t("askPlanwise.expenses.title")}</h3>
    <label className="block text-sm text-gray-700" htmlFor={id+"-month"}>{t("askPlanwise.expenses.month")}</label>
    <input id={id+"-month"} type="month" min="1900-01" max={thisMonth} value={scope.month} disabled={busy}
      onChange={event=>onChange({month:event.target.value})} className="w-full rounded-lg border px-3 py-2 text-sm" />
    <p className="text-xs text-gray-500">{t(scope.month===thisMonth?"askPlanwise.expenses.currentHint":"askPlanwise.expenses.pastHint")}</p>
    <details><summary className="cursor-pointer text-sm text-violet-700">{t("askPlanwise.expenses.filters")}</summary>
      <div className="space-y-3 mt-3">
        <label className="block text-sm">{t("askPlanwise.expenses.category")}<select disabled={busy} value={scope.category} onChange={event=>onChange({category:event.target.value})} className="mt-1 w-full rounded-lg border p-2">
          <option value="">{t("expensesPanel.filters.allCategories")}</option>{EXPENSE_CATEGORIES.map(key=><option key={key} value={key}>{t(`expensesPanel.categories.${key}`)}</option>)}
        </select></label>
        <label className="block text-sm">{t("askPlanwise.expenses.search")}<input disabled={busy} value={scope.search} maxLength={1000} onChange={event=>onChange({search:event.target.value})} placeholder={t("askPlanwise.expenses.searchPlaceholder")}
          className="mt-1 w-full rounded-lg border p-2" /></label>
        <label className="block text-sm">{t("askPlanwise.expenses.smallAmount")}<input disabled={busy} inputMode="decimal" value={scope.smallAmount} onChange={event=>onChange({smallAmount:event.target.value})} className="mt-1 w-full rounded-lg border p-2" /></label>
      </div>
    </details>
    {!valid&&<p role="alert" className="text-xs text-red-700">{t("askPlanwise.errors.AI_EXPENSE_INPUT_INVALID")}</p>}
    <div className="grid grid-cols-2 gap-2">
      <button type="button" disabled={busy||!valid} onClick={()=>onRun("review")} className="rounded-lg bg-violet-600 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40">{t(scope.month===thisMonth?"askPlanwise.expenses.analyzeMonth":"askPlanwise.expenses.analyzeSelected")}</button>
      <button type="button" disabled={busy||!valid} onClick={()=>onRun("compare")} className="rounded-lg border border-violet-200 px-3 py-2.5 text-sm font-medium text-violet-700 disabled:opacity-40">{t("askPlanwise.expenses.compare")}</button>
    </div>
    <p className="text-xs text-gray-500">{t(scope.action==="compare"?"askPlanwise.expenses.compareMode":"askPlanwise.expenses.reviewMode")}</p>
  </section>;
}

export function ExpenseInsightCard({report,action}) {
  const {t}=useTranslation(),s=report.scope,c=report.current,p=report.previous;
  return <section aria-label={t("askPlanwise.expenses.figures")} className="mr-2 rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm space-y-3">
    <div className="text-xs text-violet-800 space-y-1"><p>{s.date_from} → {s.date_to} · MYR</p>
      {action==="compare"&&<p>{t("askPlanwise.expenses.previousPeriod")}: {s.previous_from} → {s.previous_to}</p>}
      {s.partial&&<p>{t("askPlanwise.expenses.partial")}</p>}
      {c.days!==p.days&&action==="compare"&&<p>{t("askPlanwise.expenses.unequalDays")}</p>}
      {s.category&&<p>{t(`expensesPanel.categories.${s.category}`)}</p>}{s.search&&<p className="break-words">{t("askPlanwise.expenses.search")}: {s.search}</p>}
    </div>
    <dl className="grid grid-cols-2 gap-3">
      <div><dt className="text-xs text-gray-500">{t("askPlanwise.expenses.total")}</dt><dd className="font-semibold">{expenseMoney(c.total_cents)}</dd></div>
      <div><dt className="text-xs text-gray-500">{t("askPlanwise.expenses.count")}</dt><dd>{c.count}</dd></div>
      <div><dt className="text-xs text-gray-500">{t("askPlanwise.expenses.average")}</dt><dd>{expenseMoney(c.average_cents)}</dd></div>
      <div><dt className="text-xs text-gray-500">{t("askPlanwise.expenses.dailyAverage")}</dt><dd>{expenseMoney(c.daily_average_cents)}</dd></div>
    </dl>
    {action==="compare"?<>
      <p>{t("askPlanwise.expenses.previousTotal")}: <strong>{expenseMoney(p.total_cents)}</strong></p>
      <p>{t("askPlanwise.expenses.change")}: <strong>{expenseMoney(report.comparison.delta_cents)}</strong> · {report.comparison.change_basis_points===null?t("askPlanwise.expenses.noPercentage"):percentage(report.comparison.change_basis_points)}</p>
      <ul className="space-y-1">{report.comparison.categories.map(row=><li key={row.key} className="flex justify-between gap-2"><span>{t(`expensesPanel.categories.${row.key}`)}</span><span>{expenseMoney(row.delta_cents)}</span></li>)}</ul>
    </>:<>
      <p>{t("askPlanwise.expenses.small",{amount:expenseMoney(s.small_amount_cents)})}: <strong>{expenseMoney(c.small.total_cents)}</strong> · {c.small.count} · {percentage(c.small.share_basis_points)}</p>
      <ul className="space-y-1">{c.categories.map(row=><li key={row.key} className="flex justify-between gap-2"><span>{t(`expensesPanel.categories.${row.key}`)} · {row.count}</span><span>{expenseMoney(row.total_cents)} · {percentage(row.share_basis_points)}</span></li>)}</ul>
      {!!c.frequent.length&&<details><summary className="cursor-pointer text-violet-700">{t("askPlanwise.expenses.frequent")}</summary><ul className="mt-2 space-y-2">{c.frequent.map((row,index)=><li key={index} className="break-words">{row.description}<br/>{row.count} · {expenseMoney(row.total_cents)}</li>)}</ul></details>}
    </>}
    {c.count==="0"&&<p className="text-gray-600">{t("askPlanwise.expenses.empty")}</p>}
    <p className="text-xs text-gray-500">{t("askPlanwise.expenses.exactHint")}</p>
  </section>;
}
