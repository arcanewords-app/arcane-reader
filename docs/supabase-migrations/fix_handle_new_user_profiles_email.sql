-- Fix registration: handle_new_user() must populate profiles.email (NOT NULL).
-- Symptom: POST /api/auth/register → "Database error saving new user" (Supabase Auth 500).
--
-- Run in Supabase Dashboard → SQL Editor (project ugcnqejiiybaatcqxmgn).

-- Align role CHECK with app roles (src/types/roles.ts); 'user' is DEFAULT_AUTHENTICATED_ROLE.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'author', 'author_plus', 'super_author', 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate trigger if missing (safe: drop + create).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
