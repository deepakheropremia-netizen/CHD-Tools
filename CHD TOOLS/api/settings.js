import { getSupabaseAdmin, cors } from "./lib/supabaseAdmin.js";
import {
  verifyPassword,
  signToken,
  publicUser,
  requireAuth,
  requireAdmin,
  hashPassword,
  normalizeIndianPhone,
} from "./lib/auth.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";

function getOp(req) {
  // Vercel may put query on req.query; also parse raw URL as fallback
  let q = "";
  if (req.query) {
    q = req.query.op || req.query.action || "";
    if (Array.isArray(q)) q = q[0];
  }
  if (!q && req.url) {
    const m = String(req.url).match(/[?&](?:op|action)=([^&]+)/i);
    if (m) q = decodeURIComponent(m[1]);
  }
  if (!q) {
    const b = typeof req.body === "string"
      ? (() => { try { return JSON.parse(req.body || "{}"); } catch { return {}; } })()
      : (req.body || {});
    q = b.op || b.action || "";
  }
  return String(q || "").toLowerCase().trim();
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();

  const op = getOp(req);

  // Auth ops (login / me / setup / users) — shared on this function to stay under Hobby limits
  if (op === "login" || op === "me" || op === "setup" || op === "users" || op === "otp-request" || op === "otp-verify") {
    try {
      if (op === "login") return await handleLogin(req, res);
      if (op === "me") return await handleMe(req, res);
      if (op === "setup") return await handleSetup(req, res);
      if (op === "users") return await handleUsers(req, res);
      if (op === "otp-request") return await handleOtpRequest(req, res);
      if (op === "otp-verify") return await handleOtpVerify(req, res);
    } catch (e) {
      console.error("settings/auth", op, e);
      const msg = e.message || "Server error";
      if (/relation .*login_otps.* does not exist/i.test(msg) || (/relation .*app_users.* does not exist/i.test(msg) || e.code === "42P01")) {
        return res.status(503).json({
          ok: false,
          error: /login_otps/i.test(msg)
            ? "OTP table missing. Run AUTH-OTP-SETUP.sql in Supabase SQL Editor."
            : "Users table missing. Run AUTH-SETUP.sql in Supabase SQL Editor first.",
          needsSetup: true,
        });
      }
      return res.status(500).json({ ok: false, error: msg });
    }
  }

  // Original settings GET/POST
  try {
    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("app_settings")
        .select("data")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ ok: true, data: data ? data.data : null });
    }

    if (req.method === "POST") {
      const auth = await requireAdmin(req);
      if (auth.error) {
        return res.status(auth.status || 403).json({ ok: false, error: auth.error });
      }
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      if (body.data === undefined) {
        return res.status(400).json({ ok: false, error: "Missing data" });
      }
      const { error } = await supabase
        .from("app_settings")
        .upsert({ id: 1, data: body.data, updated_at: new Date().toISOString() });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("settings API", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}

async function handleLogin(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const username = String(body.username || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Username and password required" });
  }
  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from("app_users")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  if (!user) {
    return res.status(401).json({ ok: false, error: "Invalid username or password" });
  }
  if (user.active === false) {
    return res.status(401).json({ ok: false, error: "This account is disabled. Contact your admin." });
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ ok: false, error: "Invalid username or password" });
  }
  const token = await signToken(user);
  return res.status(200).json({ ok: true, token, user: publicUser(user) });
}

async function handleMe(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const auth = await requireAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error });
  }
  return res.status(200).json({ ok: true, user: auth.user });
}

async function handleSetup(req, res) {
  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { count, error } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true });
    if (error) {
      if (/relation .*app_users.* does not exist/i.test(error.message) || error.code === "42P01") {
        return res.status(200).json({ ok: true, needsTable: true, needsOwner: true, userCount: 0 });
      }
      throw error;
    }
    return res.status(200).json({
      ok: true,
      needsTable: false,
      needsOwner: (count || 0) === 0,
      userCount: count || 0,
    });
  }

  if (req.method === "POST") {
    const { count, error: countErr } = await supabase
      .from("app_users")
      .select("id", { count: "exact", head: true });
    if (countErr) {
      if (/relation .*app_users.* does not exist/i.test(countErr.message) || countErr.code === "42P01") {
        return res.status(503).json({
          ok: false,
          error: "Run AUTH-SETUP.sql in Supabase SQL Editor first, then try again.",
          needsTable: true,
        });
      }
      throw countErr;
    }
    if ((count || 0) > 0) {
      return res.status(403).json({
        ok: false,
        error: "Owner already exists. Ask an admin to create your account.",
      });
    }
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim() || username;
    if (!username || username.length < 3) {
      return res.status(400).json({ ok: false, error: "Username must be at least 3 characters" });
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return res.status(400).json({
        ok: false,
        error: "Username: only letters, numbers, dot, underscore, hyphen",
      });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }
    const password_hash = await hashPassword(password);
    const { data, error } = await supabase
      .from("app_users")
      .insert({ username, password_hash, name, role: "admin", active: true })
      .select("id, username, name, role, active, created_at")
      .single();
    if (error) throw error;
    const token = await signToken(data);
    return res.status(200).json({
      ok: true,
      token,
      user: publicUser(data),
      message: "Owner account created. You are logged in as admin.",
    });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}

