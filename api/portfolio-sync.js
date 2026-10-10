"use strict";

/**
 * Encrypted portfolio sync via Supabase.
 * Env (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

function env() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
    /\/$/,
    ""
  );
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return { url, key };
}

async function sb(path, { method = "GET", body, prefer } = {}) {
  const { url, key } = env();
  if (!url || !key) {
    const err = new Error(
      "Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel."
    );
    err.status = 503;
    throw err;
  }
  const headers = {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(url + "/rest/v1/" + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  if (!r.ok) {
    const msg =
      (data && (data.message || data.error_description || data.error)) ||
      text ||
      "Supabase HTTP " + r.status;
    const err = new Error(String(msg));
    err.status = r.status;
    throw err;
  }
  return data;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const syncId = String(req.query.sync_id || req.query.syncId || "").trim();
      if (!syncId || syncId.length < 8) {
        return res.status(400).json({ error: "sync_id required (min 8 chars)" });
      }
      const rows = await sb(
        "portfolio_sync?sync_id=eq." +
          encodeURIComponent(syncId) +
          "&select=sync_id,ciphertext,iv,salt,updated_at,device_label,meta"
      );
      if (!Array.isArray(rows) || !rows.length) {
        return res.status(404).json({ error: "No backup found for this Sync ID" });
      }
      return res.status(200).json({ ok: true, row: rows[0] });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const action = String(body.action || "push").toLowerCase();
      const syncId = String(body.sync_id || body.syncId || "").trim();
      if (!syncId || syncId.length < 8) {
        return res.status(400).json({ error: "sync_id required (min 8 chars)" });
      }

      if (action === "pull") {
        const rows = await sb(
          "portfolio_sync?sync_id=eq." +
            encodeURIComponent(syncId) +
            "&select=sync_id,ciphertext,iv,salt,updated_at,device_label,meta"
        );
        if (!Array.isArray(rows) || !rows.length) {
          return res.status(404).json({ error: "No backup found for this Sync ID" });
        }
        return res.status(200).json({ ok: true, row: rows[0] });
      }

      if (action === "push") {
        const ciphertext = String(body.ciphertext || "");
        const iv = String(body.iv || "");
        const salt = String(body.salt || "");
        if (!ciphertext || !iv || !salt) {
          return res.status(400).json({ error: "ciphertext, iv, salt required" });
        }
        if (ciphertext.length > 2500000) {
          return res.status(413).json({ error: "Backup too large" });
        }
        const updated_at = body.updated_at || new Date().toISOString();
        const device_label = body.device_label ? String(body.device_label).slice(0, 80) : null;
        const meta = body.meta && typeof body.meta === "object" ? body.meta : {};

        await sb("portfolio_sync?on_conflict=sync_id", {
          method: "POST",
          prefer: "resolution=merge-duplicates,return=representation",
          body: [
            {
              sync_id: syncId,
              ciphertext,
              iv,
              salt,
              updated_at,
              device_label,
              meta
            }
          ]
        });

        return res.status(200).json({ ok: true, sync_id: syncId, updated_at });
      }

      if (action === "status") {
        const { url, key } = env();
        return res.status(200).json({
          ok: true,
          configured: !!(url && key),
          hasServiceRole: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || "")
        });
      }

      return res.status(400).json({ error: "Unknown action" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    return res.status(status).json({ error: e.message || "Sync failed" });
  }
}
