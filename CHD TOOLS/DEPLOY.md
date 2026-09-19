# CHD Tools — Deploy Guide (Both Methods)

Site: https://chd-tools.vercel.app/
Stack: Vercel (hosting + API) + Supabase (database)

---

## Method A — AI update → deploy (ZIP / files) — FASTEST day-to-day

Use this when Grok (or any AI) gives you a new zip.

### Steps
1. Download the latest zip from the chat (e.g. CHD-Quotation-v2_9_5-LOGIN-BTN.zip).
2. Unzip it on your computer.
3. Open [Vercel Dashboard](https://vercel.com/dashboard) → project **chd-tools** (or your project name).
4. Pick ONE upload path:
   - **Option A1 — Git still not linked:**  
     Project → **Settings** is for env only. Prefer linking Git (Method B).  
     Or use Vercel CLI (below).
   - **Option A2 — Vercel CLI (recommended for zip workflow):**
     ```bash
     npm i -g vercel
     cd folder-you-unzipped
     vercel login
     vercel --prod
     ```
     First time: link to existing project `chd-tools`.
5. Wait until status = **Ready**.
6. Open https://chd-tools.vercel.app/ → hard refresh: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac).

### Habit with AI
```
You: "Fix X / add Y"
AI: edits code → gives zip
You: vercel --prod  (or drag to Git)
You: test live site 1 minute
```

### Never put secrets in the zip
Keep these ONLY in Vercel → Settings → Environment Variables:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- AUTH_SECRET
- MSG91_AUTH_KEY (optional)
- OTP_DEV_MODE (optional, testing)

After changing env vars → Redeploy.

---

## Method B — GitHub + Vercel auto-deploy — BEST long-term

Once set up: every push to `main` publishes the site automatically.

### B1. Create GitHub repo
1. Go to https://github.com/new
2. Name: `chd-tools` (private recommended)
3. Do NOT add README if you will upload existing files
4. Create repository

### B2. Upload project code
On your computer (unzip latest CHD package first):

```bash
cd path/to/chd-quotation
git init
git add .
git commit -m "CHD Tools v2.9.5"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/chd-tools.git
git push -u origin main
```

(Or use GitHub website → Upload files.)

### B3. Connect GitHub to Vercel
1. Vercel → your **chd-tools** project  
   (If new: Add New Project → Import Git Repository → pick `chd-tools`)
2. **Settings → Git** → connect GitHub if asked
3. Production branch: **main**
4. Framework preset: Other / no special build (static + `/api` serverless)
5. Root directory: `.` (repo root)
6. Ensure env vars are set (same list as Method A)
7. Deploy

### B4. Everyday update after this
```
AI gives changes → you (or AI) commit → git push
→ Vercel auto-builds → live in ~1 minute
```

Preview URLs appear on pull requests (optional).

---

## Supabase (both methods)

Run once in Supabase → SQL Editor (if not already):
1. AUTH-SETUP.sql
2. AUTH-OTP-SETUP.sql
3. supabase-schema.sql (core tables)
4. SETUP-MEDIA-LIBRARY.sql (if using media)

Dashboard: https://supabase.com/dashboard

---

## Quick test after every deploy
- [ ] Login (username/password)
- [ ] Phone OTP tab opens (SMS only if MSG91 or OTP_DEV_MODE set)
- [ ] New quote + PDF
- [ ] Settings opens (admin)

---

## Rollback
Vercel → Deployments → open older deployment → **Promote to Production**

---

## Summary

| Method | When to use | Publish trigger |
|--------|-------------|-----------------|
| **A – Zip / CLI** | Quick AI fixes now | `vercel --prod` or re-upload |
| **B – GitHub** | Ongoing development | `git push` to main |

Do **Method A** today for the latest zip.  
Set up **Method B** once this week so future updates are one push.