async function handleUsers(req, res) {
  const auth = await requireAdmin(req);
  if (auth.error) {
    return res.status(auth.status || 403).json({ ok: false, error: auth.error });
  }
  const supabase = getSupabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("app_users")
      .select("id, username, name, role, active, phone, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return res.status(200).json({ ok: true, data: (data || []).map(publicUser) });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "").trim() || username;
    const role = body.role === "admin" ? "admin" : "employee";
    const phone = body.phone ? normalizeIndianPhone(body.phone) : null;
    if (body.phone && !phone) {
      return res.status(400).json({ ok: false, error: "Invalid phone — use 10-digit Indian mobile" });
    }
    if (!username || username.length < 3) {
      return res.status(400).json({ ok: false, error: "Username must be at least 3 characters" });
    }
    if (!/^[a-z0-9._-]+$/.test(username)) {
      return res.status(400).json({
        ok: false,
        error: "Username: only letters, numbers, dot, underscore, hyphen",
      });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
    }
    const password_hash = await hashPassword(password);
    const row = { username, password_hash, name, role, active: true };
    if (phone) row.phone = phone;
    const { data, error } = await supabase
      .from("app_users")
      .insert(row)
      .select("id, username, name, role, active, phone, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ ok: false, error: "Username or phone already exists" });
      }
      throw error;
    }
    return res.status(200).json({ ok: true, user: publicUser(data) });
  }

  if (req.method === "PATCH" || req.method === "PUT") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const id = body.id || (req.query && req.query.id);
    if (!id) return res.status(400).json({ ok: false, error: "Missing user id" });
    const updates = {};
    if (body.name !== undefined) updates.name = String(body.name || "").trim();
    if (body.role !== undefined) updates.role = body.role === "admin" ? "admin" : "employee";
    if (body.active !== undefined) updates.active = !!body.active;
    if (body.phone !== undefined) {
      if (body.phone === null || body.phone === "") {
        updates.phone = null;
      } else {
        const ph = normalizeIndianPhone(body.phone);
        if (!ph) return res.status(400).json({ ok: false, error: "Invalid phone" });
        updates.phone = ph;
      }
    }
    if (body.password) {
      if (String(body.password).length < 6) {
        return res.status(400).json({ ok: false, error: "Password must be at least 6 characters" });
      }
      updates.password_hash = await hashPassword(body.password);
    }
    updates.updated_at = new Date().toISOString();
    if (id === auth.user.id && updates.role === "employee") {
      return res.status(400).json({ ok: false, error: "You cannot demote your own admin account" });
    }
    if (id === auth.user.id && updates.active === false) {
      return res.status(400).json({ ok: false, error: "You cannot disable your own account" });
    }
    const { data, error } = await supabase
      .from("app_users")
      .update(updates)
      .eq("id", id)
      .select("id, username, name, role, active, phone, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ ok: false, error: "Phone already used by another user" });
      }
      throw error;
    }
    return res.status(200).json({ ok: true, user: publicUser(data) });
  }

  if (req.method === "DELETE") {
    const id = (req.query && req.query.id) || (req.body && req.body.id);
    if (!id) return res.status(400).json({ ok: false, error: "Missing user id" });
    if (id === auth.user.id) {
      return res.status(400).json({ ok: false, error: "You cannot delete your own account" });
    }
    const { data: target } = await supabase
      .from("app_users")
      .select("id, role")
      .eq("id", id)
      .maybeSingle();
    if (target && target.role === "admin") {
      const { count } = await supabase
        .from("app_users")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("active", true);
      if ((count || 0) <= 1) {
        return res.status(400).json({ ok: false, error: "Cannot delete the last admin account" });
      }
    }
    const { error } = await supabase.from("app_users").delete().eq("id", id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
}


async function sendOtpSms(phone10, code) {
  const msg = `CHD Tools login OTP: ${code}. Valid 5 minutes. Do not share.`;
  const msg91 = process.env.MSG91_AUTH_KEY;
  if (msg91) {
    const sender = process.env.MSG91_SENDER || "CHDTL";
    const res = await fetch(
      `https://control.msg91.com/api/sendhttp.php?authkey=${encodeURIComponent(msg91)}&mobiles=91${phone10}&message=${encodeURIComponent(msg)}&sender=${encodeURIComponent(sender)}&route=4&country=91`,
      { method: "GET" }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("SMS failed: " + (t || res.status));
    }
    return { provider: "msg91" };
  }
  const twSid = process.env.TWILIO_ACCOUNT_SID;
  const twTok = process.env.TWILIO_AUTH_TOKEN;
  const twFrom = process.env.TWILIO_FROM;
  if (twSid && twTok && twFrom) {
    const to = `+91${phone10}`;
    const body = new URLSearchParams({ To: to, From: twFrom, Body: msg });
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${twSid}:${twTok}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("Twilio SMS failed: " + String(t || res.status).slice(0, 120));
    }
    return { provider: "twilio" };
  }
  if (process.env.OTP_DEV_MODE === "1") {
    return { provider: "dev", devCode: code };
  }
  throw new Error(
    "SMS not configured. Set MSG91_AUTH_KEY or TWILIO_* env vars, or OTP_DEV_MODE=1 for testing."
  );
}

