--users
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  email text, -- 可选，方便直接查找
  created_at timestamptz default now()
);

--tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  reminder_date date,
  reminder_time time,
  repeat_option text,
  description text,
  priority text check (priority in ('High', 'Medium', 'Low')),
  is_completed boolean default false,
  created_at timestamptz default now()
);

--subtasks
create table subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  title text not null,
  is_completed boolean default false,
  created_at timestamptz default now()
);

--expenses
create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric not null,
  category text,
  note text,
  expense_date date default current_date,
  created_at timestamptz default now()
);

--notes
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  content text,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz
);

--settings
create table settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  dark_mode boolean default false,
  language text default 'en',
  created_at timestamptz default now()
);

--files
create table files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  path text not null,
  label text,
  created_at timestamptz default now()
);

-- 启用 RLS
alter table tasks enable row level security;
alter table users enable row level security;

-- 添加策略：只允许用户访问自己的数据
create policy "Users can view their own tasks"
  on tasks for select
  using (auth.uid() = user_id);

-- 插入/更新/删除的策略也要加：
create policy "Users can insert their own tasks"
  on tasks for insert
  with check (auth.uid() = user_id);

  -- 允许用户 SELECT 自己的行
create policy "Users can view their own profile"
  on users for select
  using (auth.uid() = id);

-- 允许用户 INSERT 自己的行
create policy "Users can insert their own profile"
  on users for insert
  with check (auth.uid() = id);

-- 允许用户 UPDATE 自己的行
create policy "Users can update their own profile"
  on users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);