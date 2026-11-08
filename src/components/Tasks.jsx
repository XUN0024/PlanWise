import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getTasks, getTaskById, saveTask, updateTask, updateSubtask, deleteTask } from "../services/taskService";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faBell, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { Link, useLocation } from "react-router-dom";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

export const formatTaskForUI = (task) => ({
  id: task.id,
  title: task.title,
  description: task.description || "",
  priority: task.priority || "Medium",
  isCompleted: !!task.is_completed,
  createdAt: task.created_at,
  reminderDate: task.reminder_date || "",
  reminderClock: task.reminder_time || "",
  repeatOption: task.repeat_option || "不重复",
  subtasks: (task.subtasks || []).map((sub) => ({
    id: sub.id, title: sub.title, isCompleted: !!sub.is_completed,
  })),
});

const emptyDraft = () => ({
  id: crypto.randomUUID(), title: "", description: "", priority: "Medium",
  reminderDate: "", reminderClock: "", repeatOption: "不重复", subtasks: [],
});
const controlClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

export function TaskCard({ task, busy, onEdit, onDelete, onToggle, onToggleSub, onAsk }) {
  return (
    <article className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
      <div className="flex items-start gap-3">
        <input type="checkbox" className="w-5 h-5 mt-1" checked={task.isCompleted}
          disabled={busy} aria-label={task.isCompleted ? `Restore ${task.title}` : `Complete ${task.title}`}
          onChange={() => onToggle(task)} />
        <div className="flex-1 min-w-0">
          <button disabled={busy} onClick={() => onEdit(task)} className={`text-left text-lg font-medium break-words ${task.isCompleted ? "line-through text-gray-500" : "text-gray-900"}`}>
            {task.title}
          </button>
          {task.description && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{task.description}</p>}
          {task.reminderDate && <p className="text-xs text-gray-500 mt-1">Reminder: {task.reminderDate} {task.reminderClock.slice(0, 5)}</p>}
          <p className={`text-sm mt-2 ${task.priority === "High" ? "text-red-600" : task.priority === "Low" ? "text-green-600" : "text-yellow-600"}`}>{task.priority}</p>
          {!!task.subtasks.length && <ul className="mt-3 space-y-2">
            {task.subtasks.map((sub) => <li key={sub.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="w-4 h-4" checked={sub.isCompleted} disabled={busy}
                aria-label={`${sub.isCompleted ? "Restore" : "Complete"} subtask ${sub.title}`}
                onChange={() => onToggleSub(task, sub)} />
              <span className={sub.isCompleted ? "line-through text-gray-400" : "text-gray-700"}>{sub.title}</span>
            </li>)}
          </ul>}
        </div>
        <div className="flex gap-3 text-sm">
          <button disabled={busy} type="button" onClick={()=>onAsk?.(task)} className="text-violet-700">PW AI</button>
          <button disabled={busy} onClick={() => onEdit(task)} className="text-blue-600">Edit</button>
          <button disabled={busy} onClick={() => onDelete(task)} className="text-red-600">Delete</button>
        </div>
      </div>
    </article>
  );
}

export function TaskEditor({ draft, isNew, saving, error, onChange, onClose, onSave, onReminder, onClearReminder, reminderOpen }) {
  useEffect(() => {
    const previous = document.activeElement;
    const escape = (event) => { if (event.key === "Escape" && !saving && !reminderOpen) onClose(); };
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previous?.focus?.(); };
  }, [saving, reminderOpen]);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="task-editor-title" className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 id="task-editor-title" className="text-xl font-semibold">{isNew ? "Add New Task" : "Edit Task"}</h2>
          <button disabled={saving} onClick={onClose} aria-label="Close task editor"><FontAwesomeIcon icon={faTimes} /></button>
        </div>
        {error && <p role="alert" className="mb-4 text-red-700">{error}</p>}
        <form onSubmit={onSave}>
          <fieldset disabled={saving} className="space-y-4 disabled:opacity-60">
            <label className="block text-sm font-medium">Task Title *
              <input autoFocus required value={draft.title} onChange={(e) => onChange({ title: e.target.value })} className={controlClass} />
            </label>
            <label className="block text-sm font-medium">Description
              <textarea rows="3" value={draft.description} onChange={(e) => onChange({ description: e.target.value })} className={controlClass} />
            </label>
            <label className="block text-sm font-medium">Priority
              <select value={draft.priority} onChange={(e) => onChange({ priority: e.target.value })} className={controlClass}>
                <option>Low</option><option>Medium</option><option>High</option>
              </select>
            </label>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Subtasks</span>
                <button type="button" className="text-sm text-blue-600" onClick={() => onChange({ subtasks: [...draft.subtasks, { id: crypto.randomUUID(), title: "", isCompleted: false }] })}>+ Add Subtask</button>
              </div>
              <div className="space-y-2">{draft.subtasks.map((sub) => <div key={sub.id} className="flex items-center gap-2">
                <input type="checkbox" checked={sub.isCompleted} aria-label={`Complete subtask ${sub.title || "untitled"}`}
                  onChange={(e) => onChange({ subtasks: draft.subtasks.map((s) => s.id === sub.id ? { ...s, isCompleted: e.target.checked } : s) })} />
                <input required aria-label="Subtask title" value={sub.title} placeholder="Enter subtask..." className={controlClass}
                  onChange={(e) => onChange({ subtasks: draft.subtasks.map((s) => s.id === sub.id ? { ...s, title: e.target.value } : s) })} />
                <button type="button" className="text-red-600" aria-label={`Remove subtask ${sub.title || "untitled"}`}
                  onClick={() => onChange({ subtasks: draft.subtasks.filter((s) => s.id !== sub.id) })}><FontAwesomeIcon icon={faTimes} /></button>
              </div>)}</div>
            </div>
            <div className="text-sm">
              <button type="button" onClick={onReminder} className="text-blue-600"><FontAwesomeIcon icon={faBell} /> Set Reminder</button>
              {draft.reminderDate && <div className="mt-2">{draft.reminderDate} {draft.reminderClock.slice(0, 5)}
                <button type="button" onClick={onClearReminder} className="ml-3 text-red-600">Clear</button>
              </div>}
              <p className="text-xs text-gray-500 mt-1">Reminder times are saved; scheduled notifications are not available yet.</p>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg">{saving ? "Saving..." : isNew ? "Add Task" : "Update Task"}</button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

const Tasks = () => {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const location=useLocation();
  const [sourcePreview,setSourcePreview]=useState(null),[sourceLoading,setSourceLoading]=useState(false),[sourceError,setSourceError]=useState(false),[sourceAttempt,setSourceAttempt]=useState(0);
  const sourceRef=useRef(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [deletingTask, setDeletingTask] = useState(null);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderDate, setReminderDate] = useState(new Date());
  const [reminderTime, setReminderTime] = useState({ hour: 9, minute: 0 });
  const [repeatOption, setRepeatOption] = useState("不重复");
  const [scrollPositions, setScrollPositions] = useState({ date: 0, hour: 0, minute: 0 });
  const REM_ITEM_H = 40;
  const dateRef = useRef(null);
  const hourRef = useRef(null);
  const minuteRef = useRef(null);
  const scrollTimers = useRef({ date: null, hour: null, minute: null });
  const operationRef = useRef(null);
  const currentUser = useRef(user?.id);
  currentUser.current = user?.id;

  useEffect(()=>{
    let cancelled=false;
    const id=new URLSearchParams(location.search).get("task"),userId=user?.id;
    setSourcePreview(null);setSourceError(false);setSourceLoading(!!id&&!!userId);
    if(id&&userId)getTaskById(id,userId).then(row=>{
      if(!cancelled&&currentUser.current===userId)setSourcePreview(formatTaskForUI(row));
    }).catch(()=>{if(!cancelled&&currentUser.current===userId)setSourceError(true);})
      .finally(()=>{if(!cancelled&&currentUser.current===userId)setSourceLoading(false);});
    return()=>{cancelled=true;};
  },[user?.id,location.search,location.key,sourceAttempt]);
  useEffect(()=>{if(sourcePreview&&!draft){sourceRef.current?.scrollIntoView?.({block:"start"});sourceRef.current?.focus?.();}},[sourcePreview,draft]);

  useEffect(() => {
    let cancelled = false;
    setTasks([]);
    setDraft(null);
    setDeletingTask(null);
    setShowReminderModal(false);
    setError(null);
    setLoading(true);
    setSaving(false);
    operationRef.current = null;
    const load = async () => {
      try {
        const userId = user?.id;
        const data = userId ? await getTasks() : [];
        if (!cancelled && currentUser.current === userId) setTasks(data.map(formatTaskForUI));
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load tasks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; operationRef.current = null; };
  }, [user?.id, reload]);

  // A ref blocks even a second click in the same render, before state updates.
  const mutate = async (action) => {
    if (operationRef.current || loading || !user?.id) return;
    const token = {};
    const userId = user.id;
    operationRef.current = token;
    setSaving(true);
    setError(null);
    try {
      const apply = await action();
      if (operationRef.current === token && currentUser.current === userId) apply();
    } catch (err) {
      if (operationRef.current === token && currentUser.current === userId) {
        setError(err.message || "Could not save the change. Please retry.");
      }
    } finally {
      if (operationRef.current === token) {
        operationRef.current = null;
        setSaving(false);
      }
    }
  };
  const replaceTask = (saved) => setTasks((list) => {
    const task = formatTaskForUI(saved);
    return list.some((item) => item.id === task.id)
      ? list.map((item) => item.id === task.id ? task : item)
      : [task, ...list];
  });
  const handleSave = (event) => {
    event.preventDefault();
    mutate(async () => {
      const saved = await saveTask(draft, isNew);
      return () => { replaceTask(saved); setDraft(null); setShowReminderModal(false); };
    });
  };
  const handleToggle = (task) => mutate(async () => {
    const saved = await updateTask(task.id, { is_completed: !task.isCompleted });
    return () => setTasks((list) => list.map((item) => item.id === task.id ? { ...item, isCompleted: !!saved.is_completed } : item));
  });
  const handleToggleSub = (task, sub) => mutate(async () => {
    const saved = await updateSubtask(sub.id, { is_completed: !sub.isCompleted });
    return () => setTasks((list) => list.map((item) => item.id === task.id ? {
      ...item, subtasks: item.subtasks.map((child) => child.id === sub.id ? { ...child, isCompleted: !!saved.is_completed } : child),
    } : item));
  });
  const handleDelete = () => mutate(async () => {
    const id = deletingTask.id;
    await deleteTask(id);
    return () => { setTasks((list) => list.filter((task) => task.id !== id)); setDeletingTask(null); };
  });
  const closeEditor = () => { if (!operationRef.current) { setDraft(null); setShowReminderModal(false); setError(null); } };
  const openEditor = (task = null) => {
    if (operationRef.current) return;
    setError(null);
    setIsNew(!task);
    setDraft(task ? { ...task, subtasks: task.subtasks.map((sub) => ({ ...sub })) } : emptyDraft());
  };
  const handleSignOut = () => signOut();
  const handleOpenReminderModal = () => {
    const date = draft.reminderDate ? new Date(`${draft.reminderDate}T00:00:00`) : new Date();
    const [hour, minute] = (draft.reminderClock || "09:00").split(":").map(Number);
    setReminderDate(date);
    setReminderTime({ hour, minute });
    setRepeatOption(draft.repeatOption || "不重复");
    setShowReminderModal(true);
  };
  const handleCloseReminderModal = () => setShowReminderModal(false);
  const handleConfirmReminder = () => {
    // Use local calendar fields, never UTC conversion (which can shift the day).
    const date = `${reminderDate.getFullYear()}-${String(reminderDate.getMonth() + 1).padStart(2, "0")}-${String(reminderDate.getDate()).padStart(2, "0")}`;
    const time = `${String(reminderTime.hour).padStart(2, "0")}:${String(reminderTime.minute).padStart(2, "0")}`;
    setDraft((value) => ({ ...value, reminderDate: date, reminderClock: time, repeatOption }));
    setShowReminderModal(false);
  };
  // Helper function to generate date options
  const generateDateOptions = () => {
    const dates = [];
    const today = new Date();
    for (let i = -1; i <= 2; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  // Helper function to format date
  const formatDate = (date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const weekday = weekdays[date.getDay()];
    return `${month}月${day}日 ${weekday}`;
  };

  // Build long lists for smooth vertical scrolling
  const buildDateList = () => {
    const list = [];
    const base = new Date();
    for (let i = -30; i <= 60; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      list.push(d);
    }
    return list;
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  // 配置项：滑动灵敏度与吸附
  const SCROLL = {
    DEBOUNCE_MS: 150, // 停止滚动多久后吸附
    MIN_DELTA_PX: 40, // 触发状态更新的最小滚动距离
    SNAP_EPSILON_PX: 3, // 与目标网格差小于该值则不再调整
  };

  // 统一计算尺寸与索引的工具
  const getMetrics = (ref, itemHeight = REM_ITEM_H) => {
    const containerHeight = ref.current?.clientHeight || 160;
    // 视觉索引线位于容器几何中心 L；为让“行中心”对齐索引线，应减去 itemHeight/2
    const lineCenter = Math.floor(containerHeight / 2); // L
    const selectionTop = lineCenter - Math.floor(itemHeight / 2); // L - h/2
    // 公式推导：
    // scrollTopForIndex = i*h + h/2 - L = i*h - (L - h/2) = i*h - selectionTop
    // indexFromScrollTop = round((scrollTop + L - h/2)/h) = round((scrollTop + selectionTop)/h)
    const indexFromScrollTop = (scrollTop) =>
      Math.round((scrollTop + selectionTop) / itemHeight);
    const scrollTopForIndex = (index) => index * itemHeight - selectionTop;
    return {
      itemHeight,
      containerHeight,
      lineCenter,
      selectionTop,
      indexFromScrollTop,
      scrollTopForIndex,
    };
  };

  // 吸附到最近网格
  const snapToGrid = (ref, itemHeight = REM_ITEM_H) => {
    if (!ref.current) return;
    const sc = ref.current;
    const { indexFromScrollTop, scrollTopForIndex } = getMetrics(
      ref,
      itemHeight
    );
    let idx = indexFromScrollTop(sc.scrollTop);
    let target = scrollTopForIndex(idx);

    // 防止在两项中间时重复抖动：若距离上次锁定位置很近，则直接用上次锁定
    const key = ref === dateRef ? "date" : ref === hourRef ? "hour" : "minute";
    const last = lastScrollPos.current[key];
    if (Math.abs(last - target) <= SCROLL.SNAP_EPSILON_PX) {
      target = last;
    }

    if (Math.abs(sc.scrollTop - target) > SCROLL.SNAP_EPSILON_PX) {
      sc.scrollTop = target;
    }
  };

  // 程序化滚动锁，防止点击触发的滚动与滚动事件互相干扰
  const programmaticScroll = React.useRef({
    date: false,
    hour: false,
    minute: false,
  });
  const rafIds = React.useRef({ date: null, hour: null, minute: null });

  const smoothScrollTo = (ref, key, target) => {
    if (!ref.current) return;
    // 取消任何待执行的吸附
    if (scrollTimers.current[key]) clearTimeout(scrollTimers.current[key]);
    if (rafIds.current[key]) cancelAnimationFrame(rafIds.current[key]);

    programmaticScroll.current[key] = true;
    ref.current.scrollTo({ top: target, behavior: "smooth" });

    const tick = () => {
      const sc = ref.current;
      if (!sc) return;
      if (Math.abs(sc.scrollTop - target) <= SCROLL.SNAP_EPSILON_PX) {
        sc.scrollTop = target; // 最终对齐，消除余差
        programmaticScroll.current[key] = false;
        rafIds.current[key] = null;
        return;
      }
      rafIds.current[key] = requestAnimationFrame(tick);
    };
    rafIds.current[key] = requestAnimationFrame(tick);
  };

  // 点击后滚动到指定索引并更新相关状态（不受阈值限制）
  const scrollToIndex = (ref, key, targetIndex, onComplete) => {
    if (!ref.current) return;
    const { scrollTopForIndex } = getMetrics(ref);
    const target = scrollTopForIndex(targetIndex);
    // 程序化滚动并锁定滚动处理
    smoothScrollTo(ref, key, target);
    // 同步滚动位置与上次位置，避免后续滚动处理干扰
    lastScrollPos.current[key] = target;
    setScrollPositions((prev) => ({ ...prev, [key]: target }));
    if (onComplete) onComplete();
  };

  React.useEffect(() => {
    if (!showReminderModal) return;
    // Initialize scrolls on open - center the selected item
    const containerHeight = 160; // h-40 = 160px
    const visibleItems = Math.floor(containerHeight / REM_ITEM_H); // 4 items visible
    const centerOffset = Math.floor(visibleItems / 2) * REM_ITEM_H; // offset to center

    if (hourRef.current) {
      const scrollTop = reminderTime.hour * REM_ITEM_H - centerOffset;
      hourRef.current.scrollTop = scrollTop;
      lastScrollPos.current.hour = scrollTop;
    }
    if (minuteRef.current) {
      const scrollTop = reminderTime.minute * REM_ITEM_H - centerOffset;
      minuteRef.current.scrollTop = scrollTop;
      lastScrollPos.current.minute = scrollTop;
    }
    if (dateRef.current) {
      const list = buildDateList();
      const centerIndex = list.findIndex(
        (d) => d.toDateString() === reminderDate.toDateString()
      );
      const idx = centerIndex === -1 ? 30 : centerIndex;
      const scrollTop = idx * REM_ITEM_H - centerOffset;
      dateRef.current.scrollTop = scrollTop;
      lastScrollPos.current.date = scrollTop;
    }
  }, [showReminderModal]);

  // Debounced scroll handlers for snapping and updating state
  const lastScrollPos = React.useRef({ date: 0, hour: 0, minute: 0 });
  const debounced = (key, fn, delay = SCROLL.DEBOUNCE_MS) => {
    if (scrollTimers.current[key]) clearTimeout(scrollTimers.current[key]);
    scrollTimers.current[key] = setTimeout(fn, delay);
  };

  const handleDateScroll = () => {
    if (!dateRef.current) return;
    const key = "date";

    // 程序化滚动时直接退出，防止原地抖动
    if (programmaticScroll.current[key]) return;

    const scrollTop = dateRef.current.scrollTop;
    const lastPos = lastScrollPos.current[key];
    const scrollDelta = Math.abs(scrollTop - lastPos);

    setScrollPositions((prev) => ({ ...prev, [key]: scrollTop }));

    if (scrollDelta > SCROLL.MIN_DELTA_PX) {
      const list = buildDateList();
      const { indexFromScrollTop } = getMetrics(dateRef);
      const centerIdx = indexFromScrollTop(scrollTop);
      const i = Math.max(0, Math.min(centerIdx, list.length - 1));
      setReminderDate(list[i]);
      lastScrollPos.current[key] = scrollTop;
    }

    debounced(key, () => snapToGrid(dateRef, REM_ITEM_H));
  };

  const handleHourScroll = () => {
    if (!hourRef.current) return;
    const key = "hour";

    if (programmaticScroll.current[key]) return;

    const scrollTop = hourRef.current.scrollTop;
    const lastPos = lastScrollPos.current[key];
    const scrollDelta = Math.abs(scrollTop - lastPos);

    setScrollPositions((prev) => ({ ...prev, [key]: scrollTop }));

    if (scrollDelta > SCROLL.MIN_DELTA_PX) {
      const { indexFromScrollTop } = getMetrics(hourRef);
      const centerIdx = indexFromScrollTop(scrollTop);
      const hour = Math.max(0, Math.min(centerIdx, 23));
      setReminderTime((p) => ({ ...p, hour }));
      lastScrollPos.current[key] = scrollTop;
    }

    debounced(key, () => snapToGrid(hourRef, REM_ITEM_H));
  };

  const handleMinuteScroll = () => {
    if (!minuteRef.current) return;
    const key = "minute";

    if (programmaticScroll.current[key]) return;

    const scrollTop = minuteRef.current.scrollTop;
    const lastPos = lastScrollPos.current[key];
    const scrollDelta = Math.abs(scrollTop - lastPos);

    setScrollPositions((prev) => ({ ...prev, [key]: scrollTop }));

    if (scrollDelta > SCROLL.MIN_DELTA_PX) {
      const { indexFromScrollTop } = getMetrics(minuteRef);
      const centerIdx = indexFromScrollTop(scrollTop);
      const minute = Math.max(0, Math.min(centerIdx, 59));
      setReminderTime((p) => ({ ...p, minute }));
      lastScrollPos.current[key] = scrollTop;
    }

    debounced(key, () => snapToGrid(minuteRef, REM_ITEM_H));
  };

  // Calculate highlighted index using the same metrics as snapping
  const getCenterIndex = (ref, scrollTop) => {
    const { indexFromScrollTop } = getMetrics(ref);
    return indexFromScrollTop(scrollTop);
  };


  useEffect(() => () => {
    Object.values(scrollTimers.current).forEach(clearTimeout);
    Object.values(rafIds.current).forEach((id) => { if (id) cancelAnimationFrame(id); });
  }, []);

  const matching = tasks.filter((task) => `${task.title} ${task.description} ${task.subtasks.map((s) => s.title).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const incompleteTasks = matching.filter((task) => !task.isCompleted);
  const completedTasks = matching.filter((task) => task.isCompleted);
  const card = (task) => <TaskCard key={task.id} task={task} busy={saving || !!draft || !!deletingTask}
    onAsk={value=>window.dispatchEvent(new CustomEvent("planwise:ask",{detail:{userId:user.id,title:value.title,reference:{type:"tasks",taskId:value.id,status:"all",priority:"",search:"",from:"",to:""}}}))}
    onEdit={openEditor} onToggle={handleToggle} onToggleSub={handleToggleSub}
    onDelete={(value) => { setError(null); setDeletingTask(value); }} />;

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
                  className="text-blue-600 border-b-2 border-blue-600 hover:text-gray-700 px-1 py-4 text-sm font-medium"
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
              <span data-planwise-ai-slot />
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">All Tasks</h1>
        {sourceLoading&&<p role="status" className="mb-4 text-sm text-gray-500">{t("askPlanwise.tasks.loading")}</p>}
        {sourceError&&<div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700"><p>{t("askPlanwise.tasks.sourceUnavailable")}</p><button type="button" onClick={()=>setSourceAttempt(value=>value+1)} className="underline mt-2">{t("askPlanwise.retry")}</button></div>}
        {sourcePreview&&<section ref={sourceRef} tabIndex={-1} aria-label={t("askPlanwise.tasks.sourceTitle")} className="mb-6 rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-2">
          <div className="flex justify-between gap-3"><h2 className="font-semibold text-violet-900">{t("askPlanwise.tasks.sourceTitle")}</h2><button type="button" aria-label={t("askPlanwise.tasks.closeSource")} onClick={()=>setSourcePreview(null)} className="text-sm text-violet-700">✕</button></div>
          <h3 className="font-medium break-words">{sourcePreview.title}</h3>
          <p className="text-sm">{t(sourcePreview.isCompleted?"askPlanwise.tasks.done":"askPlanwise.tasks.unfinished")} · {t("askPlanwise.tasks.priority."+sourcePreview.priority)}</p>
          {sourcePreview.description&&<p className="whitespace-pre-wrap break-words text-sm">{sourcePreview.description}</p>}
          {sourcePreview.reminderDate&&<p className="text-xs text-gray-600">{t("askPlanwise.tasks.reminder")}: {sourcePreview.reminderDate} {sourcePreview.reminderClock.slice(0,5)}</p>}
          <ul className="text-sm space-y-1">{sourcePreview.subtasks.map(sub=><li key={sub.id} className="break-words">{sub.isCompleted?"✓":"○"} {sub.title} · {t(sub.isCompleted?"askPlanwise.tasks.done":"askPlanwise.tasks.unfinished")}</li>)}</ul>
        </section>}
        {error && !draft && !deletingTask && <div role="alert" className="mb-4 p-4 rounded-lg bg-red-50 text-red-700">
          <p>{error}</p>
          <button disabled={saving} onClick={() => setReload((value) => value + 1)} className="underline mt-2">Reload tasks</button>
        </div>}
        <div className="flex items-center gap-4">
          <input type="search" aria-label="Search tasks" placeholder="Search tasks..." value={query}
            onChange={(e) => setQuery(e.target.value)} className={`${controlClass} max-w-md`} />
          <button disabled={saving || loading} onClick={() => openEditor()} className="bg-gray-600 text-white px-4 py-2 rounded-lg whitespace-nowrap disabled:opacity-50">Add Task</button>
        </div>
        {saving && <p role="status" className="text-sm text-blue-600 mt-3">Saving changes...</p>}
        {loading ? <p role="status" className="py-8 text-gray-600">Loading tasks...</p> : <div className="mt-8 space-y-6">
          {!error && !matching.length && <p className="text-gray-500 py-4">{query.trim() ? "No matching tasks." : "No tasks yet. Add your first task."}</p>}
          {!error && matching.length > 0 && !incompleteTasks.length && <p className="text-gray-500">No incomplete tasks.</p>}
          <div className="space-y-3">{incompleteTasks.map(card)}</div>
          <div className="border-t border-gray-200 pt-6">
            <button onClick={() => setShowCompleted(!showCompleted)} aria-expanded={showCompleted} className="text-gray-600 mb-4">
              <FontAwesomeIcon icon={faArrowRight} className={`w-3 h-3 mr-2 ${showCompleted ? "rotate-90" : ""}`} />
              {completedTasks.length} Completed
            </button>
            {showCompleted && <div className="space-y-3">{completedTasks.map(card)}</div>}
          </div>
        </div>}
      </main>
      {draft && <TaskEditor draft={draft} isNew={isNew} saving={saving} error={error}
        onChange={(updates) => setDraft((value) => ({ ...value, ...updates }))}
        onClose={closeEditor} onSave={handleSave} onReminder={handleOpenReminderModal} reminderOpen={showReminderModal}
        onClearReminder={() => setDraft((value) => ({ ...value, reminderDate: "", reminderClock: "", repeatOption: "不重复" }))} />}
      {deletingTask && <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="delete-task-title" className="bg-white rounded-lg p-6 max-w-md w-full">
          <h2 id="delete-task-title" className="text-xl font-semibold">Delete task?</h2>
          <p className="my-4 break-words">“{deletingTask.title}” and all its subtasks will be deleted.</p>
          {error && <p role="alert" className="text-red-700 mb-4">{error}</p>}
          <div className="flex justify-end gap-3">
            <button autoFocus disabled={saving} onClick={() => { setDeletingTask(null); setError(null); }} className="px-4 py-2 border rounded-lg">Cancel</button>
            <button disabled={saving} onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg">{saving ? "Deleting..." : "Delete"}</button>
          </div>
        </div>
      </div>}
      {/*Reminder Modal*/}
      {showReminderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <style>
            {`
              .hide-scrollbar::-webkit-scrollbar {
                display: none;
              }
              .hide-scrollbar {
                -ms-overflow-style: none;
                scrollbar-width: none;
              }
            `}
          </style>
          <div role="dialog" aria-modal="true" aria-label="Reminder time" className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4">
            {/* Modal Header */}
            <div className="text-center mb-6">
              <h2 className="text-lg font-medium text-gray-900 mb-2">
                提醒时间
              </h2>
              <p className="text-sm text-gray-600">
                {formatDate(reminderDate)} {reminderTime.hour}时
                {reminderTime.minute}分
              </p>
            </div>

            {/* Date and Time Selectors */}
            <div className="flex justify-between items-center mb-8">
              {/* Date Selector */}
              <div className="relative">
                {/* center index line */}
                <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-blue-100"></div>
                <div
                  className="w-40 h-40 overflow-y-auto hide-scrollbar"
                  ref={dateRef}
                  onScroll={handleDateScroll}
                  style={{ scrollSnapType: "y mandatory" }}
                >
                  {buildDateList().map((date, idx) => {
                    const centerIdx = getCenterIndex(
                      dateRef,
                      scrollPositions.date
                    );
                    const isHighlighted = idx === centerIdx;
                    return (
                      <div
                        key={idx}
                        className={`h-10 flex items-center justify-center transition-all duration-200 cursor-pointer hover:text-blue-400 ${
                          isHighlighted
                            ? "text-blue-600 font-semibold text-lg"
                            : "text-gray-500"
                        }`}
                        style={{ scrollSnapAlign: "center" }}
                        onClick={() => {
                          scrollToIndex(dateRef, "date", idx, () => {
                            setReminderDate(date);
                          });
                        }}
                      >
                        {formatDate(date)}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Time Selector */}
              <div className="flex space-x-4">
                {/* Hour Selector */}
                <div className="relative">
                  {/* center index line */}
                  <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-blue-100"></div>
                  <div
                    className="w-14 h-40 overflow-y-auto hide-scrollbar"
                    ref={hourRef}
                    onScroll={handleHourScroll}
                    style={{ scrollSnapType: "y mandatory" }}
                  >
                    {Array.from({ length: 24 }).map((_, hour) => {
                      const centerIdx = getCenterIndex(
                        hourRef,
                        scrollPositions.hour
                      );
                      const isHighlighted = hour === centerIdx;
                      return (
                        <div
                          key={hour}
                          className={`h-10 flex items-center justify-center transition-all duration-200 cursor-pointer hover:text-blue-400 ${
                            isHighlighted
                              ? "text-blue-600 font-semibold text-lg"
                              : "text-gray-400"
                          }`}
                          style={{ scrollSnapAlign: "center" }}
                          onClick={() => {
                            scrollToIndex(hourRef, "hour", hour, () => {
                              setReminderTime((p) => ({ ...p, hour }));
                            });
                          }}
                        >
                          {hour.toString().padStart(2, "0")}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Minute Selector */}
                <div className="relative">
                  {/* center index line */}
                  <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-blue-100"></div>
                  <div
                    className="w-14 h-40 overflow-y-auto hide-scrollbar"
                    ref={minuteRef}
                    onScroll={handleMinuteScroll}
                    style={{ scrollSnapType: "y mandatory" }}
                  >
                    {Array.from({ length: 60 }).map((_, minute) => {
                      const centerIdx = getCenterIndex(
                        minuteRef,
                        scrollPositions.minute
                      );
                      const isHighlighted = minute === centerIdx;
                      return (
                        <div
                          key={minute}
                          className={`h-10 flex items-center justify-center transition-all duration-200 cursor-pointer hover:text-blue-400 ${
                            isHighlighted
                              ? "text-blue-600 font-semibold text-lg"
                              : "text-gray-400"
                          }`}
                          style={{ scrollSnapAlign: "center" }}
                          onClick={() => {
                            scrollToIndex(minuteRef, "minute", minute, () => {
                              setReminderTime((p) => ({ ...p, minute }));
                            });
                          }}
                        >
                          {minute.toString().padStart(2, "0")}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Repeat Option */}
            <div className="flex justify-between items-center mb-8">
              <span className="text-gray-700 font-medium">重复提醒</span>
              <select
                disabled
                title="Recurring notifications are not available yet"
                value={repeatOption}
                onChange={(e) => setRepeatOption(e.target.value)}
                className="text-gray-600 bg-transparent border-none outline-none"
              >
                <option value="不重复">不重复</option>
                <option value="每天">每天</option>
                <option value="每周">每周</option>
                <option value="每月">每月</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={handleCloseReminderModal}
                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirmReminder}
                className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
