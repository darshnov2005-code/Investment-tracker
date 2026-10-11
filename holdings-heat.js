"use strict";
/** Overlay: highlight sectors you hold on the heatmap */
(function () {
  var SYM_SECTOR = {
    HDFCBANK: "BANK", ICICIBANK: "BANK", SBIN: "PSUBANK", KOTAKBANK: "BANK", AXISBANK: "BANK",
    INDUSINDBK: "BANK", BANKBARODA: "PSUBANK", PNB: "PSUBANK", FEDERALBNK: "BANK",
    TCS: "IT", INFY: "IT", WIPRO: "IT", HCLTECH: "IT", TECHM: "IT", LTIM: "IT", PERSISTENT: "IT",
    RELIANCE: "ENERGY", ONGC: "ENERGY", BPCL: "ENERGY", IOC: "ENERGY",
    TATASTEEL: "METAL", HINDALCO: "METAL", JSWSTEEL: "METAL", VEDL: "METAL", SAIL: "METAL", NMDC: "METAL",
    MARUTI: "AUTO", TATAMOTORS: "AUTO", "M&M": "AUTO", BAJAJ_AUTO: "AUTO", HEROMOTOCO: "AUTO", EICHERMOT: "AUTO",
    SUNPHARMA: "PHARMA", DRREDDY: "PHARMA", CIPLA: "PHARMA", DIVISLAB: "PHARMA",
    HINDUNILVR: "FMCG", ITC: "FMCG", NESTLEIND: "FMCG", BRITANNIA: "FMCG",
    BHARTIARTL: "TELECOM", NTPC: "POWER", POWERGRID: "POWER", TATAPOWER: "POWER",
    ULTRACEMCO: "CEMENT", SHREECEM: "CEMENT", AMBUJACEM: "CEMENT",
    BAJFINANCE: "FIN", BAJAJFINSV: "FIN", SBILIFE: "FIN", HDFCLIFE: "FIN",
    ASIANPAINT: "CONSUMER", TITAN: "CONSUMER", LT: "REALTY", DLF: "REALTY"
  };

  function heldBySector() {
    var map = {};
    try {
      var raw = localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3");
      if (!raw) return map;
      var st = JSON.parse(raw);
      function add(sym) {
        sym = String(sym || "").toUpperCase().replace(/\.NS$/i, "").replace(/\.BO$/i, "").trim();
        if (!sym) return;
        var sid = SYM_SECTOR[sym];
        if (!sid) return;
        if (!map[sid]) map[sid] = [];
        if (map[sid].indexOf(sym) < 0) map[sid].push(sym);
      }
      (st.transactions || []).forEach(function (t) { add(t.symbol); });
      (st.sips || []).forEach(function (s) { add(s.symbol); });
    } catch (e) {}
    return map;
  }

  function paint() {
    var body = document.getElementById("sectorsBody");
    if (!body) return;
    var map = heldBySector();
    body.querySelectorAll("[data-sector-open]").forEach(function (el) {
      var id = el.getAttribute("data-sector-open");
      var own = map[id] || map[String(id).toUpperCase()];
      if (!own || !own.length) return;
      if (el.querySelector(".heat-hold")) return;
      el.style.outline = "2px solid var(--amber)";
      el.style.boxShadow = "0 0 0 1px rgba(242,198,109,.35)";
      var d = document.createElement("div");
      d.className = "heat-hold";
      d.style.cssText = "margin-top:4px;font-size:10px;color:var(--amber);font-weight:700";
      d.textContent =
        "You hold \u00b7 " + own.slice(0, 3).join(", ") + (own.length > 3 ? " +" + (own.length - 3) : "");
      el.appendChild(d);
      el.title = "You hold: " + own.join(", ") + " \u2014 " + (el.title || "");
    });
  }

  function boot() {
    paint();
  }
  var view = document.getElementById("view");
  if (view) {
    new MutationObserver(function () {
      setTimeout(paint, 50);
    }).observe(view, { childList: true, subtree: true });
  }
  document.addEventListener(
    "click",
    function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-page="movers"],[data-page="sectors"]')) {
        setTimeout(paint, 400);
        setTimeout(paint, 1200);
      }
    },
    true
  );
  setInterval(paint, 1500);
  setTimeout(boot, 600);
  console.log("[holdings-heat] ready");
})();
