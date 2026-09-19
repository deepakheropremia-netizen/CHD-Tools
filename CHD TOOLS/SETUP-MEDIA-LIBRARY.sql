-- Run this ONCE in Supabase → SQL Editor → Run

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

-- ALREADY RAN THE ABOVE BEFORE? The 'slideshow' category is new in this
-- build. Run this once in Supabase SQL Editor to allow it on an existing
-- table (safe to run even if the table is brand new):
alter table media_library drop constraint if exists media_library_category_check;
alter table media_library add constraint media_library_category_check
  check (category in ('catalogue_bike','catalogue_accessories','hog_video','slideshow','other'));

-- Optional but recommended for direct PDF uploads (1–3.5 MB):
-- Supabase → Storage → New bucket
--   Name: media-library
--   Public bucket: ON


-- REQUIRED for large PDF / video direct uploads:
-- 1) Storage → New bucket → name: media-library
-- 2) Public bucket: ON
-- 3) (Policies) If uploads fail, add policy allowing service role full access
--    (service role bypasses RLS by default)
