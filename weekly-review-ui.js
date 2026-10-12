"use strict";
/**
 * Weekly portfolio review — stocks + MF.
 * v7: GET symbols API + lot baseline + page-persist loader
 */
(function () {
  var CACHE = "investtrack-weekly-review-v4";

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
      return (
        d.getFullYear() +
        "-" +
        ("0" + (d.getMonth() + 1)).slice(-2) +
        "-" +
        ("0" + d.getDate()).slice(-2)
      );
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
      ".wr-head h3{margin:0;font-size:16px;font-weight:700}" +
      ".wr-head .wr-sub{font-size:12px;color:var(--muted);margin-top:3px}" +
      ".wr-body{padding:14px 16px}" +
      ".wr-kpi{font-size:26px;font-weight:800}" +
      ".wr-chip{display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.06);border:1px solid var(--line);margin:2px}" +
      ".wr-empty{padding:18px;text-align:center;color:var(--muted);font-size:13px}";
    document.head.appendChild(s);
  }

  function section(emoji, title, subtitle, rightHtml, bodyHtml) {
    return (
      '<section class="wr-section"><div class="wr-head"><div><h3>' +
      emoji +
      " " +
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
      .replace(/\s+/g, "")
      .trim();
  }

  function normDate(d) {
    if (!d) return "";
    var s = String(d).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) {
      return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    }
    var t = Date.parse(s);
    if (isFinite(t)) {
      var dt = new Date(t);
      return (
        dt.getFullYear() +
        "-" +
        ("0" + (dt.getMonth() + 1)).slice(-2) +
        "-" +
        ("0" + dt.getDate()).slice(-2)
      );
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
        if (normSym(t.symbol) !== key) return;
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

    if (!lots.length) {
      var baseline =
        marketWeekStart != null && isFinite(marketWeekStart)
          ? marketWeekStart
          : Number(h.avg) || null;
      var est0 =
        baseline != null && isFinite(baseline) ? Number(h.qty) * (price - baseline) : null;
      var pct0 =
        baseline != null && baseline > 1e-9 ? ((price - baseline) / baseline) * 100 : null;
      return { est: est0, pct: pct0, weekStart: baseline, error: m.error };
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
          marketWeekStart != null && isFinite(marketWeekStart) ? marketWeekStart : lot.price;
      }
      if (baseline == null || !isFinite(baseline) || baseline <= 0) return;
      est += lot.qty * (price - baseline);
      basis += lot.qty * baseline;
      qtySum += lot.qty;
    });
    if (qtySum < 1e-12) return { est: null, pct: null, weekStart: marketWeekStart, error: m.error };
    return {
      est: est,
      pct: basis > 1e-9 ? (est / basis) * 100 : null,
      weekStart: basis / qtySum,
      error: m.error
    };
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
      '<div style="font-size:13px"><div style="margin-bottom:8px"><span class="muted">Leaders</span><div style="margin-top:6px">' +
      line(top) +
      '</div></div><div><span class="muted">Laggards</span><div style="margin-top:6px">' +
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
    var stockRows = moveRows(data.stocks || [], data.stockMoves || {}, getState(), range);
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
        '<span class="' + pctCls(stockEst) + '" style="font-weight:800">' + money(stockEst) + "</span>",
        stockBody
      ) +
      section(
        "\uD83D\uDCB0",
        "Mutual funds",
        "SIPs this week use installment NAV as baseline",
        '<span class="' + pctCls(mfEst) + '" style="font-weight:800">' + money(mfEst) + "</span>",
        mfRows.length ? mfBody : '<div class="wr-empty">No mutual fund holdings found.</div>'
      )
    );
  }

  function buildHoldings(st) {
    var lots = {};
    (st.transactions || [])
      .slice()
      .sort(function (a, b) {
        return normDate(a.date).localeCompare(normDate(b.date));
      })
      .forEach(function (t) {
        if (!t) return;
        var key = String(t.type || "STOCK") + "|" + normSym(t.symbol);
        if (!lots[key]) {
          lots[key] = {
            qty: 0,
            cost: 0,
            name: t.name || t.symbol,
            symbol: normSym(t.symbol),
            symbolRaw: t.symbol,
            type: t.type || "STOCK",
            exchange: t.exchange || ""
          };
        }
        var q = Number(t.qty) || 0;
        var px = Number(t.price) || 0;
        var action = String(t.action || "").toUpperCase();
        if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(action) >= 0 && q > 0) {
          lots[key].qty += q;
          lots[key].cost += q * px;
          if (t.name) lots[key].name = t.name;
        } else if (["SELL", "REDEMPTION"].indexOf(action) >= 0 && q > 0) {
          var avg = lots[key].qty > 0 ? lots[key].cost / lots[key].qty : 0;
          lots[key].qty -= q;
          lots[key].cost -= avg * q;
          if (lots[key].qty < 1e-12) {
            lots[key].qty = 0;
            lots[key].cost = 0;
          }
        }
      });
    return Object.keys(lots)
      .map(function (k) {
        return lots[k];
      })
      .filter(function (h) {
        return h.qty > 1e-12;
      })
      .map(function (h) {
        h.avg = h.qty > 0 ? h.cost / h.qty : 0;
        return h;
      });
  }

  function itemsToMoves(items) {
    var map = {};
    (items || []).forEach(function (it) {
      if (!it) return;
      [it.symbol, normSym(it.symbol), it.matchedCode].filter(Boolean).forEach(function (k) {
        map[k] = {
          symbol: it.symbol,
          name: it.name,
          price: it.price,
          weekStartPrice: it.weekStartPrice,
          changePct: it.changePct,
          error: it.error
        };
      });
    });
    return map;
  }

  async function load(force) {
    var view = document.getElementById("view");
    if (!view) return;
    if (!force) {
      try {
        var cached = JSON.parse(localStorage.getItem(CACHE) || "null");
        if (cached && cached.asOf && Date.now() - new Date(cached.asOf).getTime() < 3 * 3600 * 1000) {
          view.innerHTML = pageShell(render(cached));
          wire(cached);
          return;
        }
      } catch (e) {}
    }
    view.innerHTML = pageShell('<div class="wr-empty">Loading week moves\u2026</div>');
    try {
      var st = getState() || { transactions: [] };
      var holds = buildHoldings(st);
      var mfs = holds.filter(function (h) {
        return String(h.type || "").toUpperCase() === "MUTUAL_FUND";
      });
      var stocks = holds.filter(function (h) {
        return String(h.type || "").toUpperCase() !== "MUTUAL_FUND";
      });

      var stockMoves = {};
      var mfMoves = {};

      if (!holds.length) {
        view.innerHTML = pageShell(
          '<div class="wr-empty">No holdings found. Add stock/MF transactions first.</div>'
        );
        return;
      }

      if (stocks.length) {
        var syms = stocks
          .map(function (h) {
            return normSym(h.symbol);
          })
          .filter(Boolean);
        syms = syms
          .filter(function (s, i) {
            return syms.indexOf(s) === i;
          })
          .slice(0, 25);
        if (syms.length) {
          var r = await fetch(
            "/api/week-performance?symbols=" +
              encodeURIComponent(syms.join(",")) +
              "&t=" +
              Date.now()
          );
          if (!r.ok) {
            var errBody = await r.json().catch(function () {
              return {};
            });
            throw new Error(errBody.error || "HTTP " + r.status);
          }
          stockMoves = itemsToMoves((await r.json()).items || []);
        }
      }

      if (mfs.length) {
        var codes = mfs
          .map(function (h) {
            return String(h.symbolRaw || h.symbol || "").trim();
          })
          .filter(Boolean);
        codes = codes
          .filter(function (s, i) {
            return codes.indexOf(s) === i;
          })
          .slice(0, 20);
        if (codes.length) {
          var r2 = await fetch(
            "/api/mf-week?symbols=" + encodeURIComponent(codes.join(",")) + "&t=" + Date.now()
          );
          if (r2.ok) mfMoves = itemsToMoves((await r2.json()).items || []);
        }
      }

      var data = {
        asOf: new Date().toISOString(),
        range: weekRange(),
        stocks: stocks,
        mfs: mfs,
        stockMoves: stockMoves,
        mfMoves: mfMoves
      };
      try {
        localStorage.setItem(CACHE, JSON.stringify(data));
      } catch (e) {}
      view.innerHTML = pageShell(render(data));
      wire(data);
    } catch (e) {
      view.innerHTML = pageShell('<div class="wr-empty">Failed: ' + esc(e.message) + "</div>");
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
                return (r.name || r.symbol) + ": " + pctLab(r.pct) + " / " + money(r.est);
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

  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-page="weekly"]');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        load(false);
      }
      var tab = e.target && e.target.closest && e.target.closest('[data-nav-tab="weekly"]');
      if (tab) setTimeout(function () {
        load(false);
      }, 80);
    },
    true
  );

  window.__weeklyReviewLoad = load;
  console.log("[weekly-review-ui] ready v7 page-persist + robust load");
})();
