CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ordo_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text DEFAULT '',
  phone text DEFAULT '',
  studio text DEFAULT '',
  avatar_url text DEFAULT '',
  is_admin boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ordo_sessions (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ordo_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW profiles AS
SELECT id, email, name, phone, studio, avatar_url, is_admin, status, created_at, updated_at
FROM ordo_users;

CREATE TABLE IF NOT EXISTS studio_data (
  user_id uuid PRIMARY KEY REFERENCES ordo_users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  username_index text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_username ON studio_data (lower(username_index));

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES ordo_users(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  plan_name text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  duration_days integer,
  features jsonb DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS serial_keys (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code text NOT NULL UNIQUE,
  key_code text,
  user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'unused',
  plan_id text REFERENCES subscription_plans(id) ON DELETE SET NULL,
  plan_name text,
  billing text,
  duration_days integer,
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES ordo_users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  id integer PRIMARY KEY DEFAULT 1,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shared_contracts (
  token text PRIMARY KEY,
  user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_invites (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  team_id text,
  team_name text,
  owner_user_id uuid REFERENCES ordo_users(id) ON DELETE CASCADE,
  owner_name text,
  to_email text,
  to_user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  member_name text,
  member_role text,
  role text,
  status text DEFAULT 'pending',
  payload jsonb DEFAULT '{}'::jsonb,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  team_id text,
  user_id uuid REFERENCES ordo_users(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES ordo_users(id) ON DELETE CASCADE,
  role text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token text UNIQUE,
  user_id uuid REFERENCES ordo_users(id) ON DELETE CASCADE,
  type text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_store_items (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid REFERENCES ordo_users(id) ON DELETE CASCADE,
  data jsonb DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_store_orders (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  data jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_reviews (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_queue (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  data jsonb DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_contracts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  token text UNIQUE,
  user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_client_portal_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid REFERENCES ordo_users(id) ON DELETE SET NULL,
  plan_id text,
  status text DEFAULT 'pending',
  receipt_url text,
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO subscription_plans (id, name, plan_name, price, price_monthly, duration_days, features, active)
VALUES
('basic', 'Basic', 'Basic', 0, 0, 30, '{"dashboard":true,"tasks":true,"projects":true,"clients":true,"finance":true,"invoices":true,"settings":true}', true),
('pro', 'Pro', 'Pro', 0, 0, 365, '{"dashboard":true,"tasks":true,"projects":true,"clients":true,"finance":true,"invoices":true,"proposals":true,"contracts":true,"store":true,"team":true,"reports":true,"settings":true}', true)
ON CONFLICT (id) DO NOTHING;
