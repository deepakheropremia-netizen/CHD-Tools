-- CHD Tools — Employee Login / Admin Users
-- Run once in Supabase → SQL Editor → New query → Run

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  name text,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_username_idx on app_users (username);
create index if not exists app_users_role_idx on app_users (role);

-- Block public/anon access — all reads/writes go through Vercel API (service role)
alter table app_users enable row level security;
