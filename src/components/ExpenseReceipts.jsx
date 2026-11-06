import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import ExpenseDialog from "./ExpenseDialog";
import NoteAttachments from "./NoteAttachments";
import { expenseReceiptPanelServices } from "../services/expenseReceiptService";
import { formatExpenseRM } from "../lib/expenseModel";

export default function ExpenseReceipts({ record, userId, onClose, onBusyChange }) {
  const { t } = useTranslation(), [busy,setBusy] = useState(false), working = useRef(false);
  const close = () => { if(!working.current) onClose(); };
  return <ExpenseDialog title={t("expensesPanel.receipts.title")} onClose={close}>
    <NoteAttachments key={userId+":"+record.id} noteId={record.id} userId={userId} saved
      services={expenseReceiptPanelServices} titleKey="expensesPanel.receipts.files" saveFirstKey="expensesPanel.receipts.saveFirst"
      allowFilePicker ConfirmDialog={ExpenseDialog} onBusyChange={value=>{working.current=value;setBusy(value);onBusyChange?.(value);}}>
      <div className="min-h-[140px] py-3">
        <p className="font-medium text-gray-900 break-words">{record.description}</p>
        <p className="text-sm text-gray-500 mt-1">{formatExpenseRM(record.cents)} · {record.date}</p>
        <p className="text-sm text-gray-600 mt-5">{t("expensesPanel.receipts.hint")}</p>
        <p className="text-xs text-gray-500 mt-2">{t("attachments.limits")}</p>
      </div>
    </NoteAttachments>
    <div className="mt-5 flex justify-end"><button type="button" disabled={busy} onClick={close} className="px-4 py-2 border rounded-lg disabled:opacity-50">{t("expensesPanel.receipts.close")}</button></div>
  </ExpenseDialog>;
}
