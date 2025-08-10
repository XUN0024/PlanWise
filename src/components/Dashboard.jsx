import React from "react";
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
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import LanguageSwitcher from "./LanguageSwitcher";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();

  const handleSignOut = async () => {
    await signOut();
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
                <a
                  href="#"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  Expenses
                </a>
                <a
                  href="#"
                  className="text-gray-500 hover:text-gray-700 px-1 py-4 text-sm font-medium"
                >
                  Notes
                </a>
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* Welcome Hero Section */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-lg p-8 text-white">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">
                  Welcome back, {user?.email?.split("@")[0] || "User"}! 👋
                </h1>
                <p className="text-blue-100 text-lg mb-6">
                  Your personal productivity hub is ready. Manage tasks, track
                  expenses, organize notes, and store files.
                </p>
                <div className="flex flex-wrap gap-4">
                  <button className="bg-white text-blue-600 px-6 py-2 rounded-lg font-medium hover:bg-blue-50 transition-colors">
                    + New Task
                  </button>
                  <button className="bg-blue-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-400 transition-colors">
                    + Add Expense
                  </button>
                  <button className="bg-purple-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-400 transition-colors">
                    + Create Note
                  </button>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="w-32 h-32 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                  <img
                    className="w-28 h-28 rounded-full"
                    src={planWiseLogo}
                    alt="PlanWise Logo"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FontAwesomeIcon
                      icon={faTasks}
                      className="w-6 h-6 text-blue-600"
                    />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    Active Tasks
                  </p>
                  <p className="text-2xl font-bold text-gray-900">12</p>
                  <p className="text-xs text-green-600">3 completed today</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <FontAwesomeIcon
                      icon={faDollarSign}
                      className="w-6 h-6 text-green-600"
                    />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    This Month
                  </p>
                  <p className="text-2xl font-bold text-gray-900">$1,234</p>
                  <p className="text-xs text-red-600">+$89 from last month</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <FontAwesomeIcon
                      icon={faStickyNote}
                      className="w-6 h-6 text-purple-600"
                    />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Notes</p>
                  <p className="text-2xl font-bold text-gray-900">8</p>
                  <p className="text-xs text-blue-600">2 updated today</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <FontAwesomeIcon
                      icon={faFile}
                      className="w-6 h-6 text-orange-600"
                    />
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Files</p>
                  <p className="text-2xl font-bold text-gray-900">24</p>
                  <p className="text-xs text-gray-500">2.3 GB used</p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Recent Activity */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">
                    Recent Activity
                  </h2>
                </div>
                <div className="p-6">
                  <div className="space-y-4">
                    {/* Sample Activity Items */}
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <FontAwesomeIcon
                            icon={faCheck}
                            className="w-4 h-4 text-green-600"
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          Completed task "Review project proposal"
                        </p>
                        <p className="text-xs text-gray-500">2 hours ago</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <FontAwesomeIcon
                            icon={faPlus}
                            className="w-4 h-4 text-blue-600"
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          Added expense "Lunch at cafe" - $12.50
                        </p>
                        <p className="text-xs text-gray-500">4 hours ago</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                          <FontAwesomeIcon
                            icon={faEdit}
                            className="w-4 h-4 text-purple-600"
                          />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900">
                          Created note "Meeting notes - Q1 planning"
                        </p>
                        <p className="text-xs text-gray-500">Yesterday</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 text-center">
                    <button className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center justify-center">
                      View all activity{" "}
                      <FontAwesomeIcon
                        icon={faArrowRight}
                        className="ml-2 w-3 h-3"
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Quick Actions & Summary */}
            <div className="space-y-6">
              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Quick Actions
                </h3>
                <div className="space-y-3">
                  <button className="w-full flex items-center px-4 py-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                    <FontAwesomeIcon
                      icon={faTasks}
                      className="w-5 h-5 text-blue-600 mr-3"
                    />
                    <span className="text-blue-700 font-medium">Add Task</span>
                  </button>

                  <button className="w-full flex items-center px-4 py-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
                    <FontAwesomeIcon
                      icon={faDollarSign}
                      className="w-5 h-5 text-green-600 mr-3"
                    />
                    <span className="text-green-700 font-medium">
                      Log Expense
                    </span>
                  </button>

                  <button className="w-full flex items-center px-4 py-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
                    <FontAwesomeIcon
                      icon={faStickyNote}
                      className="w-5 h-5 text-purple-600 mr-3"
                    />
                    <span className="text-purple-700 font-medium">
                      Write Note
                    </span>
                  </button>

                  <button className="w-full flex items-center px-4 py-3 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors">
                    <FontAwesomeIcon
                      icon={faUpload}
                      className="w-5 h-5 text-orange-600 mr-3"
                    />
                    <span className="text-orange-700 font-medium">
                      Upload File
                    </span>
                  </button>
                </div>
              </div>

              {/* Today's Summary */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Today's Summary
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Tasks completed
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      3 of 8
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Expenses logged
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      $45.20
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Notes created</span>
                    <span className="text-sm font-medium text-gray-900">2</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      Files uploaded
                    </span>
                    <span className="text-sm font-medium text-gray-900">1</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Items Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Tasks */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Recent Tasks
                  </h3>
                  <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    View all
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Review quarterly budget
                      </p>
                      <p className="text-xs text-gray-500">Due: Tomorrow</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      High
                    </span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 rounded"
                      defaultChecked
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-500 line-through">
                        Update project documentation
                      </p>
                      <p className="text-xs text-gray-400">Completed today</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Done
                    </span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Call client about proposal
                      </p>
                      <p className="text-xs text-gray-500">Due: Friday</p>
                    </div>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Medium
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Expenses */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Recent Expenses
                  </h3>
                  <button className="text-green-600 hover:text-green-700 text-sm font-medium">
                    View all
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                        <FontAwesomeIcon
                          icon={faShoppingCart}
                          className="w-4 h-4 text-red-600"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Groceries
                        </p>
                        <p className="text-xs text-gray-500">Today</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      $67.50
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <FontAwesomeIcon
                          icon={faGasPump}
                          className="w-4 h-4 text-blue-600"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">Gas</p>
                        <p className="text-xs text-gray-500">Yesterday</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      $45.00
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <FontAwesomeIcon
                          icon={faCoffee}
                          className="w-4 h-4 text-green-600"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Coffee
                        </p>
                        <p className="text-xs text-gray-500">2 days ago</p>
                      </div>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      $4.50
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Notes and Files */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Recent Notes */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Recent Notes
                  </h3>
                  <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">
                    View all
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="border-l-4 border-purple-400 pl-4">
                    <h4 className="text-sm font-medium text-gray-900">
                      Meeting Notes - Q1 Planning
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Updated 2 hours ago
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Discussed budget allocation and project timelines...
                    </p>
                  </div>

                  <div className="border-l-4 border-blue-400 pl-4">
                    <h4 className="text-sm font-medium text-gray-900">
                      Project Ideas
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Created yesterday
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Brainstorming session results and next steps...
                    </p>
                  </div>

                  <div className="border-l-4 border-green-400 pl-4">
                    <h4 className="text-sm font-medium text-gray-900">
                      Shopping List
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Updated 3 days ago
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Weekly grocery items and household supplies...
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Files */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    Recent Files
                  </h3>
                  <button className="text-orange-600 hover:text-orange-700 text-sm font-medium">
                    View all
                  </button>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <FontAwesomeIcon
                        icon={faFilePdf}
                        className="w-8 h-8 text-red-600"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        Q1_Budget_Report.pdf
                      </p>
                      <p className="text-xs text-gray-500">
                        Uploaded 2 hours ago • 2.3 MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <FontAwesomeIcon
                        icon={faFileExcel}
                        className="w-8 h-8 text-green-600"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        Project_Timeline.xlsx
                      </p>
                      <p className="text-xs text-gray-500">
                        Uploaded yesterday • 1.8 MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <FontAwesomeIcon
                        icon={faImage}
                        className="w-8 h-8 text-blue-600"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        team_photo.jpg
                      </p>
                      <p className="text-xs text-gray-500">
                        Uploaded 3 days ago • 4.2 MB
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Productivity Insights */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  Productivity Insights
                </h3>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {/* Task Completion Rate */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Task Completion Rate
                      </span>
                      <span className="text-sm text-gray-900">75%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: "75%" }}
                      ></div>
                    </div>
                  </div>

                  {/* Weekly Goal */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Weekly Goal Progress
                      </span>
                      <span className="text-sm text-gray-900">8/10 tasks</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full"
                        style={{ width: "80%" }}
                      ></div>
                    </div>
                  </div>

                  {/* Expense Budget */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Monthly Budget
                      </span>
                      <span className="text-sm text-gray-900">
                        $1,234 / $2,000
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-yellow-500 h-2 rounded-full"
                        style={{ width: "62%" }}
                      ></div>
                    </div>
                  </div>

                  {/* Storage Usage */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">
                        Storage Used
                      </span>
                      <span className="text-sm text-gray-900">2.3 / 10 GB</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{ width: "23%" }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
