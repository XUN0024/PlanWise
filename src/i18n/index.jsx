import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Translation resources
const resources = {
  en: {
    translation: {
      attachments: {
        title: "Attachments", dropHere: "Drag and drop here",
        limits: "Up to 5 files per drop · 15MB maximum per file",
        saveFirst: "Select a saved note, or save this note before adding attachments.",
        wait: "Please wait for the current operation to finish.",
        tooMany: "Drop no more than 5 files at a time. No files were uploaded.",
        tooLarge: "Each file must be 15MB or smaller. No files were uploaded.",
        invalidName: "A file name is empty or too long. No files were uploaded.",
        emptyDrop: "No files found.", directory: "Drop files, not folders.",
        authError: "Your session changed. Sign in again before uploading.",
        queued: "Waiting", uploading: "Uploading", failed: "Upload failed",
        incomplete: "Unfinished upload", uploadError: "Upload could not finish. Retry or remove this item.",
        loadError: "Could not load attachments. Check the Storage setup and your connection.",
        removeError: "Could not remove this attachment. Please retry.",
        downloadError: "Could not download this attachment. Please retry.",
        deleteTitle: "Permanently remove this attachment?",
        cancelUpload: "Cancel upload", cancelled: "Upload stopped. Retry or remove this item.",
        errorDetails: "Show error details",
        stage: { validation: "File validation", authentication: "Session check",
          reservation: "Attachment registration", transfer: "Storage upload",
          confirmation: "Upload confirmation", unknown: "Upload" },
      },
      tagsPanel: {
        manage: "Manage tags", addToNote: "Add tag", search: "Search tags",
        name: "Tag name", new: "New tag", create: "Create tag", rename: "Edit tag", color: "Tag color",
        createNamed: 'Create and add "{{name}}"', removeFromNote: 'Remove "{{name}}" from this note',
        saveFirst: "Save this note before adding tags.", noMatches: "No matching tags.",
        noteCount_one: "{{count}} note", noteCount_other: "{{count}} notes",
        clearFilter: "Clear tag filter", reload: "Reload tags", loading: "Loading tags...", saving: "Saving...",
        duplicate: "A tag with this name already exists (names are case-insensitive).",
        invalidName: "Enter a tag name between 1 and 100 characters.", invalidColor: "Choose one of the preset colors.",
        loadError: "Could not load tags. Your note content is still available. Retry when connected.",
        setupRequired: "Tag database setup is required. Run 20261105_note_tags.sql in Supabase SQL Editor, then reload tags.",
        unavailable: "Tags are unavailable. Open Manage tags for details.",
        writeError: "Could not save the tag change. Your input is kept. Please retry.",
        conflict: "This tag or note changed or was deleted elsewhere. Reload tags and review the latest values before editing again.",
        deleteTitle: "Delete this tag?", deleteBody: "This removes the tag from {{count}} notes and deletes it from your tag library. The notes are kept.",
      },
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
        formatting: "Text formatting",
        format: { bold: "Bold", underline: "Underline", italic: "Italic", orderedList: "Numbered list", bulletList: "Bulleted list" },
        saveError: "Could not save this note. Your draft is kept. Please retry.",
        titleRequired: "Enter a title for this note.",
        conflict: "This note changed or was deleted elsewhere. Your draft is kept. Copy your changes before reloading.",
        reload: "Reload notes", delete: "Delete", deleting: "Deleting...",
        deleted: "Note deleted.", deleteTitle: "Delete this note?",
        deleteBody: "This permanently deletes the note and its attachments. It cannot be restored from Trash.",
        confirmDelete: "Confirm delete",
        deleteError: "Could not finish deleting this note. The note remains; some attachments may already have been removed. Please retry.",
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
      attachments: {
        title: "附件", dropHere: "拖拽文件到此处上传",
        limits: "每次最多 5 个文件 · 单个文件最大 15MB",
        saveFirst: "请先选择已保存的笔记，或保存当前笔记后再添加附件。",
        wait: "请等待当前操作完成。",
        tooMany: "每次最多拖入 5 个文件，本次未上传任何文件。",
        tooLarge: "单个文件不能超过 15MB，本次未上传任何文件。",
        invalidName: "文件名为空或过长，本次未上传任何文件。",
        emptyDrop: "没有检测到文件。", directory: "请拖入文件，暂不支持文件夹。",
        authError: "登录状态已变化，请重新登录后上传。",
        queued: "等待上传", uploading: "正在上传", failed: "上传失败",
        incomplete: "未完成的上传", uploadError: "上传未完成，请重试或移除此项。",
        loadError: "无法加载附件，请检查 Storage 配置和网络后重试。",
        removeError: "无法移除附件，请重试。",
        downloadError: "无法下载附件，请重试。",
        deleteTitle: "永久移除此附件？",
        cancelUpload: "停止上传", cancelled: "上传已停止，可重试或移除此项。",
        errorDetails: "查看错误详情",
        stage: { validation: "文件校验", authentication: "登录状态检查",
          reservation: "附件记录登记", transfer: "Storage 文件上传",
          confirmation: "上传完成校验", unknown: "上传" },
      },
      tagsPanel: {
        manage: "管理标签", addToNote: "添加标签", search: "搜索标签",
        name: "标签名称", new: "新建标签", create: "创建标签", rename: "编辑标签", color: "标签颜色",
        createNamed: "创建并添加「{{name}}」", removeFromNote: "从当前笔记移除「{{name}}」",
        saveFirst: "请先保存笔记，再添加标签。", noMatches: "没有匹配的标签。",
        noteCount: "{{count}} 篇笔记", clearFilter: "清除标签筛选", reload: "重新读取标签",
        loading: "正在加载标签…", saving: "正在保存…",
        duplicate: "已存在同名标签，名称不区分大小写。",
        invalidName: "请输入 1 至 100 个字符的标签名称。", invalidColor: "请选择预设颜色。",
        loadError: "无法加载标签，笔记正文仍可使用。请连接网络后重试。",
        setupRequired: "请先在 Supabase SQL Editor 执行 20261105_note_tags.sql，再重新读取标签。",
        unavailable: "标签暂不可用，请打开管理标签查看详情。",
        writeError: "标签修改保存失败，输入已保留，请重试。",
        conflict: "标签或笔记已在其他地方修改或删除。请重新读取标签，核对最新内容后再编辑。",
        deleteTitle: "删除这个标签？", deleteBody: "将从 {{count}} 篇笔记移除此标签，并从你的标签库删除它。笔记仍会保留。",
      },
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
        formatting: "正文格式",
        format: { bold: "加粗", underline: "下划线", italic: "斜体", orderedList: "有序列表", bulletList: "无序列表" },
        saveError: "无法保存笔记，草稿已保留，请重试。",
        titleRequired: "请填写笔记标题。",
        conflict: "这篇笔记已在其他地方修改或删除。草稿已保留，请先复制修改内容再重新读取。",
        reload: "重新读取笔记", delete: "删除", deleting: "正在删除…",
        deleted: "笔记已删除。", deleteTitle: "确认删除这篇笔记？",
        deleteBody: "此操作会永久删除笔记及其附件，无法从回收站恢复。",
        confirmDelete: "确认删除",
        deleteError: "删除未完成，笔记仍保留；部分附件可能已移除，请重试。",
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
