"use strict";
/**
 * Sector heatmap + click-through to scrips in that sector.
 * Day-cached; no polling after market hours.
 */
(function () {
  var CACHE_KEY = "investtrack-sector-heatmap-v1";
  var STOCK_CACHE_KEY = "investtrack-sector-stocks-v1";
  var lastHeat = null;

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
    var f = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short"
    });
    var parts = {};
    f.formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    var mins = Number(parts.hour) * 60 + Number(parts.minute);
    var isWeekend = parts.weekday === "Sat" || parts.weekday === "Sun";
    return {
      date: parts.year + "-" + parts.month + "-" + parts.day,
      time: parts.hour + ":" + parts.minute,
      marketOpen: !isWeekend && mins >= 9 * 60 + 15 && mins < 15 * 60 + 30,
      isWeekend: isWeekend
    };
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); } catch (e) { return null; }
  }
  function writeCache(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ tradeDate: data.tradeDate, savedAt: Date.now(), data: data }));
    } catch (e) {}
  }
  function readStockCache(sector) {
    try {
      var all = JSON.parse(localStorage.getItem(STOCK_CACHE_KEY) || "{}");
      var ist = istParts();
      var row = all[ist.date + "|" + sector];
      if (!row) return null;
      if (!ist.marketOpen) return row;
      if (Date.now() - (row.savedAt || 0) < 5 * 60 * 1000) return row;
      return null;
    } catch (e) { return null; }
  }
  function writeStockCache(sector, data) {
    try {
      var all = JSON.parse(localStorage.getItem(STOCK_CACHE_KEY) || "{}");
      var ist = istParts();
      all[ist.date + "|" + sector] = { savedAt: Date.now(), data: data };
      localStorage.setItem(STOCK_CACHE_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function cellColor(pct) {
    if (pct == null || !isFinite(pct)) return "#1b2834";
    var t = Math.max(-3, Math.min(3, pct)) / 3;
    if (t >= 0) return "rgb(20," + Math.round(40 + t * 100) + ",55)";
    return "rgb(" + Math.round(40 + (-t) * 120) + ",30,40)";
  }

  function heatCell(s) {
    var pct = s.changePct;
    var cls = pct == null ? "muted" : pct >= 0 ? "green" : "red";
    var label = pct == null ? "\u2014" : ((pct >= 0 ? "+" : "") + fmt(pct, 2) + "%");
    return (
      '<div class="heat-cell" role="button" tabindex="0" data-sector-open="' + esc(s.id) + '" data-sector-name="' + esc(s.name) + '" style="background:' + cellColor(pct) + ';cursor:pointer" title="Click to see stocks in ' + esc(s.name) + '">' +
      '<div class="heat-name">' + esc(s.name) + "</div>" +
      '<div class="heat-pct ' + cls + '"><b>' + label + "</b></div>" +
      '<div class="heat-sub muted">' + (s.price != null ? fmt(s.price, 2) : esc(s.error || "")) + " \u00b7 view stocks</div>" +
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
          '</div><div class="muted" style="margin-top:6px">Laggards: ' + (bot || "\u2014") +
          '</div><div class="muted" style="margin-top:8px">Tip: click any sector tile to see scrip-level moves.</div></div>'
        : "") + html
    );
  }

  function stockTable(stocks) {
    if (!stocks || !stocks.length) return '<div class="card empty">No scrips available for this sector.</div>';
    return (
      '<div class="tablewrap"><table class="table"><thead><tr><th>Scrip</th><th>Day %</th><th>Price</th><th>Prev close</th><th></th></tr></thead><tbody>' +
      stocks.map(function (x) {
        var pct = x.changePct;
        var cls = pct == null ? "muted" : pct >= 0 ? "green" : "red";
        var label = pct == null ? "\u2014" : ((pct >= 0 ? "+" : "") + fmt(pct, 2) + "%");
        return (
          "<tr><td><div class=\"asset\">" + esc(x.name || x.symbol) + '</div><div class="sub">' + esc(x.symbol) + "</div></td>" +
          '<td class="' + cls + '"><b>' + label + "</b></td>" +
          "<td>" + (x.price != null ? fmt(x.price, 2) : "\u2014") + "</td>" +
          "<td>" + (x.previousClose != null ? fmt(x.previousClose, 2) : "\u2014") + "</td>" +
          '<td><button type="button" class="btn" data-sector-research="' + esc(x.symbol) + '">Research</button></td></tr>'
        );
      }).join("") +
      "</tbody></table></div>"
    );
  }

  function pageShell(inner, meta, drill) {
    var status = meta
      ? (meta.marketOpen ? "Market open" : "Market closed") +
        " \u00b7 Session " + esc(meta.tradeDate || "") +
        (meta.asOfTimeIST ? " \u00b7 as of " + esc(meta.asOfTimeIST) + " IST" : "")
      : "";
    var headRight = drill
      ? '<button class="btn" id="sectorsBack">\u2190 All sectors</button>'
      : '<button class="btn" id="sectorsRefresh" title="Fresh pull during market hours">\u21bb Refresh</button>';
    return (
      '<div class="card"><div class="head" style="margin:0 0 10px"><div>' +
      "<h2 style=\"margin:0\">" + (drill ? esc(drill.title) : "Sector heatmap") + "</h2>" +
      '<div class="muted">' +
      (drill
        ? "Scrip-level day moves for this sector (cached for the session)."
        : "Full-day sector moves \u2014 click a tile for stocks. Cached after market close.") +
      "</div></div>" + headRight + "</div>" +
      (status ? '<div class="notice">' + status + (meta && meta.note && !drill ? " \u2014 " + esc(meta.note) : "") + "</div>" : "") +
      "</div>" +
      '<style>.heat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}' +
      ".heat-cell{border:1px solid var(--line);border-radius:10px;padding:12px;min-height:88px}" +
      ".heat-cell:hover{outline:1px solid var(--green)}.heat-name{font-weight:700;font-size:13px}" +
      ".heat-pct{font-size:18px;margin-top:6px}.heat-sub{font-size:10px;margin-top:4px}</style>" +
      '<div id="sectorsBody" style="margin-top:12px">' + inner + "</div>"
    );
  }

  async function loadHeat(force) {
    var ist = istParts();
    var cached = readCache();
    if (!force && cached && cached.tradeDate === ist.date && cached.data && !ist.marketOpen) {
      return { data: cached.data, source: "local-day-cache" };
    }
    if (!force && cached && cached.tradeDate === ist.date && cached.data && ist.marketOpen && Date.now() - (cached.savedAt || 0) < 5 * 60 * 1000) {
      return { data: cached.data, source: "local-short-cache" };
    }
    var r = await fetch("/api/sectors" + (force ? "?force=1" : "") + "&t=" + Date.now());
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    writeCache(d);
    return { data: d, source: "network" };
  }

  async function loadStocks(sectorId, force) {
    var cached = !force && readStockCache(sectorId);
    if (cached && cached.data) return cached.data;
    var r = await fetch("/api/sector-stocks?sector=" + encodeURIComponent(sectorId) + (force ? "&force=1" : "") + "&t=" + Date.now());
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    writeStockCache(sectorId, d);
    return d;
  }

  async function showHeat(force) {
    var view = document.getElementById("view");
    if (!view) return;
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Sector heatmap";
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "movers" || b.getAttribute("data-page") === "sectors");
    });
    view.innerHTML = pageShell('<div class="card empty">Loading sector moves\u2026</div>', null, null);
    try {
      var res = await loadHeat(!!force);
      lastHeat = res.data;
      view.innerHTML = pageShell(renderHeatmap(res.data), res.data, null);
      if (res.source && res.source.indexOf("cache") >= 0) {
        var notice = view.querySelector(".notice");
        if (notice) notice.textContent += " \u00b7 served from " + res.source.replace(/-/g, " ");
      }
    } catch (e) {
      var body = document.getElementById("sectorsBody");
      if (body) body.innerHTML = '<div class="card empty">Could not load sectors: ' + esc(e.message || "error") + "</div>";
    }
  }

  async function showSector(sectorId, sectorName) {
    var view = document.getElementById("view");
    if (!view) return;
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = (sectorName || sectorId) + " stocks";
    var meta = lastHeat || { tradeDate: istParts().date, marketOpen: istParts().marketOpen };
    view.innerHTML = pageShell('<div class="card empty">Loading scrips in ' + esc(sectorName || sectorId) + "\u2026</div>", meta, {
      title: (sectorName || sectorId) + " \u2014 scrips"
    });
    try {
      var data = await loadStocks(sectorId, false);
      view.innerHTML = pageShell(stockTable(data.stocks), Object.assign({}, meta, { note: data.count + " names" }), {
        title: (sectorName || sectorId) + " \u2014 " + (data.count || 0) + " scrips"
      });
    } catch (e) {
      var body = document.getElementById("sectorsBody");
      if (body) body.innerHTML = '<div class="card empty">Could not load stocks: ' + esc(e.message || "error") + "</div>";
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
    var t = e.target;
    if (!t) return;
    if (t.id === "sectorsRefresh") { showHeat(true); return; }
    if (t.id === "sectorsBack") { showHeat(false); return; }
    var cell = t.closest && t.closest("[data-sector-open]");
    if (cell) {
      e.preventDefault();
      showSector(cell.getAttribute("data-sector-open"), cell.getAttribute("data-sector-name"));
      return;
    }
    var res = t.closest && t.closest("[data-sector-research]");
    if (res) {
      var sym = res.getAttribute("data-sector-research");
      var navBtn = document.querySelector('.nav [data-page="research"]');
      if (navBtn) navBtn.click();
      setTimeout(function () {
        var inp = document.getElementById("researchSymbol");
        if (inp) inp.value = sym;
        var run = document.getElementById("researchRun");
        if (run) run.click();
      }, 100);
      return;
    }
    var sbtn = t.closest && t.closest('[data-page="sectors"], [data-page="movers"]');
    if (sbtn) setTimeout(function () { showHeat(false); }, 30);
  });

  function boot() { ensureNav(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  console.log("[sectors-heatmap] ready v2 (drill-down)");
})();
