"use strict";
(function () {
  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function getHoldings() {
    try { if (typeof holdings === "function") return holdings() || []; } catch (_) {}
    return [];
  }
  var IDEA_UNIVERSE = [
    "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","BHARTIARTL","ITC","LT","HINDUNILVR",
    "BAJFINANCE","ASIANPAINT","MARUTI","SUNPHARMA","TITAN","WIPRO","AXISBANK","KOTAKBANK","NTPC","POWERGRID"
  ];
  function computeSignal(d) {
    var p = d.price || {}, f = d.financialData || {}, sd = d.summaryDetail || {}, k = d.keyStats || {};
    var score = 0, reasons = [];
    function add(cond, pts, txt) { if (cond) { score += pts; reasons.push(txt); } }
    var roe = Number(f.returnOnEquity), margin = Number(f.profitMargins), rev = Number(f.revenueGrowth);
    var earn = Number(f.earningsGrowth), de = Number(f.debtToEquity), cr = Number(f.currentRatio);
    var fc = Number(f.freeCashflow), pe = Number(sd.trailingPE || k.trailingPE);
    var px = Number(p.regularMarketPrice), m50 = Number(p.fiftyDayAverage), m200 = Number(p.twoHundredDayAverage);
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
    return { score: score, signal: score >= 5 ? "BUY" : score <= 1 ? "SELL" : "HOLD", reasons: reasons.slice(0, 8) };
  }
  function ideasPage() {
    return '<div class="card"><div class="head" style="margin:0 0 10px"><div><h2 style="margin:0">Stock ideas (research-backed)</h2>' +
      '<div class="muted">Same transparent rules as Stock Research. Not personalised advice.</div></div>' +
      '<button class="btn primary" id="ideasRefresh">↻ Run screen</button></div>' +
      '<div class="notice">Click Run screen to score ~20 liquid NSE names (15–30s).</div></div>' +
      '<div id="ideasResult" style="margin-top:12px"><div class="card empty">Click <b>Run screen</b> to start.</div></div>';
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
          return { sym: sym, d: d, sg: computeSignal(d), held: !!held[sym] };
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
  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "ideasRefresh") runIdeas();
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
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (document.querySelector(".side .nav")) {
      clearInterval(t);
      ensureIdeasNav();
    } else if (tries > 80) clearInterval(t);
  }, 150);
})();
