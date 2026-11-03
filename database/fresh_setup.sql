-- PlanWise: run ONCE in a NEW, EMPTY Supabase project's SQL Editor.
-- Do not combine with the legacy supabase.sql / trigger_and_function.sql.
-- Transactional: any error rolls back this setup. Existing tables cause an error.
BEGIN;

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  reminder_date date,
  reminder_time time,
  repeat_option text,
  description text,
  priority text CHECK (priority IN ('High', 'Medium', 'Low')),
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  category text,
  note text,
  expense_date date DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  content text,
  tags text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  dark_mode boolean NOT NULL DEFAULT false,
  language text NOT NULL DEFAULT 'en',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Passwords are managed exclusively by Supabase Auth.
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
          NEW.email, NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.settings (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

GRANT USAGE ON SCHEMA public TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "users_delete_own" ON public.users
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = id);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;
CREATE POLICY "tasks_select_own" ON public.tasks
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "tasks_insert_own" ON public.tasks
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "tasks_update_own" ON public.tasks
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "tasks_delete_own" ON public.tasks
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subtasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subtasks TO authenticated;
CREATE POLICY "subtasks_select_own" ON public.subtasks
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks AS parent
    WHERE parent.id = subtasks.task_id AND parent.user_id = (SELECT auth.uid())));
CREATE POLICY "subtasks_insert_own" ON public.subtasks
  FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.tasks AS parent
    WHERE parent.id = subtasks.task_id AND parent.user_id = (SELECT auth.uid())));
CREATE POLICY "subtasks_update_own" ON public.subtasks
  FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks AS parent
    WHERE parent.id = subtasks.task_id AND parent.user_id = (SELECT auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.tasks AS parent
    WHERE parent.id = subtasks.task_id AND parent.user_id = (SELECT auth.uid())));
CREATE POLICY "subtasks_delete_own" ON public.subtasks
  FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.tasks AS parent
    WHERE parent.id = subtasks.task_id AND parent.user_id = (SELECT auth.uid())));

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.expenses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO authenticated;
CREATE POLICY "expenses_select_own" ON public.expenses
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "expenses_insert_own" ON public.expenses
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "expenses_update_own" ON public.expenses
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "expenses_delete_own" ON public.expenses
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notes TO authenticated;
CREATE POLICY "notes_select_own" ON public.notes
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "notes_insert_own" ON public.notes
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "notes_update_own" ON public.notes
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "notes_delete_own" ON public.notes
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.settings TO authenticated;
CREATE POLICY "settings_select_own" ON public.settings
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "settings_insert_own" ON public.settings
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "settings_update_own" ON public.settings
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "settings_delete_own" ON public.settings
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.files FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.files TO authenticated;
CREATE POLICY "files_select_own" ON public.files
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "files_insert_own" ON public.files
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "files_update_own" ON public.files
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "files_delete_own" ON public.files
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE INDEX tasks_user_id_idx ON public.tasks(user_id);
CREATE INDEX expenses_user_id_idx ON public.expenses(user_id);
CREATE INDEX notes_user_id_idx ON public.notes(user_id);
CREATE INDEX files_user_id_idx ON public.files(user_id);
CREATE INDEX subtasks_task_id_idx ON public.subtasks(task_id);
COMMIT;

-- Verification (expect 7 rows, each with row_security_enabled=true).
SELECT tablename, rowsecurity AS row_security_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('users','tasks','subtasks','expenses','notes','settings','files')
ORDER BY tablename;

