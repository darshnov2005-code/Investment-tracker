"use strict";
(function () {
  var CACHE = "investtrack-opportunities-v1";
  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function injectCss() {
    if (document.getElementById("opp-css")) return;
    var s = document.createElement("style");
    s.id = "opp-css";
    s.textContent =
      ".opp-wrap{display:grid;gap:14px}" +
      ".opp-card{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.02)}" +
      ".opp-head{padding:12px 14px;background:rgba(0,0,0,0.22);border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:10px;align-items:center}" +
      ".opp-head h3{margin:0;font-size:15px;font-weight:700}" +
      ".opp-body{padding:10px 12px}" +
      ".opp-row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)}" +
      ".opp-row:last-child{border-bottom:0}" +
      ".opp-score{font-weight:800;font-size:15px;min-width:52px;text-align:right}" +
      ".opp-why{font-size:12px;color:var(--muted);margin-top:4px;line-height:1.4}" +
      ".opp-pill{display:inline-block;font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);margin-right:4px}";
    document.head.appendChild(s);
  }
  function scoreColor(s) {
    if (s >= 70) return "green";
    if (s >= 50) return "";
    return "muted";
  }
  function rowHtml(item) {
    return (
      '<div class="opp-row"><div style="min-width:0;flex:1">' +
      '<div style="font-weight:650">' +
      esc(item.name || item.symbol) +
      ' <span class="muted" style="font-weight:500">' +
      esc(item.symbol) +
      "</span></div>" +
      '<div class="opp-why">' +
      (item.why || [])
        .slice(0, 3)
        .map(function (w) {
          return '<span class="opp-pill">' + esc(w) + "</span>";
        })
        .join(" ") +
      "</div>" +
      '<div class="muted" style="font-size:12px;margin-top:4px">\u20b9' +
      esc(item.price) +
      (item.rsi != null ? " \u00b7 RSI " + item.rsi : "") +
      (item.volRatio != null ? " \u00b7 Vol " + item.volRatio + "x" : "") +
      "</div></div>" +
      '<div class="opp-score ' +
      scoreColor(item.score) +
      '">' +
      Math.round(item.score) +
      "</div></div>"
    );
  }
  function section(title, emoji, items) {
    if (!items || !items.length) {
      return (
        '<div class="opp-card"><div class="opp-head"><h3>' +
        emoji +
        " " +
        esc(title) +
        '</h3></div><div class="opp-body muted">No matches in current scan.</div></div>'
      );
    }
    return (
      '<div class="opp-card"><div class="opp-head"><h3>' +
      emoji +
      " " +
      esc(title) +
      '</h3><span class="muted" style="font-size:12px">' +
      items.length +
      " names</span></div><div class=\"opp-body\">" +
      items.map(rowHtml).join("") +
      "</div></div>"
    );
  }
  function render(data) {
    injectCss();
    var cats = data.categories || {};
    var asOf = data.asOf ? new Date(data.asOf).toLocaleString("en-IN") : "\u2014";
    return (
      '<div class="head"><div><h2>\uD83C\uDFAF Opportunities</h2><div class="muted">Ranked setups across ' +
      (data.scanned || 0) +
      " liquid NSE stocks \u00b7 " +
      esc(asOf) +
      '</div></div><button type="button" class="btn" id="opp-refresh">Refresh scan</button></div>' +
      '<div class="card" style="margin-bottom:12px;padding:12px 14px"><div class="muted" style="font-size:13px;line-height:1.45">' +
      esc(data.note || "") +
      " Cached ~30 min so post-close does not hammer APIs.</div></div>" +
      '<div class="opp-wrap">' +
      section("Nearing breakout", "\uD83D\uDE80", cats.breakout && cats.breakout.items) +
      section("Value / oversold zone", "\uD83D\uDC8E", cats.value && cats.value.items) +
      section("RS recovery after correction", "\uD83D\uDCC8", cats.rs_recovery && cats.rs_recovery.items) +
      section("High-volume breakouts", "\uD83D\uDCE2", cats.volume_breakout && cats.volume_breakout.items) +
      section("Price lag / incomplete recovery", "\u23F3", cats.price_lag && cats.price_lag.items) +
      "</div>"
    );
  }
  async function load(force) {
    var view = document.getElementById("view");
    if (!view) return;
    if (!force) {
      try {
        var cached = JSON.parse(localStorage.getItem(CACHE) || "null");
        if (cached && cached.asOf && Date.now() - new Date(cached.asOf).getTime() < 30 * 60 * 1000) {
          view.innerHTML = render(cached);
          wire();
          return;
        }
      } catch (e) {}
    }
    view.innerHTML =
      '<div class="head"><h2>\uD83C\uDFAF Opportunities</h2></div><div class="card">Scanning liquid NSE universe\u2026 (15\u201340s first time)</div>';
    try {
      var r = await fetch("/api/opportunities?t=" + Date.now());
      if (!r.ok) {
        var err = await r.json().catch(function () { return {}; });
        throw new Error(err.error || "HTTP " + r.status);
      }
      var data = await r.json();
      try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch (e) {}
      view.innerHTML = render(data);
      wire();
    } catch (e) {
      view.innerHTML =
        '<div class="head"><h2>\uD83C\uDFAF Opportunities</h2></div><div class="card" style="color:#ef8d8d">Failed: ' +
        esc(e.message) +
        "</div>";
    }
  }
  function wire() {
    var b = document.getElementById("opp-refresh");
    if (b) b.onclick = function () { load(true); };
  }
  document.addEventListener(
    "click",
    function (e) {
      var tab = e.target && e.target.closest && e.target.closest('[data-nav-tab="opportunities"]');
      if (tab) setTimeout(function () { load(false); }, 60);
      var btn = e.target && e.target.closest && e.target.closest('[data-page="opportunities"]');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        load(false);
      }
    },
    true
  );
  window.__opportunitiesLoad = load;
  console.log("[opportunities-ui] ready");
})();
