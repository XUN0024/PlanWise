import React from "react";
import { useTranslation } from "react-i18next";
import { EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS } from "../lib/expenseModel";
import { EXPENSE_DATE_PRESETS, EXPENSE_SORTS } from "../lib/expenseQuery";

const control = "mt-1 w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
export default function ExpenseFilters({ filters, disabled, error, onChange, onReset }) {
  const { t } = useTranslation();
  const update = (key) => (event) => onChange({ [key]: event.target.value });
  return <section aria-label={t("expensesPanel.filters.title")} className="bg-white border rounded-xl p-4 mb-5">
    <fieldset disabled={disabled} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 disabled:opacity-60">
      <legend className="font-medium text-gray-900 mb-3">{t("expensesPanel.filters.title")}</legend>
      <label className="text-sm text-gray-700">{t("expensesPanel.filters.search")}
        <input type="search" value={filters.search} maxLength={1000} onChange={update("search")} placeholder={t("expensesPanel.filters.searchPlaceholder")} className={control} />
      </label>
      <label className="text-sm text-gray-700">{t("expensesPanel.filters.dateRange")}
        <select value={filters.datePreset} onChange={update("datePreset")} className={control}>
          {EXPENSE_DATE_PRESETS.map((preset) => <option key={preset} value={preset}>{t(`expensesPanel.filters.dates.${preset}`)}</option>)}
        </select>
      </label>
      <label className="text-sm text-gray-700">{t("expensesPanel.filters.sort")}
        <select value={filters.sort} onChange={update("sort")} className={control}>
          {EXPENSE_SORTS.map((sort) => <option key={sort} value={sort}>{t(`expensesPanel.filters.sorts.${sort}`)}</option>)}
        </select>
      </label>
      {filters.datePreset === "custom" && <>
        <label className="text-sm text-gray-700">{t("expensesPanel.filters.dateFrom")}
          <input type="date" min="0001-01-01" max="9999-12-31" value={filters.dateFrom} onChange={update("dateFrom")} className={control} />
        </label>
        <label className="text-sm text-gray-700">{t("expensesPanel.filters.dateTo")}
          <input type="date" min="0001-01-01" max="9999-12-31" value={filters.dateTo} onChange={update("dateTo")} className={control} />
        </label>
      </>}
      <label className="text-sm text-gray-700">{t("expensesPanel.category")}
        <select value={filters.category} onChange={update("category")} className={control}>
          <option value="">{t("expensesPanel.filters.allCategories")}</option>
          {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{t(`expensesPanel.categories.${category}`)}</option>)}
        </select>
      </label>
      <label className="text-sm text-gray-700">{t("expensesPanel.paymentMethod")}
        <select value={filters.paymentMethod} onChange={update("paymentMethod")} className={control}>
          <option value="">{t("expensesPanel.filters.allMethods")}</option>
          {EXPENSE_PAYMENT_METHODS.map((method) => <option key={method} value={method}>{t(`expensesPanel.paymentMethods.${method}`)}</option>)}
          <option value="unrecorded">{t("expensesPanel.notRecorded")}</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-gray-700">{t("expensesPanel.filters.minAmount")}
          <input type="text" inputMode="decimal" value={filters.minAmount} onChange={update("minAmount")} placeholder="0.00" className={control} />
        </label>
        <label className="text-sm text-gray-700">{t("expensesPanel.filters.maxAmount")}
          <input type="text" inputMode="decimal" value={filters.maxAmount} onChange={update("maxAmount")} placeholder={t("expensesPanel.filters.noLimit")} className={control} />
        </label>
      </div>
      <button type="button" onClick={onReset} className="sm:col-span-2 lg:col-span-3 justify-self-end text-sm text-blue-600 underline">{t("expensesPanel.filters.reset")}</button>
    </fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{t(error)}</p>}
  </section>;
}
