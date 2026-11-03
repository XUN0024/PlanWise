import React, { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NOTE_COLORS } from "../lib/noteColors";

export const clampMenuPosition = (x, y, width, height, viewportWidth, viewportHeight) => ({
  left: Math.max(8, Math.min(x, viewportWidth - width - 8)),
  top: Math.max(8, Math.min(y, viewportHeight - height - 8)),
});

export default function NoteContextMenu({ note, x, y, onAction, onClose }) {
  const { t } = useTranslation();
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const previous = document.activeElement;
    const bounds = menu.getBoundingClientRect();
    setPosition(clampMenuPosition(x, y, bounds.width, bounds.height, window.innerWidth, window.innerHeight));
    menu.querySelector('[role="menuitemcheckbox"]')?.focus({ preventScroll: true });
    const outside = (event) => { if (!menu.contains(event.target)) onClose(); };
    const dismiss = () => onClose();
    const scroll = (event) => {
      if (event.target === window || !menu.contains(event.target)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", scroll, true);
      if (menu.contains(document.activeElement) || document.activeElement === document.body) previous?.focus?.({ preventScroll: true });
    };
  }, [x, y, note.id]);
  const onKeyDown = (event) => {
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      onClose();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = [...menuRef.current.querySelectorAll('[role^="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };
  const itemClass = "w-full text-left px-4 py-2 text-sm hover:bg-gray-100 focus:bg-blue-50 focus:outline-none";
  return (
    <div ref={menuRef} role="menu" aria-label={t("notesPanel.contextMenu")} onKeyDown={onKeyDown}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
      className="fixed z-50 py-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-y-auto"
      style={{ ...position, width: 244, maxWidth: "calc(100vw - 16px)", maxHeight: "calc(100vh - 16px)" }}>
      <p className="px-4 py-2 text-xs text-gray-500 truncate" title={note.title}>{note.title || t("notesPanel.untitled")}</p>
      <button role="menuitemcheckbox" aria-checked={note.starred} className={itemClass}
        onClick={() => onAction({ type: "appearance", changes: { starred: !note.starred } })}>
        {t(note.starred ? "notesPanel.unstar" : "notesPanel.star")}
      </button>
      <button role="menuitemcheckbox" aria-checked={note.pinned} className={itemClass}
        onClick={() => onAction({ type: "appearance", changes: { pinned: !note.pinned } })}>
        {t(note.pinned ? "notesPanel.unpin" : "notesPanel.pin")}
      </button>
      <div role="group" aria-label={t("notesPanel.changeColor")} className="px-4 py-2 border-y border-gray-100 my-1">
        <p className="text-xs text-gray-500 mb-2">{t("notesPanel.changeColor")}</p>
        <div className="flex gap-2">{NOTE_COLORS.map((color) =>
          <button key={color.value} role="menuitemradio" aria-checked={note.color === color.value}
            aria-label={t(`notesPanel.colors.${color.name}`)} title={t(`notesPanel.colors.${color.name}`)}
            onClick={() => onAction({ type: "appearance", changes: { color: color.value } })}
            className="w-7 h-7 rounded-full shrink-0 border border-black/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-center"
            style={{ backgroundColor: color.value }}>
            {note.color === color.value && <span aria-hidden="true" className="text-white text-sm">✓</span>}
          </button>
        )}</div>
      </div>
      <button role="menuitem" className={itemClass} onClick={() => onAction({ type: "edit" })}>{t("notesPanel.edit")}</button>
      <button role="menuitem" className={`${itemClass} text-red-600`} onClick={() => onAction({ type: "delete" })}>{t("notesPanel.delete")}</button>
    </div>
  );
}
