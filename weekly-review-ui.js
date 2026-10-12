"use strict";
/**
 * Weekly portfolio review — stocks + MF.
 * Week P/L lot-aware: baseline = buy price or week-start price, whichever applies later.
 */
(function () {
  var CACHE = "investtrack-weekly-review-v2";

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function money(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    var sign = n < 0 ? "-" : n > 0 ? "+" : "";
    return sign + "\u20b9" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "\u2014";
    return Number(n).toLocaleString("en-IN", { maximumFractionDigits: d == null ? 2 : d });
  }
  function pctLab(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    return (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%";
  }
  function pctCls(n) {
    if (n == null || !isFinite(n)) return "muted";
    return n >= 0 ? "green" : "red";
  }

  function weekRange() {
    var now = new Date();
    var day = now.getDay();
    var diffToMon = day === 0 ? -6 : 1 - day;
    var mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon);
    mon.setHours(0, 0, 0, 0);
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    function iso(d) {
      return d.toISOString().slice(0, 10);
    }
    return { from: iso(mon), to: iso(sun), label: iso(mon) + " \u2192 " + iso(sun) };
  }

  function getState() {
    try {
      var raw = localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function injectCss() {
    if (document.getElementById("wr-css")) return;
    var s = document.createElement("style");
    s.id = "wr-css";
    s.textContent =
      ".wr-wrap{display:grid;gap:16px}" +
      ".wr-section{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:rgba(255,255,255,0.02)}" +
      ".wr-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:rgba(0,0,0,0.22);border-bottom:1px solid var(--line)}" +
      ".wr-head h3{margin:0;font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px}" +
      ".wr-head .wr-sub{font-size:12px;color:var(--muted);margin-top:3px}" +
      ".wr-body{padding:14px 16px}" +
      ".wr-kpi{font-size:26px;font-weight:800;letter-spacing:-0.02em;line-height:1.15}" +
      ".wr-chip{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.06);border:1px solid var(--line);margin:2px}" +
      ".wr-empty{padding:18px;text-align:center;color:var(--muted);font-size:13px}";
    document.head.appendChild(s);
  }

  function section(emoji, title, subtitle, rightHtml, bodyHtml) {
    return (
      '<section class="wr-section"><div class="wr-head"><div><h3><span aria-hidden="true">' +
      emoji +
      "</span> " +
      esc(title) +
      '</h3><div class="wr-sub">' +
      esc(subtitle || "") +
      "</div></div>" +
      (rightHtml ? "<div>" + rightHtml + "</div>" : "") +
      '</div><div class="wr-body">' +
      bodyHtml +
      "</div></section>"
    );
  }

  function normSym(s) {
    return String(s || "")
      .toUpperCase()
      .replace(/\.NS$/i, "")
      .replace(/\.BO$/i, "")
      .replace(/\.NSE$/i, "")
      .replace(/\.BSE$/i, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function normDate(d) {
    if (!d) return "";
    var s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      var dd = ("0" + m[1]).slice(-2);
      var mm = ("0" + m[2]).slice(-2);
      return m[3] + "-" + mm + "-" + dd;
    }
    var t = Date.parse(s);
    if (isFinite(t)) {
      var dt = new Date(t);
      var y = dt.getFullYear();
      var mo = ("0" + (dt.getMonth() + 1)).slice(-2);
      var day = ("0" + dt.getDate()).slice(-2);
      return y + "-" + mo + "-" + day;
    }
    return s.slice(0, 10);
  }

  function openLots(st, symbolKey) {
    var key = normSym(symbolKey);
    var lots = [];
    (st.transactions || [])
      .slice()
      .sort(function (a, b) {
        return normDate(a.date).localeCompare(normDate(b.date));
      })
      .forEach(function (t) {
        if (!t) return;
        if (normSym(t.symbol) !== key && normSym(t.symbolRaw || "") !== key) return;
        var q = Number(t.qty) || 0;
        var px = Number(t.price) || 0;
        if (q <= 0) return;
        var action = String(t.action || "").toUpperCase();
        if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(action) >= 0) {
          lots.push({ qty: q, price: px > 0 ? px : null, date: normDate(t.date) });
        } else if (["SELL", "REDEMPTION"].indexOf(action) >= 0) {
          var left = q;
          while (left > 1e-12 && lots.length) {
            var lot = lots[0];
            var take = Math.min(lot.qty, left);
            lot.qty -= take;
            left -= take;
            if (lot.qty <= 1e-12) lots.shift();
          }
        }
      });
    return lots.filter(function (l) {
      return l.qty > 1e-12;
    });
  }

  function weekPnLForHolding(st, h, range, m) {
    var price = m.price;
    var marketWeekStart = m.weekStartPrice;
    if (price == null || !isFinite(price)) {
      return { est: null, pct: null, weekStart: marketWeekStart, error: m.error };
    }
    var from = normDate(range.from);
    var to = normDate(range.to);
    var lots = openLots(st, h.symbol);
    if (!lots.length && h.symbolRaw) lots = openLots(st, h.symbolRaw);
    if (!lots.length && m.symbol) lots = openLots(st, m.symbol);

    if (!lots.length) {
      var avg = Number(h.avg) || Number(h.avgCost) || null;
      var baseline =
        marketWeekStart != null && isFinite(marketWeekStart) ? marketWeekStart : avg;
      var est0 =
        baseline != null && isFinite(baseline) ? Number(h.qty) * (price - baseline) : null;
      var pct0 =
        baseline != null && baseline > 1e-9 ? ((price - baseline) / baseline) * 100 : null;
      return {
        est: est0,
        pct: pct0,
        weekStart: baseline,
        error: m.error || "no lots matched — used week open"
      };
    }

    var est = 0,
      basis = 0,
      qtySum = 0;
    lots.forEach(function (lot) {
      var d = lot.date || "";
      if (d && to && d > to) return;

      var baseline;
      if (d && from && d >= from) {
        baseline = lot.price != null && isFinite(lot.price) ? lot.price : marketWeekStart;
      } else {
        baseline =
          marketWeekStart != null && isFinite(marketWeekStart)
            ? marketWeekStart
            : lot.price;
      }
      if (baseline == null || !isFinite(baseline) || baseline <= 0) return;
      est += lot.qty * (price - baseline);
      basis += lot.qty * baseline;
      qtySum += lot.qty;
    });

    if (qtySum < 1e-12) {
      return { est: null, pct: null, weekStart: marketWeekStart, error: m.error };
    }
    var pct = basis > 1e-9 ? (est / basis) * 100 : null;
    var avgBaseline = basis / qtySum;
    return { est: est, pct: pct, weekStart: avgBaseline, error: m.error };
  }

  function moveRows(holds, moves, st, range) {
    st = st || getState() || { transactions: [] };
    range = range || weekRange();
    return holds
      .map(function (h) {
        var symU = normSym(h.symbol);
        var m =
          moves[h.symbol] ||
          moves[symU] ||
          moves[String(h.symbolRaw || "").toUpperCase()] ||
          moves[normSym(h.symbolRaw)] ||
          moves[h.symbolRaw] ||
          {};
        var w = weekPnLForHolding(st, h, range, m);
        return {
          symbol: h.symbol,
          name: m.name || h.name,
          qty: h.qty,
          pct: w.pct,
          price: m.price,
          weekStart: w.weekStart,
          est: w.est,
          error: w.error
        };
      })
      .sort(function (a, b) {
        return (b.pct != null ? b.pct : -999) - (a.pct != null ? a.pct : -999);
      });
  }

  function sumEst(rows) {
    return rows.reduce(function (a, r) {
      return a + (r.est != null && isFinite(r.est) ? r.est : 0);
    }, 0);
  }

  function leadersLaggards(rows) {
    var ranked = rows.filter(function (r) {
      return r.pct != null && isFinite(r.pct);
    });
    var top = ranked.slice(0, 3);
    var bot = ranked.slice().reverse().slice(0, 3);
    function line(list) {
      if (!list.length) return "\u2014";
      return list
        .map(function (r) {
          return (
            '<span class="wr-chip">' +
            esc(r.name || r.symbol) +
            " <b class=\"" +
            pctCls(r.pct) +
            '\">' +
            pctLab(r.pct) +
            "</b></span>"
          );
        })
        .join(" ");
    }
    return (
      '<div style="font-size:13px"><div style="margin-bottom:8px"><span class="muted">\uD83D\uDE80 Leaders</span><div style="margin-top:6px">' +
      line(top) +
      '</div></div><div><span class="muted">\uD83D\uDCC9 Laggards</span><div style="margin-top:6px">' +
      line(bot) +
      "</div></div></div>"
    );
  }

  function tableHtml(rows, priceLabel) {
    if (!rows.length) return '<div class="wr-empty">Nothing in this sleeve yet.</div>';
    return (
      '<div class="tablewrap"><table class="table"><thead><tr><th>Name</th><th>Units</th><th>Week %</th><th>' +
      esc(priceLabel) +
      "</th><th>Baseline</th><th>Est. \u20b9</th></tr></thead><tbody>" +
      rows
        .map(function (r) {
          return (
            '<tr><td><div class="asset" style="font-weight:600">' +
            esc(r.name) +
            '</div><div class="sub">' +
            esc(r.symbol) +
            (r.error ? " \u00b7 " + esc(r.error) : "") +
            "</div></td><td>" +
            fmt(r.qty, 4) +
            '</td><td class="' +
            pctCls(r.pct) +
            '"><b>' +
            pctLab(r.pct) +
            "</b></td><td>" +
            (r.price != null ? fmt(r.price, 2) : "\u2014") +
            "</td><td>" +
            (r.weekStart != null ? fmt(r.weekStart, 2) : "\u2014") +
            '</td><td class="' +
            pctCls(r.est) +
            '"><b>' +
            money(r.est) +
            "</b></td></tr>"
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function pageShell(inner) {
    injectCss();
    var range = weekRange();
    return (
      '<div class="head"><div><h2>\uD83D\uDCC5 Weekly review</h2><div class="muted">' +
      esc(range.label) +
      " \u00b7 baseline = buy price or week start (whichever is later)</div></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn" id="wr-refresh">Refresh</button>' +
      '<button type="button" class="btn primary" id="wr-save-notes">Save to Notes</button></div></div>' +
      '<div class="wr-wrap" id="wr-body">' +
      inner +
      "</div>"
    );
  }

  function render(data) {
    var range = data.range || weekRange();
    var stockRows = moveRows(
      data.stocks || [],
      data.stockMoves || {},
      getState(),
      range
    );
    var mfRows = moveRows(data.mfs || [], data.mfMoves || {}, getState(), range);
    var stockEst = sumEst(stockRows);
    var mfEst = sumEst(mfRows);

    var stockBody =
      '<div class="grid stats" style="margin-bottom:12px">' +
      '<div class="card"><div class="label">Est. week P/L</div><div class="wr-kpi ' +
      pctCls(stockEst) +
      '">' +
      money(stockEst) +
      "</div></div>" +
      '<div class="card"><div class="label">Names</div><div class="big">' +
      stockRows.length +
      "</div></div></div>" +
      leadersLaggards(stockRows) +
      '<div style="margin-top:12px">' +
      tableHtml(stockRows, "Price") +
      "</div>";

    var mfBody =
      '<div class="grid stats" style="margin-bottom:12px">' +
      '<div class="card"><div class="label">Est. week P/L</div><div class="wr-kpi ' +
      pctCls(mfEst) +
      '">' +
      money(mfEst) +
      "</div></div>" +
      '<div class="card"><div class="label">Funds</div><div class="big">' +
      mfRows.length +
      "</div></div></div>" +
      leadersLaggards(mfRows) +
      '<div style="margin-top:12px">' +
      tableHtml(mfRows, "NAV") +
      "</div>";

    return (
      section(
        "\uD83D\uDCC8",
        "Stocks & ETFs",
        "Mid-week buys use buy price, not Monday",
        '<span class="' +
          pctCls(stockEst) +
          '" style="font-weight:800">' +
          money(stockEst) +
          "</span>",
        stockBody
      ) +
      section(
        "\uD83D\uDCB0",
        "Mutual funds",
        "SIPs this week use installment NAV as baseline",
        '<span class="' +
          pctCls(mfEst) +
          '" style="font-weight:800">' +
          money(mfEst) +
          "</span>",
        mfRows.length
          ? mfBody
          : '<div class="wr-empty">No mutual fund holdings found. Log SIP/MF buys to see this section fill up.</div>'
      )
    );
  }

  async function load(force) {
    var view = document.getElementById("view");
    if (!view) return;
    if (!force) {
      try {
        var cached = JSON.parse(localStorage.getItem(CACHE) || "null");
        if (
          cached &&
          cached.asOf &&
          Date.now() - new Date(cached.asOf).getTime() < 3 * 3600 * 1000
        ) {
          view.innerHTML = pageShell(render(cached));
          wire(cached);
          return;
        }
      } catch (e) {}
    }
    view.innerHTML = pageShell('<div class="wr-empty">Loading week moves\u2026</div>');
    try {
      var st = getState() || { transactions: [] };
      var r = await fetch("/api/week-performance?t=" + Date.now(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolio: st })
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json();
      if (data.error) throw new Error(data.error);
      data.asOf = new Date().toISOString();
      try {
        localStorage.setItem(CACHE, JSON.stringify(data));
      } catch (e) {}
      view.innerHTML = pageShell(render(data));
      wire(data);
    } catch (e) {
      view.innerHTML =
        pageShell(
          '<div class="wr-empty">Failed: ' + esc(e.message) + "</div>"
        );
    }
  }

  function wire(data) {
    var b = document.getElementById("wr-refresh");
    if (b)
      b.onclick = function () {
        load(true);
      };
    var s = document.getElementById("wr-save-notes");
    if (s)
      s.onclick = function () {
        try {
          var notes = JSON.parse(localStorage.getItem("investtrack-notes-v1") || "[]");
          var range = (data && data.range) || weekRange();
          var stockRows = moveRows(
            (data && data.stocks) || [],
            (data && data.stockMoves) || {},
            getState(),
            range
          );
          var text =
            "Weekly review " +
            (range.label || "") +
            "\n" +
            stockRows
              .slice(0, 8)
              .map(function (r) {
                return (
                  (r.name || r.symbol) +
                  ": " +
                  pctLab(r.pct) +
                  " / " +
                  money(r.est)
                );
              })
              .join("\n");
          notes.unshift({
            id: "n-" + Date.now(),
            title: "Weekly review",
            body: text,
            createdAt: new Date().toISOString()
          });
          localStorage.setItem("investtrack-notes-v1", JSON.stringify(notes.slice(0, 100)));
          if (window.investToast) window.investToast("Saved to Notes");
          else alert("Saved to Notes");
        } catch (e) {
          alert("Could not save notes: " + e.message);
        }
      };
  }

  function injectNav() {
    var nav = document.querySelector(".nav");
    if (!nav || nav.querySelector('[data-page="weekly"]')) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-page", "weekly");
    btn.textContent = "\uD83D\uDCC5 Weekly";
    btn.style.display = "none";
    nav.appendChild(btn);
  }

  document.addEventListener(
    "click",
    function (e) {
      var btn =
        e.target &&
        e.target.closest &&
        e.target.closest('[data-page="weekly"], [data-nav-tab="weekly"]');
      if (!btn) return;
      if (btn.getAttribute("data-nav-tab") === "weekly" || btn.getAttribute("data-page") === "weekly") {
        // consolidate-nav already routes; still handle direct
      }
      if (btn.getAttribute("data-page") === "weekly") {
        e.preventDefault();
        e.stopPropagation();
        document.querySelectorAll(".nav button").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-page") === "weekly");
        });
        load(false);
      }
    },
    true
  );

  // Also open when Markets tab Weekly is chosen via consolidate
  document.addEventListener(
    "click",
    function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-nav-tab="weekly"]');
      if (!t) return;
      setTimeout(function () {
        load(false);
      }, 50);
    },
    true
  );

  function boot() {
    injectNav();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  console.log("[weekly-review-ui] ready v5 baseline=max(buy, weekStart)");
})();
