"use strict";
/**
 * Multi-device sync via Supabase (encrypted).
 * v2 — more reliable Settings injection
 */
(function () {
  var CFG_KEY = "investtrack-sync-cfg";
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

  function isSettingsPage() {
    var title = document.getElementById("title");
    if (title && /setting/i.test(title.textContent || "")) return true;
    var active = document.querySelector(
      '.nav button.active[data-page="settings"], .bottomnav button.active[data-page="settings"], button.active[data-page="settings"]'
    );
    if (active) return true;
    var view = document.getElementById("view");
    if (view) {
      var html = view.innerHTML || "";
      if (/Privacy|Change PIN|Danger zone|Export JSON|Import JSON|Auto backup/i.test(html))
        return true;
    }
    return false;
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
      '"></div></div>' +
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
    console.log("[sync-ui] panel injected");
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
        if (!cfg.syncId || cfg.syncId.length < 8) return msg("Sync ID too short", false);
        saveCfg(cfg);
        msg("Sync ID saved on this device.", true);
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
          var cfg = loadCfg();
          cfg.syncId = syncId;
          cfg.deviceLabel = device;
          cfg.lastPushAt = updated_at;
          saveCfg(cfg);
          msg("Pushed OK at " + updated_at, true);
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
          msg("Downloading\u2026", true);
          var data = await api({ action: "pull", sync_id: syncId });
          var row = data.row;
          if (!row) throw new Error("Empty response");
          msg("Decrypting\u2026", true);
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

  function boot() {
    injectPanel();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-page="settings"]');
      if (t) {
        [50, 200, 500, 1000, 2000].forEach(function (ms) {
          setTimeout(injectPanel, ms);
        });
      }
    },
    true
  );

  var view = document.getElementById("view");
  if (view) {
    new MutationObserver(function () {
      injectPanel();
    }).observe(view, { childList: true, subtree: true });
  }

  setInterval(function () {
    if (isSettingsPage() && !document.getElementById("syncPanel")) injectPanel();
  }, 800);

  setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setTimeout(boot, 3000);
  console.log("[sync-ui] ready v2");
})();
