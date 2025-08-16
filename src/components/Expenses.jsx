import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faSearch,
  faFilter,
  faEdit,
  faTrash,
  faPaperclip,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";
import { Link } from "react-router-dom";

// 使用 UMD 按需加载 Recharts；加载失败时退化为占位图表，避免构建期 es-toolkit 报错
const CATS = [
  "Food",
  "Transport",
  "Bills",
  "Entertainment",
  "Shopping",
  "Health",
  "Other",
];

const fmt = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
const toDate = (s) => new Date(s);
const isSameMonth = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const isSameWeek = (d, ref) => {
  const s = new Date(ref);
  s.setDate(ref.getDate() - ref.getDay());
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return d >= s && d <= e;
};

// 简单的占位图表组件
function ChartPlaceholder({ type, data }) {
  if (type === "bar") {
    return (
      <div className="w-full h-full flex items-end justify-center gap-2 px-4">
        {data.map((item, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div
              className="bg-blue-400 rounded-t min-w-[20px]"
              style={{
                height: `${Math.max(
                  8,
                  (item.total / Math.max(...data.map((d) => d.total))) * 120
                )}px`,
              }}
            />
            <span className="text-xs text-gray-500">{item.day}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === "pie") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div className="w-32 h-32 rounded-full border-8 border-gray-200 relative mb-4">
          <div className="absolute inset-0 rounded-full border-8 border-blue-400 border-r-transparent border-b-transparent transform rotate-45"></div>
          <div className="absolute inset-2 rounded-full border-4 border-green-400 border-l-transparent border-t-transparent transform -rotate-12"></div>
        </div>
        <div className="text-xs text-gray-500 text-center">
          <div>Chart placeholder</div>
          <div className="mt-1">({data.length} categories)</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
      Chart placeholder
    </div>
  );
}

const Expenses = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
  };

  // mock expenses
  const [expenses, setExpenses] = useState([
    {
      id: 1,
      desc: "Lunch at café",
      amount: -12.5,
      date: "2025-08-14",
      cat: "Food",
      hasFile: true,
    },
    {
      id: 2,
      desc: "Metro card",
      amount: -30,
      date: "2025-08-12",
      cat: "Transport",
    },
    {
      id: 3,
      desc: "Electric bill",
      amount: -65.2,
      date: "2025-08-03",
      cat: "Bills",
    },
    {
      id: 4,
      desc: "Movie night",
      amount: -18.9,
      date: "2025-08-10",
      cat: "Entertainment",
    },
    {
      id: 5,
      desc: "Gym membership",
      amount: -45,
      date: "2025-07-26",
      cat: "Health",
    },
    {
      id: 6,
      desc: "Online shopping",
      amount: -120,
      date: "2025-08-09",
      cat: "Shopping",
      hasFile: true,
    },
    {
      id: 7,
      desc: "Water bill",
      amount: -22.3,
      date: "2025-07-28",
      cat: "Bills",
    },
  ]);
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("This Month"); // Today | This Week | This Month | Custom
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [sort, setSort] = useState("desc");

  const now = new Date("2025-08-15"); // 固定日期用于演示
  const thisMonthTotal = useMemo(
    () =>
      expenses
        .filter((e) => isSameMonth(toDate(e.date), now))
        .reduce((s, e) => s + e.amount, 0),
    [expenses]
  );
  const lastMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthTotal = useMemo(
    () =>
      expenses
        .filter((e) => isSameMonth(toDate(e.date), lastMonthRef))
        .reduce((s, e) => s + e.amount, 0),
    [expenses]
  );
  const deltaPct =
    lastMonthTotal === 0
      ? null
      : ((thisMonthTotal - lastMonthTotal) / Math.abs(lastMonthTotal)) * 100;

  // charts data
  const pieData = useMemo(() => {
    const map = {};
    expenses
      .filter((e) => isSameMonth(toDate(e.date), now))
      .forEach((e) => {
        map[e.cat] = (map[e.cat] || 0) + Math.abs(e.amount);
      });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [expenses]);
  const barData = useMemo(() => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const arr = days.map((d) => ({ day: d, total: 0 }));
    expenses
      .filter((e) => isSameWeek(toDate(e.date), now))
      .forEach((e) => {
        const d = toDate(e.date).getDay();
        arr[d].total += Math.abs(e.amount);
      });
    return arr;
  }, [expenses]);

  // filter + sort list
  const filtered = useMemo(() => {
    return expenses
      .filter((e) => {
        const d = toDate(e.date);
        const passDate =
          dateFilter === "Today"
            ? d.toDateString() === now.toDateString()
            : dateFilter === "This Week"
            ? isSameWeek(d, now)
            : dateFilter === "Custom"
            ? from && to
              ? d >= toDate(from) && d <= toDate(to)
              : true
            : isSameMonth(d, now);
        const passCat = catFilter === "All" ? true : e.cat === catFilter;
        const passQ =
          !query || e.desc.toLowerCase().includes(query.toLowerCase());
        return passDate && passCat && passQ;
      })
      .sort((a, b) =>
        sort === "desc"
          ? toDate(b.date) - toDate(a.date)
          : toDate(a.date) - toDate(b.date)
      );
  }, [expenses, query, dateFilter, from, to, catFilter, sort]);

  const [form, setForm] = useState({
    desc: "",
    amount: "",
    date: "",
    cat: CATS[0],
    file: null,
  });
  const saveExpense = (e) => {
    e.preventDefault();
    if (!form.desc || !form.amount || !form.date) return;
    setExpenses((prev) => [
      {
        id: Date.now(),
        desc: form.desc,
        amount: -Math.abs(parseFloat(form.amount || 0)),
        date: form.date,
        cat: form.cat,
        hasFile: !!form.file,
      },
      ...prev,
    ]);
    setShowAdd(false);
    setForm({ desc: "", amount: "", date: "", cat: CATS[0], file: null });
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
                  className="text-blue-600 border-b-2 border-blue-600 px-1 py-4 text-sm font-medium"
                >
                  {t("dashboard")}
                </Link>
                <Link
                  to="/tasks"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  {t("tasks")}
                </Link>
                <Link
                  to="/expenses"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  {t("expenses")}
                </Link>
                <Link
                  to="/notes"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
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

      {/* Expenses Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-semibold text-gray-900">Expenses</h1>
            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                  className="pl-9 pr-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <FontAwesomeIcon
                  icon={faSearch}
                  className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                />
              </div>
              <button
                onClick={() => setShowAdd(true)}
                className="bg-gray-700 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-2"
              >
                <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                Add Expense
              </button>
              <button className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                <FontAwesomeIcon icon={faFilter} className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Summary + Charts */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Total This Month</div>
            <div className="text-2xl font-semibold text-gray-900">
              {fmt(thisMonthTotal)}
            </div>
            <div
              className={`text-xs mt-1 ${
                deltaPct === null ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {deltaPct === null
                ? "No last month data"
                : `${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(
                    1
                  )}% vs last month`}
            </div>
          </div>
          <div className="bg-white border rounded-lg p-4 md:col-span-2 h-48">
            <ChartPlaceholder type="bar" data={barData} />
          </div>
        </div>

        <div className="bg-white border rounded-lg p-4 mt-4 h-72">
          <ChartPlaceholder type="pie" data={pieData} />
        </div>

        {/* Tools */}
        <div className="bg-white border rounded-lg p-4 mt-4 flex flex-wrap items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <label>Date:</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="border rounded px-2 py-1"
            >
              <option>This Month</option>
              <option>Today</option>
              <option>This Week</option>
              <option>Custom</option>
            </select>
            {dateFilter === "Custom" && (
              <>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="border rounded px-2 py-1"
                />
                <span>to</span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="border rounded px-2 py-1"
                />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label>Category:</label>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="border rounded px-2 py-1"
            >
              <option>All</option>
              {CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label>Amount:</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="border rounded px-2 py-1"
            >
              <option value="desc">高 ➝ 低</option>
              <option value="asc">低 ➝ 高</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search description..."
              className="w-full pl-8 pr-2 py-1.5 border rounded"
            />
            <FontAwesomeIcon
              icon={faSearch}
              className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2"
            />
          </div>
        </div>

        {/* List */}
        <div className="mt-4 space-y-3">
          {filtered.map((e) => (
            <div
              key={e.id}
              className="bg-white border rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-900 font-medium truncate">
                  {e.desc}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                  <span>
                    {new Date(e.date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    {e.cat}
                  </span>
                  {e.hasFile && (
                    <FontAwesomeIcon
                      icon={faPaperclip}
                      className="w-3 h-3 text-gray-400"
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-gray-900">
                  {fmt(e.amount)}
                </div>
                <button className="p-2 text-gray-500 hover:text-gray-700">
                  <FontAwesomeIcon icon={faEdit} className="w-4 h-4" />
                </button>
                <button className="p-2 text-red-500 hover:text-red-600">
                  <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Add/Edit Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-5 w-full max-w-md">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Add Expense
              </h3>
              <button
                onClick={() => setShowAdd(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={saveExpense} className="space-y-3 text-sm">
              <div>
                <label className="block text-gray-700 mb-1">Description</label>
                <input
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="e.g., Lunch at café"
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  placeholder="12.50"
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Category</label>
                <select
                  value={form.cat}
                  onChange={(e) => setForm({ ...form, cat: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  {CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-gray-700 mb-1">
                  Attachment (optional)
                </label>
                <input
                  type="file"
                  onChange={(e) =>
                    setForm({ ...form, file: e.target.files?.[0] || null })
                  }
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="px-4 py-2 border rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
