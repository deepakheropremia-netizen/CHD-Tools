import { getSupabaseAdmin, cors } from "./lib/supabaseAdmin.js";
import { requireAuth, requireAdmin } from "./lib/auth.js";

function toClient(row) {
  return {
    model: row.model,
    state: row.state,
    exShowroom: Number(row.ex_showroom) || 0,
    rtoInd: Number(row.rto_ind) || 0,
    rtoComp: Number(row.rto_comp) || 0,
    insurance: Number(row.insurance) || 0,
    handling: Number(row.handling) || 0,
    helmet: Number(row.helmet) || 0,
  };
}

function fromClient(item) {
  return {
    model: item.model || "",
    state: item.state || "",
    ex_showroom: Number(item.exShowroom) || 0,
    rto_ind: Number(item.rtoInd) || 0,
    rto_comp: Number(item.rtoComp) || 0,
    insurance: Number(item.insurance) || 0,
    handling: Number(item.handling) || 0,
    helmet: Number(item.helmet) || 0,
  };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const auth = await requireAuth(req);
      if (auth.error) {
        return res.status(auth.status || 401).json({ ok: false, error: auth.error });
      }
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("price_list")
        .select("*")
        .order("model", { ascending: true })
        .order("state", { ascending: true });
      if (error) throw error;
      return res.status(200).json({ ok: true, data: (data || []).map(toClient) });
    }

    if (req.method === "POST") {
      const auth = await requireAdmin(req);
      if (auth.error) {
        return res.status(auth.status || 403).json({ ok: false, error: auth.error });
      }
      const supabase = getSupabaseAdmin();
      const body =
        typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const list = Array.isArray(body.data) ? body.data : [];
      const { error: delErr } = await supabase
        .from("price_list")
        .delete()
        .neq("model", "__never__");
      if (delErr) throw delErr;
      if (list.length) {
        const rows = list.map(fromClient);
        const { error } = await supabase.from("price_list").insert(rows);
        if (error) throw error;
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("pricelist API", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
