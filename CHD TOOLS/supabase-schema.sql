-- Capital Harley-Davidson Quotation App — Supabase schema
-- Run this once in Supabase → SQL Editor → New query → Run.
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE throughout).

-- 1) Company settings — single-row config (logo, dealer info, terms, PIN, etc.)
create table if not exists app_settings (
  id smallint primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

-- 2) Price list — one row per model/state combo, editable directly in the Table Editor
create table if not exists price_list (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  state text not null,
  ex_showroom numeric not null default 0,
  rto_ind numeric not null default 0,
  rto_comp numeric not null default 0,
  insurance numeric not null default 0,
  handling numeric not null default 0,
  helmet numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists price_list_model_state_idx on price_list (model, state);

-- 3) Quote number counters — one row per "PREFIX-YEAR", incremented atomically
create table if not exists quote_counters (
  key text primary key,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

-- 4) Quotes — every saved quotation, shared across all staff/devices, fully searchable
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  quote_no text unique not null,
  quote_date date,
  dse_name text,
  cust_name text,
  cust_phone text,
  cust_email text,
  cust_state text,
  reg_type text,
  items jsonb not null default '[]'::jsonb,
  extra_acc jsonb not null default '[]'::jsonb,
  discount numeric default 0,
  rto numeric default 0,
  insurance numeric default 0,
  accessories numeric default 0,
  helmet numeric default 0,
  grand_total numeric default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists quotes_cust_name_idx on quotes (cust_name);
create index if not exists quotes_cust_phone_idx on quotes (cust_phone);
create index if not exists quotes_dse_name_idx on quotes (dse_name);
create index if not exists quotes_created_idx on quotes (created_at desc);

-- Atomic "give me the next number" function — prevents two staff getting the same quote number
create or replace function next_quote_number(p_key text)
returns integer
language plpgsql
as $$
declare
  v_number integer;
begin
  insert into quote_counters (key, last_number)
  values (p_key, 1)
  on conflict (key) do update
    set last_number = quote_counters.last_number + 1,
        updated_at = now()
  returning last_number into v_number;
  return v_number;
end;
$$;

-- Lock every table down from the public/anon key. All reads & writes go through
-- your Vercel API routes, which use the SERVICE ROLE key (server-side only).
-- No policies are added below on purpose — that means the anon key gets zero access.
alter table app_settings enable row level security;
alter table price_list enable row level security;
alter table quote_counters enable row level security;
alter table quotes enable row level security;

-- 5) Feedback from any user of the website
create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists feedbacks_created_idx on feedbacks (created_at desc);

-- 6) Saved Booking Forms & Proforma Invoices
create table if not exists saved_docs (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('booking', 'proforma')),
  title text,
  cust_name text,
  cust_phone text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists saved_docs_type_idx on saved_docs (doc_type, created_at desc);
create index if not exists saved_docs_cust_idx on saved_docs (cust_name);

alter table feedbacks enable row level security;
alter table saved_docs enable row level security;

-- 7) Media library — catalogues, accessories, HOG videos, slideshow photos
create table if not exists media_library (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'catalogue_bike',
    'catalogue_accessories',
    'hog_video',
    'slideshow',
    'other'
  )),
  model text,
  title text not null,
  description text,
  file_type text,
  file_url text not null,
  file_name text,
  created_at timestamptz not null default now()
);
create index if not exists media_library_cat_idx on media_library (category, created_at desc);
create index if not exists media_library_model_idx on media_library (model);

alter table media_library enable row level security;

-- Already ran this table before on the old (pre-'slideshow') schema?
-- Run this once in Supabase SQL Editor to unlock the new category:
alter table media_library drop constraint if exists media_library_category_check;
alter table media_library add constraint media_library_category_check
  check (category in ('catalogue_bike','catalogue_accessories','hog_video','slideshow','other'));

-- 8) Staff login accounts (employee / admin)
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
alter table app_users enable row level security;
