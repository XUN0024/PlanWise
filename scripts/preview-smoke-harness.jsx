import React from "react";
import { createRoot } from "react-dom/client";
import AttachmentPreview from "../src/components/AttachmentPreview";
import i18n from "../src/i18n";
import "../src/index.css";
i18n.changeLanguage("en");
window.planwiseAttachments = {
  save: async (value) => { window.smokeSavedBytes = value.bytes.length; return { cancelled: true }; },
  print: async (value) => { window.smokePrint = value; return { cancelled: true }; }, cancelPrint() {},
};
window.inspectPrinted = async (bytes) => {
  const { openPreviewPdf } = await import("../src/lib/pdfPreview");
  const task = openPreviewPdf(new Uint8Array(bytes));
  const doc = await task.promise; const count = doc.numPages; await task.destroy(); return count;
};
function Harness() {
  const [open, setOpen] = React.useState(false);
  return <div><textarea defaultValue="Unsaved note draft" /><button id="open-preview" onClick={() => setOpen(true)}>Open preview</button>
    {open && <AttachmentPreview userId="test-user" record={{ id: "test-file", status: "ready", original_name: "中文附件.pdf", mime_type: "application/pdf" }} onClose={() => setOpen(false)} />}
  </div>;
}
createRoot(document.getElementById("root")).render(<Harness />);
