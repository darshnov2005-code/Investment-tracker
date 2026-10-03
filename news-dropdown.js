"use strict";
/* Portfolio symbol dropdown on News — labeled and hard to miss */
(function () {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getSymbols() {
    try {
      var raw = localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3");
      if (!raw) return [];
      var st = JSON.parse(raw);
      var qty = {};
      var meta = {};
      (st.transactions || []).forEach(function (t) {
        if (!t || !t.symbol) return;
        if (["STOCK", "ETF"].indexOf(t.type) < 0) return;
        var k = String(t.symbol).toUpperCase();
        var q = Number(t.qty) || 0;
        if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) + q;
        else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) qty[k] = (qty[k] || 0) - q;
        meta[k] = { symbol: k, name: t.name || k };
      });
      var held = Object.keys(qty)
        .filter(function (k) { return qty[k] > 1e-8; })
        .map(function (k) { return meta[k]; });
      if (held.length) return held.sort(function (a, b) { return a.symbol.localeCompare(b.symbol); });
      return Object.keys(meta).sort().map(function (k) { return meta[k]; });
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

    var holdings = getSymbols();
    var bar = document.createElement("div");
    bar.id = "newsDropBar";
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0 4px;width:100%";
    bar.innerHTML =
      '<label for="newsSymbolSelect" style="font-size:12px;font-weight:700;white-space:nowrap">\uD83D\uDCF0 Pick holding</label>';

    var select = document.createElement("select");
    select.id = "newsSymbolSelect";
    select.className = "select";
    select.style.cssText = "min-width:220px;max-width:100%;font-weight:600";
    if (!holdings.length) {
      select.innerHTML = '<option value="">No stock/ETF holdings found \u2014 type a symbol below</option>';
    } else {
      select.innerHTML =
        '<option value="">\u2014 Select portfolio stock / ETF \u2014</option>' +
        holdings
          .map(function (h) {
            var label = h.symbol + (h.name && h.name !== h.symbol ? " \u2014 " + String(h.name).slice(0, 40) : "");
            return '<option value="' + esc(h.symbol) + '">' + esc(label) + "</option>";
          })
          .join("");
    }

    select.addEventListener("change", function () {
      if (!select.value) return;
      search.value = select.value;
      var btn = document.getElementById("newsRun");
      if (btn) btn.click();
    });

    bar.appendChild(select);
    var searchRow = search.closest(".search") || search.parentElement;
    if (searchRow && searchRow.parentNode) {
      searchRow.parentNode.insertBefore(bar, searchRow);
    } else if (search.parentElement) {
      search.parentElement.insertBefore(bar, search);
    }
  }

  function watchNews() {
    var view = document.getElementById("view");
    if (!view) {
      setTimeout(watchNews, 250);
      return;
    }
    new MutationObserver(function () {
      enhanceNewsPage();
    }).observe(view, { childList: true, subtree: true });
    enhanceNewsPage();
  }

  document.addEventListener(
    "click",
    function (e) {
      var n = e.target && e.target.closest && e.target.closest('[data-page="news"]');
      if (n) setTimeout(enhanceNewsPage, 80);
    },
    true
  );

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchNews);
  else watchNews();
  setTimeout(watchNews, 800);
  console.log("[news-dropdown] ready v2");
})();
