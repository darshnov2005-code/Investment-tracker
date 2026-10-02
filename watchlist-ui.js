"use strict";
/**
 * Watchlist — symbols you don't necessarily hold, with optional note.
 */
(function () {
  var KEY = "investtrack-watchlist-v1";

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "\u2014";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: d == null ? 2 : d }).format(n);
  }

  function load() {
    try {
      var arr = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function save(arr) {
    localStorage.setItem(KEY, JSON.stringify(arr));
  }
  function uid() {
    return "w-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
  }

  function heldSymbols() {
    try {
      var st = JSON.parse(localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3") || "null");
      if (!st || !st.transactions) return {};
      var qty = {};
      st.transactions.forEach(function (t) {
        if (!t || !t.symbol) return;
        if (["STOCK", "ETF"].indexOf(t.type) < 0) return;
        var k = String(t.symbol).toUpperCase();
        var q = Number(t.qty) || 0;
        if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) + q;
        else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) - q;
      });
      var out = {};
      Object.keys(qty).forEach(function (k) {
        if (qty[k] > 1e-8) out[k] = true;
      });
      return out;
    } catch (e) {
      return {};
    }
  }

  function pageHtml() {
    return (
      '<div class="card"><div class="head" style="margin:0 0 10px"><div>' +
      '<h2 style="margin:0">Watchlist</h2>' +
      '<div class="muted">Names you are tracking \u2014 not necessarily held. Day % uses the quote API when available.</div></div>' +
      '<button class="btn" id="wlRefreshQuotes">\u21bb Refresh quotes</button></div>' +
      '<div class="form" style="margin-top:10px">' +
      '<div class="field"><label>Symbol</label><input class="input wide" id="wlSymbol" placeholder="e.g. TATASTEEL" style="text-transform:uppercase"></div>' +
      '<div class="field"><label>Name (optional)</label><input class="input wide" id="wlName" placeholder="Display name"></div>' +
      '<div class="field full"><label>Note</label><input class="input wide" id="wlNote" placeholder="Why on the list / buy zone"></div>' +
      '<div class="field" style="align-self:end"><button type="button" class="btn primary" id="wlAdd">\uff0b Add</button></div>' +
      "</div></div>" +
      '<div id="wlBody" style="margin-top:12px"></div>'
    );
  }

  function renderList(quotes) {
    var items = load();
    var held = heldSymbols();
    quotes = quotes || {};
    if (!items.length) {
      return '<div class="card empty">Watchlist is empty. Add a symbol above.</div>';
    }
    return (
      '<div class="tablewrap"><table class="table"><thead><tr><th>Symbol</th><th>Day %</th><th>Price</th><th>Note</th><th>Status</th><th></th></tr></thead><tbody>' +
      items
        .slice()
        .sort(function (a, b) {
          return String(a.symbol).localeCompare(String(b.symbol));
        })
        .map(function (w) {
          var sym = String(w.symbol || "").toUpperCase();
          var q = quotes[sym] || {};
          var pct = q.changePct;
          var cls = pct == null ? "muted" : pct >= 0 ? "green" : "red";
          var label = pct == null ? "\u2014" : (pct >= 0 ? "+" : "") + fmt(pct, 2) + "%";
          var status = held[sym]
            ? '<span class="pill" style="background:#1a3a2a;color:var(--green)">In holdings</span>'
            : '<span class="muted">Watch only</span>';
          return (
            "<tr><td><div class=\"asset\">" +
            esc(w.name || sym) +
            '</div><div class="sub">' +
            esc(sym) +
            "</div></td>" +
            '<td class="' +
            cls +
            '"><b>' +
            label +
            "</b></td><td>" +
            (q.price != null ? fmt(q.price, 2) : "\u2014") +
            '</td><td style="max-width:240px">' +
            esc(w.note || "") +
            "</td><td>" +
            status +
            '</td><td style="white-space:nowrap">' +
            '<button type="button" class="btn" data-wl-research="' +
            esc(sym) +
            '">Research</button> ' +
            '<button type="button" class="btn danger" data-wl-del="' +
            esc(w.id) +
            '">Remove</button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  async function fetchQuotes() {
    var items = load();
    var out = {};
    for (var i = 0; i < items.length; i++) {
      var sym = String(items[i].symbol || "").toUpperCase();
      if (!sym) continue;
      try {
        var r = await fetch("/api/quote?symbol=" + encodeURIComponent(sym) + "&exchange=NSE&t=" + Date.now());
        var d = await r.json();
        if (r.ok && d.price != null) {
          var prev = d.previousClose;
          var changePct =
            prev && prev > 0 ? ((Number(d.price) - Number(prev)) / Number(prev)) * 100 : null;
          out[sym] = { price: Number(d.price), previousClose: prev, changePct: changePct };
        }
      } catch (e) {}
    }
    return out;
  }

  async function show(refreshQuotes) {
    var view = document.getElementById("view");
    if (!view) return;
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Watchlist";
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "watchlist");
    });
    view.innerHTML = pageHtml();
    var body = document.getElementById("wlBody");
    if (body) body.innerHTML = renderList({});
    if (refreshQuotes !== false && load().length) {
      if (body) body.innerHTML = '<div class="card empty">Loading quotes\u2026</div>';
      try {
        var q = await fetchQuotes();
        if (body) body.innerHTML = renderList(q);
      } catch (e) {
        if (body) body.innerHTML = renderList({});
      }
    }
  }

  function ensureNav() {
    var nav = document.querySelector(".side .nav");
    if (!nav || nav.querySelector('[data-page="watchlist"]')) return;
    var btn = document.createElement("button");
    btn.setAttribute("data-page", "watchlist");
    btn.innerHTML = "\u2606 <span>Watchlist</span>";
    var research = nav.querySelector('[data-page="research"]');
    if (research) nav.insertBefore(btn, research);
    else nav.appendChild(btn);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === "wlAdd") {
      var sym = ((document.getElementById("wlSymbol") && document.getElementById("wlSymbol").value) || "")
        .trim()
        .toUpperCase();
      if (!sym) return alert("Enter a symbol");
      var name = ((document.getElementById("wlName") && document.getElementById("wlName").value) || "").trim();
      var note = ((document.getElementById("wlNote") && document.getElementById("wlNote").value) || "").trim();
      var arr = load();
      if (arr.some(function (x) { return String(x.symbol).toUpperCase() === sym; })) {
        return alert(sym + " is already on the watchlist");
      }
      arr.push({ id: uid(), symbol: sym, name: name || sym, note: note, addedAt: new Date().toISOString() });
      save(arr);
      show(true);
      return;
    }
    if (t.id === "wlRefreshQuotes") {
      show(true);
      return;
    }
    var del = t.closest && t.closest("[data-wl-del]");
    if (del) {
      if (!confirm("Remove from watchlist?")) return;
      save(load().filter(function (x) { return x.id !== del.getAttribute("data-wl-del"); }));
      show(false);
      return;
    }
    var res = t.closest && t.closest("[data-wl-research]");
    if (res) {
      var sym = res.getAttribute("data-wl-research");
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
    var wbtn = t.closest && t.closest('[data-page="watchlist"]');
    if (wbtn) setTimeout(function () { show(true); }, 20);
  });

  function boot() {
    ensureNav();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  console.log("[watchlist-ui] ready");
})();
