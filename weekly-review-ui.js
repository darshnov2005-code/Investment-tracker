"use strict";
/**
 * Weekly portfolio review — stocks/ETFs + mutual funds in separate emoji sections.
 */
(function () {
  var NOTES_KEY = "investtrack-notes-v1";
  var CACHE_KEY = "investtrack-weekly-review-v1";

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "\u2014";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: d == null ? 2 : d }).format(n);
  }
  function money(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    var sign = n < 0 ? "-" : n > 0 ? "+" : "";
    return sign + "\u20b9" + fmt(Math.abs(n), 0);
  }
  function pctLab(pct) {
    if (pct == null || !isFinite(pct)) return "\u2014";
    return (pct >= 0 ? "+" : "") + fmt(pct, 2) + "%";
  }
  function pctCls(pct) {
    if (pct == null || !isFinite(pct)) return "muted";
    return pct >= 0 ? "green" : "red";
  }

  function weekRange() {
    var now = new Date();
    var day = now.getDay();
    var mon = new Date(now);
    mon.setHours(0, 0, 0, 0);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    function iso(d) { return d.toISOString().slice(0, 10); }
    return { from: iso(mon), to: iso(sun), label: iso(mon) + " \u2192 " + iso(sun) };
  }

  function getState() {
    try {
      return JSON.parse(localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3") || "null");
    } catch (e) { return null; }
  }

  function netHoldings(st, types) {
    var qty = {}, meta = {};
    (st.transactions || []).forEach(function (t) {
      if (!t || !t.symbol) return;
      if (types.indexOf(t.type) < 0) return;
      var k = String(t.symbol).toUpperCase();
      var q = Number(t.qty) || 0;
      if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) + q;
      else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) - q;
      meta[k] = { name: t.name || k, type: t.type, symbolRaw: t.symbol };
    });
    return Object.keys(qty).filter(function (k) { return qty[k] > 1e-8; }).map(function (k) {
      return { symbol: k, symbolRaw: (meta[k] && meta[k].symbolRaw) || k, qty: qty[k], name: (meta[k] && meta[k].name) || k, type: (meta[k] && meta[k].type) || types[0] };
    }).sort(function (a, b) { return a.symbol.localeCompare(b.symbol); });
  }

  function txsThisWeek(st, range) {
    return (st.transactions || []).filter(function (t) {
      return t && t.date && t.date >= range.from && t.date <= range.to;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  }

  var CSS = "<style>" +
    ".wr-wrap{display:flex;flex-direction:column;gap:16px}" +
    ".wr-section{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.02)}" +
    ".wr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:rgba(0,0,0,0.22);border-bottom:1px solid var(--line)}" +
    ".wr-head h3{margin:0;font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}" +
    ".wr-head .wr-sub{font-size:12px;color:var(--muted);margin-top:3px}" +
    ".wr-body{padding:14px 16px}" +
    ".wr-kpi{font-size:26px;font-weight:800;letter-spacing:-0.02em;line-height:1.15}" +
    ".wr-chip{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.06);border:1px solid var(--line);margin:2px}" +
    ".wr-empty{padding:18px;text-align:center;color:var(--muted);font-size:13px}" +
    "</style>";

  function section(emoji, title, subtitle, rightHtml, bodyHtml) {
    return '<section class="wr-section"><div class="wr-head"><div><h3><span aria-hidden="true">' + emoji + "</span> " + esc(title) +
      '</h3><div class="wr-sub">' + esc(subtitle || "") + "</div></div>" + (rightHtml ? "<div>" + rightHtml + "</div>" : "") +
      '</div><div class="wr-body">' + bodyHtml + "</div></section>";
  }

  function moveRows(holds, moves) {
    return holds.map(function (h) {
      var m = moves[h.symbol] || moves[String(h.symbolRaw || "").toUpperCase()] || moves[h.symbolRaw] || {};
      var est = m.price != null && m.weekStartPrice != null ? h.qty * (m.price - m.weekStartPrice) : null;
      return { symbol: h.symbol, name: m.name || h.name, qty: h.qty, pct: m.changePct, price: m.price, weekStart: m.weekStartPrice, est: est, error: m.error };
    }).sort(function (a, b) { return (b.pct ?? -999) - (a.pct ?? -999); });
  }

  function sumEst(rows) {
    return rows.reduce(function (a, r) { return a + (r.est || 0); }, 0);
  }

  function bits(rows) {
    var withPct = rows.filter(function (r) { return r.pct != null; });
    var top = withPct.slice(0, 3);
    var bot = withPct.slice().reverse().slice(0, 3);
    function line(arr) {
      if (!arr.length) return "\u2014";
      return arr.map(function (r) {
        var s = r.symbol.length > 16 ? r.symbol.slice(0, 14) + "\u2026" : r.symbol;
        return '<span class="wr-chip">' + esc(s) + ' <b class="' + pctCls(r.pct) + '">' + pctLab(r.pct) + "</b></span>";
      }).join(" ");
    }
    return '<div style="font-size:13px"><div style="margin-bottom:8px"><span class="muted">\uD83D\uDE80 Leaders</span><div style="margin-top:6px">' + line(top) +
      '</div></div><div><span class="muted">\uD83D\uDCC9 Laggards</span><div style="margin-top:6px">' + line(bot) + "</div></div></div>";
  }

  function tableHtml(rows, priceLabel) {
    if (!rows.length) return '<div class="wr-empty">Nothing in this sleeve yet.</div>';
    return '<div class="tablewrap"><table class="table"><thead><tr><th>Name</th><th>Units</th><th>Week %</th><th>' + esc(priceLabel) +
      "</th><th>Week start</th><th>Est. \u20b9</th></tr></thead><tbody>" +
      rows.map(function (r) {
        return "<tr><td><div class=\"asset\" style=\"font-weight:600\">" + esc(r.name) + '</div><div class="sub">' + esc(r.symbol) +
          (r.error ? " \u00b7 " + esc(r.error) : "") + "</div></td><td>" + fmt(r.qty, 4) + '</td><td class="' + pctCls(r.pct) + '"><b>' + pctLab(r.pct) +
          "</b></td><td>" + (r.price != null ? fmt(r.price, 2) : "\u2014") + "</td><td>" + (r.weekStart != null ? fmt(r.weekStart, 2) : "\u2014") +
          '</td><td class="' + pctCls(r.est) + '"><b>' + money(r.est) + "</b></td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function pageShell(inner) {
    var range = weekRange();
    return CSS +
      '<div class="card" style="margin-bottom:14px"><div class="head" style="margin:0"><div>' +
      '<h2 style="margin:0;font-size:22px;font-weight:800">\uD83D\uDCC5 Weekly portfolio review</h2>' +
      '<div class="muted" style="margin-top:4px;font-size:13px">Week <b>' + esc(range.label) +
      "</b> \u00b7 scroll for \uD83D\uDCCA stocks then \uD83D\uDCC8 mutual funds</div></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn primary" id="wrRun">\uD83D\uDD04 Run review</button>' +
      '<button type="button" class="btn" id="wrSaveNote">\uD83D\uDCBE Save to Notes</button></div></div>' +
      '<div class="notice" style="margin-top:12px">\uD83D\uDCCA Stocks \u2248 last 5 sessions \u00b7 \uD83D\uDCC8 MF NAV \u2248 ~7 days (mfapi). Est. \u20b9 = units \u00d7 change.</div></div>' +
      '<div id="wrBody" class="wr-wrap">' + inner + "</div>";
  }

  function render(data) {
    var stockRows = moveRows(data.stocks || [], data.stockMoves || {});
    var mfRows = moveRows(data.mfs || [], data.mfMoves || {});
    var stockEst = sumEst(stockRows);
    var mfEst = sumEst(mfRows);
    var totalEst = stockEst + mfEst;
    var txs = data.txs || [];
    var range = data.range;

    var overview = section("\u2728", "Week at a glance", "Combined estimate for stocks/ETFs + mutual funds",
      '<span class="wr-chip">' + esc(range.label) + "</span>",
      '<div class="grid three">' +
        '<div><div class="muted" style="font-size:12px;font-weight:600">\uD83D\uDCE6 TOTAL EST.</div><div class="wr-kpi ' + pctCls(totalEst) + '">' + money(totalEst) + "</div></div>" +
        '<div><div class="muted" style="font-size:12px;font-weight:600">\uD83D\uDCCA STOCKS & ETFs</div><div class="wr-kpi ' + pctCls(stockEst) + '" style="font-size:22px">' + money(stockEst) + "</div></div>" +
        '<div><div class="muted" style="font-size:12px;font-weight:600">\uD83D\uDCC8 MUTUAL FUNDS</div><div class="wr-kpi ' + pctCls(mfEst) + '" style="font-size:22px">' + money(mfEst) + "</div></div></div>");

    var stocksSec = section("\uD83D\uDCCA", "Stocks & ETFs", "Exchange prices \u00b7 ~5 trading sessions",
      stockRows.length ? '<span class="wr-chip">' + stockRows.length + " holdings</span>" : "",
      bits(stockRows) + '<div style="margin-top:14px">' + tableHtml(stockRows, "Price") + "</div>");

    var mfSec = section("\uD83D\uDCC8", "Mutual funds", "NAV week change \u2014 separate from stocks",
      mfRows.length ? '<span class="wr-chip">' + mfRows.length + " schemes</span>" : "",
      !mfRows.length
        ? '<div class="wr-empty">No mutual fund holdings found. Log SIP/MF buys to see this section fill up.</div>'
        : bits(mfRows) + '<div style="margin-top:14px">' + tableHtml(mfRows, "NAV") + "</div>");

    var txBody;
    if (!txs.length) {
      txBody = '<div class="wr-empty">No buys/sells/SIPs between ' + esc(range.from) + " and " + esc(range.to) + ".</div>";
    } else {
      txBody = '<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Action</th><th>Asset</th><th>Qty</th><th>Price/NAV</th></tr></thead><tbody>' +
        txs.map(function (t) {
          var emoji = t.action === "SIP" ? "\uD83D\uDD01" : t.action === "BUY" ? "\uD83D\uDFE2" : (t.action === "SELL" || t.action === "REDEMPTION") ? "\uD83D\uDD34" : "\u2022";
          return "<tr><td>" + esc(t.date) + "</td><td>" + emoji + ' <span class="pill">' + esc(t.action) + "</span></td><td><div class=\"asset\" style=\"font-weight:600\">" +
            esc(t.name || t.symbol) + '</div><div class="sub">' + esc(t.type || "") + " \u00b7 " + esc(t.symbol) + "</div></td><td>" +
            fmt(t.qty, 4) + "</td><td>" + fmt(t.price, 2) + "</td></tr>";
        }).join("") + "</tbody></table></div>";
    }
    var activitySec = section("\uD83E\uDDFE", "Activity this week", "What you recorded in the ledger",
      '<span class="wr-chip">' + txs.length + " txn</span>", txBody);

    return overview + stocksSec + mfSec + activitySec;
  }

  function buildNoteText(data) {
    var stockRows = moveRows(data.stocks || [], data.stockMoves || {});
    var mfRows = moveRows(data.mfs || [], data.mfMoves || {});
    var range = data.range;
    var lines = ["\uD83D\uDCC5 Weekly portfolio review (" + range.label + ")", "",
      "\u2728 Total est. MTM: " + money(sumEst(stockRows) + sumEst(mfRows)),
      "\uD83D\uDCCA Stocks/ETFs: " + money(sumEst(stockRows)),
      "\uD83D\uDCC8 Mutual funds: " + money(sumEst(mfRows)), "", "\uD83D\uDCCA Stock leaders:"];
    stockRows.filter(function (r) { return r.pct != null; }).slice(0, 5).forEach(function (r) {
      lines.push("- " + r.symbol + ": " + pctLab(r.pct) + " \u00b7 " + money(r.est));
    });
    lines.push("", "\uD83D\uDCC8 MF leaders:");
    mfRows.filter(function (r) { return r.pct != null; }).slice(0, 5).forEach(function (r) {
      lines.push("- " + String(r.name || r.symbol).slice(0, 48) + ": " + pctLab(r.pct) + " \u00b7 " + money(r.est));
    });
    var txs = data.txs || [];
    lines.push("", "\uD83E\uDDFE Activity: " + txs.length + " transaction(s)");
    txs.slice(0, 12).forEach(function (t) { lines.push("- " + t.date + " " + t.action + " " + (t.symbol || t.name)); });
    lines.push("", "\u270d\ufe0f My takeaways:", "- ");
    return lines.join("\n");
  }

  async function fetchMoves(url) {
    var r = await fetch(url);
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    var map = {};
    (d.items || []).forEach(function (it) {
      if (it.symbol) map[String(it.symbol).toUpperCase()] = it;
      if (it.matchedCode) map[String(it.matchedCode).toUpperCase()] = it;
    });
    return map;
  }

  async function runReview() {
    var body = document.getElementById("wrBody");
    if (body) body.innerHTML = '<div class="wr-section"><div class="wr-empty">\u23f3 Loading \uD83D\uDCCA stocks, \uD83D\uDCC8 mutual funds, and \uD83E\uDDFE activity\u2026</div></div>';
    var st = getState();
    if (!st) {
      if (body) body.innerHTML = '<div class="wr-section"><div class="wr-empty">No portfolio data in this browser.</div></div>';
      return;
    }
    var range = weekRange();
    var stocks = netHoldings(st, ["STOCK", "ETF"]);
    var mfs = netHoldings(st, ["MUTUAL_FUND"]);
    var txs = txsThisWeek(st, range);
    var stockMoves = {}, mfMoves = {};
    try {
      if (stocks.length) {
        stockMoves = await fetchMoves("/api/week-performance?symbols=" + encodeURIComponent(stocks.map(function (h) { return h.symbol; }).slice(0, 25).join(",")) + "&t=" + Date.now());
      }
    } catch (e) { console.warn("stock week", e); }
    try {
      if (mfs.length) {
        mfMoves = await fetchMoves("/api/mf-week?symbols=" + encodeURIComponent(mfs.map(function (h) { return h.symbolRaw || h.symbol; }).slice(0, 20).join(",")) + "&t=" + Date.now());
      }
    } catch (e) { console.warn("mf week", e); }
    var data = { stocks: stocks, mfs: mfs, stockMoves: stockMoves, mfMoves: mfMoves, txs: txs, range: range, ranAt: Date.now() };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
    window.__weeklyReviewData = data;
    if (body) body.innerHTML = render(data);
  }

  function saveToNotes() {
    var data = window.__weeklyReviewData;
    if (!data) return alert("Run the review first.");
    var notes = [];
    try { notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]"); if (!Array.isArray(notes)) notes = []; } catch (e) { notes = []; }
    notes.push({ id: "n-" + Date.now(), url: "", note: buildNoteText(data), tags: "weekly,portfolio", createdAt: new Date().toISOString() });
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    alert("Saved to Notes (tags: weekly, portfolio).");
  }

  function show() {
    var view = document.getElementById("view");
    if (!view) return;
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Weekly review";
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "weekly");
    });
    view.innerHTML = pageShell('<div class="wr-section"><div class="wr-empty">Click <b>\uD83D\uDD04 Run review</b>.</div></div>');
    setTimeout(runReview, 40);
  }

  function ensureNav() {
    var nav = document.querySelector(".side .nav");
    if (!nav) return;
    var existing = nav.querySelector('[data-page="weekly"]');
    if (existing) {
      existing.innerHTML = "\uD83D\uDCC5 <span>Weekly review</span>";
      return;
    }
    var btn = document.createElement("button");
    btn.setAttribute("data-page", "weekly");
    btn.innerHTML = "\uD83D\uDCC5 <span>Weekly review</span>";
    var notes = nav.querySelector('[data-page="notes"]');
    if (notes) nav.insertBefore(btn, notes);
    else {
      var research = nav.querySelector('[data-page="research"]');
      if (research) nav.insertBefore(btn, research);
      else nav.appendChild(btn);
    }
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === "wrRun") { runReview(); return; }
    if (t.id === "wrSaveNote") { saveToNotes(); return; }
    var btn = t.closest && t.closest('[data-page="weekly"]');
    if (btn) setTimeout(show, 20);
  });

  function boot() { ensureNav(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  console.log("[weekly-review-ui] ready v3 MF+sections");
})();
