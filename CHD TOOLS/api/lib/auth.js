import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getSupabaseAdmin } from "./supabaseAdmin.js";

const TOKEN_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const BCRYPT_ROUNDS = 10;

function getJwtSecret() {
  const secret = process.env.AUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error(
      "Missing AUTH_SECRET (or SUPABASE_SERVICE_ROLE_KEY) for signing tokens"
    );
  }
  return String(secret);
}

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(s, "base64").toString("utf8");
}

export async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  return bcrypt.compare(String(plain), String(hash));
}

export async function signToken(user) {
  const header = b64urlJson({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlJson({
    sub: user.id,
    username: user.username,
    role: user.role,
    name: user.name || user.username,
    iat: now,
    exp: now + TOKEN_TTL_SEC,
  });
  const data = `${header}.${payload}`;
  const sig = crypto
    .createHmac("sha256", getJwtSecret())
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${data}.${sig}`;
}

export async function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const data = `${header}.${payload}`;
  const expected = crypto
    .createHmac("sha256", getJwtSecret())
    .update(data)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const body = JSON.parse(fromB64url(payload));
    if (!body || !body.sub) return null;
    if (body.exp && Math.floor(Date.now() / 1000) > body.exp) return null;
    return body;
  } catch {
    return null;
  }
}

export function getBearerToken(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || "";
  if (typeof h === "string" && h.toLowerCase().startsWith("bearer ")) {
    return h.slice(7).trim();
  }
  if (req.body && req.body.token) return String(req.body.token);
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

export async function requireAuth(req) {
  const token = getBearerToken(req);
  const payload = await verifyToken(token);
  if (!payload || !payload.sub) {
    return { error: "Unauthorized", status: 401 };
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, username, name, role, active, created_at")
    .eq("id", payload.sub)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.active === false) {
    return { error: "Account disabled or not found", status: 401 };
  }
  return {
    user: {
      id: data.id,
      username: data.username,
      name: data.name || data.username,
      role: data.role === "admin" ? "admin" : "employee",
      active: data.active !== false,
      created_at: data.created_at,
    },
  };
}

export async function requireAdmin(req) {
  const auth = await requireAuth(req);
  if (auth.error) return auth;
  if (auth.user.role !== "admin") {
    return { error: "Admin access required", status: 403 };
  }
  return auth;
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    name: row.name || row.username,
    role: row.role === "admin" ? "admin" : "employee",
    active: row.active !== false,
    phone: row.phone || null,
    created_at: row.created_at,
  };
}

/** Normalize Indian mobile to 10 digits, or null if invalid */
export function normalizeIndianPhone(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (d.startsWith("91") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length !== 10 || !/^[6-9]/.test(d)) return null;
  return d;
}
