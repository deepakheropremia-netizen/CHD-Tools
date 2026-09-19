
========
v2.9 security upgrade
========
- All data APIs (quotes, saved-docs, pricelist, media) require Authorization: Bearer <token>
- Pricelist write + settings write require admin role
- CORS restricted to chd-tools.vercel.app (+ optional CORS_ORIGINS env)
- Set AUTH_SECRET in Vercel env (recommended separate from service role key)
- Optional: ALLOW_VERCEL_PREVIEWS=1 for preview deploys
- robots.txt disallows crawlers

Capital Harley-Davidson Quotation Generator — Version 2.8 (Instrument UI)
================================================================

NEW IN v2.8 — INSTRUMENT UI / UX
-------------------------------
1. Denser "workshop instrument" layout — tighter panels, stronger tabs.
2. Sticky on-road total bar on Quote (desktop) with Save / PDF / Booking.
3. Mobile bottom action bar (Save · PDF · Booking · WhatsApp).
4. Welcome launchpad redesigned as quick-start grid + Tools entry.
5. New Tools tab with working EMI Calculator (+ placeholders for exchange,
   stock, follow-ups, test-ride, sales snapshot).
6. Live preview toolbar shows running grand total.
7. Auto night theme after 7pm if user has never chosen a theme.
8. Clearer empty states for quote history.

NEW IN v2.7 — SPEED + SECURITY
------------------------------
1. Full-screen loading screen REMOVED (it was delaying first paint by ~1.4s+
   and included a large embedded image). App opens immediately.
2. Auto-logout after 15 minutes of inactivity (warning toast at 14 min).
   Mouse / keyboard / touch / scroll reset the timer. Also pauses when the
   browser tab is hidden and resumes when you return.
3. PDF libraries (html2pdf / html2canvas / jspdf) now load ON DEMAND only
   when you click Download PDF or Copy Image — faster first visit.
4. Online / Offline / Syncing indicator in the top bar.
5. Service worker cache bumped so phones pick up the faster shell.

NEW IN THIS BUILD — Corner Logo + Photo Slideshow
--------------------------------------------------
1. Corner Logo: Settings → "Corner / Watermark Logo" — upload any logo and
   it now shows fixed in the bottom-right corner on the login screen AND
   every tab of the app (separate from the Dealership Logo and the top-bar
   App Logo, which are unchanged).
2. Photo Slideshow: the "Models & Brochures" tab now has an auto-advancing
   photo slideshow at the top, plus the Catalogues & Media Library list/
   upload UI (this existed in the code before but the on-screen list/upload
   button/filters were missing — they're wired in now). Admins upload
   photos via "+ Upload to Library" → category "Slideshow Photo".
3. Fixed: the dealership logo on the login screen used to pop in late
   (a few seconds of blank space) while it waited on a network call. It's
   now cached on-device and paints instantly on repeat visits, refreshing
   quietly in the background.
4. ONE-TIME SQL STEP (existing installs only): open Supabase → SQL Editor
   and run the bottom of SETUP-MEDIA-LIBRARY.sql (the two "alter table"
   lines) to allow the new 'slideshow' category. New installs running the
   full supabase-schema.sql already have this included — no extra step.


NEW IN v2.4 — EMPLOYEE LOGIN
----------------------------
1. Full-site login gate — only staff with a username/password can open the app
2. Admin / Owner role — controls Settings, Price List, and Staff Logins
3. Admin can create employee IDs & passwords, reset passwords, disable or delete users
4. First visit: if no users exist, create the Owner account on the login screen
5. Session lasts 7 days (token stored on device); Log out button in the top bar

ONE-TIME AUTH SETUP (in addition to existing Supabase tables)
------------------------------------------------------------
A) Supabase → SQL Editor → run the file AUTH-SETUP.sql (creates app_users table)

B) Vercel → Project → Settings → Environment Variables, add:
     AUTH_SECRET   = any long random string (e.g. openssl rand -hex 32)
   Keep existing:
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY
   Redeploy after adding AUTH_SECRET.

C) Open the site → create Owner username/password → then Settings → Staff Logins
   to add employees.


NEW IN THIS BUILD (v2.3.1 UI updates)
-------------------------------------
1. Website / App logo — upload in Settings; shows in the top bar
2. Per-bike "Discount type / reason" field next to discount amount
3. Save Booking + Save Proforma buttons (stored in Supabase saved_docs)
4. "Dealer Settings" renamed to "Settings"
5. Official footer: © All rights reserved
6. Feedback button (anyone) + View Feedback inside Settings (admin PIN area)

