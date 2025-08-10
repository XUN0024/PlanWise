import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faStar,
  faTags,
  faTrash,
  faInbox,
  faSearch,
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";

// A fresh, bright sidebar, independent from the dark sample image
export default function NotesSidebar({
  notes = [],
  selectedId,
  color,
  onSelect,
}) {
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState({
    inbox: true,
    pinned: true,
    tags: true,
  });

  // Demo fallbacks when no notes are passed in
  const inboxItems = notes.length
    ? notes
    : Array.from({ length: 6 }).map((_, i) => ({
        id: `in-${i}`,
        title: `Note in Inbox ${i + 1}`,
      }));

  return (
    <aside className="w-72 h-[calc(100vh-4rem)] bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">All Notes</h2>
          <button className="text-blue-600 hover:text-blue-700 text-sm flex items-center">
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3 mr-1" /> New
          </button>
        </div>
        {/* Search */}
        <div className="mt-3 relative">
          <FontAwesomeIcon
            icon={faSearch}
            className="w-3 h-3 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes or tags"
            className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-300"
          />
        </div>
      </div>

      {/* Scrollable lists */}
      <div className="flex-1 overflow-y-auto">
        {/* Inbox */}
        <SectionHeader
          title="Inbox"
          open={sections.inbox}
          onToggle={() => setSections((s) => ({ ...s, inbox: !s.inbox }))}
        />
        {sections.inbox && (
          <ul className="px-2 py-1 space-y-1">
            {(notes.length
              ? notes
              : Array.from({ length: 6 }).map((_, i) => ({
                  id: `in-${i}`,
                  title: `Note in Inbox ${i + 1}`,
                }))
            ).map((n, i) => (
              <li key={n.id || `inbox-${i}`} className="group">
                <button
                  onClick={() => onSelect?.(n.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors ${
                    selectedId === n.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                  }`}
                >
                  <span className="truncate flex items-center">
                    <span
                      className="inline-block flex-shrink-0 w-2.5 h-2.5 rounded-sm mr-2"
                      style={{
                        backgroundColor: n.color || color || "#F59E0B",
                      }}
                    ></span>
                    {n.title}
                  </span>
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="w-3 h-3 text-gray-300 group-hover:text-blue-400"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Pinned */}
        <SectionHeader
          title="Pinned"
          icon={faStar}
          open={sections.pinned}
          onToggle={() => setSections((s) => ({ ...s, pinned: !s.pinned }))}
        />
        {sections.pinned && (
          <ul className="px-2 py-1 space-y-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={`pinned-${i}`} className="group">
                <button
                  onClick={() => onSelect?.(`pinned-${i}`)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between transition-colors ${
                    selectedId === `pinned-${i}`
                      ? "bg-amber-50 text-amber-700"
                      : "text-gray-700 hover:bg-amber-50 hover:text-amber-700"
                  }`}
                >
                  <span className="truncate">Starred Note {i + 1}</span>
                  <FontAwesomeIcon
                    icon={faStar}
                    className="w-3 h-3 text-amber-400"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Tags */}
        <SectionHeader
          title="Tags"
          icon={faTags}
          open={sections.tags}
          onToggle={() => setSections((s) => ({ ...s, tags: !s.tags }))}
        />
        {sections.tags && (
          <ul className="px-2 py-1 space-y-1">
            {["react", "ui", "meeting", "ideas", "todo"].map((tag) => (
              <li key={tag} className="group">
                <button className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                  <span className="truncate">#{tag}</span>
                  <span className="text-xs text-gray-400">12</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Trash */}
      <div className="px-3 py-3 border-t border-gray-100">
        <button className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 flex items-center">
          <FontAwesomeIcon icon={faTrash} className="w-3 h-3 mr-2" /> Trash
        </button>
      </div>
    </aside>
  );
}

function SectionHeader({ title, icon, open, onToggle }) {
  return (
    <button
      className="w-full px-3 py-2 mt-4 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase flex items-center"
      onClick={onToggle}
    >
      {icon && (
        <FontAwesomeIcon icon={icon} className="w-3 h-3 mr-2 text-gray-400" />
      )}
      {title}
      <span className="ml-auto text-gray-300">{open ? "−" : "+"}</span>
    </button>
  );
}
