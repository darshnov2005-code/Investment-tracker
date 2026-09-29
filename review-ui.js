"use strict";
/* Buy/sell review as its own page (not on Dashboard) */
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
    return {
      h: h,
      cost: h.reduce(function (a, x) { return a + (Number(x.cost) || 0); }, 0),
      value: h.reduce(function (a, x) { return a + (Number(x.value) || 0); }, 0)
    };
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

  function reviewPageHTML() {
    var rows = reviewRows();
    var body;
    if (!rows.length) {
      body = '<div class="card empty">Add stock or ETF holdings to see sell / hold style signals. Rule-based, not personalised advice.</div>';
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
    return '<div class="card"><div class="head" style="margin:0 0 10px"><div><h2 style="margin:0">Buy / sell review</h2>' +
      '<div class="muted">From your cost, P/L, concentration and day move. Not personalised advice.</div></div>' +
      '<button class="btn" id="reviewRefresh">↻ Refresh signals</button></div>' +
      '<div class="notice">Signals update after quote refresh. Use ↻ Refresh quotes on the top bar first if prices look stale.</div></div>' +
      '<div style="margin-top:12px">' + body + '</div>';
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

  function ensureNav() {
    var nav = document.querySelector(".side .nav");
    if (!nav || nav.querySelector('[data-page="review"]')) return;
    var btn = document.createElement("button");
    btn.setAttribute("data-page", "review");
    btn.innerHTML = "⚑ <span>Review</span>";
    var hold = nav.querySelector('[data-page="holdings"]');
    if (hold && hold.nextSibling) hold.parentNode.insertBefore(btn, hold.nextSibling);
    else nav.appendChild(btn);
  }

  function showReviewPage() {
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Buy / sell review";
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "review");
    });
    var view = document.getElementById("view");
    if (view) view.innerHTML = reviewPageHTML();
  }

  function onDashboard() {
    var view = document.getElementById("view");
    var title = (document.getElementById("title") || {}).textContent || "";
    if (!view || title.indexOf("Dashboard") !== 0) return;
    view.querySelectorAll("[data-review-panel],[data-movers-panel]").forEach(function (el) { el.remove(); });
    loadIndicesInto(view, false);
  }

  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "reviewRefresh") {
      showReviewPage();
      return;
    }
    if (e.target && (e.target.id === "refresh" || (e.target.closest && e.target.closest("#refresh")))) {
      var view = document.getElementById("view");
      var title = (document.getElementById("title") || {}).textContent || "";
      if (view && title.indexOf("Dashboard") === 0) loadIndicesInto(view, true);
    }
    var rev = e.target.closest && e.target.closest('[data-page="review"]');
    if (rev) {
      e.preventDefault();
      e.stopPropagation();
      showReviewPage();
    }
  }, true);

  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (document.getElementById("view") && document.getElementById("title")) {
      clearInterval(t);
      ensureNav();
      onDashboard();
      var titleEl = document.getElementById("title");
      if (titleEl) {
        new MutationObserver(function () {
          var title = titleEl.textContent || "";
          if (title.indexOf("Dashboard") === 0) onDashboard();
        }).observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
    } else if (tries > 80) clearInterval(t);
  }, 150);
})();
