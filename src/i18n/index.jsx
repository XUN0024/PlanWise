import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Translation resources
const resources = {
  en: {
    translation: {
      // Navigation
      dashboard: "Dashboard",
      tasks: "Tasks",
      expenses: "Expenses",
      notes: "Notes",
      files: "Files",

      // Common
      welcome: "Welcome back",
      signOut: "Sign Out",
      loading: "Loading...",
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      edit: "Edit",
      add: "Add",

      // Dashboard
      welcomeMessage:
        "Your personal productivity hub is ready. Manage tasks, track expenses, organize notes, and store files.",
      activeTasks: "Active Tasks",
      thisMonth: "This Month",
      recentActivity: "Recent Activity",
      quickActions: "Quick Actions",
      todaySummary: "Today's Summary",

      // Tasks
      newTask: "New Task",
      addTask: "Add Task",
      taskTitle: "Task Title",
      taskDescription: "Task Description",
      priority: "Priority",
      createdAt: "Created At",
      high: "High",
      medium: "Medium",
      low: "Low",
      completed: "Completed",
      pending: "Pending",
      inProgress: "In Progress",

      // Buttons
      createTask: "Create Task",
      addExpense: "Add Expense",
      createNote: "Create Note",
      uploadFile: "Upload File",
      logExpense: "Log Expense",
      writeNote: "Write Note",

      // Stats
      completedToday: "completed today",
      updatedToday: "updated today",
      fromLastMonth: "from last month",
      gbUsed: "GB used",

      // Time
      hoursAgo: "hours ago",
      yesterday: "Yesterday",
      daysAgo: "days ago",
      today: "Today",
      tomorrow: "Tomorrow",

      // File types
      groceries: "Groceries",
      gas: "Gas",
      coffee: "Coffee",
    },
  },
  zh: {
    translation: {
      // Navigation
      dashboard: "仪表板",
      tasks: "任务",
      expenses: "支出",
      notes: "笔记",
      files: "文件",

      // Common
      welcome: "欢迎回来",
      signOut: "退出登录",
      loading: "加载中...",
      save: "保存",
      cancel: "取消",
      delete: "删除",
      edit: "编辑",
      add: "添加",

      // Dashboard
      welcomeMessage:
        "您的个人生产力中心已准备就绪。管理任务、跟踪支出、整理笔记和存储文件。",
      activeTasks: "活跃任务",
      thisMonth: "本月",
      recentActivity: "最近活动",
      quickActions: "快速操作",
      todaySummary: "今日摘要",

      // Tasks
      newTask: "新任务",
      addTask: "添加任务",
      taskTitle: "任务标题",
      taskDescription: "任务描述",
      priority: "优先级",
      createdAt: "创建时间",
      high: "高",
      medium: "中",
      low: "低",
      completed: "已完成",
      pending: "待处理",
      inProgress: "进行中",

      // Buttons
      createTask: "创建任务",
      addExpense: "添加支出",
      createNote: "创建笔记",
      uploadFile: "上传文件",
      logExpense: "记录支出",
      writeNote: "写笔记",

      // Stats
      completedToday: "今日完成",
      updatedToday: "今日更新",
      fromLastMonth: "较上月",
      gbUsed: "GB 已使用",

      // Time
      hoursAgo: "小时前",
      yesterday: "昨天",
      daysAgo: "天前",
      today: "今天",
      tomorrow: "明天",

      // File types
      groceries: "杂货",
      gas: "汽油",
      coffee: "咖啡",
    },
  },
};

i18n
  .use(LanguageDetector) // Automatically detect user language
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    resources,
    fallbackLng: "en", // Default language
    debug: process.env.NODE_ENV === "development",

    interpolation: {
      escapeValue: false, // React already escapes values
    },

    detection: {
      // Language detection options
      order: ["localStorage", "navigator", "htmlTag"],
      caches: ["localStorage"],
    },
  });

export default i18n;
