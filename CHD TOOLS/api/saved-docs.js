import { getSupabaseAdmin, cors } from "./lib/supabaseAdmin.js";
import { requireAuth } from "./lib/auth.js";

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const auth = await requireAuth(req);
    if (auth.error) {
      return res.status(auth.status || 401).json({ ok: false, error: auth.error });
    }

    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const docType = ((req.query && req.query.type) || "").toLowerCase();
      const limitRaw = parseInt((req.query && req.query.limit) || "40", 10);
      const limit = Math.min(Math.max(limitRaw || 40, 1), 100);
      let query = supabase
        .from("saved_docs")
        .select("id, doc_type, title, cust_name, cust_phone, created_at, data")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (docType === "booking" || docType === "proforma") {
        query = query.eq("doc_type", docType);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ ok: true, data: data || [] });
    }

    if (req.method === "POST") {
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const docType = String(body.docType || body.doc_type || "").toLowerCase();
      if (docType !== "booking" && docType !== "proforma") {
        return res
          .status(400)
          .json({ ok: false, error: "docType must be booking or proforma" });
      }
      const data = body.data || {};
      const row = {
        doc_type: docType,
        title: String(body.title || "").trim() || null,
        cust_name:
          String(body.custName || data.custName || data.name || "").trim() || null,
        cust_phone:
          String(body.custPhone || data.custPhone || data.mobile || "").trim() ||
          null,
        data,
      };
      const { data: inserted, error } = await supabase
        .from("saved_docs")
        .insert(row)
        .select("id, created_at")
        .single();
      if (error) throw error;
      return res
        .status(200)
        .json({ ok: true, id: inserted.id, created_at: inserted.created_at });
    }

    if (req.method === "DELETE") {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { error } = await supabase.from("saved_docs").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
