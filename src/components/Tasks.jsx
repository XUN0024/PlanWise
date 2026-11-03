import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  createSubtask,
  updateSubtask,
  deleteSubtask,
} from "../services/taskService";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faTasks,
  faDollarSign,
  faStickyNote,
  faFile,
  faPlus,
  faCheck,
  faEdit,
  faArrowRight,
  faUpload,
  faShoppingCart,
  faGasPump,
  faSearch,
  faCoffee,
  faTimes,
  faCalendar,
  faAlarmClock,
  faFlag,
  faBell,
} from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import LanguageSwitcher from "./LanguageSwitcher";
import { useTranslation } from "react-i18next";

const Tasks = () => {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  // Sample task data - you can replace this with data from your backend
  const [incompleteTasks, setIncompleteTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState(null);

  // Helper function to format database data for UI
  const formatTaskForUI = (dbTask) => {
    return {
      id: dbTask.id,
      title: dbTask.title,
      description: dbTask.description || "",
      priority: dbTask.priority || "Medium",
      isCompleted: dbTask.is_completed || false,
      createdAt: dbTask.created_at,
      reminderTime:
        dbTask.reminder_date && dbTask.reminder_time
          ? `${new Date(dbTask.reminder_date).toLocaleDateString()} ${
              dbTask.reminder_time
            }`
          : null,
      subtasks: (dbTask.subtasks || []).map((sub) => ({
        id: sub.id,
        title: sub.title,
        isCompleted: sub.is_completed || false,
      })),
    };
  };

  //load tasks when component mounts
  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log("🔄 Loading tasks for user:", user?.id);
        const tasks = await getTasks();
        console.log("✅ Tasks loaded successfully:", tasks);

        // Debug: Log first task structure
        if (tasks.length > 0) {
          console.log("🔍 First task structure:", tasks[0]);
          console.log("🔍 First task subtasks:", tasks[0].subtasks);
        }

        // Format tasks for UI
        const formattedTasks = tasks.map(formatTaskForUI);
        console.log("🎨 Formatted tasks:", formattedTasks);

        // Separate completed and incomplete tasks
        const incomplete = formattedTasks.filter((task) => !task.isCompleted);
        const completed = formattedTasks.filter((task) => task.isCompleted);

        console.log("📊 Incomplete tasks:", incomplete.length);
        console.log("✅ Completed tasks:", completed.length);

        setIncompleteTasks(incomplete);
        setCompletedTasks(completed);
      } catch (error) {
        console.error("❌ Error loading tasks:", error);
        setError(error.message || "Failed to load tasks");
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      console.log("👤 User found, loading tasks...");
      loadTasks();
    } else {
      console.log("⚠️ No user found, skipping task load");
      setLoading(false);
    }
  }, [user]);

  // UI: map of ids that are playing the complete animation (task level)
  const [animatingCompleteIds, setAnimatingCompleteIds] = useState({});
  const startComplete = (id) => {
    setAnimatingCompleteIds((m) => (m[id] ? m : { ...m, [id]: true }));
    // 立即将复选框视觉置为勾选
    setCheckedMap((prev) => ({ ...prev, [id]: true }));
  };
  const finalizeComplete = (id) => {
    // 从未完成中移除并加入已完成
    setIncompleteTasks((list) => {
      const idx = list.findIndex((t) => t.id === id);
      if (idx === -1) return list;
      const task = list[idx];
      // 防重：只在未存在时加入 completed
      setCompletedTasks((done) =>
        done.some((t) => t.id === id) ? done : [...done, { ...task }]
      );
      const next = [...list.slice(0, idx), ...list.slice(idx + 1)];
      return next;
    });
    // 清除该任务的勾选视觉状态，避免回到未完成后仍为选中
    setCheckedMap((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
    setAnimatingCompleteIds((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
  };

  // UI: subtasks animation + completion state (per subKey)
  const [animatingSubIds, setAnimatingSubIds] = useState({});
  const [completedSubMap, setCompletedSubMap] = useState({});
  const startSubAnimate = (subKey) => {
    setAnimatingSubIds((m) => (m[subKey] ? m : { ...m, [subKey]: true }));
  };
  const finalizeSubAnimate = (subKey) => {
    setAnimatingSubIds((m) => {
      const n = { ...m };
      delete n[subKey];
      return n;
    });
    setCompletedSubMap((m) => ({ ...m, [subKey]: true }));
  };

  const [showCompleted, setShowCompleted] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "Medium",
    subtasks: [],
  });
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderDate, setReminderDate] = useState(new Date());
  const [reminderTime, setReminderTime] = useState({ hour: 15, minute: 48 });
  const [repeatOption, setRepeatOption] = useState("不重复");

  // UI state: checkbox for tasks
  const [checkedMap, setCheckedMap] = useState({});

  // Demo tester state for strike-through animation
  const [demoAnim, setDemoAnim] = useState({
    animating: false,
    completed: false,
  });
  const runDemo = () => setDemoAnim({ animating: true, completed: false });
  const resetDemo = () => setDemoAnim({ animating: false, completed: false });
  const onDemoEnd = () =>
    setDemoAnim((s) =>
      s.animating ? { animating: false, completed: true } : s
    );

  // Track scroll positions for dynamic highlighting
  const [scrollPositions, setScrollPositions] = useState({
    date: 0,
    hour: 0,
    minute: 0,
  });

  // Reminder modal scrolling helpers
  const REM_ITEM_H = 40; // px height per row
  const dateRef = React.useRef(null);
  const hourRef = React.useRef(null);
  const minuteRef = React.useRef(null);
  const scrollTimers = React.useRef({ date: null, hour: null, minute: null });
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Helper function to get priority color
  const getPriorityColor = (priority) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "text-red-600";
      case "medium":
        return "text-yellow-600";
      case "low":
        return "text-green-600";
      default:
        return "text-gray-600";
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleAddTask = () => {
    setShowAddModal(true);
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setShowSubtasks(false);
    setNewTask({
      title: "",
      description: "",
      priority: "Medium",
      subtasks: [],
    });
  };

  const handleSubmitTask = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    try {
      console.log("🚀 Creating new task:", newTask);

      // Create the main task
      const createdTask = await createTask(
        {
          title: newTask.title,
          description: newTask.description,
          priority: newTask.priority,
          reminder_date: reminderDate
            ? reminderDate.toISOString().split("T")[0]
            : null,
          reminder_time: reminderTime
            ? `${reminderTime.hour
                .toString()
                .padStart(2, "0")}:${reminderTime.minute
                .toString()
                .padStart(2, "0")}`
            : null,
        },
        user.id
      );

      console.log("✅ Task created:", createdTask);

      // Create subtasks if any
      if (newTask.subtasks && newTask.subtasks.length > 0) {
        const subtaskPromises = newTask.subtasks
          .filter((st) => st.title.trim()) // Only create non-empty subtasks
          .map((st) =>
            createSubtask(createdTask.id, {
              title: st.title,
              is_completed: false,
            })
          );

        await Promise.all(subtaskPromises);
        console.log("✅ Subtasks created");
      }

      // Reload tasks to get updated data
      const updatedTasks = await getTasks();
      const formattedTasks = updatedTasks.map(formatTaskForUI);
      const incomplete = formattedTasks.filter((task) => !task.isCompleted);
      setIncompleteTasks(incomplete);

      handleCloseModal();
    } catch (error) {
      console.error("❌ Failed to create task:", error);
      setError(error.message || "Failed to create task");
    }
  };

  const handleInputChange = (field, value) => {
    setNewTask((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleAddSubtask = () => {
    setShowSubtasks(true);
    setNewTask((prev) => ({
      ...prev,
      subtasks: [...prev.subtasks, { id: Date.now(), title: "" }],
    }));
  };

  const handleSubtaskChange = (subtaskId, value) => {
    setNewTask((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, title: value } : subtask
      ),
    }));
  };

  const handleRemoveSubtask = (subtaskId) => {
    setNewTask((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((subtask) => subtask.id !== subtaskId),
    }));

    // Hide subtasks section if no subtasks remain
    if (newTask.subtasks.length <= 1) {
      setShowSubtasks(false);
    }
  };

  const handleOpenReminderModal = () => {
    setShowReminderModal(true);
  };

  const handleCloseReminderModal = () => {
    setShowReminderModal(false);
  };

  const handleConfirmReminder = () => {
    // Here you would save the reminder settings
    console.log("Reminder set:", { reminderDate, reminderTime, repeatOption });
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

  const handleEditTask = (task) => {
    setEditingTask({
      ...task,
      subtasks: task.subtasks || [],
    });
    setShowEditModal(true);
    setShowSubtasks(task.subtasks && task.subtasks.length > 0);
  };

  const handleCloseEditModal = () => {
    setShowEditModal(false);
    setEditingTask(null);
    setShowSubtasks(false);
  };

  const handleUpdateTask = (e) => {
    e.preventDefault();
    if (editingTask && editingTask.title.trim()) {
      // Here you would typically update the task in your backend
      console.log("Updated task:", editingTask);
      handleCloseEditModal();
    }
  };

  const handleEditInputChange = (field, value) => {
    setEditingTask((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleEditSubtaskChange = (subtaskId, value) => {
    setEditingTask((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((subtask) =>
        subtask.id === subtaskId ? { ...subtask, title: value } : subtask
      ),
    }));
  };

  const handleAddEditSubtask = () => {
    setShowSubtasks(true);
    setEditingTask((prev) => ({
      ...prev,
      subtasks: [...(prev.subtasks || []), { id: Date.now(), title: "" }],
    }));
  };

  const handleRemoveEditSubtask = (subtaskId) => {
    setEditingTask((prev) => ({
      ...prev,
      subtasks: prev.subtasks.filter((subtask) => subtask.id !== subtaskId),
    }));

    // Hide subtasks section if no subtasks remain
    if (editingTask.subtasks && editingTask.subtasks.length <= 1) {
      setShowSubtasks(false);
    }
  };

  // Add this near the start of your return statement
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading tasks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ">
        {/*task header*/}
        <div className="flex justify-between items-center py-4">
          <h1 className="text-2xl font-bold text-gray-900">All Tasks</h1>
        </div>
        {/*search and add task*/}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search tasks..."
            />
            <button className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <FontAwesomeIcon
                icon={faSearch}
                className="w-4 h-4 text-gray-500"
              />
            </button>
          </div>
          <button
            onClick={handleAddTask}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm whitespace-nowrap"
          >
            Add Task
          </button>
        </div>

        {/* Task List */}
        <div className="mt-8 space-y-6">
          {/* Incomplete Tasks */}
          <div className="space-y-3">
            {incompleteTasks.map((task) => (
              <div
                key={task.id}
                onClick={() => handleEditTask(task)}
                className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start space-x-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // 如果已在动画中，忽略
                      if (animatingCompleteIds[task.id]) return;
                      // 触发完成动画（最终在动画结束时移动到已完成）
                      startComplete(task.id);
                    }}
                    className={`w-5 h-5 rounded mt-1 flex items-center justify-center border-2 transition-colors ${
                      checkedMap[task.id]
                        ? "border-blue-500 bg-blue-500 text-white"
                        : "border-gray-300 bg-white"
                    }`}
                    aria-pressed={!!checkedMap[task.id]}
                  >
                    {checkedMap[task.id] && (
                      <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
                    )}
                  </button>
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">
                      <span className="relative inline-block">
                        <span className="relative z-0">{task.title}</span>
                        <span
                          className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-current z-10 origin-left transition-transform duration-300 ${
                            animatingCompleteIds[task.id]
                              ? "scale-x-100"
                              : "scale-x-0"
                          }`}
                          onTransitionEnd={() => {
                            if (animatingCompleteIds[task.id])
                              finalizeComplete(task.id);
                          }}
                          style={{
                            transform: animatingCompleteIds[task.id]
                              ? "scaleX(1)"
                              : "scaleX(0)",
                          }}
                        />
                      </span>
                    </h3>
                    {/* Reminder Date & Time*/}
                    {task.reminderTime && (
                      <div className="flex items-center space-x-4 mt-1">
                        <div className="flex items-center space-x-1 text-xs text-gray-400">
                          <span>{task.reminderTime}</span>
                          <FontAwesomeIcon
                            icon={faAlarmClock}
                            className="w-3 h-3"
                          />
                        </div>
                      </div>
                    )}
                    {/* Description */}
                    {task.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {task.description}
                      </p>
                    )}
                    {task.subtasks && task.subtasks.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {task.subtasks.map((st, i) => {
                          const subKey = `${task.id}-sub-${st.id || i}`;
                          const isChecked =
                            !!checkedMap[subKey] || st.isCompleted;
                          const label = st.title || st;
                          return (
                            <li
                              key={subKey}
                              className="text-sm text-gray-500 flex items-center gap-2"
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = !isChecked;
                                  setCheckedMap((prev) => ({
                                    ...prev,
                                    [subKey]: next,
                                  }));
                                  if (next) {
                                    if (
                                      !animatingSubIds[subKey] &&
                                      !completedSubMap[subKey]
                                    ) {
                                      startSubAnimate(subKey);
                                    }
                                  } else {
                                    setCompletedSubMap((m) => {
                                      const n = { ...m };
                                      delete n[subKey];
                                      return n;
                                    });
                                    setAnimatingSubIds((m) => {
                                      const n = { ...m };
                                      delete n[subKey];
                                      return n;
                                    });
                                  }
                                }}
                                className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-colors ${
                                  isChecked
                                    ? animatingSubIds[subKey] &&
                                      !completedSubMap[subKey]
                                      ? "border-blue-500 bg-blue-500 text-white"
                                      : "border-gray-300 bg-gray-200 text-gray-500"
                                    : "border-gray-300 bg-white text-gray-400"
                                }`}
                                aria-pressed={isChecked}
                              >
                                {isChecked && (
                                  <FontAwesomeIcon
                                    icon={faCheck}
                                    className="w-2.5 h-2.5"
                                  />
                                )}
                              </button>
                              <span className="relative inline-block">
                                <span
                                  className={`relative z-0 ${
                                    isChecked || completedSubMap[subKey]
                                      ? "line-through text-gray-400"
                                      : "text-gray-700"
                                  }`}
                                >
                                  {label}
                                </span>
                                <span
                                  className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-current z-10 origin-left ${
                                    animatingSubIds[subKey]
                                      ? "transition-transform duration-300 scale-x-100"
                                      : "transition-none scale-x-0"
                                  }`}
                                  onTransitionEnd={() => {
                                    if (animatingSubIds[subKey])
                                      finalizeSubAnimate(subKey);
                                  }}
                                  style={{
                                    transform: animatingSubIds[subKey]
                                      ? "scaleX(1)"
                                      : "scaleX(0)",
                                  }}
                                />
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {/* Priority */}
                    <div className="flex items-center space-x-4 mt-2">
                      <div
                        className={`text-sm font-medium ${getPriorityColor(
                          task.priority
                        )}`}
                      >
                        {task.priority}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Completed Tasks Section */}
          <div className="border-t border-gray-200 pt-6">
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors mb-4"
            >
              <FontAwesomeIcon
                icon={showCompleted ? faArrowRight : faArrowRight}
                className={`w-3 h-3 transition-transform ${
                  showCompleted ? "rotate-90" : ""
                }`}
              />
              <span className="text-sm font-medium">
                {completedTasks.length} Completed
              </span>
            </button>

            {showCompleted && (
              <div className="space-y-3">
                {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-gray-50 p-4 rounded-lg border border-gray-200"
                  >
                    <div className="flex items-start space-x-3">
                      <button
                        onClick={() => {
                          // move back to incomplete
                          setCompletedTasks((list) =>
                            list.filter((t) => t.id !== task.id)
                          );
                          setIncompleteTasks((list) => {
                            // 防重：若已存在则不重复插入
                            if (list.some((t) => t.id === task.id)) return list;
                            return [...list, { ...task }];
                          });
                          // 清除该任务的勾选视觉状态
                          setCheckedMap((m) => {
                            const n = { ...m };
                            delete n[task.id];
                            return n;
                          });
                        }}
                        className="w-5 h-5 rounded flex items-center justify-center border-2 border-gray-300 bg-white mt-1 text-gray-500"
                        aria-label="Mark as incomplete"
                      >
                        <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />
                      </button>
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-500 line-through">
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-gray-400 mt-1 line-through">
                            {task.description}
                          </p>
                        )}
                        {/* Priority for completed tasks */}
                        <div className="flex items-center space-x-4 mt-2">
                          <div
                            className={`text-sm font-medium text-gray-400 line-through`}
                          >
                            {task.priority}
                          </div>
                        </div>
                        {/* Subtasks for completed tasks */}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {task.subtasks.map((st, i) => {
                              const subKey = `${task.id}-done-sub-${
                                st.id || i
                              }`;
                              const label = st.title || st;
                              return (
                                <li
                                  key={subKey}
                                  className="text-sm text-gray-400 flex items-center gap-2"
                                >
                                  <span className="w-3 h-3 rounded border-2 border-gray-300 bg-gray-200 flex items-center justify-center">
                                    <FontAwesomeIcon
                                      icon={faCheck}
                                      className="w-2 h-2 text-gray-500"
                                    />
                                  </span>
                                  <span className="line-through">{label}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Add New Task
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTask} className="space-y-4">
              {/* Task Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => handleInputChange("title", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter task title..."
                  required
                />
              </div>

              {/* Task Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter task description..."
                  rows="3"
                />
              </div>

              {/* Subtasks Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Subtasks
                  </label>
                  <button
                    type="button"
                    onClick={handleAddSubtask}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center space-x-1"
                  >
                    <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                    <span>Add Subtask</span>
                  </button>
                </div>

                {/* Subtasks List */}
                {showSubtasks && newTask.subtasks.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {newTask.subtasks.map((subtask) => (
                      <div
                        key={subtask.id}
                        className="flex items-center space-x-2"
                      >
                        <input
                          type="text"
                          value={subtask.title}
                          onChange={(e) =>
                            handleSubtaskChange(subtask.id, e.target.value)
                          }
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter subtask..."
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSubtask(subtask.id)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <div className="relative">
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      handleInputChange("priority", e.target.value)
                    }
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                  <FontAwesomeIcon
                    icon={faFlag}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-4">
                {/* Set Reminder - Bottom Left */}
                <button
                  type="button"
                  onClick={handleOpenReminderModal}
                  className="flex items-center space-x-2 px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 text-sm"
                >
                  <FontAwesomeIcon icon={faBell} className="w-4 h-4" />
                  <span>Set Reminder</span>
                </button>

                {/* Action Buttons - Bottom Right */}
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Add Task
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {showEditModal && editingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Edit Task</h2>
              <button
                onClick={handleCloseEditModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateTask} className="space-y-4">
              {/* Task Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Title *
                </label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) =>
                    handleEditInputChange("title", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter task title..."
                  required
                />
              </div>

              {/* Task Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editingTask.description}
                  onChange={(e) =>
                    handleEditInputChange("description", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter task description..."
                  rows="3"
                />
              </div>

              {/* Subtasks Section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Subtasks
                  </label>
                  <button
                    type="button"
                    onClick={handleAddEditSubtask}
                    className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center space-x-1"
                  >
                    <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                    <span>Add Subtask</span>
                  </button>
                </div>

                {/* Subtasks List */}
                {showSubtasks &&
                  editingTask.subtasks &&
                  editingTask.subtasks.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {editingTask.subtasks.map((subtask) => (
                        <div
                          key={subtask.id}
                          className="flex items-center space-x-2"
                        >
                          <input
                            type="text"
                            value={subtask.title}
                            onChange={(e) =>
                              handleEditSubtaskChange(
                                subtask.id,
                                e.target.value
                              )
                            }
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Enter subtask..."
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveEditSubtask(subtask.id)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <FontAwesomeIcon
                              icon={faTimes}
                              className="w-4 h-4"
                            />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <div className="relative">
                  <select
                    value={editingTask.priority}
                    onChange={(e) =>
                      handleEditInputChange("priority", e.target.value)
                    }
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                  <FontAwesomeIcon
                    icon={faFlag}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-4">
                {/* Set Reminder - Bottom Left */}
                <button
                  type="button"
                  onClick={handleOpenReminderModal}
                  className="flex items-center space-x-2 px-2 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 text-sm"
                >
                  <FontAwesomeIcon icon={faBell} className="w-4 h-4" />
                  <span>Set Reminder</span>
                </button>

                {/* Action Buttons - Bottom Right */}
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleCloseEditModal}
                    className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Update Task
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

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
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm mx-4">
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
