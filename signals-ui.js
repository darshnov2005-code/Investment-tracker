"use strict";
/* Reliable dashboard signals + collapsible portfolio news */
(function () {
  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function money(n) {
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n) || 0);
    } catch (_) {
      return "Rs " + Math.round(Number(n) || 0);
    }
  }
  function pct(n) {
    var v = Number(n) || 0;
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  }
  function fmtIdx(n) {
    if (n == null || !isFinite(n)) return "—";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
  }

  function getHoldings() {
    try {
      if (typeof holdings === "function") return holdings() || [];
    } catch (_) {}
    return [];
  }
  function getTotals() {
    try {
      if (typeof totals === "function") return totals();
    } catch (_) {}
    var h = getHoldings();
    var cost = h.reduce(function (a, x) { return a + (Number(x.cost) || 0); }, 0);
    var value = h.reduce(function (a, x) { return a + (Number(x.value) || 0); }, 0);
    return { h: h, cost: cost, value: value };
  }

  function reviewRows() {
    var t = getTotals();
    var list = (t.h || []).filter(function (x) {
      return x.type === "STOCK" || x.type === "ETF";
    });
    return list.map(function (h) {
      var ret = h.cost ? (h.pnl / h.cost) * 100 : 0;
      var weight = t.value ? (h.value / t.value) * 100 : 0;
      var reasons = [];
      var score = 0;
      if (ret >= 40) { score += 2; reasons.push("Up " + pct(ret) + " from avg cost — consider partial profits"); }
      else if (ret >= 20) { score += 1; reasons.push("Solid unrealised gain " + pct(ret)); }
      else if (ret <= -25) { score -= 2; reasons.push("Down " + pct(ret) + " from cost — review thesis"); }
      else if (ret <= -12) { score -= 1; reasons.push("Mild loss " + pct(ret)); }
      if (weight >= 25) { score -= 1; reasons.push("High concentration " + weight.toFixed(0) + "%"); }
      else if (weight >= 15) reasons.push(weight.toFixed(0) + "% of portfolio");
      try {
        var prev = typeof q !== "undefined" ? Number(q[h.symbol + "_prevClose"]) : NaN;
        if (isFinite(prev) && prev > 0 && h.current > 0) {
          var day = ((h.current - prev) / prev) * 100;
          if (day <= -5) { score -= 1; reasons.push("Sharp day drop " + pct(day)); }
          else if (day >= 5) reasons.push("Strong day move " + pct(day));
        }
      } catch (_) {}
      if (!reasons.length) reasons.push("No strong rule triggered — keep monitoring");
      var action = "HOLD";
      if (score <= -2) action = "REVIEW / CONSIDER EXIT";
      else if (score === -1) action = "WATCH";
      else if (score >= 2) action = "CONSIDER TRIM";
      else if (score === 1) action = "HOLD / TRAIL";
      return { h: h, ret: ret, weight: weight, action: action, score: score, reasons: reasons };
    }).sort(function (a, b) { return a.score - b.score; });
  }

  function reviewHTML() {
    var rows = reviewRows();
    var body;
    if (!rows.length) {
      body = '<div class="muted" style="padding:8px 0">Add stock or ETF holdings to see sell / hold style signals here. Rule-based, not personalised advice.</div>';
    } else {
      body = '<div class="tablewrap"><table class="table"><thead><tr><th>Holding</th><th>P/L</th><th>Weight</th><th>Signal</th><th>Why</th></tr></thead><tbody>' +
        rows.map(function (r) {
          var cls = r.action.indexOf("EXIT") >= 0 || r.action.indexOf("WATCH") >= 0 ? "red" :
            r.action.indexOf("TRIM") >= 0 ? "amber" : "green";
          return '<tr><td><div class="asset">' + esc(r.h.name) + '</div><div class="sub">' + esc(r.h.symbol) + '</div></td>' +
            '<td class="' + (r.ret >= 0 ? "green" : "red") + '">' + money(r.h.pnl) + '<div class="sub">' + pct(r.ret) + '</div></td>' +
            '<td>' + r.weight.toFixed(1) + '%</td>' +
            '<td class="' + cls + '"><b>' + esc(r.action) + '</b></td>' +
            '<td class="muted">' + r.reasons.map(esc).join(" · ") + '</td></tr>';
        }).join("") + '</tbody></table></div>';
    }
    return '<div class="card" data-review-panel="1" style="margin-top:12px">' +
      '<div class="head" style="margin:0 0 8px"><div><h2 style="margin:0">Buy / sell review signals</h2>' +
      '<div class="muted">From your cost, P/L, concentration and day move. Not personalised advice.</div></div></div>' + body + '</div>';
  }

  function indicesCardsHTML(data, loading) {
    if (loading || !(data && data.indices && data.indices.length)) {
      return '<div class="grid three" data-indices-panel="1" style="margin-bottom:12px"><div class="card empty">Loading Nifty / Sensex / Bank Nifty…</div></div>';
    }
    return '<div class="grid three" data-indices-panel="1" style="margin-bottom:12px">' +
      (data.indices || []).map(function (x) {
        var up = x.change != null && x.change >= 0;
        var cls = x.change == null ? "" : (up ? "green" : "red");
        var ch = x.change == null ? "—" :
          ((up ? "+" : "") + fmtIdx(x.change) + " (" + (up ? "+" : "") +
            (x.changePct != null ? x.changePct.toFixed(2) : "—") + "%)");
        return '<div class="card"><div class="label">' + esc(x.label) + '</div><div class="big ' + cls + '">' +
          fmtIdx(x.price) + '</div><div class="sub ' + cls + '">' + ch + '</div><div class="sub">' + esc(x.source || "") + '</div></div>';
      }).join("") + '</div>';
  }

  async function loadIndicesInto(view, force) {
    if (!view) return;
    var existing = view.querySelector("[data-indices-panel]");
    if (existing && !force) return;
    if (!existing) {
      var ph = document.createElement("div");
      ph.innerHTML = indicesCardsHTML(null, true);
      if (ph.firstChild) view.insertBefore(ph.firstChild, view.firstChild);
    } else if (force) {
      existing.outerHTML = indicesCardsHTML(null, true);
    }
    try {
      var r = await fetch("/api/indices?t=" + Date.now());
      var d = await r.json();
      if (!r.ok) throw new Error("fail");
      var panel = view.querySelector("[data-indices-panel]");
      var tmp = document.createElement("div");
      tmp.innerHTML = indicesCardsHTML(d, false);
      if (panel && tmp.firstChild) panel.replaceWith(tmp.firstChild);
    } catch (_) {
      var p = view.querySelector("[data-indices-panel]");
      if (p) p.innerHTML = '<div class="card empty">Could not load indices</div>';
    }
  }

  function injectDashboard() {
    var view = document.getElementById("view");
    var title = (document.getElementById("title") || {}).textContent || "";
    if (!view || title.indexOf("Dashboard") !== 0) return;
    loadIndicesInto(view, false);
    if (!view.querySelector("[data-review-panel]")) {
      var wrap = document.createElement("div");
      wrap.innerHTML = reviewHTML();
      if (wrap.firstChild) view.appendChild(wrap.firstChild);
    }
  }

  function makeNewsCollapsible() {
    var out = document.getElementById("newsPortfolioResult");
    if (!out) return;
    var cards = out.querySelectorAll(".card");
    cards.forEach(function (card, idx) {
      if (card.dataset.collapseReady) return;
      var head = card.querySelector(".head");
      if (!head) return;
      card.dataset.collapseReady = "1";
      var key = "news-collapsed-" + ((card.querySelector(".sub") || {}).textContent || idx).trim();
      var collapsed = false;
      try { collapsed = localStorage.getItem(key) === "1"; } catch (_) {}

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn";
      btn.style.flexShrink = "0";
      btn.textContent = collapsed ? "Show news ▾" : "Hide news ▴";

      var body = document.createElement("div");
      body.className = "news-collapse-body";
      var nodes = [];
      for (var i = 0; i < card.childNodes.length; i++) {
        var n = card.childNodes[i];
        if (n !== head) nodes.push(n);
      }
      nodes.forEach(function (n) { body.appendChild(n); });
      card.appendChild(body);
      if (collapsed) body.style.display = "none";

      head.style.cursor = "pointer";
      head.appendChild(btn);

      function toggle(e) {
        if (e) e.stopPropagation();
        collapsed = !collapsed;
        body.style.display = collapsed ? "none" : "";
        btn.textContent = collapsed ? "Show news ▾" : "Hide news ▴";
        try { localStorage.setItem(key, collapsed ? "1" : "0"); } catch (_) {}
      }
      btn.addEventListener("click", toggle);
      head.addEventListener("click", function (e) {
        if (e.target === btn || btn.contains(e.target)) return;
        toggle(e);
      });
    });
  }

  function ensureIdeasNav() {
    var nav = document.querySelector(".side .nav");
    if (!nav || nav.querySelector('[data-page="ideas"]')) return;
    var btn = document.createElement("button");
    btn.setAttribute("data-page", "ideas");
    btn.innerHTML = "★ <span>Ideas</span>";
    var research = nav.querySelector('[data-page="research"]');
    if (research) research.parentNode.insertBefore(btn, research);
    else nav.appendChild(btn);
  }

  function ideasPage() {
    return '<div class="card"><div class="head" style="margin:0 0 10px"><div><h2 style="margin:0">Stock ideas (research-backed)</h2>' +
      '<div class="muted">Same transparent rules as Stock Research. Not personalised advice.</div></div>' +
      '<button class="btn primary" id="ideasRefresh">↻ Run screen</button></div>' +
      '<div class="notice">Click Run screen to score ~20 liquid NSE names (15–30s).</div></div>' +
      '<div id="ideasResult" style="margin-top:12px"><div class="card empty">Click <b>Run screen</b> to start.</div></div>';
  }

  var IDEA_UNIVERSE = [
    "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","BHARTIARTL","ITC","LT","HINDUNILVR",
    "BAJFINANCE","ASIANPAINT","MARUTI","SUNPHARMA","TITAN","WIPRO","AXISBANK","KOTAKBANK","NTPC","POWERGRID"
  ];

  function computeSignal(d) {
    var p = d.price || {};
    var f = d.financialData || {};
    var sd = d.summaryDetail || {};
    var k = d.keyStats || {};
    var score = 0;
    var reasons = [];
    function add(cond, pts, txt) {
      if (cond) { score += pts; reasons.push(txt); }
    }
    var roe = Number(f.returnOnEquity);
    var margin = Number(f.profitMargins);
    var rev = Number(f.revenueGrowth);
    var earn = Number(f.earningsGrowth);
    var de = Number(f.debtToEquity);
    var cr = Number(f.currentRatio);
    var fc = Number(f.freeCashflow);
    var pe = Number(sd.trailingPE || k.trailingPE);
    var px = Number(p.regularMarketPrice);
    var m50 = Number(p.fiftyDayAverage);
    var m200 = Number(p.twoHundredDayAverage);
    if (isFinite(roe)) { add(roe >= 0.15, 1, "ROE ≥ 15%"); add(roe < 0.08, -1, "ROE < 8%"); }
    if (isFinite(margin)) { add(margin >= 0.10, 1, "Profit margin ≥ 10%"); add(margin < 0.05, -1, "Profit margin < 5%"); }
    if (isFinite(rev)) { add(rev >= 0.10, 1, "Revenue growth ≥ 10%"); add(rev < 0, -1, "Revenue growth is negative"); }
    if (isFinite(earn)) { add(earn >= 0.10, 1, "Earnings growth ≥ 10%"); add(earn < 0, -1, "Earnings growth is negative"); }
    if (isFinite(de)) { add(de <= 75, 1, "Debt/equity ≤ 75%"); add(de > 150, -1, "Debt/equity > 150%"); }
    if (isFinite(cr)) { add(cr >= 1, 1, "Current ratio ≥ 1"); add(cr < 0.75, -1, "Current ratio < 0.75"); }
    if (isFinite(fc)) { add(fc > 0, 1, "Free cash flow positive"); add(fc < 0, -1, "Free cash flow negative"); }
    if (isFinite(pe)) { add(pe > 0 && pe <= 25, 1, "P/E ≤ 25"); add(pe > 40, -1, "P/E > 40"); }
    if (isFinite(px) && isFinite(m50) && isFinite(m200)) {
      add(px > m50 && px > m200, 1, "Price above 50D and 200D");
      add(px < m50 && px < m200, -1, "Price below 50D and 200D");
    }
    return {
      score: score,
      signal: score >= 5 ? "BUY" : score <= 1 ? "SELL" : "HOLD",
      reasons: reasons.slice(0, 8)
    };
  }

  async function runIdeas() {
    var out = document.getElementById("ideasResult");
    if (!out) return;
    out.innerHTML = '<div class="card empty">Screening…</div>';
    var held = {};
    getHoldings().forEach(function (x) {
      if (x.type === "STOCK" || x.type === "ETF") held[String(x.symbol).toUpperCase()] = 1;
    });
    var results = [];
    for (var i = 0; i < IDEA_UNIVERSE.length; i += 4) {
      var batch = IDEA_UNIVERSE.slice(i, i + 4);
      var part = await Promise.all(batch.map(async function (sym) {
        try {
          var r = await fetch("/api/research?symbol=" + encodeURIComponent(sym) + "&exchange=NSE");
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || "fail");
          var sg = computeSignal(d);
          return { sym: sym, d: d, sg: sg, held: !!held[sym] };
        } catch (e) {
          return { sym: sym, d: null, sg: { score: 0, signal: "—", reasons: [e.message || "Unavailable"] }, held: !!held[sym] };
        }
      }));
      results = results.concat(part);
      out.innerHTML = '<div class="card empty">Screened ' + results.length + " / " + IDEA_UNIVERSE.length + "…</div>";
    }
    results.sort(function (a, b) { return (b.sg.score || 0) - (a.sg.score || 0); });
    out.innerHTML = '<div class="tablewrap"><table class="table"><thead><tr><th>Stock</th><th>Signal</th><th>Why</th><th></th></tr></thead><tbody>' +
      results.map(function (x) {
        var name = (x.d && (x.d.name || x.d.symbol)) || x.sym;
        var cls = x.sg.signal === "BUY" ? "green" : x.sg.signal === "SELL" ? "red" : "amber";
        return '<tr><td><div class="asset">' + esc(name) + (x.held ? ' <span class="pill">In portfolio</span>' : "") +
          '</div><div class="sub">' + esc(x.sym) + '</div></td>' +
          '<td class="' + cls + '"><b>' + esc(x.sg.signal) + '</b><div class="sub">Score ' + (x.sg.score || 0) + "</div></td>" +
          '<td class="muted">' + (x.sg.reasons || []).slice(0, 4).map(esc).join(" · ") + "</td>" +
          '<td><button class="btn" data-ideas-research="' + esc(x.sym) + '">Research</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  }

  function onViewChange() {
    var title = (document.getElementById("title") || {}).textContent || "";
    if (title.indexOf("Dashboard") === 0) injectDashboard();
    if (title.indexOf("News") === 0) {
      setTimeout(makeNewsCollapsible, 400);
      setTimeout(makeNewsCollapsible, 1500);
      setTimeout(makeNewsCollapsible, 3000);
    }
  }

  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "ideasRefresh") runIdeas();
    if (e.target && (e.target.id === "refresh" || (e.target.closest && e.target.closest("#refresh")))) {
      var view = document.getElementById("view");
      var title = (document.getElementById("title") || {}).textContent || "";
      if (view && title.indexOf("Dashboard") === 0) {
        loadIndicesInto(view, true);
        var oldRev = view.querySelector("[data-review-panel]");
        if (oldRev) oldRev.remove();
        injectDashboard();
      }
    }
    var res = e.target.closest && e.target.closest("[data-ideas-research]");
    if (res) {
      var sym = res.getAttribute("data-ideas-research");
      var navBtn = document.querySelector('.nav [data-page="research"]');
      if (navBtn) navBtn.click();
      setTimeout(function () {
        var inp = document.getElementById("researchSymbol");
        if (inp) inp.value = sym;
        var run = document.getElementById("researchRun");
        if (run) run.click();
      }, 80);
    }
    var ideasBtn = e.target.closest && e.target.closest('[data-page="ideas"]');
    if (ideasBtn) {
      e.preventDefault();
      e.stopPropagation();
      var titleEl = document.getElementById("title");
      if (titleEl) titleEl.textContent = "Stock Ideas";
      document.querySelectorAll(".nav button").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-page") === "ideas");
      });
      var view = document.getElementById("view");
      if (view) view.innerHTML = ideasPage();
    }
  }, true);

  function start() {
    ensureIdeasNav();
    onViewChange();
    var titleEl = document.getElementById("title");
    var view = document.getElementById("view");
    if (titleEl) {
      new MutationObserver(onViewChange).observe(titleEl, { childList: true, characterData: true, subtree: true });
    }
    if (view) {
      new MutationObserver(function () {
        onViewChange();
        makeNewsCollapsible();
      }).observe(view, { childList: true, subtree: true });
    }
    setInterval(function () {
      var t = (document.getElementById("title") || {}).textContent || "";
      if (t.indexOf("Dashboard") === 0 && !document.querySelector("[data-review-panel]")) injectDashboard();
    }, 2000);
  }

  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (document.getElementById("view") && document.getElementById("title")) {
      clearInterval(t);
      start();
    } else if (tries > 80) clearInterval(t);
  }, 150);
})();
