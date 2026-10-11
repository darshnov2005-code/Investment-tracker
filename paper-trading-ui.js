"use strict";
/**
 * Paper trading: EQ delivery / intraday, F&O, commodities.
 * Virtual capital only — stored in localStorage (investtrack-paper-v1).
 */
(function () {
  var KEY = "investtrack-paper-v1";
  var DEFAULT_CASH = 1000000;

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function money(n) {
    n = Number(n) || 0;
    var sign = n < 0 ? "-" : "";
    return sign + "\u20b9" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  function cls(n) {
    n = Number(n);
    if (!isFinite(n) || n === 0) return "muted";
    return n > 0 ? "green" : "red";
  }
  function uid() {
    return "pt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || "null");
      if (d && typeof d.cash === "number") return d;
    } catch (e) {}
    return {
      cash: DEFAULT_CASH,
      startingCash: DEFAULT_CASH,
      positions: [],
      closed: [],
      createdAt: new Date().toISOString()
    };
  }
  function save(d) {
    localStorage.setItem(KEY, JSON.stringify(d));
  }

  function hideResearch() {
    document.querySelectorAll('[data-page="research"]').forEach(function (b) {
      b.style.display = "none";
    });
  }

  function injectNav() {
    var nav = document.querySelector(".nav");
    if (!nav || nav.querySelector('[data-page="paper"]')) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-page", "paper");
    btn.innerHTML = "\uD83D\uDCC8 <span>Paper trade</span>";
    var after =
      nav.querySelector('[data-page="transactions"]') ||
      nav.querySelector('[data-page="holdings"]') ||
      nav.lastElementChild;
    if (after && after.nextSibling) nav.insertBefore(btn, after.nextSibling);
    else nav.appendChild(btn);
  }

  function unrealized(p) {
    var qty = Number(p.qty) || 0;
    var entry = Number(p.entry) || 0;
    var mark = Number(p.mark != null ? p.mark : p.entry) || entry;
    var mult = Number(p.lotMult) || 1;
    if (p.side === "SELL") return (entry - mark) * qty * mult;
    return (mark - entry) * qty * mult;
  }

  function render() {
    var view = document.getElementById("view");
    if (!view) return;
    var title = document.getElementById("title");
    if (title) title.textContent = "Paper trade";
    document.querySelectorAll(".nav button, .bottomnav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "paper");
    });

    var d = load();
    var open = d.positions || [];
    var closed = (d.closed || []).slice().reverse().slice(0, 40);
    var uPnL = open.reduce(function (s, p) {
      return s + unrealized(p);
    }, 0);
    var rPnL = (d.closed || []).reduce(function (s, p) {
      return s + (Number(p.realized) || 0);
    }, 0);
    var equityDisp = d.cash + uPnL;

    var openRows =
      open
        .map(function (p) {
          var up = unrealized(p);
          return (
            "<tr><td><b>" +
            esc(p.symbol) +
            '</b><div class="sub">' +
            esc(p.segment) +
            " \u00b7 " +
            esc(p.style) +
            " \u00b7 " +
            esc(p.side) +
            "</div></td><td>" +
            esc(p.qty) +
            "</td><td>" +
            money(p.entry) +
            '</td><td><input class="input" style="width:100px" data-pt-mark="' +
            esc(p.id) +
            '" value="' +
            esc(p.mark != null ? p.mark : p.entry) +
            '"></td><td class="' +
            cls(up) +
            '">' +
            money(up) +
            '</td><td><button type="button" class="btn" data-pt-close="' +
            esc(p.id) +
            '">Close</button></td></tr>'
          );
        })
        .join("") ||
      '<tr><td colspan="6" class="muted">No open paper positions. Place a trade below.</td></tr>';

    var closedRows =
      closed
        .map(function (p) {
          return (
            "<tr><td>" +
            esc(p.symbol) +
            '</td><td class="sub">' +
            esc(p.segment) +
            " \u00b7 " +
            esc(p.style) +
            "</td><td>" +
            esc(p.side) +
            "</td><td>" +
            esc(p.qty) +
            "</td><td>" +
            money(p.entry) +
            "</td><td>" +
            money(p.exit) +
            '</td><td class="' +
            cls(p.realized) +
            '">' +
            money(p.realized) +
            "</td><td class=\"sub\">" +
            esc((p.closedAt || "").slice(0, 16).replace("T", " ")) +
            "</td></tr>"
          );
        })
        .join("") ||
      '<tr><td colspan="8" class="muted">No closed trades yet.</td></tr>';

    view.innerHTML =
      '<div class="head"><div><h2>\uD83D\uDCC8 Paper trade</h2><div class="muted">Virtual money only \u2014 EQ delivery / intraday, futures, options, commodities. Not linked to real portfolio.</div></div>' +
      '<button type="button" class="btn" id="pt-reset">Reset account</button></div>' +
      '<div class="grid stats" style="margin-top:10px">' +
      '<div class="card"><div class="label">Cash</div><div class="big">' +
      money(d.cash) +
      "</div></div>" +
      '<div class="card"><div class="label">Open P/L</div><div class="big ' +
      cls(uPnL) +
      '">' +
      money(uPnL) +
      "</div></div>" +
      '<div class="card"><div class="label">Realised P/L</div><div class="big ' +
      cls(rPnL) +
      '">' +
      money(rPnL) +
      "</div></div>" +
      '<div class="card"><div class="label">Equity (cash + open P/L)</div><div class="big">' +
      money(equityDisp) +
      "</div></div></div>" +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 10px;font-size:15px">\u2795 New paper order</h2>' +
      '<form id="pt-form" class="form" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">' +
      '<div class="field"><label class="muted">Segment</label><select class="select wide" name="segment">' +
      '<option value="EQ">Equity</option><option value="FUT">Futures</option><option value="OPT">Options</option><option value="CMDTY">Commodity</option></select></div>' +
      '<div class="field"><label class="muted">Style</label><select class="select wide" name="style">' +
      '<option value="DELIVERY">Delivery / hold (upto 1yr)</option><option value="INTRADAY">Intraday</option></select></div>' +
      '<div class="field"><label class="muted">Side</label><select class="select wide" name="side"><option value="BUY">Buy</option><option value="SELL">Sell / short</option></select></div>' +
      '<div class="field"><label class="muted">Symbol</label><input class="input wide" name="symbol" required placeholder="RELIANCE / BANKNIFTY / GOLD"></div>' +
      '<div class="field"><label class="muted">Qty / lots</label><input class="input wide" name="qty" type="number" min="0.01" step="any" required value="1"></div>' +
      '<div class="field"><label class="muted">Entry price</label><input class="input wide" name="entry" type="number" min="0" step="any" required></div>' +
      '<div class="field"><label class="muted">Lot multiplier</label><input class="input wide" name="lotMult" type="number" min="1" step="1" value="1" title="F&O lot size e.g. 15, 25"></div>' +
      '<div class="field"><label class="muted">Notes</label><input class="input wide" name="notes" placeholder="Strike / expiry optional"></div>' +
      '<div class="field" style="display:flex;align-items:end"><button type="submit" class="btn primary wide">Place order</button></div></form>' +
      '<p class="muted" style="margin:10px 0 0;line-height:1.4">Intraday: close same day ideally. Delivery: hold up to ~1 year in this simulator. F&amp;O / commodity use lot multiplier for P/L. Prices are manual (paper).</p></div>' +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 8px;font-size:15px">Open positions</h2>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>Contract</th><th>Qty</th><th>Entry</th><th>Mark</th><th>Unrealised</th><th></th></tr></thead><tbody>' +
      openRows +
      "</tbody></table></div></div>" +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 8px;font-size:15px">Closed trades</h2>' +
      '<div class="tablewrap"><table class="table"><thead><tr><th>Symbol</th><th>Type</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit</th><th>P/L</th><th>When</th></tr></thead><tbody>' +
      closedRows +
      "</tbody></table></div></div>";

    wire();
  }

  function wire() {
    var form = document.getElementById("pt-form");
    if (form) {
      form.onsubmit = function (e) {
        e.preventDefault();
        var o = Object.fromEntries(new FormData(form));
        var qty = Number(o.qty);
        var entry = Number(o.entry);
        var lotMult = Number(o.lotMult) || 1;
        if (!o.symbol || !(qty > 0) || !(entry > 0)) return alert("Fill symbol, qty, entry");
        var d = load();
        var notional = qty * entry * lotMult;
        var margin =
          o.segment === "EQ" && o.side === "BUY" && o.style === "DELIVERY"
            ? notional
            : Math.max(notional * 0.2, entry * qty * 0.2);
        if (d.cash < margin) return alert("Insufficient paper cash. Need ~" + money(margin));
        d.cash -= margin;
        d.positions.push({
          id: uid(),
          symbol: String(o.symbol).toUpperCase().trim(),
          segment: o.segment,
          style: o.style,
          side: o.side,
          qty: qty,
          entry: entry,
          mark: entry,
          lotMult: lotMult,
          margin: margin,
          notes: o.notes || "",
          openedAt: new Date().toISOString(),
          openDate: today()
        });
        save(d);
        render();
      };
    }

    document.querySelectorAll("[data-pt-mark]").forEach(function (inp) {
      inp.onchange = function () {
        var id = inp.getAttribute("data-pt-mark");
        var d = load();
        d.positions = (d.positions || []).map(function (p) {
          if (p.id !== id) return p;
          return Object.assign({}, p, { mark: Number(inp.value) || p.entry });
        });
        save(d);
        render();
      };
    });

    document.querySelectorAll("[data-pt-close]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-pt-close");
        var d = load();
        var p = (d.positions || []).find(function (x) {
          return x.id === id;
        });
        if (!p) return;
        var exitStr = prompt("Exit / mark price", String(p.mark != null ? p.mark : p.entry));
        if (exitStr == null) return;
        var exit = Number(exitStr);
        if (!(exit > 0)) return alert("Invalid exit");
        var realized = 0;
        var mult = Number(p.lotMult) || 1;
        if (p.side === "SELL") realized = (Number(p.entry) - exit) * Number(p.qty) * mult;
        else realized = (exit - Number(p.entry)) * Number(p.qty) * mult;
        d.cash += Number(p.margin) || 0;
        d.cash += realized;
        d.positions = d.positions.filter(function (x) {
          return x.id !== id;
        });
        d.closed = d.closed || [];
        d.closed.push(
          Object.assign({}, p, {
            exit: exit,
            realized: realized,
            closedAt: new Date().toISOString()
          })
        );
        save(d);
        render();
      };
    });

    var reset = document.getElementById("pt-reset");
    if (reset)
      reset.onclick = function () {
        if (!confirm("Reset paper account to \u20b910,00,000 and clear all trades?")) return;
        localStorage.removeItem(KEY);
        render();
      };
  }

  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-page="paper"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      render();
    },
    true
  );

  function boot() {
    hideResearch();
    injectNav();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setInterval(hideResearch, 2000);
  console.log("[paper-trading-ui] ready v1");
})();
