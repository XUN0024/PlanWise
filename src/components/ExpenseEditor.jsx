import React from "react";
import { useTranslation } from "react-i18next";
import ExpenseDialog from "./ExpenseDialog";
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, expenseCurrentTime } from "../lib/expenseModel";
const control = "mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

export default function ExpenseEditor({ draft, isNew, busy, error, onChange, onSave, onClose, onReload }) {
  const { t } = useTranslation();
  return <ExpenseDialog title={t(isNew ? "expensesPanel.add" : "expensesPanel.edit")} onClose={() => { if (!busy) onClose(); }}>
    <p className="text-sm text-gray-500 mb-4">{t("expensesPanel.currency")}: MYR (RM)</p>
    {error && <div role="alert" className="mb-4 text-sm text-red-700">
      <p>{t(error)}</p>
      {error === "expensesPanel.conflict" && <button type="button" disabled={busy} onClick={onReload} className="mt-2 underline">{t("expensesPanel.reload")}</button>}
    </div>}
    <form onSubmit={onSave}>
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
        <label className="block text-sm font-medium text-gray-700">{t("expensesPanel.description")}
          <input autoFocus required value={draft.description} onChange={(event) => onChange({ description: event.target.value })} className={control} />
        </label>
        <label className="block text-sm font-medium text-gray-700">{t("expensesPanel.amount")}
          <input required inputMode="decimal" type="text" autoComplete="off" placeholder="12.50" value={draft.amount}
            onChange={(event) => onChange({ amount: event.target.value })} className={control} />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-sm font-medium text-gray-700">{t("expensesPanel.date")}
            <input required type="date" min="0001-01-01" max="9999-12-31" value={draft.date} onChange={(event) => onChange({ date: event.target.value })} className={control} />
          </label>
          <div>
            <label htmlFor="expense-time" className="block text-sm font-medium text-gray-700">{t("expensesPanel.time")} <span className="font-normal text-gray-500">({t("expensesPanel.optional")})</span></label>
            <input id="expense-time" type="time" step="60" value={draft.time || ""} onChange={(event) => onChange({ time: event.target.value })} className={control} />
            <div className="flex flex-wrap gap-3 mt-2 text-xs">
              <button type="button" onClick={() => onChange({ time: expenseCurrentTime() })} className="text-blue-600">{t("expensesPanel.useCurrentTime")}</button>
              <button type="button" disabled={!draft.time} onClick={() => onChange({ time: "" })} className="text-gray-500 disabled:opacity-40">{t("expensesPanel.clearTime")}</button>
            </div>
          </div>
        </div>
        <label className="block text-sm font-medium text-gray-700">{t("expensesPanel.category")}
          <select value={draft.category} onChange={(event) => onChange({ category: event.target.value })} className={control}>
            {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{t(`expensesPanel.categories.${category}`)}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">{t("expensesPanel.paymentMethod")} <span className="font-normal text-gray-500">({t("expensesPanel.optional")})</span>
          <select value={draft.paymentMethod || ""} onChange={(event) => onChange({ paymentMethod: event.target.value })} className={control}>
            <option value="">{t("expensesPanel.notRecorded")}</option>
            {EXPENSE_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{t(`expensesPanel.paymentMethods.${method}`)}</option>)}
          </select>
        </label>
        <p className="text-xs text-gray-500">{t("expensesPanel.receipts.optional")}</p>
        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">{t("cancel")}</button>
          <button type="submit" name="afterSave" value="receipts" className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg">{t("expensesPanel.receipts.saveAndAdd")}</button>
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{t(busy ? "expensesPanel.saving" : "save")}</button>
        </div>
      </fieldset>
    </form>
  </ExpenseDialog>;
}
