# 🗂️ Planwise App

**An all-in-one personal planner, finance tracker, and productivity dashboard.**  
Planwise is a full-stack app designed for individuals to manage their tasks, daily expenses, and visualize personal data—safe, extensible, and cross-platform.

---

## ✨ Purpose

Planwise helps users:

- Manage personal plans (tasks, to-dos, schedules)
- Record and analyze daily expenses
- Visualize trends and data through charts
- Sync data across devices
- Securely manage accounts (Google Login + MFA)
- Connect to external APIs to extend functionality

> **One sentence: Planwise = Personal Digital Assistant + Plan Manager + Finance Tracker + Data Visualizer**

---

## 🖥️ Dashboard Concept

The Dashboard is:

- The first screen after login
- The main workspace
- A summary and entry point to key features
- Designed to give users instant clarity on their current status

### Dashboard Modules:

| Module                | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| Welcome / User Info   | Welcome user + show account details                    |
| Today's Plan          | Today’s tasks / high-priority items                    |
| This Month's Expenses | Expense summary + categorized charts                   |
| Quick Add             | Quickly add tasks / expenses                           |
| Data Visualization    | Progress trends, spending trends, habit tracking       |
| Recent Activity       | Recent modifications / entries / sync events           |
| API Data Area         | Google Calendar, Weather, Exchange Rates, Stocks, etc. |
| Settings / Config     | Account settings, security settings, API management    |

---

## 🛠️ Tech Stack

### Frontend:

- **React.js** — UI framework
- **Tailwind CSS** — Styling framework
- **Electron** — Packaged as a desktop app
- **Webpack** — Build tool

### Backend / Data:

- **Supabase** — Backend as a Service (Database + Auth)
- **Supabase Auth** — Google Login + MFA support
- **Supabase Database** — PostgreSQL database
- **Supabase Storage** — File storage (optional)
- **RLS + Triggers** — Row-level security and automated logic

### API Integrations:

- Google Calendar API (planned)
- Weather API (planned)
- Exchange Rate API (planned)
- Camera / Microphone API (desktop integration)

---

## 🔐 Security

- Google Login
- MFA support
- Row Level Security (RLS) to restrict users to their own data
- API keys managed via `.env` file, not committed to the repo

---

## To Run the Project

- use `npm run dev` to start the dev server and electron app

## 🏆 Roadmap

### ✅ 1. Login Page Complete

Implement a secure login system using Supabase Auth with Google Sign-In and optional MFA support.  
This is the entry point to the app, ensuring only authorized users can access their data.

### ✅ 2. Dashboard Design Confirmed

Design and finalize the main dashboard layout where users can:

- View key information at a glance
- Navigate to core modules
- Customize parts of their workspace

### ⏳ 3. Core Database Schema Complete

Design and implement the core database structure, including tables for:

- Users
- Tasks
- Expenses
- Profiles
- Settings
  With appropriate relationships, indexes, RLS policies, and triggers.

### ⏳ 4. Tasks / Expenses Modules Implemented

Develop full-featured modules to allow users to:

- Create, update, and delete tasks
- Record daily expenses
- Categorize expenses
- Set budgets
- Track completion status and deadlines

### ⏳ 5. Data Visualization Module Implemented

Implement charts and graphs to help users analyze:

- Spending trends
- Task completion trends
- Habit tracking
- Budget vs actual performance
  Use libraries like Chart.js or Recharts for dynamic, interactive data visualizations.

### ⏳ 6. API Data Sync Implemented

Allow users to connect and sync with external services, such as:

- Google Calendar: import and sync events with personal tasks
- Weather API: show weather forecasts within the dashboard
- Exchange Rate API: display real-time currency rates for financial planning

### ⏳ 7. Desktop Version Packaged and Released

Use Electron to package the app as a cross-platform desktop application:

- Windows
- macOS
- Linux
  Allow offline capabilities and local data caching for desktop users.

### ⏳ 8. Dark Mode Support Added

Implement a toggleable dark mode for better user experience, especially for night-time use.

- Support both system theme and manual override.

### ⏳ 9. Widget-based Customizable Dashboard

Make the dashboard modular so users can:

- Add/remove widgets
- Rearrange their dashboard layout
- Customize what data and modules they want to see first
  Enable a more personalized experience for different user types (students, freelancers, professionals, etc).

## Acknowledgements

- Supabase
- React
- Tailwind CSS
- Electron
- AI Models assisted in architecture and planning (TBD)
