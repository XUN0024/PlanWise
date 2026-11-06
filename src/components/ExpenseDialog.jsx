import React, { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";

export default function ExpenseDialog({ title, role = "dialog", onClose, children }) {
  const panel = useRef(null), close = useRef(onClose);
  const titleId = useId();
  // Capture before React commits autoFocus inputs inside the dialog.
  const opener = useRef(typeof document === "undefined" ? null : document.activeElement);
  close.current = onClose;
  useEffect(() => {
    const previous = opener.current, overflow = document.body.style.overflow;
    const root = document.getElementById("root"), inert = root?.inert;
    if (root && !root.contains(panel.current)) root.inert = true;
    document.body.style.overflow = "hidden";
    const controlsInOrder = () => [...panel.current.querySelectorAll("*")].filter(node=>
      node.matches("button,input,select,textarea") && !node.matches(":disabled") && !node.closest("[hidden]") && node.type!=="hidden" && node.tabIndex>=0);
    controlsInOrder()[0]?.focus();
    const keyboard = (event) => {
      // Only the top modal handles keys while receipt confirmation or preview is open.
      if ([...document.querySelectorAll('[aria-modal="true"]')].at(-1) !== panel.current) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close.current?.(); }
      if (event.key === "Tab") {
        const controls = controlsInOrder();
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); panel.current.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !panel.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true); document.body.style.overflow = overflow;
      if (root) root.inert = inert;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
    <section ref={panel} tabIndex={-1} role={role} aria-modal="true" aria-labelledby={titleId}
      className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
      <h2 id={titleId} className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  </div>, document.body);
}
