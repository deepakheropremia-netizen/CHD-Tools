import { getSupabaseAdmin, cors } from "./lib/supabaseAdmin.js";
import { requireAuth } from "./lib/auth.js";

function rowToRecord(row) {
  return {
    id: row.id,
    quoteNo: row.quote_no,
    custName: row.cust_name,
    date: row.quote_date,
    grand: Number(row.grand_total) || 0,
    dseName: row.dse_name,
    form: {
      quoteNo: row.quote_no,
      date: row.quote_date,
      dseName: row.dse_name,
      custName: row.cust_name,
      custPhone: row.cust_phone,
      custEmail: row.cust_email,
      custState: row.cust_state,
      regType: row.reg_type,
      items: row.items || [],
      extraAcc: row.extra_acc || [],
      discount: Number(row.discount) || 0,
      rto: Number(row.rto) || 0,
      insurance: Number(row.insurance) || 0,
      accessories: Number(row.accessories) || 0,
      helmet: Number(row.helmet) || 0,
      notes: row.notes || "",
    },
  };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const auth = await requireAuth(req);
    if (auth.error) {
      return res.status(auth.status || 401).json({ ok: false, error: auth.error });
    }

    const supabase = getSupabaseAdmin();
    const op = ((req.query && req.query.op) || (req.body && req.body.op) || "")
      .toString()
      .toLowerCase();

    if (op === "next") {
      const year = new Date().getFullYear();
      let prefix = "CHD";
      if (req.query && req.query.prefix) prefix = String(req.query.prefix).trim() || "CHD";
      if (req.method === "POST" && req.body && req.body.prefix) {
        prefix = String(req.body.prefix).trim() || "CHD";
      }
      const key = `${prefix}-${year}`;
      let number;
      if (req.method === "POST") {
        const { data, error } = await supabase.rpc("next_quote_number", { p_key: key });
        if (error) throw error;
        number = data;
      } else if (req.method === "GET") {
        const { data, error } = await supabase
          .from("quote_counters")
          .select("last_number")
          .eq("key", key)
          .maybeSingle();
        if (error) throw error;
        number = (data ? data.last_number : 0) + 1;
      } else {
        return res.status(405).json({ ok: false, error: "Method not allowed" });
      }
      const quoteNo = `${prefix}/${year}/${String(number).padStart(4, "0")}`;
      return res.status(200).json({ ok: true, quoteNo, number, year, prefix });
    }

    if (req.method === "GET") {
      const q = ((req.query && req.query.q) || "").trim();
      const limitRaw = parseInt((req.query && req.query.limit) || "20", 10);
      const limit = Math.min(Math.max(limitRaw || 20, 1), 100);

      let query = supabase
        .from("quotes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (q) {
        const like = `%${q.replace(/%/g, "")}%`;
        query = query.or(
          `quote_no.ilike.${like},cust_name.ilike.${like},cust_phone.ilike.${like},dse_name.ilike.${like}`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ ok: true, data: (data || []).map(rowToRecord) });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const form = body.form || {};
      const row = {
        quote_no: body.quoteNo || form.quoteNo,
        quote_date: body.date || form.date || null,
        dse_name: body.dseName || form.dseName || null,
        cust_name: body.custName || form.custName || null,
        cust_phone: form.custPhone || null,
        cust_email: form.custEmail || null,
        cust_state: form.custState || null,
        reg_type: form.regType || null,
        items: form.items || [],
        extra_acc: form.extraAcc || [],
        discount: Number(form.discount) || 0,
        rto: Number(form.rto) || 0,
        insurance: Number(form.insurance) || 0,
        accessories: Number(form.accessories) || 0,
        helmet: Number(form.helmet) || 0,
        notes: form.notes || "",
        grand_total: Number(body.grand) || 0,
      };
      const { data, error } = await supabase
        .from("quotes")
        .insert(row)
        .select("*")
        .single();
      if (error) throw error;
      return res.status(200).json({ ok: true, data: rowToRecord(data) });
    }

    if (req.method === "DELETE") {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { error } = await supabase.from("quotes").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    console.error("quotes API", err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
