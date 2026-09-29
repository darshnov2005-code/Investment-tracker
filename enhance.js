"use strict";
/* Portfolio review signals + Ideas page */
(function () {
  function ready(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  var IDEA_UNIVERSE = [
    { symbol: "RELIANCE", name: "Reliance Industries" },
    { symbol: "TCS", name: "TCS" },
    { symbol: "INFY", name: "Infosys" },
    { symbol: "HDFCBANK", name: "HDFC Bank" },
    { symbol: "ICICIBANK", name: "ICICI Bank" },
    { symbol: "SBIN", name: "State Bank of India" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel" },
    { symbol: "ITC", name: "ITC" },
    { symbol: "LT", name: "Larsen & Toubro" },
    { symbol: "HINDUNILVR", name: "Hindustan Unilever" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance" },
    { symbol: "ASIANPAINT", name: "Asian Paints" },
    { symbol: "MARUTI", name: "Maruti Suzuki" },
    { symbol: "SUNPHARMA", name: "Sun Pharma" },
    { symbol: "TITAN", name: "Titan" },
    { symbol: "WIPRO", name: "Wipro" },
    { symbol: "AXISBANK", name: "Axis Bank" },
    { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank" },
    { symbol: "NTPC", name: "NTPC" },
    { symbol: "POWERGRID", name: "Power Grid" }
  ];

  function moneyFmt(n) {
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n) || 0);
    } catch (_) {
      return "Rs " + Math.round(Number(n) || 0);
    }
  }

  function pctFmt(n) {
    var v = Number(n) || 0;
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  }

  function escSafe(x) {
    if (typeof esc === "function") return esc(x);
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }

  function reviewSignals() {
    if (typeof holdings !== "function" || typeof totals !== "function") return [];
    var t = totals();
    var list = (t.h || []).filter(function (x) { return x.type === "STOCK" || x.type === "ETF"; });
    if (!list.length) return [];
    return list.map(function (h) {
      var ret = h.cost ? (h.pnl / h.cost) * 100 : 0;
      var weight = t.value ? (h.value / t.value) * 100 : 0;
      var reasons = [];
      var score = 0;

      if (ret >= 40) { score += 2; reasons.push("Up " + pctFmt(ret) + " from avg cost — consider booking partial profits"); }
      else if (ret >= 20) { score += 1; reasons.push("Solid unrealised gain " + pctFmt(ret)); }
      else if (ret <= -25) { score -= 2; reasons.push("Down " + pctFmt(ret) + " from cost — review thesis"); }
      else if (ret <= -12) { score -= 1; reasons.push("Mild loss " + pctFmt(ret)); }

      if (weight >= 25) { score -= 1; reasons.push("High concentration " + weight.toFixed(0) + "% of portfolio"); }
      else if (weight >= 15) { reasons.push(weight.toFixed(0) + "% of portfolio value"); }

      var prev = typeof q !== "undefined" ? Number(q[h.symbol + "_prevClose"]) : NaN;
      if (isFinite(prev) && prev > 0 && h.current > 0) {
        var day = ((h.current - prev) / prev) * 100;
        if (day <= -5) { score -= 1; reasons.push("Sharp day drop " + pctFmt(day)); }
        else if (day >= 5) { reasons.push("Strong day move " + pctFmt(day)); }
      }

      if (!reasons.length) reasons.push("No strong rule triggered — continue monitoring");

      var action = "HOLD";
      if (score <= -2) action = "REVIEW / CONSIDER EXIT";
      else if (score === -1) action = "WATCH";
      else if (score >= 2) action = "CONSIDER TRIM";
      else if (score === 1) action = "HOLD / TRAIL";

      return { h: h, ret: ret, weight: weight, action: action, score: score, reasons: reasons };
    }).sort(function (a, b) { return a.score - b.score; });
  }

  function reviewHTML() {
    var rows = reviewSignals();
    if (!rows.length) {
      return '<div class="card" style="margin-top:12px"><div class="head" style="margin:0 0 8px"><h2 style="margin:0">Portfolio review signals</h2></div><div class="muted">Add stock/ETF holdings to see sell / hold style review signals. Rule-based, not personalised advice.</div></div>';
    }
    return '<div class="card" style="margin-top:12px"><div class="head" style="margin:0 0 8px"><div><h2 style="margin:0">Portfolio review signals</h2><div class="muted">Rule-based cues from cost, P/L, concentration and day move. Not personalised advice.</div></div></div>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>Holding</th><th>P/L</th><th>Weight</th><th>Signal</th><th>Why</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        var cls = r.action.indexOf("EXIT") >= 0 || r.action.indexOf("WATCH") >= 0 ? "red" : r.action.indexOf("TRIM") >= 0 ? "amber" : "green";
        return '<tr><td><div class="asset">' + escSafe(r.h.name) + '</div><div class="sub">' + escSafe(r.h.symbol) + '</div></td>' +
          '<td class="' + (r.ret >= 0 ? "green" : "red") + '">' + moneyFmt(r.h.pnl) + '<div class="sub">' + pctFmt(r.ret) + '</div></td>' +
          '<td>' + r.weight.toFixed(1) + '%</td>' +
          '<td class="' + cls + '"><b>' + escSafe(r.action) + '</b></td>' +
          '<td class="muted">' + r.reasons.map(escSafe).join(" · ") + '</td>' +
          '<td><button class="btn" data-sell="' + escSafe(r.h.symbol) + '">Sell</button></td></tr>';
      }).join("") +
      '</tbody></table></div></div>';
  }

  function injectReview() {
    var view = document.getElementById("view");
    if (!view) return;
    var title = (document.getElementById("title") || {}).textContent || "";
    if (title.indexOf("Dashboard") !== 0) return;
    if (view.querySelector("[data-review-panel]")) return;
    var wrap = document.createElement("div");
    wrap.setAttribute("data-review-panel", "1");
    wrap.innerHTML = reviewHTML();
    view.appendChild(wrap);
  }

  function ideasPageHTML() {
    return '<div class="card"><div class="head" style="margin:0 0 10px"><div><h2 style="margin:0">Stock ideas (research-backed)</h2><div class="muted">Screened liquid NSE names using the same transparent rules as Stock Research. Not personalised advice.</div></div><button class="btn primary" id="ideasRefresh">↻ Run screen</button></div>' +
      '<div class="notice">Scores use ROE, margins, growth, leverage, cash flow and moving averages when available.</div></div>' +
      '<div id="ideasResult" style="margin-top:12px"><div class="card empty">Click <b>Run screen</b> to fetch research (takes ~15–30s).</div></div>';
  }

  async function runIdeasScreen() {
    var out = document.getElementById("ideasResult");
    if (!out) return;
    out.innerHTML = '<div class="card empty">Screening ' + IDEA_UNIVERSE.length + ' names…</div>';
    var held = {};
    try {
      holdings().filter(function (x) { return x.type === "STOCK" || x.type === "ETF"; }).forEach(function (x) { held[String(x.symbol).toUpperCase()] = 1; });
    } catch (_) {}

    var results = [];
    for (var i = 0; i < IDEA_UNIVERSE.length; i += 4) {
      var batch = IDEA_UNIVERSE.slice(i, i + 4);
      var part = await Promise.all(batch.map(async function (it) {
        try {
          var r = await fetch("/api/research?symbol=" + encodeURIComponent(it.symbol) + "&exchange=NSE");
          var d = await r.json();
          if (!r.ok) throw new Error(d.error || "fail");
          var sg = typeof signal === "function" ? signal(d) : { score: 0, signal: "HOLD", reasons: [] };
          return { it: it, d: d, sg: sg, held: !!held[it.symbol] };
        } catch (e) {
          return { it: it, d: null, sg: { score: 0, signal: "—", reasons: [e.message || "Unavailable"] }, held: !!held[it.symbol] };
        }
      }));
      results = results.concat(part);
      out.innerHTML = '<div class="card empty">Screened ' + results.length + ' / ' + IDEA_UNIVERSE.length + '…</div>';
    }

    results.sort(function (a, b) { return (b.sg.score || 0) - (a.sg.score || 0); });
    var buys = results.filter(function (x) { return x.sg.signal === "BUY"; }).length;
    var holds = results.filter(function (x) { return x.sg.signal === "HOLD"; }).length;
    var sells = results.filter(function (x) { return x.sg.signal === "SELL"; }).length;

    out.innerHTML =
      '<div class="grid three" style="margin-bottom:12px">' +
      '<div class="card"><div class="label">BUY signals</div><div class="big green">' + buys + '</div></div>' +
      '<div class="card"><div class="label">HOLD</div><div class="big amber">' + holds + '</div></div>' +
      '<div class="card"><div class="label">SELL / weak</div><div class="big red">' + sells + '</div></div></div>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>Stock</th><th>Signal</th><th>Why</th><th></th></tr></thead><tbody>' +
      results.map(function (x) {
        var name = (x.d && (x.d.name || x.d.symbol)) || x.it.name;
        var cls = x.sg.signal === "BUY" ? "green" : x.sg.signal === "SELL" ? "red" : "amber";
        return '<tr><td><div class="asset">' + escSafe(name) + (x.held ? ' <span class="pill">In portfolio</span>' : '') + '</div><div class="sub">' + escSafe(x.it.symbol) + ' · NSE</div></td>' +
          '<td class="' + cls + '"><b>' + escSafe(x.sg.signal) + '</b><div class="sub">Score ' + (x.sg.score || 0) + '</div></td>' +
          '<td class="muted">' + (x.sg.reasons || []).slice(0, 4).map(escSafe).join(" · ") + '</td>' +
          '<td><button class="btn" data-ideas-research="' + escSafe(x.it.symbol) + '">Research</button> ' +
          (x.held ? '' : '<button class="btn primary" data-buy="' + escSafe(x.it.symbol) + '">Add</button>') +
          '</td></tr>';
      }).join("") +
      '</tbody></table></div>';
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

  function patchRender() {
    if (typeof render !== "function" || render.__enhanced) return;
    var orig = render;
    window.render = function () {
      if (typeof page !== "undefined" && page === "ideas") {
        var titleEl = document.getElementById("title");
        if (titleEl) titleEl.textContent = "Stock Ideas";
        document.querySelectorAll(".nav button,[data-page]").forEach(function (b) {
          if (b.dataset && b.dataset.page) b.classList.toggle("active", b.dataset.page === "ideas");
        });
        var view = document.getElementById("view");
        if (view) view.innerHTML = ideasPageHTML();
        return;
      }
      orig.apply(this, arguments);
      try { injectReview(); } catch (_) {}
    };
    window.render.__enhanced = true;
  }

  function wireClicks() {
    document.addEventListener("click", function (e) {
      if (e.target && e.target.id === "ideasRefresh") {
        runIdeasScreen();
        return;
      }
      var res = e.target.closest("[data-ideas-research]");
      if (res) {
        page = "research";
        render();
        setTimeout(function () {
          var inp = document.getElementById("researchSymbol");
          if (inp) inp.value = res.getAttribute("data-ideas-research");
          var run = document.getElementById("researchRun");
          if (run) run.click();
        }, 50);
      }
    });
  }

  ready(function () {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (typeof render === "function" && typeof holdings === "function") {
        clearInterval(t);
        ensureIdeasNav();
        patchRender();
        wireClicks();
        try { injectReview(); } catch (_) {}
      } else if (tries > 50) clearInterval(t);
    }, 200);
  });
})();
