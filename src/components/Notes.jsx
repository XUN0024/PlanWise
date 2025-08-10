import React, { useMemo, useState, useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useTranslation } from "react-i18next";
import planWiseLogo from "../../assets/PlanWise.png";
import {
  faTasks,
  faDollarSign,
  faStickyNote,
  faFile,
  faPlus,
  faCheck,
  faChartBar,
  faUpload,
  faShoppingCart,
  faGasPump,
  faCoffee,
  faEdit,
  faFilePdf,
  faFileExcel,
  faImage,
  faEyeDropper,
  faStar,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import LanguageSwitcher from "./LanguageSwitcher";
import NotesSidebar from "./NotesSidebar";

const Notes = () => {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const handleSignOut = async () => {
    await signOut();
  };

  // Mock data (replace with real data later)
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState([
    {
      id: "n1",
      title: "The user panel UI design has some bugs.",
      body: "The user panel UI design has some bugs.",
      points: [
        { id: "p1", text: "Fix top header spacing (24px vertical rhythm)" },
        { id: "p2", text: "Align sidebar icons and labels to an 8px grid" },
        {
          id: "p3",
          text: "Adjust padding in the main content area for consistency",
        },
      ],
      attachments: [
        { id: "a1", type: "file", name: "Spec.pdf", size: "120 KB" },
        { id: "a2", type: "file", name: "Costs.xlsx", size: "36 KB" },
        { id: "a3", type: "image", name: "Mock.png", size: "512 KB" },
      ],
      tags: ["ui", "bug"],
      color: "#F59E0B", //amber
      pinned: true,
      starred: true,
      updatedAt: "Today 10:20",
    },
    {
      id: "n2",
      title: "(1)STEP to create a REACT PROJECT:",
      body: "body 233333333333333333",
      tags: ["react"],
      color: "#EF4444", // red-500
      pinned: false,
      starred: false,
      updatedAt: "Today 09:00",
    },
    {
      id: "n3",
      title: "(2)WHAT IS JSX",
      body: "body 344444444444444444444444444444",
      tags: ["react"],
      color: "#3B82F6", // blue-500
      pinned: false,
      starred: true,
      updatedAt: "Yesterday",
    },
    {
      id: "n4",
      title: "(3)JSX中，我们使用大括号语法 來識别变量",
      body: "...",
      tags: ["jsx", "cn"],
      color: "#10B981", // emerald-500
      pinned: false,
      starred: true,
      updatedAt: "2d ago",
    },
    {
      id: "n5",
      title: "(4)JSX中，我们使用大括号语法 來識别变量",
      body: "...",
      tags: ["jsx", "cn"],
      color: "#EC4899", // pink-500
      pinned: false,
      starred: true,
      updatedAt: "2d ago",
    },
    {
      id: "n3",
      title: "(2)WHAT IS JSX",
      body: "body 344444444444444444444444444444",
      tags: ["react"],
      color: "#8B5CF6", // violet-500
      pinned: false,
      starred: true,
      updatedAt: "Yesterday",
    },
  ]);
  const getIcon = (k) =>
    k === "pdf" ? faFilePdf : k === "excel" ? faFileExcel : faImage;

  // Shared palette and color picker to match sidebar sticky note colors
  const PALETTE = [
    "#F59E0B", // amber-500
    "#EF4444", // red-500
    "#3B82F6", // blue-500
    "#10B981", // emerald-500
    "#EC4899", // pink-500
    "#f4f3f6ff", // violet-500
  ];
  const hash = (s = "") => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h >>> 0;
  };
  const getNoteColor = (note) =>
    note?.color ||
    PALETTE[hash(note?.id || note?.title || "") % PALETTE.length];

  // Default fallback color for sidebar sticky notes when a note has no explicit color
  const color = "#F59E0B"; // amber-500

  const [selectedId, setSelectedId] = useState(notes[0]?.id ?? null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef(null);

  // Close color picker when clicking outside
  useEffect(() => {
    if (!showColorPicker) return;
    const onDocClick = (e) => {
      if (!colorPickerRef.current) return;
      if (!colorPickerRef.current.contains(e.target)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showColorPicker]);

  const handlePickNoteColor = (c) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === selectedId ? { ...n, color: c } : n))
    );
  };
  // Filter notes by search query with simple operators:
  // - Plain text matches title/body/tags (AND across tokens)
  // - #tag matches tags
  // - is:pinned keeps only pinned notes
  // Also sorts pinned notes to the top.
  const filteredNotes = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    const sortPinnedTop = (arr) =>
      arr.slice().sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    if (!q) return sortPinnedTop(notes);

    const tokens = q.split(/\s+/).filter(Boolean);

    const res = notes.filter((n) => {
      const hay = `${n.title ?? ""} ${n.body ?? ""} ${(n.tags ?? []).join(
        " "
      )}`.toLowerCase();
      return tokens.every((tok) => {
        if (tok === "is:pinned") return !!n.pinned;
        if (tok.startsWith("#")) {
          const tag = tok.slice(1);
          return (n.tags ?? []).some((t) => t.toLowerCase().includes(tag));
        }
        return hay.includes(tok);
      });
    });

    return sortPinnedTop(res);
  }, [search, notes]);
  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedId) || filteredNotes[0] || null,
    [notes, filteredNotes, selectedId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
    );
  }, [search, notes]);

  const handleStarNote = () => {
    setNotes((prev) =>
      prev.map((n) => (n.id === selectedId ? { ...n, starred: !n.starred } : n))
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Navigation */}
            <div className="flex items-center">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white text-sm font-bold">PW</span>
                </div>
                <span className="ml-2 text-xl font-semibold text-gray-900">
                  PlanWise
                </span>
              </div>

              {/* Navigation */}
              <nav className="hidden md:ml-8 md:flex md:space-x-8">
                <Link
                  to="/dashboard"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  {t("dashboard")}
                </Link>
                <Link
                  to="/tasks"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  {t("tasks")}
                </Link>
                <a
                  href="#"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  Expenses
                </a>
                <Link
                  to="/notes"
                  className="text-blue-600 border-b-2 border-blue-600 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  Notes
                </Link>
                <a
                  href="#"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  Files
                </a>
              </nav>
            </div>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              <LanguageSwitcher />
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user?.email?.charAt(0).toUpperCase() || "U"}
                  </span>
                </div>
                <span className="text-sm text-gray-600 hidden sm:block">
                  {user?.email}
                </span>
              </div>
              <button
                onClick={handleSignOut}
                className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
              >
                {t("signOut")}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="content-wrapper flex items-start gap-6 px-4 sm:px-6 lg:px-8">
        {/* Sidebar */}
        <aside>
          <NotesSidebar
            notes={filteredNotes}
            selectedId={selectedId}
            color={color}
            onSelect={setSelectedId}
          />
        </aside>
        {/* Main content: selected note full details */}
        <main className="flex-1 py-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Color banner (matches the sticky note color) */}
            <div
              className="h-2 w-full"
              style={{
                backgroundColor: selectedNote?.color || "#F59E0B", //amber as default
              }}
            />
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {selectedNote?.title}
                </h1>
                <div className="mt-1 text-xs text-gray-500">
                  {selectedNote?.updatedAt}
                </div>
              </div>
              <div className="relative inline-flex items-center gap-2">
                {/* Eyedropper with hover color picker */}
                <div className="relative" ref={colorPickerRef}>
                  <button
                    onClick={() => setShowColorPicker((v) => !v)}
                    className="px-3 py-1.5 rounded-md border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <FontAwesomeIcon icon={faEyeDropper} className="w-3 h-3" />
                  </button>

                  {showColorPicker && (
                    <div className="absolute right-1 mt-2 z-10 rounded-md shadow-lg border border-gray-200 bg-white p-1">
                      <div className="flex overflow-hidden rounded-md">
                        {[
                          "#F59E0B",
                          "#10B981",
                          "#EC4899",
                          "#8B5CF6",
                          "#3B82F6",
                          "#38BDF8",
                        ].map((c) => (
                          <button
                            key={c}
                            onClick={() => handlePickNoteColor(c)}
                            className="relative w-8 h-8 focus:outline-none"
                            style={{ backgroundColor: c }}
                            aria-label={`Pick color ${c}`}
                          >
                            {selectedNote?.color === c && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <FontAwesomeIcon
                                  icon={faCheck}
                                  className="w-3 h-3 text-white"
                                />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Star */}
                <button
                  className="px-3 py-1.5 rounded-md border border-gray-200 text-sm hover:bg-gray-50"
                  style={{
                    color: selectedNote?.starred ? "#EAB308" : "grey",
                  }}
                  onClick={handleStarNote}
                >
                  <FontAwesomeIcon icon={faStar} className="w-3 h-3" />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="px-6 py-5">
              {/* Tags */}
              <div className="flex flex-wrap gap-2">
                {(selectedNote?.tags ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs"
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Content */}
              <div className="mt-4 space-y-3 text-sm text-gray-700 leading-relaxed">
                <p>{selectedNote?.body}</p>
                <ul className="space-y-2">
                  {(selectedNote?.points ?? []).map((pt) => (
                    <li key={pt.id} className="flex items-start">
                      <span
                        className={`w-4 h-4 mt-0.5 rounded border-2 border-gray-300 mr-2 flex items-center justify-center ${
                          pt.done ? "bg-blue-500 text-white" : ""
                        }`}
                      >
                        {pt.done && (
                          <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
                        )}
                      </span>
                      {pt.text}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Attachments */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(selectedNote?.attachments ?? []).map((f) => (
                  <div
                    key={f.id}
                    className="border rounded-md p-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer"
                  >
                    <FontAwesomeIcon
                      icon={getIcon(f.kind)}
                      className={`w-5 h-5 ${
                        f.kind === "pdf"
                          ? "text-red-500"
                          : f.kind === "excel"
                          ? "text-green-600"
                          : "text-blue-500"
                      }`}
                    />
                    <div>
                      <div className="text-sm text-gray-900">{f.name}</div>
                      <div className="text-xs text-gray-500">{f.size}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Notes;
