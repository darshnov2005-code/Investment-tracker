"use strict";
/**
 * Sector heatmap page (replaces Hot movers).
 * Caches by IST trade date in localStorage - no polling after market hours.
 */
(function () {
  var CACHE_KEY = "investtrack-sector-heatmap-v1";

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "\u2014";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: d == null ? 2 : d }).format(n);
  }

  function istParts() {
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short"
    });
    var parts = {};
    fmt.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var mins = Number(parts.hour) * 60 + Number(parts.minute);
    var isWeekend = parts.weekday === "Sat" || parts.weekday === "Sun";
    var marketOpen = !isWeekend && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
    return {
      date: parts.year + "-" + parts.month + "-" + parts.day,
      time: parts.hour + ":" + parts.minute,
      marketOpen: marketOpen,
      isWeekend: isWeekend
    };
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        tradeDate: data.tradeDate,
        savedAt: Date.now(),
        data: data
      }));
    } catch (e) {}
  }

  function cellColor(pct) {
    if (pct == null || !isFinite(pct)) return "#1b2834";
    var t = Math.max(-3, Math.min(3, pct)) / 3;
    if (t >= 0) {
      var g = Math.round(40 + t * 100);
      return "rgb(20," + g + ",55)";
    }
    var r = Math.round(40 + (-t) * 120);
    return "rgb(" + r + ",30,40)";
  }

  function heatCell(s) {
    var pct = s.changePct;
    var cls = pct == null ? "muted" : pct >= 0 ? "green" : "red";
    var label = pct == null ? "\u2014" : ((pct >= 0 ? "+" : "") + fmt(pct, 2) + "%");
    return (
      '<div class="heat-cell" style="background:' + cellColor(pct) + '" title="' +
      esc(s.name) + " \u00b7 " + label + '">' +
      '<div class="heat-name">' + esc(s.name) + "</div>" +
      '<div class="heat-pct ' + cls + '"><b>' + label + "</b></div>" +
      '<div class="heat-sub muted">' + (s.price != null ? fmt(s.price, 2) : esc(s.error || "")) + "</div>" +
      "</div>"
    );
  }

  function renderHeatmap(data) {
    var sectors = (data && data.sectors) || [];
    var groups = {};
    sectors.forEach(function (s) {
      var g = s.group || "Others";
      if (!groups[g]) groups[g] = [];
      groups[g].push(s);
    });
    var order = ["Benchmark", "Financials", "Technology", "Cyclical", "Energy", "Healthcare", "Defensive", "Others"];
    var html = "";
    order.forEach(function (g) {
      if (!groups[g] || !groups[g].length) return;
      html += '<div class="label" style="margin:14px 0 8px">' + esc(g) + "</div>";
      html += '<div class="heat-grid">' + groups[g].map(heatCell).join("") + "</div>";
    });
    var sorted = sectors.filter(function (s) { return s.changePct != null; }).slice().sort(function (a, b) {
      return b.changePct - a.changePct;
    });
    var top = sorted.slice(0, 3).map(function (s) {
      return esc(s.name) + ' <span class="green">+' + fmt(s.changePct, 2) + "%</span>";
    }).join(" \u00b7 ");
    var bot = sorted.slice(-3).reverse().map(function (s) {
      return esc(s.name) + ' <span class="red">' + fmt(s.changePct, 2) + "%</span>";
    }).join(" \u00b7 ");

    return (
      (sorted.length
        ? '<div class="card" style="margin-bottom:12px"><div class="muted">Leaders: ' + (top || "\u2014") +
          '</div><div class="muted" style="margin-top:6px">Laggards: ' + (bot || "\u2014") + "</div></div>"
        : "") + html
    );
  }

  function pageShell(inner, meta) {
    var ist = istParts();
    var status = meta
      ? (meta.marketOpen ? "Market open" : "Market closed") +
        " \u00b7 Session " + esc(meta.tradeDate || ist.date) +
        (meta.asOfTimeIST ? " \u00b7 as of " + esc(meta.asOfTimeIST) + " IST" : "")
      : "";
    return (
      '<div class="card"><div class="head" style="margin:0 0 10px"><div>' +
      '<h2 style="margin:0">Sector heatmap</h2>' +
      '<div class="muted">Full-day sector moves across NSE indices \u2014 cached for the session so post-market does not keep polling.</div></div>' +
      '<button class="btn" id="sectorsRefresh" title="Only needed if you want a fresh pull during market hours">\u21bb Refresh</button></div>' +
      (status ? '<div class="notice">' + status + (meta && meta.note ? " \u2014 " + esc(meta.note) : "") + "</div>" : "") +
      "</div>" +
      '<style>.heat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}' +
      ".heat-cell{border:1px solid var(--line);border-radius:10px;padding:12px;min-height:88px}" +
      ".heat-name{font-weight:700;font-size:13px}.heat-pct{font-size:18px;margin-top:6px}.heat-sub{font-size:10px;margin-top:4px}</style>" +
      '<div id="sectorsBody" style="margin-top:12px">' + inner + "</div>"
    );
  }

  async function loadData(force) {
    var ist = istParts();
    var cached = readCache();
    if (
      !force &&
      cached &&
      cached.tradeDate === ist.date &&
      cached.data &&
      !ist.marketOpen
    ) {
      return { data: cached.data, source: "local-day-cache" };
    }
    if (
      !force &&
      cached &&
      cached.tradeDate === ist.date &&
      cached.data &&
      ist.marketOpen &&
      Date.now() - (cached.savedAt || 0) < 5 * 60 * 1000
    ) {
      return { data: cached.data, source: "local-short-cache" };
    }

    var r = await fetch("/api/sectors" + (force ? "?force=1" : "") + "&t=" + Date.now());
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    writeCache(d);
    return { data: d, source: "network" };
  }

  async function show(force) {
    var view = document.getElementById("view");
    if (!view) return;
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Sector heatmap";
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "movers" || b.getAttribute("data-page") === "sectors");
    });
    view.innerHTML = pageShell('<div class="card empty">Loading sector moves\u2026</div>', null);
    try {
      var res = await loadData(!!force);
      view.innerHTML = pageShell(renderHeatmap(res.data), res.data);
      if (res.source && res.source.indexOf("cache") >= 0) {
        var notice = view.querySelector(".notice");
        if (notice) notice.textContent += " \u00b7 served from " + res.source.replace(/-/g, " ");
      }
    } catch (e) {
      var body2 = document.getElementById("sectorsBody");
      if (body2) {
        body2.innerHTML = '<div class="card empty">Could not load sectors: ' + esc(e.message || "error") + "</div>";
      }
    }
  }

  function ensureNav() {
    var nav = document.querySelector(".side .nav");
    if (!nav) return;
    var existing = nav.querySelector('[data-page="movers"], [data-page="sectors"]');
    if (existing) {
      existing.innerHTML = "\u25a3 <span>Sector heatmap</span>";
      existing.setAttribute("data-page", "sectors");
      return;
    }
    var btn = document.createElement("button");
    btn.setAttribute("data-page", "sectors");
    btn.innerHTML = "\u25a3 <span>Sector heatmap</span>";
    var research = nav.querySelector('[data-page="research"]');
    if (research) nav.insertBefore(btn, research);
    else nav.appendChild(btn);
  }

  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "sectorsRefresh") {
      show(true);
      return;
    }
    var sbtn = e.target.closest && e.target.closest('[data-page="sectors"], [data-page="movers"]');
    if (sbtn) {
      setTimeout(function () { show(false); }, 30);
    }
  });

  function boot() {
    ensureNav();
    if (window.__investExtraPage === "sectors" || window.__investExtraPage === "movers") {
      show(false);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);

  console.log("[sectors-heatmap] ready");
})();
