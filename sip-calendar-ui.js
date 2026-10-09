"use strict";
/**
 * SIP calendar + FII/DII (Moneycontrol cash & F&O).
 * Auto-sync once per day; table shows last 10 with expand; FII Idx Fut/Opt columns.
 */
(function () {
  var CACHE = "investtrack-sip-calendar-v2";
  var HIST = "investtrack-fiidii-hist-v1";
  var MODE_KEY = "investtrack-fiidii-mode";

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
      ".sc-toggle{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden}" +
      ".sc-toggle button{border:0;background:transparent;color:inherit;padding:8px 14px;cursor:pointer;font-weight:600;font-size:13px}" +
      ".sc-toggle button.active{background:rgba(143,211,182,.2)}" +
      "@media (max-width:700px){.sc-grid{grid-template-columns:repeat(4,1fr)}}";
    document.head.appendChild(s);
  }

  function getMode() {
    try {
      return localStorage.getItem(MODE_KEY) === "monthly" ? "monthly" : "daily";
    } catch (e) {
      return "daily";
    }
  }
  function setMode(m) {
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch (e) {}
  }

  function mergeHist(dailyCash, dailyFno) {
    var hist = { cash: {}, fno: {} };
    try {
      hist = JSON.parse(localStorage.getItem(HIST) || "{}") || { cash: {}, fno: {} };
    } catch (e) {
      hist = { cash: {}, fno: {} };
    }
    if (!hist.cash) hist.cash = {};
    if (!hist.fno) hist.fno = {};
    (dailyCash || []).forEach(function (r) {
      if (r && r.date) hist.cash[r.date] = r;
    });
    (dailyFno || []).forEach(function (r) {
      if (r && r.date) hist.fno[r.date] = r;
    });
    try {
      localStorage.setItem(HIST, JSON.stringify(hist));
    } catch (e) {}
    var cash = Object.keys(hist.cash)
      .filter(function (d) {
        return d >= "2026-01-01";
      })
      .sort()
      .map(function (d) {
        return hist.cash[d];
      });
    var fno = Object.keys(hist.fno)
      .filter(function (d) {
        return d >= "2026-01-01";
      })
      .sort()
      .map(function (d) {
        return hist.fno[d];
      });
    return { cash: cash, fno: fno };
  }

  function monthlyFrom(cash, fno) {
    var map = {};
    (cash || []).forEach(function (d) {
      var k = String(d.date).slice(0, 7);
      if (!map[k])
        map[k] = {
          month: k,
          sessions: 0,
          fiiNet: 0,
          diiNet: 0,
          fiiBuy: 0,
          fiiSell: 0,
          diiBuy: 0,
          diiSell: 0,
          futNet: 0,
          optNet: 0
        };
      var m = map[k];
      m.sessions++;
      m.fiiNet += d.fiiNet || 0;
      m.diiNet += d.diiNet || 0;
      m.fiiBuy += d.fiiBuy || 0;
      m.fiiSell += d.fiiSell || 0;
      m.diiBuy += d.diiBuy || 0;
      m.diiSell += d.diiSell || 0;
    });
    (fno || []).forEach(function (d) {
      var k = String(d.date).slice(0, 7);
      if (!map[k])
        map[k] = {
          month: k,
          sessions: 0,
          fiiNet: 0,
          diiNet: 0,
          fiiBuy: 0,
          fiiSell: 0,
          diiBuy: 0,
          diiSell: 0,
          futNet: 0,
          optNet: 0
        };
      map[k].futNet += d.futNet || 0;
      map[k].optNet += d.optNet || 0;
    });
    return Object.keys(map)
      .sort()
      .map(function (k) {
        return map[k];
      });
  }

  function heatColor(avg) {
    if (avg == null) return "";
    if (avg <= -0.05) return "soft";
    if (avg >= 0.08) return "strong";
    return "";
  }

  function render(data) {
    injectCss();
    var mode = getMode();
    var sea = data.seasonality || {};
    var byDom = sea.byDayOfMonth || [];
    var byDow = sea.byWeekday || [];
    var soft = sea.softDays || [];
    var strong = sea.strongDays || [];
    var fd = data.fiiDii || {};
    var merged = mergeHist(fd.dailyCash || [], fd.dailyFno || []);
    var dailyCash = merged.cash;
    var dailyFno = merged.fno;
    var monthly = monthlyFrom(dailyCash, dailyFno);
    var today = new Date().getDate();
    var latest = dailyCash.length ? dailyCash[dailyCash.length - 1] : fd.latestCash;

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

    var fnoByDate = {};
    dailyFno.forEach(function (r) {
      fnoByDate[r.date] = r;
    });

    var tableBody;
    if (mode === "monthly") {
      if (!monthly.length) {
        tableBody =
          '<tr><td colspan="8" class="muted">No monthly rows yet (need daily history).</td></tr>';
      } else {
        tableBody = monthly
          .map(function (m) {
            return (
              "<tr><td><b>" +
              esc(m.month) +
              '</b><div class="sub">' +
              m.sessions +
              ' sessions in cache</div></td><td class="' +
              cls(m.fiiNet) +
              '">' +
              moneyCr(m.fiiNet) +
              '</td><td class="' +
              cls(m.diiNet) +
              '">' +
              moneyCr(m.diiNet) +
              '</td><td class="' +
              cls(m.futNet) +
              '">' +
              moneyCr(m.futNet) +
              '</td><td class="' +
              cls(m.optNet) +
              '">' +
              moneyCr(m.optNet) +
              "</td></tr>"
            );
          })
          .join("");
      }
    } else {
      var rows = dailyCash.slice().reverse();
      if (!rows.length) {
        tableBody = '<tr><td colspan="8" class="muted">No daily FII/DII yet.</td></tr>';
      } else {
        var expanded = false;
        try {
          expanded = sessionStorage.getItem("investtrack-fiidii-expanded") === "1";
        } catch (e) {}
        var show = expanded ? rows : rows.slice(0, 10);
        tableBody = show
          .map(function (r) {
            var f = fnoByDate[r.date] || {};
            return (
              "<tr><td>" +
              esc(r.date) +
              '</td><td class="' +
              cls(r.fiiNet) +
              '">' +
              moneyCr(r.fiiNet) +
              '</td><td class="' +
              cls(r.diiNet) +
              '">' +
              moneyCr(r.diiNet) +
              '</td><td class="' +
              cls(f.futNet) +
              '">' +
              moneyCr(f.futNet) +
              '</td><td class="' +
              cls(f.optNet) +
              '">' +
              moneyCr(f.optNet) +
              "</td></tr>"
            );
          })
          .join("");
        if (rows.length > 10) {
          tableBody +=
            '<tr><td colspan="5" style="text-align:center;padding:12px">' +
            '<button type="button" class="btn" id="sc-expand-rows">' +
            (expanded
              ? "Show last 10 only"
              : "Show all " + rows.length + " sessions") +
            "</button></td></tr>";
        }
      }
    }

    var toggle =
      '<div class="sc-toggle" role="group" aria-label="FII DII period">' +
      '<button type="button" data-sc-mode="daily" class="' +
      (mode === "daily" ? "active" : "") +
      '">Daily</button>' +
      '<button type="button" data-sc-mode="monthly" class="' +
      (mode === "monthly" ? "active" : "") +
      '">Monthly</button></div>';

    return (
      '<div class="head"><div><h2>\uD83D\uDCC6 SIP calendar</h2><div class="muted">Nifty seasonality + FII/DII from Moneycontrol (cash & F&O)</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      toggle +
      '<button type="button" class="btn primary" id="sc-refresh">Refresh</button></div></div>' +
      '<div class="notice sc-note" style="margin-top:10px">FII/DII <b>auto-saves once per day</b> when you open the app (after market data is published). Moneycontrol free feed is ~30 sessions; local history grows over time.</div>' +
      (latest
        ? '<div class="grid stats" style="margin-top:12px">' +
          '<div class="card"><div class="label">Latest FII cash net</div><div class="sc-kpi ' +
          cls(latest.fiiNet) +
          '">' +
          moneyCr(latest.fiiNet) +
          '</div><div class="muted">' +
          esc(latest.date) +
          "</div></div>" +
          '<div class="card"><div class="label">Latest DII cash net</div><div class="sc-kpi ' +
          cls(latest.diiNet) +
          '">' +
          moneyCr(latest.diiNet) +
          '</div><div class="muted">' +
          esc(latest.date) +
          "</div></div>" +
          '<div class="card"><div class="label">History in this browser</div><div class="big">' +
          dailyCash.length +
          ' days</div><div class="muted">' +
          monthly.length +
          " month(s)</div></div></div>"
        : "") +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 8px;font-size:15px">\uD83C\uDFE6 FII / DII \u2014 ' +
      (mode === "monthly" ? "Monthly" : "Daily") +
      " (cash + F&O)</h2>" +
      '<div class="muted" style="margin-bottom:8px">Cash + FII index futures & FII index options (Moneycontrol). Daily view shows last 10 by default.</div>' +
      '<div class="tablewrap"><table class="table"><thead><tr>' +
      (mode === "monthly"
        ? "<th>Month</th><th>FII cash</th><th>DII cash</th><th>FII Idx Fut</th><th>FII Idx Opt</th>"
        : "<th>Date</th><th>FII cash</th><th>DII cash</th><th>FII Idx Fut</th><th>FII Idx Opt</th>") +
      "</tr></thead><tbody>" +
      tableBody +
      "</tbody></table></div></div>" +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 8px;font-size:15px">\uD83C\uDFAF Suggested softer SIP days</h2>' +
      '<div class="muted" style="margin-bottom:8px">Historically weaker average Nifty daily returns</div><div>' +
      (softChips || "\u2014") +
      '</div><div class="muted" style="margin-top:10px">Stronger days</div><div style="margin-top:6px">' +
      (strongChips || "\u2014") +
      "</div></div>" +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 10px;font-size:15px">\uD83D\uDCCA Day of month (avg Nifty %)</h2><div class="sc-grid">' +
      cal +
      "</div></div>" +
      '<div class="card" style="margin-top:12px"><h2 style="margin:0 0 10px;font-size:15px">\uD83D\uDDD3 Weekday pattern</h2><div class="grid stats">' +
      dow +
      "</div></div>" +
      '<div class="muted" style="margin-top:12px;font-size:11px">Source: ' +
      esc((fd.source || data.source || "") + "") +
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
          Date.now() - new Date(cached.asOf).getTime() < 3 * 3600 * 1000
        ) {
          view.innerHTML = render(cached);
          wire(cached);
          return;
        }
      } catch (e) {}
    }
    view.innerHTML =
      '<div class="head"><h2>\uD83D\uDCC6 SIP calendar</h2></div><div class="notice">Loading Moneycontrol FII/DII + seasonality\u2026</div>';
    try {
      var r = await fetch("/api/sip-calendar?t=" + Date.now());
      if (!r.ok) throw new Error("HTTP " + r.status);
      var data = await r.json();
      if (data.error) throw new Error(data.error);
      try {
        localStorage.setItem(CACHE, JSON.stringify(data));
      } catch (e) {}
      view.innerHTML = render(data);
      wire(data);
    } catch (e) {
      view.innerHTML =
        '<div class="head"><h2>\uD83D\uDCC6 SIP calendar</h2></div><div class="notice">Failed: ' +
        esc(e.message) +
        "</div>";
    }
  }

  function wire(data) {
    var b = document.getElementById("sc-refresh");
    if (b)
      b.onclick = function () {
        load(true);
      };
    document.querySelectorAll("[data-sc-mode]").forEach(function (btn) {
      btn.onclick = function () {
        setMode(btn.getAttribute("data-sc-mode"));
        if (data) {
          var view = document.getElementById("view");
          if (view) {
            view.innerHTML = render(data);
            wire(data);
          }
        } else load(false);
      };
    });
    var exp = document.getElementById("sc-expand-rows");
    if (exp) {
      exp.onclick = function () {
        try {
          var cur = sessionStorage.getItem("investtrack-fiidii-expanded") === "1";
          sessionStorage.setItem("investtrack-fiidii-expanded", cur ? "0" : "1");
        } catch (e) {}
        if (data) {
          var view = document.getElementById("view");
          if (view) {
            view.innerHTML = render(data);
            wire(data);
          }
        }
      };
    }
  }

  function autoSyncToday() {
    try {
      var dayKey = "investtrack-fiidii-last-sync";
      var today = new Date().toISOString().slice(0, 10);
      if (localStorage.getItem(dayKey) === today) return;
      fetch("/api/sip-calendar?t=" + Date.now())
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          if (!data || !data.fiiDii) return;
          mergeHist(data.fiiDii.dailyCash || [], data.fiiDii.dailyFno || []);
          try {
            localStorage.setItem(CACHE, JSON.stringify(data));
            localStorage.setItem(dayKey, today);
          } catch (e) {}
          console.log("[sip-calendar-ui] auto-synced FII/DII for", today);
        })
        .catch(function () {});
    } catch (e) {}
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
    autoSyncToday();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 600);
  setTimeout(boot, 1500);
  console.log("[sip-calendar-ui] ready v3 last10 + idx opt + auto-sync");
})();
