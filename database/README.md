# PlanWise Database Setup

This directory contains all the SQL scripts needed to set up your PlanWise database in Supabase.

## 🚀 Complete Setup (Recommended)

**Use the Complete Setup Script**

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the entire content of `complete_setup.sql`
4. Click "Run" to execute
5. Done! Your database is ready with both automatic triggers and manual fallbacks.

## 📁 Available Scripts

- **`complete_setup.sql`** - 🌟 **RECOMMENDED** - Complete solution with triggers + RLS
- **`fix_rls_and_triggers.sql`** - Advanced setup with detailed policies
- **`simple_fix.sql`** - Simple RLS-only solution (no triggers)
- **`install.sql`** - Basic installation script

## 📋 Manual Setup (Advanced)

If you prefer to run scripts individually:

1. **Create Tables**: Run `01_create_tables.sql`
2. **Add Functions & Triggers**: Run `02_functions_and_triggers.sql`
3. **Set Up Security**: Run `03_row_level_security.sql`
4. **Add Utilities**: Run `04_utility_functions.sql`

## 🗄️ Database Schema Overview

### Core Tables

- **`profiles`** - User profiles (extends Supabase auth.users)
- **`workspaces`** - Organize projects into workspaces
- **`workspace_members`** - Workspace membership and roles
- **`projects`** - Main projects within workspaces
- **`project_members`** - Project membership and roles
- **`tasks`** - Individual tasks with hierarchy support
- **`task_comments`** - Comments and updates on tasks
- **`notifications`** - In-app notifications

### Features Included

✅ **User Management**

- Automatic profile creation on signup
- Personal workspace for each user
- Role-based access control

✅ **Workspace Organization**

- Multi-workspace support
- Member invitations and roles
- Workspace-level permissions

✅ **Project Management**

- Project creation and management
- Project-specific member roles
- Project statistics and tracking

✅ **Task Management**

- Hierarchical tasks (subtasks)
- Task assignments and due dates
- Task comments and attachments
- Priority and status tracking

✅ **Security**

- Row Level Security (RLS) enabled
- Comprehensive permission policies
- Secure data access patterns

✅ **Automation**

- Automatic timestamp updates
- Activity logging
- Personal workspace creation
- Project owner membership

## 🔐 Security Features

### Row Level Security (RLS)

All tables have RLS enabled with policies that ensure:

- Users can only see data they have permission to access
- Workspace members can only access their workspace data
- Project members can only access their project data
- Users can only modify data they own or have permission to edit

### Permission Levels

- **Workspace Owner**: Full control over workspace
- **Workspace Admin**: Can manage members and projects
- **Workspace Member**: Can create projects and tasks
- **Workspace Viewer**: Read-only access
- **Project Owner**: Full control over project
- **Project Admin**: Can manage project members
- **Project Member**: Can create and edit tasks
- **Project Viewer**: Read-only project access

## 🛠️ Utility Functions

The database includes several utility functions:

- `handle_new_user()` - Automatically creates profile and personal workspace
- `is_workspace_member()` - Check workspace membership
- `is_project_member()` - Check project membership
- `get_workspace_stats()` - Get workspace statistics
- `get_project_stats()` - Get project statistics
- `search_content()` - Full-text search across projects and tasks

## 📊 What Happens After Installation

1. **User Registration**: When users sign up through Supabase Auth:

   - Profile is automatically created in `profiles` table
   - Personal workspace is created
   - User becomes owner of their personal workspace

2. **Workspace Creation**: When users create workspaces:

   - User becomes workspace owner
   - Workspace member record is created
   - Proper permissions are applied

3. **Task Management**: Tasks support:
   - Hierarchical structure (parent/child tasks)
   - Assignment
   - Due dates
   - Priority
   - Status tracking

## 🔧 Environment Variables Needed

After setting up the database, make sure to set these environment variables in your application:

```env
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
```

## 🎯 Next Steps

1. Run the installation script in Supabase
2. Update your application's environment variables
3. Test user registration and login
4. Start creating workspaces and projects!

## 📝 Notes

- All timestamps are stored in UTC
- UUIDs are used for all primary keys
- Soft deletes are not implemented (uses CASCADE deletes)
- Full-text search is available for projects and tasks
- Activity logging tracks all major actions

## 🎯 Complete Setup Features

### ✅ **Automatic User Creation (Primary Method)**

When users sign up through Supabase Auth:

- **Trigger automatically fires** and creates user profile in `users` table
- **Default settings** are created in `settings` table
- **Full name** is taken from signup metadata
- **Comprehensive error handling** prevents auth failures

### ✅ **Manual Sync Fallback (Backup Method)**

If automatic creation fails:

- **Frontend automatically attempts sync** on login
- **Manual sync button** available in dashboard
- **Diagnostic tools** help identify issues
- **Robust error handling** with detailed logging

### ✅ **Comprehensive Security**

- **Row Level Security (RLS)** enabled on all tables
- **Users can only access their own data**
- **Service role permissions** for triggers
- **Authenticated user permissions** for manual operations

### ✅ **Production Ready**

- **Handles edge cases** and error conditions
- **Logging and monitoring** built-in
- **Scalable architecture** for growth
- **Battle-tested policies** for security

## 🚀 **Why Use complete_setup.sql?**

This script combines the best of both worlds:

1. **Automatic triggers** for seamless user experience
2. **Manual fallbacks** for reliability
3. **Comprehensive RLS** for security
4. **Error handling** for robustness

Your PlanWise database is now ready for production use! 🎉