ONE-TIME: run the EXTRA tables in Supabase SQL Editor
------------------------------------------------------
If you already ran the original schema, also run the bottom of
supabase-schema.sql (feedbacks + saved_docs tables), or paste:

create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  name text,
  phone text,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists feedbacks_created_idx on feedbacks (created_at desc);

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

WHAT CHANGED IN THIS BUILD
---------------------------
All shared app data now lives in a real Postgres database (Supabase) instead
of localStorage / an optional Redis blob:

- Settings (logo, dealer info, terms, PIN, default DSE)  -> app_settings table
- Price list (per model/state pricing)                   -> price_list table
- Quote number counter                                   -> quote_counters table (atomic — no more duplicate numbers if two staff save at once)
- Saved quotations                                        -> quotes table (NEW — previously only kept the last 20 quotes, only on the device that saved them)

Every staff member on every device now sees the same settings, the same
price list, and the same full quote history — searchable by name / phone /
quote no. / DSE, not capped at 20 records. localStorage is only used as a
short-lived offline cache and for the in-progress draft form.

ONE-TIME SETUP
---------------
1) Create a Supabase project
   - Go to https://supabase.com -> New project (free tier is fine)
   - Wait for it to finish provisioning

2) Run the schema
   - In your Supabase project: SQL Editor -> New query
   - Open supabase-schema.sql (included in this folder), paste the whole
     thing in, and click Run
   - This creates the app_settings / price_list / quote_counters / quotes
     tables plus the atomic quote-number function, and locks every table
     down from the public API key (see step 4)

3) Get your API keys
   - Project Settings -> API
   - Copy the "Project URL" and the "service_role" secret key
     (NOT the "anon public" key — the service role key is required so the
     Vercel functions, not the browser, are the only thing that can read/write)

4) Add environment variables in Vercel
   - Vercel Project -> Settings -> Environment Variables, add:
       SUPABASE_URL              = your Project URL
       SUPABASE_SERVICE_ROLE_KEY = your service_role secret key
   - Redeploy after adding these

5) Deploy
   - Upload this whole folder to GitHub OR drag it to Vercel
   - Framework preset: Other
   - Root directory: this folder
   - Deploy (or redeploy, if you already added the env vars above)

IMPORTANT: keep SUPABASE_SERVICE_ROLE_KEY out of any client-side code or
public repo settings — it grants full read/write access to every table and
must only exist as a server-side Vercel environment variable.

PREVIOUS FEATURES (still present)
- One-click Copy Quote -> Booking Form / Proforma
- WhatsApp share buttons on Booking Form and Proforma
- Soft required-field checklist before PDF
- Default DSE + Dealer ID in Settings
- Print-ready margins for A4 / shop printers
- Per-bike discount, EN/HI toggle, Day/Night theme, Fat Boy loader
- PWA / Add to Home Screen (manifest + service worker + icons)

TURN OFF VERCEL LOGIN WALL
Settings -> Deployment Protection -> disable Vercel Authentication for Production
Share only: https://your-project.vercel.app

ADD TO HOME SCREEN (phone)
Open the site in Chrome / Safari -> browser menu -> "Add to Home Screen" / "Install app"

IF SOMETHING GOES WRONG
- "Saved on this device only — could not reach the shared backend" toast
  means the app couldn't reach /api/quotes (check the Vercel function logs
  and confirm SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set correctly).
- You can always inspect/edit data directly in Supabase -> Table Editor.


MEDIA LIBRARY (Catalogues & HOG videos)
---------------------------------------
1) Run this SQL in Supabase:

create table if not exists media_library (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'catalogue_bike','catalogue_accessories','hog_video','other'
  )),
  model text,
  title text not null,
  description text,
  file_type text,
  file_url text not null,
  file_name text,
  created_at timestamptz not null default now()
);
alter table media_library enable row level security;

2) (Optional, for direct file uploads) Supabase → Storage → New bucket
   Name: media-library
   Public: YES

3) Redeploy. Open the "Catalogues & Media" tab.
   - Small PDF/images: upload file (max ~4MB)
   - Large files / HOG videos: paste YouTube or Google Drive link
