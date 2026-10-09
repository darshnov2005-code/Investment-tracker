"use strict";
/**
 * Weekly portfolio review — stocks/ETFs + mutual funds in separate emoji sections.
 * Week P/L is lot-aware: units bought this week use buy price as baseline, not Monday.
 */
(function () {
  var NOTES_KEY = "investtrack-notes-v1";
  var CACHE_KEY = "investtrack-weekly-review-v2";

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
    function iso(d) {
      return d.toISOString().slice(0, 10);
    }
    return { from: iso(mon), to: iso(sun), label: iso(mon) + " \u2192 " + iso(sun) };
  }

  function getState() {
    try {
      return JSON.parse(
        localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3") || "null"
      );
    } catch (e) {
      return null;
    }
  }

  function netHoldings(st, types) {
    var qty = {},
      meta = {};
    (st.transactions || []).forEach(function (t) {
      if (!t || !t.symbol) return;
      if (types.indexOf(t.type) < 0) return;
      var k = String(t.symbol).toUpperCase();
      var q = Number(t.qty) || 0;
      if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) + q;
      else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) - q;
      meta[k] = { name: t.name || k, type: t.type, symbolRaw: t.symbol };
    });
    return Object.keys(qty)
      .filter(function (k) {
        return qty[k] > 1e-8;
      })
      .map(function (k) {
        return {
          symbol: k,
          symbolRaw: (meta[k] && meta[k].symbolRaw) || k,
          qty: qty[k],
          name: (meta[k] && meta[k].name) || k,
          type: (meta[k] && meta[k].type) || types[0]
        };
      })
      .sort(function (a, b) {
        return a.symbol.localeCompare(b.symbol);
      });
  }

  function txsThisWeek(st, range) {
    return (st.transactions || [])
      .filter(function (t) {
        return t && t.date && t.date >= range.from && t.date <= range.to;
      })
      .sort(function (a, b) {
        return String(b.date).localeCompare(String(a.date));
      });
  }

  var CSS =
    "<style>" +
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

  function openLots(st, symbolKey) {
    var key = String(symbolKey || "").toUpperCase();
    var lots = [];
    (st.transactions || [])
      .slice()
      .sort(function (a, b) {
        return String(a.date || "").localeCompare(String(b.date || ""));
      })
      .forEach(function (t) {
        if (!t || String(t.symbol || "").toUpperCase() !== key) return;
        var q = Number(t.qty) || 0;
        var px = Number(t.price) || 0;
        if (q <= 0) return;
        if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) {
          lots.push({ qty: q, price: px, date: String(t.date || "") });
        } else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) {
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
      return { est: null, pct: m.changePct, weekStart: marketWeekStart, error: m.error };
    }
    var lots = openLots(st, h.symbol);
    if (!lots.length) {
      var est0 =
        marketWeekStart != null && isFinite(marketWeekStart)
          ? h.qty * (price - marketWeekStart)
          : null;
      return { est: est0, pct: m.changePct, weekStart: marketWeekStart, error: m.error };
    }
    var est = 0,
      basis = 0,
      qtySum = 0;
    lots.forEach(function (lot) {
      var baseline;
      if (lot.date && lot.date < range.from) {
        baseline =
          marketWeekStart != null && isFinite(marketWeekStart) ? marketWeekStart : lot.price;
      } else if (lot.date && lot.date <= range.to) {
        baseline = lot.price;
      } else {
        baseline = lot.price;
      }
      if (baseline == null || !isFinite(baseline)) return;
      est += lot.qty * (price - baseline);
      basis += lot.qty * baseline;
      qtySum += lot.qty;
    });
    var pct = basis > 1e-9 ? (est / basis) * 100 : m.changePct;
    var avgBaseline = qtySum > 1e-9 ? basis / qtySum : marketWeekStart;
    return { est: est, pct: pct, weekStart: avgBaseline, error: m.error };
  }

  function moveRows(holds, moves, st, range) {
    st = st || getState() || { transactions: [] };
    range = range || weekRange();
    return holds
      .map(function (h) {
        var m =
          moves[h.symbol] ||
          moves[String(h.symbolRaw || "").toUpperCase()] ||
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
        return (b.pct ?? -999) - (a.pct ?? -999);
      });
  }

  function sumEst(rows) {
    return rows.reduce(function (a, r) {
      return a + (r.est || 0);
    }, 0);
  }

  function bits(rows) {
    var withPct = rows.filter(function (r) {
      return r.pct != null;
    });
    var top = withPct.slice(0, 3);
    var bot = withPct.slice().reverse().slice(0, 3);
    function line(arr) {
      if (!arr.length) return "\u2014";
      return arr
        .map(function (r) {
          var s = r.symbol.length > 16 ? r.symbol.slice(0, 14) + "\u2026" : r.symbol;
          return (
            '<span class="wr-chip">' +
            esc(s) +
            ' <b class="' +
            pctCls(r.pct) +
            '">' +
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
            "<tr><td><div class=\"asset\" style=\"font-weight:600\">" +
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
    var range = weekRange();
    return (
      CSS +
      '<div class="head"><div><h2>\uD83D\uDCC5 Weekly review</h2><div class="muted">' +
      esc(range.label) +
      " \u00b7 gains use buy price for lots bought this week</div></div>" +
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
    var totalEst = stockEst + mfEst;

    var summary = section(
      "\u2728",
      "This week at a glance",
      range.label,
      '<div class="wr-kpi ' + pctCls(totalEst) + '">' + money(totalEst) + "</div>",
      '<div class="grid stats" style="margin:0">' +
        '<div class="card"><div class="label">Stocks / ETFs</div><div class="big ' +
        pctCls(stockEst) +
        '">' +
        money(stockEst) +
        "</div></div>" +
        '<div class="card"><div class="label">Mutual funds</div><div class="big ' +
        pctCls(mfEst) +
        '">' +
        money(mfEst) +
        "</div></div>" +
        '<div class="card"><div class="label">Ledger activity</div><div class="big">' +
        (data.txs || []).length +
        "</div></div></div>"
    );

    var stocksSec = section(
      "\uD83D\uDCCA",
      "Stocks & ETFs",
      "Mid-week buys use buy price, not Monday",
      stockRows.length ? '<span class="wr-chip">' + stockRows.length + " holdings</span>" : "",
      bits(stockRows) + '<div style="margin-top:14px">' + tableHtml(stockRows, "Price") + "</div>"
    );

    var mfSec = section(
      "\uD83D\uDCC8",
      "Mutual funds",
      "SIPs this week use installment NAV as baseline",
      mfRows.length ? '<span class="wr-chip">' + mfRows.length + " schemes</span>" : "",
      !mfRows.length
        ? '<div class="wr-empty">No mutual fund holdings found. Log SIP/MF buys to see this section fill up.</div>'
        : bits(mfRows) + '<div style="margin-top:14px">' + tableHtml(mfRows, "NAV") + "</div>"
    );

    var txBody;
    if (!(data.txs || []).length) {
      txBody =
        '<div class="wr-empty">No buys/sells/SIPs between ' +
        esc(range.from) +
        " and " +
        esc(range.to) +
        ".</div>";
    } else {
      txBody =
        '<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Action</th><th>Asset</th><th>Qty</th><th>Price</th></tr></thead><tbody>' +
        (data.txs || [])
          .map(function (t) {
            var emoji =
              t.action === "SELL" || t.action === "REDEMPTION"
                ? "\uD83D\uDCC9"
                : t.action === "SIP"
                  ? "\uD83D\uDD04"
                  : "\uD83D\uDCC8";
            return (
              "<tr><td>" +
              esc(t.date) +
              "</td><td>" +
              emoji +
              ' <span class="pill">' +
              esc(t.action) +
              "</span></td><td><div class=\"asset\" style=\"font-weight:600\">" +
              esc(t.name) +
              '</div><div class="sub">' +
              esc(t.symbol) +
              "</div></td><td>" +
              fmt(t.qty, 4) +
              "</td><td>" +
              fmt(t.price, 2) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>";
    }
    var activitySec = section(
      "\uD83E\uDDFE",
      "Activity this week",
      "What you recorded in the ledger",
      "",
      txBody
    );

    return summary + stocksSec + mfSec + activitySec;
  }

  function buildNoteText(data) {
    var range = data.range || weekRange();
    var stockRows = moveRows(data.stocks || [], data.stockMoves || {}, getState(), range);
    var mfRows = moveRows(data.mfs || [], data.mfMoves || {}, getState(), range);
    var lines = [
      "Weekly review " + range.label,
      "\u2728 Total est. MTM: " + money(sumEst(stockRows) + sumEst(mfRows)),
      "\uD83D\uDCCA Stocks/ETFs: " + money(sumEst(stockRows)),
      "\uD83D\uDCC8 Mutual funds: " + money(sumEst(mfRows)),
      "",
      "\uD83D\uDCCA Stock leaders:"
    ];
    stockRows
      .filter(function (r) {
        return r.pct != null;
      })
      .slice(0, 5)
      .forEach(function (r) {
        lines.push("- " + r.symbol + " " + pctLab(r.pct) + " " + money(r.est));
      });
    lines.push("", "\uD83D\uDCC8 MF leaders:");
    mfRows
      .filter(function (r) {
        return r.pct != null;
      })
      .slice(0, 5)
      .forEach(function (r) {
        lines.push("- " + r.symbol + " " + pctLab(r.pct) + " " + money(r.est));
      });
    var txs = data.txs || [];
    if (txs.length) {
      lines.push("", "Activity:");
      txs.slice(0, 12).forEach(function (t) {
        lines.push("- " + t.date + " " + t.action + " " + (t.symbol || t.name));
      });
    }
    return lines.join("\n");
  }

  async function fetchMoves(url) {
    var r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    var d = await r.json();
    var map = {};
    (d.items || []).forEach(function (it) {
      if (!it || !it.symbol) return;
      map[String(it.symbol).toUpperCase()] = it;
      if (it.code) map[String(it.code)] = it;
    });
    return map;
  }

  async function runReview() {
    var body = document.getElementById("wr-body");
    if (body) body.innerHTML = '<div class="wr-empty">Loading week moves\u2026</div>';
    var st = getState();
    if (!st) {
      if (body)
        body.innerHTML =
          '<div class="wr-section"><div class="wr-empty">No portfolio data in this browser.</div></div>';
      return;
    }
    var range = weekRange();
    var stocks = netHoldings(st, ["STOCK", "ETF"]);
    var mfs = netHoldings(st, ["MUTUAL_FUND"]);
    var txs = txsThisWeek(st, range);
    var stockMoves = {},
      mfMoves = {};
    try {
      if (stocks.length) {
        stockMoves = await fetchMoves(
          "/api/week-performance?symbols=" +
            encodeURIComponent(
              stocks
                .map(function (h) {
                  return h.symbol;
                })
                .slice(0, 25)
                .join(",")
            ) +
            "&t=" +
            Date.now()
        );
      }
    } catch (e) {
      console.warn("stock week", e);
    }
    try {
      if (mfs.length) {
        mfMoves = await fetchMoves(
          "/api/mf-week?symbols=" +
            encodeURIComponent(
              mfs
                .map(function (h) {
                  return h.symbolRaw || h.symbol;
                })
                .slice(0, 20)
                .join(",")
            ) +
            "&t=" +
            Date.now()
        );
      }
    } catch (e) {
      console.warn("mf week", e);
    }
    var data = {
      stocks: stocks,
      mfs: mfs,
      stockMoves: stockMoves,
      mfMoves: mfMoves,
      txs: txs,
      range: range,
      ranAt: Date.now()
    };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {}
    window.__weeklyReviewData = data;
    if (body) body.innerHTML = render(data);
  }

  function saveToNotes() {
    var data = window.__weeklyReviewData;
    if (!data) return alert("Run the review first.");
    var notes = [];
    try {
      notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]");
      if (!Array.isArray(notes)) notes = [];
    } catch (e) {
      notes = [];
    }
    notes.push({
      id: "n-" + Date.now(),
      url: "",
      note: buildNoteText(data),
      tags: "weekly,portfolio",
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    alert("Saved to Notes (tags: weekly, portfolio).");
  }

  function showWeeklyPage() {
    var view = document.getElementById("view");
    if (!view) return;
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "weekly");
    });
    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    } catch (e) {}
    view.innerHTML = pageShell(
      cached
        ? render(cached)
        : '<div class="wr-empty">Click Refresh to load this week\u2019s moves.</div>'
    );
    if (cached) window.__weeklyReviewData = cached;
    var ref = document.getElementById("wr-refresh");
    if (ref) ref.onclick = function () {
      runReview();
    };
    var sav = document.getElementById("wr-save-notes");
    if (sav) sav.onclick = function () {
      saveToNotes();
    };
  }

  function injectNav() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var existing = nav.querySelector('[data-page="weekly"]');
    if (existing) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-page", "weekly");
    btn.textContent = "\uD83D\uDCC5 Weekly";
    var after = nav.querySelector('[data-page="holdings"]') || nav.querySelector('[data-page="dashboard"]');
    if (after && after.nextSibling) nav.insertBefore(btn, after.nextSibling);
    else nav.appendChild(btn);
  }

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;
      var btn = t.closest && t.closest('[data-page="weekly"]');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        showWeeklyPage();
      }
    },
    true
  );

  function boot() {
    injectNav();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 600);
  setTimeout(boot, 1500);

  console.log("[weekly-review-ui] ready v4 lot-aware week P/L");
})();
