import React, { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTimes,
  faPlus,
  faEdit,
  faTrash,
  faCheck,
  faTags,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";

// Global Tag Manager (mock data). This modal manages ALL tags.
// Usage: conditionally render <TagManagerModal onClose={...} /> when needed.
const TagManagerModal = ({ onClose }) => {
  // Mock data for all tags
  const [allTags, setAllTags] = useState([
    { id: "t1", name: "ui", color: "#3B82F6", noteCount: 3 },
    { id: "t2", name: "bug", color: "#EF4444", noteCount: 2 },
    { id: "t3", name: "react", color: "#10B981", noteCount: 4 },
    { id: "t4", name: "jsx", color: "#F59E0B", noteCount: 2 },
    { id: "t5", name: "cn", color: "#EC4899", noteCount: 2 },
  ]);

  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3B82F6");

  const editInputRef = useRef(null);
  const addInputRef = useRef(null);

  const PALETTE = [
    "#3B82F6",
    "#EF4444",
    "#10B981",
    "#F59E0B",
    "#EC4899",
    "#8B5CF6",
  ];

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (isAdding && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [isAdding]);

  const filtered = allTags.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
  };

  const saveEdit = () => {
    if (!editName.trim()) return;
    setAllTags((prev) =>
      prev.map((t) =>
        t.id === editingId ? { ...t, name: editName.trim() } : t
      )
    );
    setEditingId(null);
    setEditName("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const removeTag = (id) => {
    if (
      window.confirm(
        "Are you sure you want to delete this tag? It will be removed from all notes."
      )
    ) {
      setAllTags((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const addTag = () => {
    if (!newName.trim()) return;
    const tag = {
      id: `t${Date.now()}`,
      name: newName.trim(),
      color: newColor,
      noteCount: 0,
    };
    setAllTags((prev) => [...prev, tag]);
    setIsAdding(false);
    setNewName("");
    setNewColor("#3B82F6");
  };

  const changeColor = (id, color) => {
    setAllTags((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative bg-white rounded-xl shadow-2xl w-[92vw] max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <FontAwesomeIcon icon={faTags} className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
              Manage Tags
            </h2>
            <span className="text-xs sm:text-sm text-gray-500">
              ({allTags.length} tags)
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faTimes} className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Toolbar: search + add */}
        <div className="p-5 border-b border-gray-100 space-y-3">
          <div className="relative">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tags..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>

          {isAdding ? (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-4 h-4 rounded-full border-2 border-white shadow"
                  style={{ backgroundColor: newColor }}
                />
                <input
                  ref={addInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addTag();
                    if (e.key === "Escape") {
                      setIsAdding(false);
                      setNewName("");
                    }
                  }}
                  placeholder="Tag name..."
                  className="flex-1 bg-transparent border-0 outline-none text-sm"
                />
              </div>
              <div className="flex gap-1">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full border-2 ${
                      newColor === c ? "border-gray-400" : "border-gray-200"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Pick ${c}`}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={addTag}
                  className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                  aria-label="Confirm"
                >
                  <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewName("");
                  }}
                  className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                  aria-label="Cancel"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
              <span className="text-sm font-medium">Add New Tag</span>
            </button>
          )}
        </div>

        {/* Tag list */}
        <div className="p-5 overflow-auto">
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-500">
                No tags found.
              </div>
            )}
            {filtered.map((tag) => (
              <div key={tag.id} className="flex items-center gap-3 p-3">
                <div
                  className="w-3.5 h-3.5 rounded-full border border-white shadow"
                  style={{ backgroundColor: tag.color }}
                />
                {editingId === tag.id ? (
                  <input
                    ref={editInputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm"
                  />
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-900 truncate">
                      {tag.name}
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {tag.noteCount} notes
                    </div>
                  </div>
                )}
                <div className="hidden sm:flex gap-1 mr-1">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => changeColor(tag.id, c)}
                      className={`w-5 h-5 rounded-full border-2 ${
                        tag.color === c ? "border-gray-400" : "border-gray-200"
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={`Pick ${c}`}
                    />
                  ))}
                </div>
                {editingId === tag.id ? (
                  <>
                    <button
                      onClick={saveEdit}
                      className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(tag)}
                      className="p-1.5 text-gray-600 hover:bg-gray-100 rounded"
                      aria-label="Edit tag"
                    >
                      <FontAwesomeIcon icon={faEdit} className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => removeTag(tag.id)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      aria-label="Delete tag"
                    >
                      <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TagManagerModal;
