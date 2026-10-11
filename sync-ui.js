"use strict";
/**
 * Multi-device sync via Supabase (encrypted).
 * v4 — auto-push, conflict warning, last sync time
 */
(function () {
  var CFG_KEY = "investtrack-sync-cfg";
  var PASS_SESSION = "investtrack-sync-pass";
  var STATE_KEYS = ["investtrack-v4", "investtrack-v3"];
  var EXTRA_KEYS = [
    "investtrack-notes-v1",
    "investtrack-watchlist-v1",
    "investtrack-fiidii-hist-v1",
    "investtrack-quotes",
    "investtrack-sip-calendar-v2"
  ];

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }

  function loadCfg() {
    try {
      return JSON.parse(localStorage.getItem(CFG_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function saveCfg(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  function getPortfolioRaw() {
    for (var i = 0; i < STATE_KEYS.length; i++) {
      var raw = localStorage.getItem(STATE_KEYS[i]);
      if (raw) return { key: STATE_KEYS[i], raw: raw };
    }
    return null;
  }

  function collectBundle() {
    var port = getPortfolioRaw();
    var extras = {};
    EXTRA_KEYS.forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v != null) extras[k] = v;
    });
    return {
      v: 1,
      exportedAt: new Date().toISOString(),
      portfolioKey: port ? port.key : "investtrack-v4",
      portfolio: port ? port.raw : null,
      extras: extras
    };
  }

  function applyBundle(bundle) {
    if (!bundle || !bundle.portfolio) throw new Error("Backup has no portfolio data");
    var key = bundle.portfolioKey || "investtrack-v4";
    localStorage.setItem(key, bundle.portfolio);
    if (key !== "investtrack-v4") localStorage.setItem("investtrack-v4", bundle.portfolio);
    var extras = bundle.extras || {};
    Object.keys(extras).forEach(function (k) {
      if (extras[k] != null) localStorage.setItem(k, extras[k]);
    });
  }

  function b64(buf) {
    var bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function fromB64(str) {
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function deriveKey(passphrase, saltBytes) {
    var enc = new TextEncoder();
    var base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, [
      "deriveKey"
    ]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBytes, iterations: 120000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptPayload(passphrase, obj) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(passphrase, salt);
    var plain = new TextEncoder().encode(JSON.stringify(obj));
    var cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plain);
    return { ciphertext: b64(cipher), iv: b64(iv), salt: b64(salt) };
  }

  async function decryptPayload(passphrase, ciphertext, iv, salt) {
    var key = await deriveKey(passphrase, fromB64(salt));
    var plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(iv) },
      key,
      fromB64(ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function api(body) {
    var r = await fetch("/api/portfolio-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    var data = await r.json().catch(function () {
      return {};
    });
    if (!r.ok) throw new Error(data.error || "HTTP " + r.status);
    return data;
  }

  async function checkStatus() {
    try {
      return await api({ action: "status" });
    } catch (e) {
      return { configured: false, error: e.message };
    }
  }

  function fmtWhen(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (!isFinite(d.getTime())) return String(iso);
      return d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });
    } catch (e) {
      return String(iso);
    }
  }

  function localSavedAt() {
    try {
      var raw = localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3");
      if (!raw) return 0;
      var st = JSON.parse(raw);
      return (st.meta && st.meta.lastSavedAt) || 0;
    } catch (e) {
      return 0;
    }
  }

  function rememberPass(pass) {
    try {
      if (pass) sessionStorage.setItem(PASS_SESSION, pass);
    } catch (e) {}
  }
  function getSessionPass() {
    try {
      return sessionStorage.getItem(PASS_SESSION) || "";
    } catch (e) {
      return "";
    }
  }

  function isSettingsPage() {
    var active = document.querySelector(
      '.nav button.active[data-page="settings"], .bottomnav button.active[data-page="settings"]'
    );
    if (active) return true;
    var title = document.getElementById("title");
    if (title && /^\s*Settings/i.test(title.textContent || "")) return true;
    return false;
  }

  function removePanelIfWrongPage() {
    if (isSettingsPage()) return;
    var p = document.getElementById("syncPanel");
    if (p && p.parentNode) p.parentNode.removeChild(p);
  }

  function injectPanel() {
    if (!isSettingsPage()) return;
    var view = document.getElementById("view");
    if (!view) return;
    if (view.querySelector("#syncPanel")) return;

    var cfg = loadCfg();
    var panel = document.createElement("div");
    panel.id = "syncPanel";
    panel.className = "card";
    panel.style.cssText = "margin:0 0 14px;grid-column:1/-1;width:100%";
    panel.innerHTML =
      '<h2 style="margin:0 0 6px;font-size:16px">\uD83D\uDD04 Multi-device sync (Supabase)</h2>' +
      '<p class="muted" style="margin:0 0 12px;line-height:1.45">Encrypted backup in your free Supabase project. Same <b>Sync ID</b> + <b>passphrase</b> on every device.</p>' +
      '<div id="syncStatus" class="muted" style="margin-bottom:10px">Checking Supabase\u2026</div>' +
      '<div style="display:grid;gap:10px">' +
      '<div><label class="muted" style="display:block;margin-bottom:4px;font-size:12px">Sync ID (same on all devices)</label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<input class="input wide" id="syncIdInput" style="flex:1;min-width:180px" placeholder="Generate or paste ID" value="' +
      esc(cfg.syncId || "") +
      '">' +
      '<button type="button" class="btn" id="syncGenId">Generate</button></div></div>' +
      '<div><label class="muted" style="display:block;margin-bottom:4px;font-size:12px">Encryption passphrase</label>' +
      '<input class="input wide" id="syncPass" type="password" placeholder="Min 4 characters — not stored on server" autocomplete="off"></div>' +
      '<div><label class="muted" style="display:block;margin-bottom:4px;font-size:12px">Device label (optional)</label>' +
      '<input class="input wide" id="syncDevice" placeholder="e.g. iPhone, Laptop" value="' +
      esc(cfg.deviceLabel || "") +
      '"></div>' +
      '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">' +
      '<input type="checkbox" id="syncAutoPush"' +
      (cfg.autoPush ? " checked" : "") +
      '> Auto-push after edits <span class="muted">(needs passphrase once this session)</span></label>' +
      '<div id="syncLast" class="muted" style="font-size:12px;line-height:1.45">' +
      (cfg.lastPushAt
        ? "Last push: <b>" +
          esc(fmtWhen(cfg.lastPushAt)) +
          "</b>" +
          (cfg.deviceLabel ? " from " + esc(cfg.deviceLabel) : "")
        : "No push yet from this device.") +
      (cfg.lastPullAt ? "<br>Last pull: <b>" + esc(fmtWhen(cfg.lastPullAt)) + "</b>" : "") +
      "</div></div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">' +
      '<button type="button" class="btn primary" id="syncPush">\u2B06 Push to cloud</button>' +
      '<button type="button" class="btn" id="syncPull">\u2B07 Pull from cloud</button>' +
      '<button type="button" class="btn" id="syncSaveCfg">Save Sync ID</button></div>' +
      '<div id="syncMsg" class="muted" style="margin-top:10px;line-height:1.4"></div>';

    if (view.firstChild) view.insertBefore(panel, view.firstChild);
    else view.appendChild(panel);

    wire(panel);
    checkStatus().then(function (st) {
      var el = document.getElementById("syncStatus");
      if (!el) return;
      if (st.configured) {
        el.innerHTML =
          '<span style="color:var(--green)">\u2713 Supabase connected</span> — ready to Push / Pull';
      } else {
        el.innerHTML =
          '<span style="color:var(--red)">Supabase not configured</span> — check Vercel env + redeploy. ' +
          esc(st.error || "");
      }
    });
  }

  function msg(text, ok) {
    var el = document.getElementById("syncMsg");
    if (!el) return;
    el.style.color = ok ? "var(--green)" : "var(--red)";
    el.textContent = text;
  }

  function wire(panel) {
    var gen = panel.querySelector("#syncGenId");
    var push = panel.querySelector("#syncPush");
    var pull = panel.querySelector("#syncPull");
    var save = panel.querySelector("#syncSaveCfg");

    if (gen)
      gen.onclick = function () {
        var id = uuid();
        panel.querySelector("#syncIdInput").value = id;
        var cfg = loadCfg();
        cfg.syncId = id;
        saveCfg(cfg);
        msg("New Sync ID generated — click Push, then use the same ID on other devices.", true);
      };

    if (save)
      save.onclick = function () {
        var cfg = loadCfg();
        cfg.syncId = (panel.querySelector("#syncIdInput").value || "").trim();
        cfg.deviceLabel = (panel.querySelector("#syncDevice").value || "").trim();
        var autoEl = panel.querySelector("#syncAutoPush");
        cfg.autoPush = !!(autoEl && autoEl.checked);
        if (!cfg.syncId || cfg.syncId.length < 8) return msg("Sync ID too short", false);
        saveCfg(cfg);
        msg("Sync settings saved on this device.", true);
      };

    if (push)
      push.onclick = async function () {
        try {
          var syncId = (panel.querySelector("#syncIdInput").value || "").trim();
          var pass = panel.querySelector("#syncPass").value || "";
          var device = (panel.querySelector("#syncDevice").value || "").trim();
          if (syncId.length < 8) return msg("Enter or generate a Sync ID", false);
          if (pass.length < 4) return msg("Passphrase min 4 characters", false);
          if (!getPortfolioRaw()) return msg("No local portfolio to upload", false);
          msg("Encrypting & uploading\u2026", true);
          var bundle = collectBundle();
          var enc = await encryptPayload(pass, bundle);
          var updated_at = new Date().toISOString();
          await api({
            action: "push",
            sync_id: syncId,
            ciphertext: enc.ciphertext,
            iv: enc.iv,
            salt: enc.salt,
            updated_at: updated_at,
            device_label: device || undefined,
            meta: { app: "investtrack", bytes: enc.ciphertext.length }
          });
          rememberPass(pass);
          var cfg = loadCfg();
          cfg.syncId = syncId;
          cfg.deviceLabel = device;
          cfg.lastPushAt = updated_at;
          var autoEl = panel.querySelector("#syncAutoPush");
          cfg.autoPush = !!(autoEl && autoEl.checked);
          saveCfg(cfg);
          msg("Pushed OK at " + fmtWhen(updated_at), true);
          var last = document.getElementById("syncLast");
          if (last)
            last.innerHTML =
              "Last push: <b>" +
              esc(fmtWhen(updated_at)) +
              "</b>" +
              (device ? " from " + esc(device) : "");
        } catch (e) {
          msg("Push failed: " + e.message, false);
        }
      };

    if (pull)
      pull.onclick = async function () {
        try {
          var syncId = (panel.querySelector("#syncIdInput").value || "").trim();
          var pass = panel.querySelector("#syncPass").value || "";
          if (syncId.length < 8) return msg("Enter Sync ID", false);
          if (pass.length < 4) return msg("Enter passphrase", false);
          if (
            getPortfolioRaw() &&
            !confirm("Pull will overwrite local portfolio on this device. Continue?")
          ) {
            return;
          }
          msg("Checking cloud\u2026", true);
          var data = await api({ action: "pull", sync_id: syncId });
          var row = data.row;
          if (!row) throw new Error("Empty response");
          var cloudTs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          var localTs = localSavedAt();
          var cfg0 = loadCfg();
          var lastPushTs = cfg0.lastPushAt ? new Date(cfg0.lastPushAt).getTime() : 0;
          var newestLocal = Math.max(localTs, lastPushTs);
          if (newestLocal && cloudTs && newestLocal > cloudTs + 5000) {
            if (
              !confirm(
                "Conflict: local data looks NEWER than cloud.\n\nLocal saved: " +
                  (localTs ? fmtWhen(new Date(localTs).toISOString()) : "unknown") +
                  "\nCloud: " +
                  fmtWhen(row.updated_at) +
                  "\n\nPull will OVERWRITE local. Continue?"
              )
            ) {
              msg("Pull cancelled (local newer).", false);
              return;
            }
          } else if (cloudTs && lastPushTs && cloudTs > lastPushTs + 5000) {
            if (
              !confirm(
                "Cloud is newer (" +
                  fmtWhen(row.updated_at) +
                  ").\nThis will replace data on this device. Continue?"
              )
            ) {
              msg("Pull cancelled.", false);
              return;
            }
          }
          msg("Decrypting\u2026", true);
          rememberPass(pass);
          var bundle = await decryptPayload(pass, row.ciphertext, row.iv, row.salt);
          applyBundle(bundle);
          var cfg = loadCfg();
          cfg.syncId = syncId;
          cfg.lastPullAt = row.updated_at;
          saveCfg(cfg);
          msg("Restored. Reloading\u2026", true);
          try {
            sessionStorage.setItem("investtrack-skip-pin", String(Date.now()));
          } catch (e) {}
          setTimeout(function () {
            location.reload();
          }, 500);
        } catch (e) {
          var m = e.message || String(e);
          if (/OperationError|decrypt/i.test(m)) m = "Wrong passphrase (cannot decrypt)";
          msg("Pull failed: " + m, false);
        }
      };
  }

  async function tryAutoPush() {
    var cfg = loadCfg();
    if (!cfg.autoPush || !cfg.syncId) return { ok: false, reason: "off" };
    var pass = getSessionPass();
    if (!pass || pass.length < 4) return { ok: false, reason: "no-pass" };
    if (!getPortfolioRaw()) return { ok: false, reason: "empty" };
    try {
      var bundle = collectBundle();
      var enc = await encryptPayload(pass, bundle);
      var updated_at = new Date().toISOString();
      await api({
        action: "push",
        sync_id: cfg.syncId,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        salt: enc.salt,
        updated_at: updated_at,
        device_label: cfg.deviceLabel || undefined,
        meta: { app: "investtrack", auto: true }
      });
      cfg.lastPushAt = updated_at;
      saveCfg(cfg);
      console.log("[sync-ui] auto-pushed", updated_at);
      return { ok: true, at: updated_at };
    } catch (e) {
      console.warn("[sync-ui] auto-push failed", e.message);
      return { ok: false, reason: e.message };
    }
  }

  var autoTimer = null;
  function notifySaved() {
    var cfg = loadCfg();
    if (!cfg.autoPush) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(function () {
      tryAutoPush();
    }, 1200);
  }

  window.__investSync = {
    notifySaved: notifySaved,
    tryAutoPush: tryAutoPush,
    loadCfg: loadCfg
  };

  function boot() {
    injectPanel();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest("[data-page]");
      if (!btn) return;
      var page = btn.getAttribute("data-page");
      if (page === "settings") {
        [50, 200, 500, 1000, 2000].forEach(function (ms) {
          setTimeout(injectPanel, ms);
        });
      } else {
        setTimeout(removePanelIfWrongPage, 30);
        setTimeout(removePanelIfWrongPage, 200);
      }
    },
    true
  );

  var view = document.getElementById("view");
  if (view) {
    new MutationObserver(function () {
      injectPanel();
      removePanelIfWrongPage();
    }).observe(view, { childList: true, subtree: true });
  }

  setInterval(function () {
    removePanelIfWrongPage();
    if (isSettingsPage() && !document.getElementById("syncPanel")) injectPanel();
  }, 800);

  setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setTimeout(boot, 3000);
  console.log("[sync-ui] ready v4 auto-push + conflict + last-sync");
})();
