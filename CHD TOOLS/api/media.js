import { getSupabaseAdmin, cors } from "./lib/supabaseAdmin.js";
import { requireAuth } from "./lib/auth.js";

const MAX_INLINE = 900 * 1024; // ~0.9MB — safe for Vercel body + DB
const MAX_STORAGE = 3.5 * 1024 * 1024; // ~3.5MB via Storage

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const auth = await requireAuth(req);
    if (auth.error) {
      return res.status(auth.status || 401).json({ ok: false, error: auth.error });
    }

    const supabase = getSupabaseAdmin();

    // op=upload-url → signed upload URL (was /api/media-upload-url)
    const op = ((req.query && req.query.op) || (req.body && req.body.op) || "").toLowerCase();
    if (op === "upload-url") {
      if (req.method !== "POST") {
        return res.status(405).json({ ok: false, error: "Method not allowed" });
      }
      const body = req.body || {};
      const fileName = String(body.fileName || "file.bin").replace(/[^\w.\-()+ ]+/g, "_").slice(0, 120);
      const contentType = String(body.contentType || "application/octet-stream");
      const category = String(body.category || "other").replace(/[^\w\-]+/g, "_");
      await supabase.storage.createBucket("media-library", { public: true }).catch(() => {});
      const path = `${category}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
      const { data, error } = await supabase.storage
        .from("media-library")
        .createSignedUploadUrl(path);
      if (error) {
        return res.status(500).json({
          ok: false,
          error:
            "Could not create upload URL: " +
            (error.message || String(error)) +
            ". Ensure Storage bucket 'media-library' exists and is Public.",
        });
      }
      const { data: pub } = supabase.storage.from("media-library").getPublicUrl(path);
      return res.status(200).json({
        ok: true,
        path,
        token: data.token,
        signedUrl: data.signedUrl,
        publicUrl: pub.publicUrl,
        contentType,
      });
    }

    if (req.method === "GET") {
      const category = ((req.query && req.query.category) || "").trim();
      const model = ((req.query && req.query.model) || "").trim();
      const limitRaw = parseInt((req.query && req.query.limit) || "100", 10);
      const limit = Math.min(Math.max(limitRaw || 100, 1), 200);

      let query = supabase
        .from("media_library")
        .select("id, category, model, title, description, file_type, file_url, file_name, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (category) query = query.eq("category", category);
      if (model) query = query.eq("model", model);

      const { data, error } = await query;
      if (error) {
        // Helpful message if table missing
        const msg = String(error.message || error);
        if (msg.includes("media_library") || msg.includes("does not exist") || error.code === "42P01") {
          return res.status(500).json({
            ok: false,
            error: "Table media_library not found. Run the media_library SQL in Supabase SQL Editor, then retry.",
          });
        }
        throw error;
      }
      return res.status(200).json({ ok: true, data: data || [] });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const title = String(body.title || "").trim();
      const category = String(body.category || "").trim();
      let fileUrl = String(body.fileUrl || body.file_url || "").trim();

      if (!title) return res.status(400).json({ ok: false, error: "Title is required" });
      if (!["catalogue_bike", "catalogue_accessories", "hog_video", "slideshow", "other"].includes(category)) {
        return res.status(400).json({ ok: false, error: "Invalid category" });
      }
      if (!fileUrl) {
        return res.status(400).json({
          ok: false,
          error: "Paste a link (Drive/YouTube) or upload a small file.",
        });
      }

      let fileName = String(body.fileName || body.file_name || "").trim() || null;
      let fileType = String(body.fileType || body.file_type || "").trim() || null;
      let finalUrl = fileUrl;

      // Handle data: URL uploads (from browser FileReader)
      if (fileUrl.startsWith("data:")) {
        const match = /^data:([^;]+);base64,(.+)$/s.exec(fileUrl);
        if (!match) {
          return res.status(400).json({ ok: false, error: "Invalid file data" });
        }
        const mime = match[1];
        const b64 = match[2];
        let buf;
        try {
          buf = Buffer.from(b64, "base64");
        } catch (_) {
          return res.status(400).json({ ok: false, error: "Could not read file data" });
        }

        fileType = fileType || mime;
        const ext =
          mime.includes("pdf") ? "pdf" :
          mime.includes("png") ? "png" :
          mime.includes("jpeg") || mime.includes("jpg") ? "jpg" :
          mime.includes("webp") ? "webp" :
          mime.includes("mp4") ? "mp4" :
          mime.includes("webm") ? "webm" : "bin";
        if (!fileName) fileName = `file-${Date.now()}.${ext}`;

        // Path A: small file → store data URL directly in DB (no Storage needed)
        if (buf.length <= MAX_INLINE) {
          finalUrl = fileUrl; // keep data URL
        } else if (buf.length > MAX_STORAGE) {
          return res.status(400).json({
            ok: false,
            error: "File too large (max ~3.5MB for upload). Upload to Google Drive / YouTube and paste the share link instead.",
          });
        } else {
          // Path B: medium file → try Supabase Storage
          try {
            await supabase.storage.createBucket("media-library", { public: true }).catch(() => {});
            const path = `${category}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("media-library")
              .upload(path, buf, { contentType: mime, upsert: false });
            if (upErr) {
              return res.status(500).json({
                ok: false,
                error:
                  "Storage upload failed: " +
                  (upErr.message || String(upErr)) +
                  ". Create a PUBLIC bucket named media-library in Supabase Storage, OR use a file under 1MB, OR paste a Drive/YouTube link.",
              });
            }
            const { data: pub } = supabase.storage.from("media-library").getPublicUrl(path);
            finalUrl = pub.publicUrl;
          } catch (e) {
            return res.status(500).json({
              ok: false,
              error:
                "Upload failed: " +
                String(e.message || e) +
                ". Prefer pasting a Google Drive / YouTube link for PDFs and videos.",
            });
          }
        }
      }

      const row = {
        category,
        model: String(body.model || "").trim() || null,
        title,
        description: String(body.description || "").trim() || null,
        file_type: fileType,
        file_url: finalUrl,
        file_name: fileName,
      };

      const { data, error } = await supabase.from("media_library").insert(row).select("*").single();
      if (error) {
        const msg = String(error.message || error);
        if (msg.includes("media_library") || msg.includes("does not exist") || error.code === "42P01") {
          return res.status(500).json({
            ok: false,
            error: "Table media_library not found. Run the media_library SQL in Supabase first.",
          });
        }
        throw error;
      }
      return res.status(200).json({ ok: true, data });
    }

    if (req.method === "DELETE") {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });
      const { error } = await supabase.from("media_library").delete().eq("id", id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
}
