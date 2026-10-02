"use strict";
/**
 * Holding vs sector: when sector scrip table is shown, mark rows you hold.
 */
(function () {
  function heldSet() {
    try {
      var st = JSON.parse(localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3") || "null");
      if (!st || !st.transactions) return {};
      var qty = {};
      st.transactions.forEach(function (t) {
        if (!t || !t.symbol) return;
        if (["STOCK", "ETF"].indexOf(t.type) < 0) return;
        var k = String(t.symbol).toUpperCase();
        var q = Number(t.qty) || 0;
        if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) + q;
        else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) - q;
      });
      var out = {};
      Object.keys(qty).forEach(function (k) {
        if (qty[k] > 1e-8) out[k] = true;
      });
      return out;
    } catch (e) {
      return {};
    }
  }

  function mark() {
    var view = document.getElementById("view");
    if (!view) return;
    var table = view.querySelector("table.table");
    if (!table) return;
    var rows = table.querySelectorAll("tbody tr");
    if (!rows.length) return;
    var hasSector = false;
    rows.forEach(function (tr) {
      if (tr.querySelector("[data-sector-research]")) hasSector = true;
    });
    if (!hasSector) return;

    var held = heldSet();
    var heldCount = 0;
    rows.forEach(function (tr) {
      if (tr.getAttribute("data-held-marked")) return;
      var btn = tr.querySelector("[data-sector-research]");
      if (!btn) return;
      var sym = (btn.getAttribute("data-sector-research") || "").toUpperCase();
      tr.setAttribute("data-held-marked", "1");
      if (!held[sym]) return;
      heldCount++;
      tr.style.outline = "1px solid rgba(80,200,120,0.45)";
      tr.style.background = "rgba(40,90,60,0.18)";
      var first = tr.querySelector("td");
      if (first && !first.querySelector(".held-pill")) {
        var pill = document.createElement("span");
        pill.className = "pill held-pill";
        pill.style.cssText = "margin-left:6px;background:#1a3a2a;color:var(--green)";
        pill.textContent = "You hold";
        var asset = first.querySelector(".asset") || first;
        asset.appendChild(pill);
      }
    });

    if (heldCount && !view.querySelector("#heldSectorNote")) {
      var note = document.createElement("div");
      note.id = "heldSectorNote";
      note.className = "notice";
      note.style.marginTop = "8px";
      note.textContent =
        heldCount + " name(s) in this sector are in your holdings (highlighted).";
      var body = document.getElementById("sectorsBody");
      if (body) body.insertBefore(note, body.firstChild);
    }
  }

  function watch() {
    var view = document.getElementById("view");
    if (!view) {
      setTimeout(watch, 300);
      return;
    }
    new MutationObserver(function () {
      mark();
    }).observe(view, { childList: true, subtree: true });
    mark();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
  console.log("[holdings-sector] ready");
})();
