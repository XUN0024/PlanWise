import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Translation resources
const resources = {
  en: {
    translation: {
      notesPanel: {
        allNotes: "All Notes", new: "New", inbox: "Inbox", pinned: "Pinned",
        starred: "Starred", tags: "Tags", trash: "Trash", updated: "Updated",
        loading: "Loading notes...", noNotes: "No notes yet.",
        noMatches: "No matching notes.", noPinned: "No pinned notes.",
        noTags: "No tags yet.", selectNote: "Select a note from the sidebar.",
        untitled: "Untitled note", noContent: "No content yet.", close: "Close",
        checklist: "Checklist", search: "Search notes or tags",
        clearSearch: "Clear search", retry: "Retry",
        loadError: "Could not load notes. Please check your connection and try again.",
        unavailable: "Notes are unavailable.",
        trashUnavailable: "Trash is not available yet.",
        title: "Title", body: "Content", edit: "Edit note", save: "Save",
        cancel: "Cancel", saving: "Saving...", saved: "Note saved.",
        unsaved: "Unsaved changes", noChanges: "No changes",
        saveError: "Could not save this note. Your draft is kept. Please retry.",
        titleRequired: "Enter a title for this note.",
        conflict: "This note changed or was deleted elsewhere. Your draft is kept. Copy your changes before reloading.",
        reload: "Reload notes", delete: "Delete", deleting: "Deleting...",
        deleted: "Note deleted.", deleteTitle: "Delete this note?",
        deleteBody: "This permanently deletes the note. It cannot be restored from Trash.",
        confirmDelete: "Confirm delete",
        deleteError: "Could not delete this note. It remains in the list. Please retry.",
        discardTitle: "Discard unsaved changes?",
        discardBody: "Your changes have not been saved. Keep editing to save them, or discard them to continue.",
        keepEditing: "Keep editing", discard: "Discard changes",
        contextMenu: "Note actions", noteActions: "Actions for {{title}}",
        star: "Star", unstar: "Unstar", pin: "Pin", unpin: "Unpin",
        changeColor: "Note color",
        colors: { amber: "Amber", red: "Red", blue: "Blue", green: "Green", purple: "Purple", pink: "Pink" },
        appearanceSaved: "Note updated.",
        appearanceError: "Could not update this note. Its last saved appearance is unchanged. Please retry.",
        appearanceConflict: "This note changed or was deleted elsewhere. Reload notes before trying again.",
      },
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
      notesPanel: {
        allNotes: "全部笔记", new: "新建", inbox: "笔记列表", pinned: "置顶",
        starred: "收藏", tags: "标签", trash: "回收站", updated: "更新时间",
        loading: "正在加载笔记…", noNotes: "暂无笔记。",
        noMatches: "没有匹配的笔记。", noPinned: "暂无置顶笔记。",
        noTags: "暂无标签。", selectNote: "请从侧栏选择一篇笔记。",
        untitled: "无标题笔记", noContent: "暂无正文。", close: "关闭",
        checklist: "清单", search: "搜索笔记或标签",
        clearSearch: "清除搜索", retry: "重试",
        loadError: "无法加载笔记，请检查网络后重试。",
        unavailable: "暂时无法获取笔记。",
        trashUnavailable: "回收站功能尚未开放。",
        title: "标题", body: "正文", edit: "编辑笔记", save: "保存",
        cancel: "取消", saving: "正在保存…", saved: "笔记已保存。",
        unsaved: "有未保存的修改", noChanges: "尚无修改",
        saveError: "无法保存笔记，草稿已保留，请重试。",
        titleRequired: "请填写笔记标题。",
        conflict: "这篇笔记已在其他地方修改或删除。草稿已保留，请先复制修改内容再重新读取。",
        reload: "重新读取笔记", delete: "删除", deleting: "正在删除…",
        deleted: "笔记已删除。", deleteTitle: "确认删除这篇笔记？",
        deleteBody: "此操作会永久删除笔记，无法从回收站恢复。",
        confirmDelete: "确认删除",
        deleteError: "删除失败，笔记仍保留在列表中，请重试。",
        discardTitle: "放弃未保存的修改？",
        discardBody: "修改尚未保存。你可以继续编辑并保存，或放弃修改后继续。",
        keepEditing: "继续编辑", discard: "放弃修改",
        contextMenu: "笔记操作", noteActions: "{{title}} 的操作",
        star: "收藏", unstar: "取消收藏", pin: "置顶", unpin: "取消置顶",
        changeColor: "笔记颜色",
        colors: { amber: "琥珀色", red: "红色", blue: "蓝色", green: "绿色", purple: "紫色", pink: "粉色" },
        appearanceSaved: "笔记设置已保存。",
        appearanceError: "修改失败，页面保留上次确认的设置，请重试。",
        appearanceConflict: "这篇笔记已在其他地方修改或删除，请重新读取后再操作。",
      },
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
