-- PlanWise Final Complete Setup with Password Support
-- This is the ONLY script you need to run
-- Run this ONCE in your Supabase SQL Editor

-- =============================================
-- STEP 1: ENABLE EXTENSIONS AND CLEANUP
-- =============================================

-- Clean up any existing setup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.sync_user_profile(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.sync_user_profile(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_user_password(UUID, TEXT);
DROP FUNCTION IF EXISTS public.verify_user_password(TEXT, TEXT);

-- Disable RLS temporarily
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS files DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Service role can insert users" ON users;
DROP POLICY IF EXISTS "Users can view their own settings" ON settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON settings;
DROP POLICY IF EXISTS "Service role can insert settings" ON settings;
DROP POLICY IF EXISTS "Users can manage their own tasks" ON tasks;
DROP POLICY IF EXISTS "Users can manage their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can manage their own notes" ON notes;
DROP POLICY IF EXISTS "Users can manage their own files" ON files;

-- =============================================
-- STEP 2: CREATE AUTOMATIC USER CREATION TRIGGER
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create or update user profile (without password)
  INSERT INTO public.users (id, full_name, email, avatar_url, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url',
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, users.full_name),
    email = EXCLUDED.email,
    avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url);

  -- Create default settings
  INSERT INTO public.settings (user_id, dark_mode, language, created_at)
  VALUES (NEW.id, false, 'en', NOW())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- STEP 3: CREATE PASSWORD MANAGEMENT FUNCTIONS
-- =============================================

-- Function to sync user data (without password)
CREATE OR REPLACE FUNCTION public.sync_user_profile(
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT DEFAULT '',
  user_avatar_url TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Upsert user profile
  INSERT INTO public.users (id, full_name, email, avatar_url, created_at)
  VALUES (user_id, user_full_name, user_email, user_avatar_url, NOW())
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    avatar_url = EXCLUDED.avatar_url;

  -- Upsert settings
  INSERT INTO public.settings (user_id, dark_mode, language, created_at)
  VALUES (user_id, false, 'en', NOW())
  ON CONFLICT (user_id) DO NOTHING;

  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- STEP 4: ENABLE RLS AND CREATE POLICIES
-- =============================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Service role can insert users" ON users
  FOR INSERT WITH CHECK (true);

-- Settings policies
CREATE POLICY "Users can view their own settings" ON settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own settings" ON settings
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own settings" ON settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can insert settings" ON settings
  FOR INSERT WITH CHECK (true);

-- Other tables policies
CREATE POLICY "Users can manage their own tasks" ON tasks
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own expenses" ON expenses
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own notes" ON notes
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own files" ON files
  FOR ALL USING (auth.uid() = user_id);

-- =============================================
-- STEP 5: GRANT PERMISSIONS
-- =============================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON users TO anon;
GRANT EXECUTE ON FUNCTION public.sync_user_profile(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- =============================================
-- STEP 6: FIX EXISTING USERS
-- =============================================

-- Ensure all existing users have settings
INSERT INTO public.settings (user_id, dark_mode, language, created_at)
SELECT u.id, false, 'en', NOW()
FROM public.users u
LEFT JOIN public.settings s ON u.id = s.user_id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- =============================================
-- SUCCESS MESSAGE
-- =============================================

DO $$
DECLARE
  user_count INTEGER;
  settings_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM public.users;
    SELECT COUNT(*) INTO settings_count FROM public.settings;
    
    RAISE NOTICE '🎉 PLANWISE FINAL SETUP COMPLETED! 🎉';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Automatic user creation: ENABLED';
    RAISE NOTICE '✅ Manual sync functions: AVAILABLE';
    RAISE NOTICE '✅ Row Level Security: ENABLED';
    RAISE NOTICE '✅ Users: % | Settings: %', user_count, settings_count;
    RAISE NOTICE '';
    RAISE NOTICE '📋 Features:';
    RAISE NOTICE '   - Automatic user profile creation';
    RAISE NOTICE '   - Default settings creation';
    RAISE NOTICE '   - Manual sync fallback available';
    RAISE NOTICE '   - Comprehensive RLS policies';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Ready to use! Test registration now.';
END $$;

