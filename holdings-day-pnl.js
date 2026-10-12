"use strict";
/**
 * Holdings table: Day P/L column after quote refresh.
 */
(function () {
  function money(n) {
    n = Number(n) || 0;
    var sign = n < 0 ? "-" : n > 0 ? "+" : "";
    return (
      sign +
      "\u20b9" +
      Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })
    );
  }
  function pct(n) {
    if (!isFinite(n)) return "\u2014";
    return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function loadQuotes() {
    try {
      return JSON.parse(localStorage.getItem("investtrack-quotes") || "{}") || {};
    } catch (e) {
      return {};
    }
  }
  function isHoldingsView() {
    var title = document.getElementById("title");
    if (title && /holding/i.test(title.textContent || "")) return true;
    var active = document.querySelector(
      '.nav button.active[data-page="holdings"], button.active[data-page="holdings"]'
    );
    if (active) return true;
    var tab = document.querySelector('[data-nav-tab="holdings"].primary');
    return !!tab;
  }
  function parseNum(txt) {
    if (txt == null) return NaN;
    var s = String(txt).replace(/[^\d.\-]/g, "");
    return Number(s);
  }
  function inject() {
    if (!isHoldingsView()) return;
    var wrap =
      document.querySelector("#hm .tablewrap table.table") ||
      document.querySelector("#view .tablewrap table.table");
    if (!wrap) return;
    var thead = wrap.querySelector("thead tr");
    var body = wrap.querySelector("tbody");
    if (!thead || !body) return;

    if (!thead.querySelector("[data-day-pnl-h]")) {
      var th = document.createElement("th");
      th.setAttribute("data-day-pnl-h", "1");
      th.textContent = "Day P/L";
      var cells = thead.children;
      if (cells.length >= 2) thead.insertBefore(th, cells[cells.length - 1]);
      else thead.appendChild(th);
    }

    var q = loadQuotes();
    var totalDay = 0;
    var hasAny = false;

    body.querySelectorAll("tr").forEach(function (tr) {
      var tds = tr.children;
      if (tds.length < 5) return;
      var sub = tr.querySelector(".sub");
      var subText = (sub && sub.textContent) || "";
      var symbol = subText.split("\u00b7")[0].trim().split(/\s+/)[0].trim();
      if (!symbol) {
        symbol = subText.split("·")[0].trim().split(/\s+/)[0].trim();
      }
      if (!symbol) return;

      var qty = parseNum(tds[1] && tds[1].textContent);
      var current = parseNum(tds[3] && tds[3].textContent);
      if (!isFinite(current) || current <= 0) current = Number(q[symbol]);
      var prev = Number(q[symbol + "_prevClose"]);

      var cell = tr.querySelector("[data-day-pnl-cell]");
      if (!cell) {
        cell = document.createElement("td");
        cell.setAttribute("data-day-pnl-cell", "1");
        tr.insertBefore(cell, tds[tds.length - 1]);
      }

      if (isFinite(prev) && prev > 0 && isFinite(current) && isFinite(qty) && qty > 0) {
        var dayPnl = (current - prev) * qty;
        var dayPct = ((current - prev) / prev) * 100;
        totalDay += dayPnl;
        hasAny = true;
        cell.className = dayPnl >= 0 ? "green" : "red";
        cell.innerHTML =
          "<b>" + money(dayPnl) + "</b> <span class=\"sub\">(" + pct(dayPct) + ")</span>";
      } else {
        cell.className = "muted";
        cell.innerHTML = "\u2014<div class=\"sub\">Refresh quotes</div>";
      }
    });

    var hm = document.getElementById("hm") || wrap.parentNode;
    var bar = document.getElementById("holdingsDayBar");
    if (!bar && hm) {
      bar = document.createElement("div");
      bar.id = "holdingsDayBar";
      bar.className = "card";
      bar.style.cssText = "margin:0 0 12px;padding:12px 14px";
      if (hm.firstChild) hm.insertBefore(bar, hm.firstChild);
      else hm.appendChild(bar);
    }
    if (bar) {
      if (hasAny) {
        bar.innerHTML =
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
          '<div><div class="label">Portfolio day P/L</div><div class="muted" style="margin-top:2px">Updates after Refresh quotes</div></div>' +
          '<div class="big ' +
          (totalDay >= 0 ? "green" : "red") +
          '" style="margin:0">' +
          money(totalDay) +
          "</div></div>";
      } else {
        bar.innerHTML =
          '<div class="muted">Day P/L needs a quote refresh. Click <b>Refresh quotes</b> at the top.</div>';
      }
    }
  }

  function boot() {
    inject();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  document.addEventListener(
    "click",
    function (e) {
      var t =
        e.target &&
        e.target.closest &&
        e.target.closest(
          '[data-page="holdings"],[data-nav-tab="holdings"],[data-nav-group="portfolio"],#refresh'
        );
      if (t) {
        setTimeout(inject, 100);
        setTimeout(inject, 400);
        setTimeout(inject, 1000);
        setTimeout(inject, 2000);
      }
    },
    true
  );

  var view = document.getElementById("view");
  if (view) {
    new MutationObserver(function () {
      if (isHoldingsView()) setTimeout(inject, 30);
    }).observe(view, { childList: true, subtree: true });
  }
  setInterval(function () {
    if (isHoldingsView()) inject();
  }, 2000);

  console.log("[holdings-day-pnl] ready v2");
})();
