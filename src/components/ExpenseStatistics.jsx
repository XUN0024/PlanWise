import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EXPENSE_CATEGORIES } from "../lib/expenseModel";
import { EXPENSE_TREND_MODES, formatStatisticCount, formatStatisticRM, statisticRatio } from "../lib/expenseStatistics";

const colors = ["#2563eb","#7c3aed","#0891b2","#ea580c","#db2777","#059669","#64748b"];
function Breakdown({ items, total, methods = false }) {
  const { t } = useTranslation();
  return <ul className={methods ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5" : "space-y-4"}>{items.map((item, index) => {
    const label = methods ? item.key === "unrecorded" ? t("expensesPanel.notRecorded") : t(`expensesPanel.paymentMethods.${item.key}`) : t(`expensesPanel.categories.${item.key}`);
    const ratio = statisticRatio(item.totalCents,total);
    const color = colors[methods ? index % colors.length : EXPENSE_CATEGORIES.indexOf(item.key)];
    return <li key={item.key}>
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm"><span className="font-medium text-gray-700">{label}</span><span className="font-medium text-gray-900">{formatStatisticRM(item.totalCents)}</span></div>
      <div className="h-2 rounded-full bg-gray-100 mt-2 overflow-hidden" aria-hidden="true"><div className="h-full rounded-full" style={{width:`${ratio}%`,backgroundColor:color}} /></div>
      <div className="flex justify-between text-xs text-gray-500 mt-1"><span>{t("expensesPanel.statistics.recordsLabel")}: {formatStatisticCount(item.count)}</span><span>{ratio.toFixed(1)}%</span></div>
    </li>;
  })}</ul>;
}
function ordinal(date, unit) {
  const [year,month,day] = date.split("-").map(Number);
  if (unit === "month") return year * 12 + month;
  const value = new Date(0);value.setUTCFullYear(year,month-1,day);value.setUTCHours(0,0,0,0);
  return value.getTime() / 86400000;
}
function Trend({ data }) {
  const { t } = useTranslation(), [offset,setOffset] = useState(0);
  useEffect(()=>setOffset(0),[data]);
  const shift = Math.min(offset,Math.max(0,data.trend.length-1));
  const end = data.trend.length-shift, start = Math.max(0,end-60), items = data.trend.slice(start,end);
  const label = date => data.granularity === "month" ? date.slice(0,7) : date;
  const first = ordinal(items[0].date,data.granularity), span = ordinal(items.at(-1).date,data.granularity)-first;
  const maximum = items.reduce((highest,item)=>BigInt(item.totalCents)>BigInt(highest)?item.totalCents:highest,"0");
  const plot = { x: 16, y: 20, width: 768, height: 190 }, barWidth = Math.max(1,Math.min(34,plot.width/(span+1)*0.65));
  return <>
    <p className="text-xs text-gray-500 mb-4">{t(`expensesPanel.statistics.units.${data.granularity}`)} · {label(items[0].date)} – {label(items.at(-1).date)}</p>
    <svg role="img" aria-label={t("expensesPanel.statistics.trend")} viewBox="0 0 800 250" className="w-full" style={{minHeight:160}}>
      <title>{t("expensesPanel.statistics.trend")}</title>
      {[0,0.5,1].map(level=><line key={level} x1={plot.x} x2={plot.x+plot.width} y1={plot.y+plot.height*level} y2={plot.y+plot.height*level} stroke="#e5e7eb" strokeDasharray="4 4" />)}
      {items.map(item=>{
        const height = statisticRatio(item.totalCents,maximum)/100*plot.height;
        const x = plot.x + barWidth/2 + (span===0 ? (plot.width-barWidth)/2 : (ordinal(item.date,data.granularity)-first)/span*(plot.width-barWidth));
        const text = `${label(item.date)}: ${formatStatisticRM(item.totalCents)} · ${t("expensesPanel.statistics.recordsLabel")}: ${formatStatisticCount(item.count)}`;
        return <rect key={item.date} x={x-barWidth/2} y={plot.y+plot.height-height} width={barWidth} height={height} rx="3" fill="#2563eb" tabIndex="0" role="img" aria-label={text}><title>{text}</title></rect>;
      })}
      <text x={plot.x} y="238" fontSize="11" fill="#6b7280">{label(items[0].date)}</text>
      {items.length>1 && <text x={plot.x+plot.width} y="238" textAnchor="end" fontSize="11" fill="#6b7280">{label(items.at(-1).date)}</text>}
    </svg>
    <p className="text-xs text-gray-500">{t("expensesPanel.statistics.trendHint")} · {t("expensesPanel.statistics.peak")}: {formatStatisticRM(maximum)}</p>
    {data.trend.length>60 && <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
      <button type="button" disabled={start===0} onClick={()=>setOffset(shift+60)} className="text-blue-600 disabled:text-gray-400">{t("expensesPanel.statistics.earlier")}</button>
      <span className="text-xs text-gray-500">{t("expensesPanel.statistics.periods")}: {start+1}–{end} / {data.trend.length}</span>
      <button type="button" disabled={shift===0} onClick={()=>setOffset(Math.max(0,shift-60))} className="text-blue-600 disabled:text-gray-400">{t("expensesPanel.statistics.later")}</button>
    </div>}
    <details className="mt-4 text-sm"><summary className="cursor-pointer text-blue-600">{t("expensesPanel.statistics.viewData")}</summary>
      <div className="overflow-x-auto max-h-64 mt-3"><table className="w-full text-left text-xs"><caption className="sr-only">{t("expensesPanel.statistics.trend")}</caption>
        <thead><tr><th className="p-2">{t("expensesPanel.date")}</th><th className="p-2">{t("expensesPanel.statistics.total")}</th><th className="p-2">{t("expensesPanel.statistics.recordsLabel")}</th></tr></thead>
        <tbody>{items.map(item=><tr key={item.date} className="border-t"><th scope="row" className="p-2 font-normal">{label(item.date)}</th><td className="p-2">{formatStatisticRM(item.totalCents)}</td><td className="p-2">{formatStatisticCount(item.count)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </>;
}
export { Trend as ExpenseTrend };
export default function ExpenseStatistics({ data, loading, error, granularity, onGranularityChange, onRetry, disabled }) {
  const { t } = useTranslation();
  return <section aria-label={t("expensesPanel.statistics.title")} className="mb-8">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div><h2 className="text-lg font-semibold text-gray-900">{t("expensesPanel.statistics.title")}</h2><p className="text-xs text-gray-500 mt-1">{t("expensesPanel.statistics.scope")}</p></div>
      <label className="text-xs text-gray-600">{t("expensesPanel.statistics.granularity")}
        <select disabled={disabled} value={granularity} onChange={event=>onGranularityChange(event.target.value)} className="ml-2 rounded-lg border bg-white p-2 text-sm text-gray-700">
          {EXPENSE_TREND_MODES.map(mode=><option key={mode} value={mode}>{t(`expensesPanel.statistics.units.${mode}`)}</option>)}
        </select>
      </label>
    </div>
    {loading ? <div role="status" className="bg-white border rounded-xl p-8 text-sm text-gray-500">{t("expensesPanel.statistics.loading")}</div>
      : error ? <div role="alert" className="bg-red-50 border border-red-100 rounded-xl p-5 text-sm text-red-700"><p>{t(error)}</p><button type="button" disabled={disabled} onClick={onRetry} className="underline mt-3">{t("expensesPanel.retry")}</button></div>
      : data && <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          {[["total",formatStatisticRM(data.totalCents)],["recordsLabel",formatStatisticCount(data.count)],["average",formatStatisticRM(data.averageCents)]].map(([key,value])=><div key={key} className="bg-white border rounded-xl p-5">
            <h3 className="text-sm text-gray-500">{t(`expensesPanel.statistics.${key}`)}</h3><p className="mt-3 text-2xl font-semibold text-gray-900 break-words">{value}</p>
          </div>)}
        </div>
        {data.count==="0" ? <div role="status" className="bg-white border rounded-xl p-8 text-center text-sm text-gray-500">{t("expensesPanel.statistics.empty")}</div>
          : <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <div className="lg:col-span-2 bg-white border rounded-xl p-5 min-w-0"><h3 className="font-medium text-gray-900 mb-3">{t("expensesPanel.statistics.trend")}</h3><Trend data={data} /></div>
              <div className="bg-white border rounded-xl p-5 min-w-0"><h3 className="font-medium text-gray-900 mb-5">{t("expensesPanel.statistics.categories")}</h3><Breakdown items={data.categories} total={data.totalCents} /></div>
            </div>
            <div className="bg-white border rounded-xl p-5"><h3 className="font-medium text-gray-900 mb-5">{t("expensesPanel.statistics.methods")}</h3><Breakdown items={data.methods} total={data.totalCents} methods /></div>
          </>}
      </>}
  </section>;
}