async function handleOtpRequest(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const phone = normalizeIndianPhone(body.phone);
  if (!phone) {
    return res.status(400).json({ ok: false, error: "Enter a valid 10-digit mobile number" });
  }
  const supabase = getSupabaseAdmin();
  const { data: user, error } = await supabase
    .from("app_users")
    .select("id, username, name, role, active, phone")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw error;
  if (!user || user.active === false) {
    return res.status(200).json({
      ok: true,
      sent: true,
      message: "If this number is registered, an OTP has been sent.",
    });
  }
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("login_otps")
    .select("id", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", since);
  if ((count || 0) >= 5) {
    return res.status(429).json({ ok: false, error: "Too many OTP requests. Try again after some time." });
  }
  const code = String(crypto.randomInt(100000, 999999));
  const code_hash = await bcrypt.hash(code, 8);
  const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { error: insErr } = await supabase.from("login_otps").insert({
    phone,
    code_hash,
    expires_at,
    attempts: 0,
    consumed: false,
  });
  if (insErr) throw insErr;

  let smsMeta;
  try {
    smsMeta = await sendOtpSms(phone, code);
  } catch (e) {
    return res.status(503).json({ ok: false, error: String(e.message || e) });
  }

  const payload = {
    ok: true,
    sent: true,
    message: "OTP sent to ******" + phone.slice(-4),
    expiresInSec: 300,
  };
  if (smsMeta && smsMeta.devCode) {
    payload.devOtp = smsMeta.devCode;
    payload.message += " (dev mode — OTP returned in response)";
  }
  return res.status(200).json(payload);
}

async function handleOtpVerify(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const phone = normalizeIndianPhone(body.phone);
  const otp = String(body.otp || body.code || "").replace(/\D/g, "");
  if (!phone || otp.length !== 6) {
    return res.status(400).json({ ok: false, error: "Phone and 6-digit OTP required" });
  }
  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("login_otps")
    .select("*")
    .eq("phone", phone)
    .eq("consumed", false)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = (rows || [])[0];
  if (!row) {
    return res.status(401).json({ ok: false, error: "OTP expired or not found. Request a new one." });
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ ok: false, error: "OTP expired. Request a new one." });
  }
  if ((row.attempts || 0) >= 5) {
    return res.status(429).json({ ok: false, error: "Too many wrong attempts. Request a new OTP." });
  }
  const match = await bcrypt.compare(otp, row.code_hash);
  if (!match) {
    await supabase
      .from("login_otps")
      .update({ attempts: (row.attempts || 0) + 1 })
      .eq("id", row.id);
    return res.status(401).json({ ok: false, error: "Invalid OTP" });
  }
  await supabase.from("login_otps").update({ consumed: true }).eq("id", row.id);

  const { data: user, error: uErr } = await supabase
    .from("app_users")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();
  if (uErr) throw uErr;
  if (!user || user.active === false) {
    return res.status(401).json({ ok: false, error: "Account not found or disabled" });
  }
  const token = await signToken(user);
  return res.status(200).json({ ok: true, token, user: publicUser(user) });
}
