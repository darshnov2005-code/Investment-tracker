"use strict";
/* Restore portfolio stock dropdown on News page */
(function () {
  function getHoldingsFromStorage() {
    try {
      var raw = localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3");
      if (!raw) return [];
      var st = JSON.parse(raw);
      var map = {};
      (st.transactions || []).forEach(function (t) {
        if (!t || !t.symbol) return;
        if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) < 0) return;
        if (["STOCK", "ETF"].indexOf(t.type) < 0) return;
        map[t.symbol] = {
          symbol: t.symbol,
          name: t.name || t.symbol,
          exchange: t.exchange || "NSE"
        };
      });
      return Object.keys(map).sort().map(function (k) { return map[k]; });
    } catch (e) {
      return [];
    }
  }

  function enhanceNewsPage() {
    var view = document.getElementById("view");
    if (!view) return;
    var search = view.querySelector("#newsSymbol");
    if (!search) return;
    if (view.querySelector("#newsSymbolSelect")) return;

    var holdings = getHoldingsFromStorage();
    var select = document.createElement("select");
    select.id = "newsSymbolSelect";
    select.className = "select";
    select.style.minWidth = "180px";
    select.innerHTML =
      '<option value="">Portfolio stock\u2026</option>' +
      holdings
        .map(function (h) {
          var label = h.symbol + (h.name && h.name !== h.symbol ? " \u2014 " + String(h.name).slice(0, 36) : "");
          return '<option value="' + String(h.symbol).replace(/"/g, "") + '">' + label + "</option>";
        })
        .join("");

    select.addEventListener("change", function () {
      if (!select.value) return;
      search.value = select.value;
      var btn = document.getElementById("newsRun");
      if (btn) btn.click();
    });

    var wrap = search.parentElement;
    if (wrap) wrap.insertBefore(select, search);
  }

  function watchNews() {
    var view = document.getElementById("view");
    if (!view) {
      setTimeout(watchNews, 300);
      return;
    }
    new MutationObserver(function () {
      enhanceNewsPage();
    }).observe(view, { childList: true, subtree: true });
    enhanceNewsPage();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchNews);
  else watchNews();
  console.log("[news-dropdown] ready");
})();
