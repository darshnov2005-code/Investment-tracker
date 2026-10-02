"use strict";
/**
 * Weekly portfolio review — holdings week moves + transactions this week + save to Notes.
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
    var sign = n < 0 ? "-" : "";
    return sign + "\u20b9" + fmt(Math.abs(n), 0);
  }

  function weekRange() {
    var now = new Date();
    var day = now.getDay();
    var mon = new Date(now);
    mon.setHours(0, 0, 0, 0);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    sun.setHours(23, 59, 59, 999);
    function iso(d) {
      return d.toISOString().slice(0, 10);
    }
    return { from: iso(mon), to: iso(sun), mon: mon, sun: sun, label: iso(mon) + " \u2192 " + iso(sun) };
  }

  function getState() {
    try {
      return JSON.parse(localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3") || "null");
    } catch (e) {
      return null;
    }
  }

  function stockHoldings(st) {
    var qty = {};
    var meta = {};
    (st.transactions || []).forEach(function (t) {
      if (!t || !t.symbol) return;
      if (["STOCK", "ETF"].indexOf(t.type) < 0) return;
      var k = String(t.symbol).toUpperCase();
      var q = Number(t.qty) || 0;
      if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) + q;
      else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) - q;
      meta[k] = { name: t.name || k, type: t.type, exchange: t.exchange || "NSE" };
    });
    return Object.keys(qty)
      .filter(function (k) {
        return qty[k] > 1e-8;
      })
      .map(function (k) {
        return {
          symbol: k,
          qty: qty[k],
          name: (meta[k] && meta[k].name) || k,
          type: (meta[k] && meta[k].type) || "STOCK"
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

  function pageShell(inner) {
    var range = weekRange();
    return (
      '<div class="card"><div class="head" style="margin:0 0 10px"><div>' +
      '<h2 style="margin:0">Weekly portfolio review</h2>' +
      '<div class="muted">Week of ' +
      esc(range.label) +
      " \u00b7 stock/ETF holdings ~5-session move + your transactions this week</div></div>" +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn primary" id="wrRun">\u21bb Run review</button>' +
      '<button type="button" class="btn" id="wrSaveNote">Save to Notes</button>' +
      "</div></div>" +
      '<div class="notice">Price moves use the last ~5 daily bars (holidays may shift the window). Est. \u20b9 change = qty \u00d7 (price \u2212 week-start). Not tax advice.</div></div>' +
      '<div id="wrBody" style="margin-top:12px">' +
      inner +
      "</div>"
    );
  }

  function render(data) {
    var holds = data.holdings || [];
    var moves = data.moves || {};
    var txs = data.txs || [];
    var range = data.range;

    var rows = holds.map(function (h) {
      var m = moves[h.symbol] || {};
      var pct = m.changePct;
      var est =
        m.price != null && m.weekStartPrice != null ? h.qty * (m.price - m.weekStartPrice) : null;
      return {
        symbol: h.symbol,
        name: h.name,
        qty: h.qty,
        pct: pct,
        price: m.price,
        weekStart: m.weekStartPrice,
        est: est,
        error: m.error
      };
    });

    rows.sort(function (a, b) {
      return (b.pct ?? -999) - (a.pct ?? -999);
    });

    var withPct = rows.filter(function (r) {
      return r.pct != null;
    });
    var totalEst = withPct.reduce(function (a, r) {
      return a + (r.est || 0);
    }, 0);
    var leaders = withPct.slice(0, 3);
    var laggards = withPct.slice().reverse().slice(0, 3);

    function listBits(arr, up) {
      if (!arr.length) return "\u2014";
      return arr
        .map(function (r) {
          var cls = up ? "green" : "red";
          var lab = (r.pct >= 0 ? "+" : "") + fmt(r.pct, 2) + "%";
          return esc(r.symbol) + ' <span class="' + cls + '">' + lab + "</span>";
        })
        .join(" \u00b7 ");
    }

    var summary =
      '<div class="grid two" style="margin-bottom:12px">' +
      '<div class="card"><div class="muted">Estimated week mark-to-market (stocks/ETFs held)</div>' +
      '<div style="font-size:22px;font-weight:700;margin-top:6px" class="' +
      (totalEst >= 0 ? "green" : "red") +
      '">' +
      money(totalEst) +
      "</div>" +
      '<div class="muted" style="margin-top:6px">' +
      withPct.length +
      " names with price data \u00b7 " +
      holds.length +
      " holdings</div></div>" +
      '<div class="card"><div class="muted">Leaders</div><div style="margin-top:6px">' +
      listBits(leaders, true) +
      '</div><div class="muted" style="margin-top:10px">Laggards</div><div style="margin-top:6px">' +
      listBits(laggards, false) +
      "</div></div></div>";

    var table =
      '<div class="label" style="margin:8px 0">Holdings \u2014 ~week move</div>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>Scrip</th><th>Qty</th><th>Week %</th><th>Now</th><th>Week start</th><th>Est. \u20b9 move</th></tr></thead><tbody>' +
      (rows.length
        ? rows
            .map(function (r) {
              var cls = r.pct == null ? "muted" : r.pct >= 0 ? "green" : "red";
              var lab =
                r.pct == null ? "\u2014" : (r.pct >= 0 ? "+" : "") + fmt(r.pct, 2) + "%";
              return (
                "<tr><td><div class=\"asset\">" +
                esc(r.name) +
                '</div><div class="sub">' +
                esc(r.symbol) +
                "</div></td><td>" +
                fmt(r.qty, 4) +
                '</td><td class="' +
                cls +
                '"><b>' +
                lab +
                "</b></td><td>" +
                (r.price != null ? fmt(r.price, 2) : "\u2014") +
                "</td><td>" +
                (r.weekStart != null ? fmt(r.weekStart, 2) : "\u2014") +
                '</td><td class="' +
                (r.est == null ? "muted" : r.est >= 0 ? "green" : "red") +
                '">' +
                money(r.est) +
                "</td></tr>"
              );
            })
            .join("")
        : '<tr><td colspan="6" class="empty">No stock/ETF holdings found.</td></tr>') +
      "</tbody></table></div>";

    var txBlock =
      '<div class="label" style="margin:16px 0 8px">Transactions this week (' +
      esc(range.from) +
      " \u2192 " +
      esc(range.to) +
      ")</div>";
    if (!txs.length) {
      txBlock += '<div class="card empty">No buys/sells/SIPs recorded in this date range.</div>';
    } else {
      txBlock +=
        '<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Action</th><th>Asset</th><th>Qty</th><th>Price</th></tr></thead><tbody>' +
        txs
          .map(function (t) {
            return (
              "<tr><td>" +
              esc(t.date) +
              '</td><td><span class="pill">' +
              esc(t.action) +
              "</span></td><td>" +
              esc(t.name || t.symbol) +
              ' <span class="sub">' +
              esc(t.symbol) +
              "</span></td><td>" +
              fmt(t.qty, 4) +
              "</td><td>" +
              fmt(t.price, 2) +
              "</td></tr>"
            );
          })
          .join("") +
        "</tbody></table></div>";
    }

    return summary + table + txBlock;
  }

  function buildNoteText(data) {
    var holds = data.holdings || [];
    var moves = data.moves || {};
    var range = data.range;
    var lines = [];
    lines.push("Weekly portfolio review (" + range.label + ")");
    lines.push("");
    var withPct = holds
      .map(function (h) {
        var m = moves[h.symbol] || {};
        return {
          symbol: h.symbol,
          qty: h.qty,
          pct: m.changePct,
          est:
            m.price != null && m.weekStartPrice != null
              ? h.qty * (m.price - m.weekStartPrice)
              : null
        };
      })
      .filter(function (x) {
        return x.pct != null;
      })
      .sort(function (a, b) {
        return b.pct - a.pct;
      });
    var totalEst = withPct.reduce(function (a, r) {
      return a + (r.est || 0);
    }, 0);
    lines.push(
      "Estimated MTM change (stocks/ETFs): " +
        (totalEst >= 0 ? "+" : "") +
        "\u20b9" +
        Math.round(totalEst).toLocaleString("en-IN")
    );
    lines.push("");
    lines.push("Top movers:");
    withPct.slice(0, 5).forEach(function (r) {
      lines.push(
        "- " +
          r.symbol +
          ": " +
          (r.pct >= 0 ? "+" : "") +
          r.pct.toFixed(2) +
          "% \u00b7 est " +
          (r.est >= 0 ? "+" : "") +
          "\u20b9" +
          Math.round(r.est || 0).toLocaleString("en-IN")
      );
    });
    if (withPct.length > 5) {
      lines.push("");
      lines.push("Weakest:");
      withPct
        .slice()
        .reverse()
        .slice(0, 3)
        .forEach(function (r) {
          lines.push(
            "- " +
              r.symbol +
              ": " +
              (r.pct >= 0 ? "+" : "") +
              r.pct.toFixed(2) +
              "%"
          );
        });
    }
    var txs = data.txs || [];
    lines.push("");
    lines.push("Activity this week: " + txs.length + " transaction(s)");
    txs.slice(0, 12).forEach(function (t) {
      lines.push("- " + t.date + " " + t.action + " " + (t.symbol || t.name));
    });
    lines.push("");
    lines.push("My takeaways:");
    lines.push("- ");
    return lines.join("\n");
  }

  async function runReview() {
    var body = document.getElementById("wrBody");
    if (body) body.innerHTML = '<div class="card empty">Loading week moves for your holdings\u2026</div>';
    var st = getState();
    if (!st) {
      if (body) body.innerHTML = '<div class="card empty">No portfolio data in this browser.</div>';
      return;
    }
    var range = weekRange();
    var holds = stockHoldings(st);
    var txs = txsThisWeek(st, range);
    var moves = {};
    if (holds.length) {
      var symbols = holds.map(function (h) {
        return h.symbol;
      });
      try {
        var r = await fetch(
          "/api/week-performance?symbols=" + encodeURIComponent(symbols.join(",")) + "&t=" + Date.now()
        );
        var d = await r.json();
        if (r.ok && d.items) {
          d.items.forEach(function (it) {
            moves[it.symbol] = it;
          });
        }
      } catch (e) {
        if (body)
          body.innerHTML =
            '<div class="card empty">Could not load prices: ' + esc(e.message || "error") + "</div>";
        return;
      }
    }
    var data = { holdings: holds, moves: moves, txs: txs, range: range, ranAt: Date.now() };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (e) {}
    window.__weeklyReviewData = data;
    if (body) body.innerHTML = render(data);
  }

  function saveToNotes() {
    var data = window.__weeklyReviewData;
    if (!data) {
      alert("Run the review first.");
      return;
    }
    var text = buildNoteText(data);
    var notes = [];
    try {
      notes = JSON.parse(localStorage.getItem(NOTES_KEY) || "[]");
      if (!Array.isArray(notes)) notes = [];
    } catch (e) {
      notes = [];
    }
    notes.push({
      id: "n-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      url: "",
      note: text,
      tags: "weekly,portfolio",
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    alert("Saved to Notes & links (tag: weekly, portfolio).");
  }

  function show() {
    var view = document.getElementById("view");
    if (!view) return;
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Weekly review";
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "weekly");
    });
    view.innerHTML = pageShell('<div class="card empty">Click <b>Run review</b> to load this week\u2019s moves.</div>');
    setTimeout(function () {
      runReview();
    }, 50);
  }

  function ensureNav() {
    var nav = document.querySelector(".side .nav");
    if (!nav || nav.querySelector('[data-page="weekly"]')) return;
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
    if (t.id === "wrRun") {
      runReview();
      return;
    }
    if (t.id === "wrSaveNote") {
      saveToNotes();
      return;
    }
    var btn = t.closest && t.closest('[data-page="weekly"]');
    if (btn) setTimeout(show, 20);
  });

  function boot() {
    ensureNav();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  console.log("[weekly-review-ui] ready");
})();
