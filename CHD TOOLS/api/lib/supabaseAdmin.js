import { createClient } from "@supabase/supabase-js";

let client = null;

// Server-side only client, built with the SERVICE ROLE key.
// This key must never be sent to the browser — only used inside /api routes.
export function getSupabaseAdmin() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

const DEFAULT_ALLOWED = [
  "https://chd-tools.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
];

function allowedOrigins() {
  const extra = String(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ALLOWED, ...extra];
}

/** Restrict CORS; still allow same-origin Vercel previews via ALLOW_VERCEL_PREVIEWS */
export function cors(res, req) {
  const origin = (req && (req.headers?.origin || req.headers?.Origin)) || "";
  const list = allowedOrigins();
  let allow = "";
  if (origin && list.includes(origin)) {
    allow = origin;
  } else if (
    origin &&
    process.env.ALLOW_VERCEL_PREVIEWS === "1" &&
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
  ) {
    allow = origin;
  } else if (!origin) {
    allow = list[0];
  }
  if (allow) {
    res.setHeader("Access-Control-Allow-Origin", allow);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}
