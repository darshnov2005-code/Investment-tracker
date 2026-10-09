"use strict";
(function () {
  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "\u2014";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: d == null ? 2 : d }).format(n);
  }
  function pctLab(pct) {
    if (pct == null || !isFinite(pct)) return "\u2014";
    return (pct >= 0 ? "+" : "") + fmt(pct, 2) + "%";
  }
  function pctCls(pct) {
    if (pct == null || !isFinite(pct)) return "muted";
    return pct >= 0 ? "green" : "red";
  }
  function getState() {
    try {
      return JSON.parse(localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3") || "null");
    } catch (e) {
      return null;
    }
  }
  function buildRows() {
    var st = getState();
    if (!st) return [];
    var quotes = {};
    try {
      quotes = JSON.parse(localStorage.getItem("investtrack-quotes") || "{}") || {};
    } catch (e) {}
    var qty = {}, cost = {}, meta = {};
    (st.transactions || []).slice().sort(function (a, b) {
      return String(a.date || "").localeCompare(String(b.date || ""));
    }).forEach(function (t) {
      if (!t || !t.symbol || t.type === "MUTUAL_FUND") return;
      var k = String(t.symbol).toUpperCase();
      var q = Number(t.qty) || 0;
      var px = Number(t.price) || 0;
      if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) {
        cost[k] = (cost[k] || 0) + q * px;
        qty[k] = (qty[k] || 0) + q;
        meta[k] = { name: t.name || k };
      } else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) {
        var have = qty[k] || 0;
        if (have <= 0) return;
        var take = Math.min(q, have);
        var avg = have > 0 ? (cost[k] || 0) / have : 0;
        qty[k] = have - take;
        cost[k] = (cost[k] || 0) - take * avg;
      }
    });
    var rows = [];
    Object.keys(qty).forEach(function (k) {
      if ((qty[k] || 0) <= 1e-8) return;
      var avg = (cost[k] || 0) / qty[k];
      var px = Number(quotes[k]) || 0;
      var pnlPct = avg > 0 && px > 0 ? ((px - avg) / avg) * 100 : null;
      var signal = "Hold";
      if (pnlPct != null) {
        if (pnlPct <= -12) signal = "Review add";
        else if (pnlPct >= 25) signal = "Review book";
        else if (pnlPct >= 10) signal = "Trail";
      }
      rows.push({ symbol: k, name: (meta[k] && meta[k].name) || k, avg: avg, price: px || null, pnlPct: pnlPct, signal: signal });
    });
    rows.sort(function (a, b) { return (a.pnlPct ?? 0) - (b.pnlPct ?? 0); });
    return rows;
  }
  function inject() {
    var view = document.getElementById("view");
    if (!view) return;
    var h2 = view.querySelector("h2");
    if (!h2 || !/weekly review/i.test(h2.textContent || "")) return;
    if (view.querySelector("#wr-signals")) return;
    var wrap = view.querySelector(".wr-wrap") || view;
    var rows = buildRows();
    var body = !rows.length
      ? '<div class="wr-empty">No stock/ETF holdings for signals.</div>'
      : '<div class="tablewrap"><table class="table"><thead><tr><th>Name</th><th>Avg</th><th>LTP*</th><th>P/L %</th><th>Signal</th></tr></thead><tbody>' +
        rows.slice(0, 40).map(function (r) {
          return "<tr><td><div class=\"asset\" style=\"font-weight:600\">" + esc(r.name) + '</div><div class="sub">' + esc(r.symbol) +
            "</div></td><td>" + fmt(r.avg, 2) + "</td><td>" + (r.price != null ? fmt(r.price, 2) : "\u2014") +
            '</td><td class="' + pctCls(r.pnlPct) + '"><b>' + pctLab(r.pnlPct) + "</b></td><td><span class=\"pill\">" + esc(r.signal) + "</span></td></tr>";
        }).join("") +
        '</tbody></table></div><div class="muted" style="margin-top:8px;font-size:11px">*LTP from last refreshed quotes. Rules: \u2264\u221212% review add, \u2265+25% review book \u2014 not advice.</div>';
    var sec = document.createElement("section");
    sec.id = "wr-signals";
    sec.style.cssText = "border:1px solid var(--line);border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.02);margin-top:12px";
    sec.innerHTML = '<div style="padding:14px 16px;background:rgba(0,0,0,0.22);border-bottom:1px solid var(--line)"><h3 style="margin:0;font-size:16px">\u2691 Buy / sell signals</h3><div class="muted" style="font-size:12px;margin-top:3px">From former Review page \u2014 stocks & ETFs</div></div><div style="padding:14px 16px">' + body + "</div>";
    var activity = null;
    wrap.querySelectorAll("section, .wr-section").forEach(function (s) {
      if (/activity this week/i.test(s.textContent || "")) activity = s;
    });
    if (activity && activity.parentNode) activity.parentNode.insertBefore(sec, activity);
    else wrap.appendChild(sec);
  }
  function boot() {
    inject();
    var view = document.getElementById("view");
    if (view && !view.__wrSigObs) {
      view.__wrSigObs = true;
      new MutationObserver(function () { inject(); }).observe(view, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 800);
  setTimeout(boot, 2000);
  console.log("[weekly-signals] ready");
})();
