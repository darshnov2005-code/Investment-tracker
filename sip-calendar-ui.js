"use strict";
/**
 * SIP calendar: day-of-month seasonality + FII/DII cash (F&O placeholder).
 */
(function () {
  var CACHE = "investtrack-sip-calendar-v1";

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "\u2014";
    return new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: d == null ? 2 : d
    }).format(n);
  }
  function moneyCr(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    var sign = n < 0 ? "-" : n > 0 ? "+" : "";
    return sign + "\u20b9" + fmt(Math.abs(n), 2) + " Cr";
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    return (n >= 0 ? "+" : "") + fmt(n, 3) + "%";
  }
  function cls(n) {
    if (n == null || !isFinite(n)) return "muted";
    return n >= 0 ? "green" : "red";
  }

  function injectCss() {
    if (document.getElementById("sip-cal-css")) return;
    var s = document.createElement("style");
    s.id = "sip-cal-css";
    s.textContent =
      ".sc-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}" +
      ".sc-day{border:1px solid var(--line);border-radius:10px;padding:8px 6px;text-align:center;background:rgba(255,255,255,.03)}" +
      ".sc-day .d{font-size:11px;color:var(--muted);font-weight:600}" +
      ".sc-day .v{font-size:13px;font-weight:800;margin-top:4px}" +
      ".sc-day .s{font-size:10px;color:var(--muted);margin-top:2px}" +
      ".sc-day.soft{border-color:rgba(239,141,141,.55);background:rgba(239,141,141,.08)}" +
      ".sc-day.strong{border-color:rgba(143,211,182,.55);background:rgba(143,211,182,.08)}" +
      ".sc-day.today{outline:2px solid var(--green)}" +
      ".sc-kpi{font-size:22px;font-weight:800}" +
      ".sc-note{font-size:12px;color:var(--muted);line-height:1.45}" +
      "@media (max-width:700px){.sc-grid{grid-template-columns:repeat(4,1fr)}}";
    document.head.appendChild(s);
  }

  function heatColor(avg) {
    if (avg == null) return "";
    if (avg <= -0.05) return "soft";
    if (avg >= 0.08) return "strong";
    return "";
  }

  function render(data) {
    injectCss();
    var sea = data.seasonality || {};
    var byDom = sea.byDayOfMonth || [];
    var byDow = sea.byWeekday || [];
    var soft = sea.softDays || [];
    var strong = sea.strongDays || [];
    var cash = (data.fiiDii && data.fiiDii.cash) || {};
    var fno = (data.fiiDii && data.fiiDii.fno) || {};
    var today = new Date().getDate();

    var softChips = soft
      .map(function (d) {
        return (
          '<span class="wr-chip" style="border-color:rgba(239,141,141,.5)">Day ' +
          d +
          "</span>"
        );
      })
      .join(" ");
    var strongChips = strong
      .map(function (d) {
        return (
          '<span class="wr-chip" style="border-color:rgba(143,211,182,.5)">Day ' +
          d +
          "</span>"
        );
      })
      .join(" ");

    var cal = byDom
      .map(function (x) {
        var heat = heatColor(x.avgReturn);
        if (soft.indexOf(x.key) >= 0) heat = "soft";
        if (strong.indexOf(x.key) >= 0) heat = "strong";
        var tcls = x.key === today ? " today" : "";
        return (
          '<div class="sc-day ' +
          heat +
          tcls +
          '"><div class="d">' +
          x.key +
          '</div><div class="v ' +
          cls(x.avgReturn) +
          '">' +
          pct(x.avgReturn) +
          '</div><div class="s">' +
          (x.upPct != null ? fmt(x.upPct, 0) + "% up \u00b7 n=" + x.samples : "\u2014") +
          "</div></div>"
        );
      })
      .join("");

    var dow = byDow
      .map(function (x) {
        return (
          '<div class="card"><div class="label">' +
          esc(x.label || x.key) +
          '</div><div class="big ' +
          cls(x.avgReturn) +
          '">' +
          pct(x.avgReturn) +
          '</div><div class="muted">' +
          (x.upPct != null ? fmt(x.upPct, 0) + "% sessions green" : "") +
          "</div></div>"
        );
      })
      .join("");

    var fii = cash.fii || {};
    var dii = cash.dii || {};
    var cashHtml = cash.error
      ? '<div class="muted">' + esc(cash.error) + "</div>"
      : '<div class="grid stats" style="margin:0">' +
        '<div class="card"><div class="label">FII / FPI net (cash)</div><div class="sc-kpi ' +
        cls(fii.net) +
        '">' +
        moneyCr(fii.net) +
        '</div><div class="muted">Buy ' +
        moneyCr(fii.buy) +
        " \u00b7 Sell " +
        moneyCr(fii.sell) +
        "</div></div>" +
        '<div class="card"><div class="label">DII net (cash)</div><div class="sc-kpi ' +
        cls(dii.net) +
        '">' +
        moneyCr(dii.net) +
        '</div><div class="muted">Buy ' +
        moneyCr(dii.buy) +
        " \u00b7 Sell " +
        moneyCr(dii.sell) +
        "</div></div>" +
        '<div class="card"><div class="label">Session</div><div class="big">' +
        esc(cash.date || "\u2014") +
        '</div><div class="muted">NSE provisional</div></div></div>';

    var fnoHtml = fno.available
      ? "F&O data loaded"
      : '<div class="sc-note">' +
        esc(
          fno.note ||
            "F&O FII/DII is published by NSE after close. Free JSON is session-locked for now — cash FII/DII above is live."
        ) +
        "</div>";

    return (
      '<div class="head"><div><h2>\uD83D\uDCC6 SIP calendar</h2><div class="muted">Nifty day-of-month patterns (~' +
      esc(String(sea.years || "10")) +
      "y) \u00b7 pick softer debit days \u00b7 auto-updates after close</div></div>" +
      '<button type="button" class="btn primary" id="sc-refresh">Refresh</button></div>' +
      '<div class="notice sc-note" style="margin-top:10px">Past averages are <b>not</b> a prediction. Use as one input for SIP date \u2014 not timing advice.</div>' +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 8px;font-size:15px">\uD83C\uDFAF Suggested softer SIP days</h2>' +
      '<div class="muted" style="margin-bottom:8px">Historically weaker average Nifty daily returns (min ~40 samples)</div>' +
      "<div>" +
      (softChips || "\u2014") +
      '</div><div class="muted" style="margin-top:10px">Historically stronger days</div><div style="margin-top:6px">' +
      (strongChips || "\u2014") +
      "</div></div>" +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 10px;font-size:15px">\uD83D\uDCCA Day of month (avg Nifty daily %)</h2>' +
      '<div class="sc-grid">' +
      cal +
      "</div>" +
      '<div class="sc-note" style="margin-top:10px">Red-tinted = softer on average \u00b7 green-tinted = stronger \u00b7 outline = today\u2019s date</div></div>' +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 10px;font-size:15px">\uD83D\uDDD3 Weekday pattern</h2><div class="grid stats">' +
      dow +
      "</div></div>" +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 8px;font-size:15px">\uD83C\uDFE6 FII / DII \u2014 cash market</h2>' +
      '<div class="muted" style="margin-bottom:10px">Latest NSE session (auto after close)</div>' +
      cashHtml +
      "</div>" +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 8px;font-size:15px">\uD83D\uDCC8 FII / DII \u2014 F&O</h2>' +
      fnoHtml +
      "</div>" +
      '<div class="muted" style="margin-top:12px;font-size:11px">Source: ' +
      esc(data.source || "") +
      " \u00b7 as of " +
      esc((data.asOf || "").slice(0, 19)) +
      "</div>"
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
          Date.now() - new Date(cached.asOf).getTime() < 6 * 3600 * 1000
        ) {
          view.innerHTML = render(cached);
          wire();
          return;
        }
      } catch (e) {}
    }
    view.innerHTML =
      '<div class="head"><h2>\uD83D\uDCC6 SIP calendar</h2></div><div class="notice">Loading seasonality & FII/DII\u2026</div>';
    try {
      var r = await fetch("/api/sip-calendar?t=" + Date.now());
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json();
      if (data.error) throw new Error(data.error);
      try {
        localStorage.setItem(CACHE, JSON.stringify(data));
      } catch (e) {}
      view.innerHTML = render(data);
      wire();
    } catch (e) {
      view.innerHTML =
        '<div class="head"><h2>\uD83D\uDCC6 SIP calendar</h2></div><div class="notice">Failed: ' +
        esc(e.message) +
        "</div>";
    }
  }

  function wire() {
    var b = document.getElementById("sc-refresh");
    if (b)
      b.onclick = function () {
        load(true);
      };
  }

  function injectNav() {
    var nav = document.querySelector(".nav");
    if (!nav || nav.querySelector('[data-page="sipcal"]')) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-page", "sipcal");
    btn.textContent = "\uD83D\uDCC6 SIP day";
    var after =
      nav.querySelector('[data-page="weekly"]') ||
      nav.querySelector('[data-page="sips"]') ||
      nav.lastElementChild;
    if (after && after.nextSibling) nav.insertBefore(btn, after.nextSibling);
    else nav.appendChild(btn);
  }

  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-page="sipcal"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      document.querySelectorAll(".nav button").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-page") === "sipcal");
      });
      load(false);
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
  console.log("[sip-calendar-ui] ready v1");
})();
