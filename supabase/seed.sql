-- Local-only accounts for `npm run stack:reset` / `stack:load`.
-- Password for every seed user: local-dev-password
-- UUIDs must match scripts/local-stack/constants.mjs
-- Do not use these emails or password in production.

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'author@local.test',
    extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'author-plus@local.test',
    extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'admin@local.test',
    extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'user@local.test',
    extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '{"sub":"10000000-0000-4000-8000-000000000001","email":"author@local.test"}'::jsonb,
    'email',
    '10000000-0000-4000-8000-000000000001',
    now(),
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '{"sub":"10000000-0000-4000-8000-000000000002","email":"author-plus@local.test"}'::jsonb,
    'email',
    '10000000-0000-4000-8000-000000000002',
    now(),
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    '{"sub":"10000000-0000-4000-8000-000000000003","email":"admin@local.test"}'::jsonb,
    'email',
    '10000000-0000-4000-8000-000000000003',
    now(),
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    '{"sub":"10000000-0000-4000-8000-000000000004","email":"user@local.test"}'::jsonb,
    'email',
    '10000000-0000-4000-8000-000000000004',
    now(),
    now(),
    now()
  )
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.profiles (id, email, role)
  VALUES
    ('10000000-0000-4000-8000-000000000001', 'author@local.test', 'author'),
    ('10000000-0000-4000-8000-000000000002', 'author-plus@local.test', 'author_plus'),
    ('10000000-0000-4000-8000-000000000003', 'admin@local.test', 'admin'),
    ('10000000-0000-4000-8000-000000000004', 'user@local.test', 'user')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role;
END $$;
