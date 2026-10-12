"use strict";
/**
 * Simplified nav: Dashboard | Portfolio | SIPs | Markets | Settings
 */
(function () {
  var GROUP_KEY = "investtrack-nav-group";
  var TAB_KEY = "investtrack-nav-tab";

  var GROUPS = {
    dashboard: { label: "Dashboard", page: "dashboard", tabs: null },
    portfolio: {
      label: "Portfolio",
      tabs: [
        { id: "holdings", label: "Holdings", page: "holdings" },
        { id: "transactions", label: "Transactions", page: "transactions" },
        { id: "realized", label: "Realised P/L", page: "realized" }
      ]
    },
    sips: { label: "SIPs", page: "sips", tabs: null },
    markets: {
      label: "Markets",
      tabs: [
        { id: "movers", label: "Sector heatmap", page: "movers" },
        { id: "sipcal", label: "SIP day / FII", page: "sipcal" },
        { id: "weekly", label: "Weekly review", page: "weekly" }
      ]
    },
    settings: {
      label: "Settings",
      tabs: [
        { id: "settings", label: "Data & sync", page: "settings" },
        { id: "notes", label: "Notes", page: "notes" },
        { id: "watchlist", label: "Watchlist", page: "watchlist" },
        { id: "goals", label: "Goals", page: "goals" },
        { id: "import", label: "CSV import", page: "import" }
      ]
    }
  };

  var HIDE_PAGES = [
    "research", "paper", "ideas", "realized", "transactions", "holdings", "goals",
    "import", "movers", "sectors", "weekly", "sipcal", "notes", "watchlist", "review"
  ];

  function getGroup() {
    try { return localStorage.getItem(GROUP_KEY) || "dashboard"; } catch (e) { return "dashboard"; }
  }
  function setGroup(g) {
    try { localStorage.setItem(GROUP_KEY, g); } catch (e) {}
  }
  function getTab(group) {
    try {
      var all = JSON.parse(localStorage.getItem(TAB_KEY) || "{}");
      return all[group] || null;
    } catch (e) { return null; }
  }
  function setTab(group, tabId) {
    try {
      var all = JSON.parse(localStorage.getItem(TAB_KEY) || "{}");
      all[group] = tabId;
      localStorage.setItem(TAB_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function clickPage(page) {
    if (!page) return;
    if (page === "weekly" && window.__weeklyReviewLoad) {
      window.__weeklyReviewLoad(false);
      return;
    }
    var btn =
      document.querySelector('.nav button[data-page="' + page + '"]') ||
      document.querySelector('.bottomnav button[data-page="' + page + '"]') ||
      document.querySelector('button[data-page="' + page + '"]');
    if (btn) { btn.click(); return; }
    var fake = document.createElement("button");
    fake.setAttribute("data-page", page);
    fake.style.display = "none";
    document.body.appendChild(fake);
    fake.click();
    setTimeout(function () { if (fake.parentNode) fake.parentNode.removeChild(fake); }, 0);
  }

  function hideClutter() {
    HIDE_PAGES.forEach(function (p) {
      document.querySelectorAll('[data-page="' + p + '"]').forEach(function (b) {
        if (b.closest && b.closest(".nav")) b.style.display = "none";
      });
    });
  }

  function ensureGroupButtons() {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var map = {
      dashboard: nav.querySelector('[data-page="dashboard"]'),
      sips: nav.querySelector('[data-page="sips"]'),
      settings: nav.querySelector('[data-page="settings"]')
    };
    if (!nav.querySelector('[data-nav-group="portfolio"]')) {
      var pb = document.createElement("button");
      pb.type = "button";
      pb.setAttribute("data-nav-group", "portfolio");
      pb.innerHTML = "\u25A4 <span>Portfolio</span>";
      var after = map.dashboard || nav.firstElementChild;
      if (after && after.nextSibling) nav.insertBefore(pb, after.nextSibling);
      else nav.appendChild(pb);
    }
    if (!nav.querySelector('[data-nav-group="markets"]')) {
      var mb = document.createElement("button");
      mb.type = "button";
      mb.setAttribute("data-nav-group", "markets");
      mb.innerHTML = "\uD83D\uDCCA <span>Markets</span>";
      var afterSips = map.sips || nav.querySelector('[data-nav-group="portfolio"]');
      if (afterSips && afterSips.nextSibling) nav.insertBefore(mb, afterSips.nextSibling);
      else nav.appendChild(mb);
    }
    if (map.settings) map.settings.innerHTML = "\u2699 <span>Settings</span>";
    hideClutter();
  }

  function renderTabs(groupId) {
    var g = GROUPS[groupId];
    var host = document.getElementById("navTabBar");
    if (!host) {
      host = document.createElement("div");
      host.id = "navTabBar";
      host.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px;padding:0";
      var main = document.querySelector(".main");
      var top = main && main.querySelector(".top");
      if (top && top.parentNode) top.parentNode.insertBefore(host, top.nextSibling);
      else if (main) main.insertBefore(host, main.firstChild);
    }
    if (!g || !g.tabs || !g.tabs.length) {
      host.style.display = "none";
      host.innerHTML = "";
      return;
    }
    host.style.display = "flex";
    var cur = getTab(groupId) || g.tabs[0].id;
    host.innerHTML = g.tabs
      .map(function (t) {
        var active = t.id === cur;
        return (
          '<button type="button" data-nav-tab="' + t.id + '" data-nav-tab-group="' + groupId +
          '" class="btn' + (active ? " primary" : "") + '" style="font-size:12px;padding:7px 12px">' +
          t.label + "</button>"
        );
      })
      .join("");
  }

  function activateGroup(groupId, tabId) {
    var g = GROUPS[groupId];
    if (!g) return;
    setGroup(groupId);
    if (g.tabs && g.tabs.length) {
      var tab = tabId || getTab(groupId) || g.tabs[0].id;
      setTab(groupId, tab);
      var tabDef = g.tabs.find(function (t) { return t.id === tab; });
      renderTabs(groupId);
      if (tabDef) clickPage(tabDef.page);
    } else {
      renderTabs(groupId);
      if (g.page) clickPage(g.page);
    }
    document.querySelectorAll("[data-nav-group]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-nav-group") === groupId);
    });
    document.querySelectorAll(".nav > button[data-page]").forEach(function (b) {
      var p = b.getAttribute("data-page");
      if (p === "dashboard" || p === "sips" || p === "settings") {
        b.classList.toggle("active", groupId === p);
      }
    });
  }

  function rebuildBottomNav() {
    var bn = document.querySelector(".bottomnav");
    if (!bn) return;
    bn.innerHTML =
      '<button type="button" data-nav-group="dashboard"><b>\u2302</b>Home</button>' +
      '<button type="button" data-nav-group="portfolio"><b>\u25A4</b>Portfolio</button>' +
      '<button type="button" data-nav-group="sips"><b>\u21BB</b>SIPs</button>' +
      '<button type="button" data-nav-group="markets"><b>\uD83D\uDCCA</b>Markets</button>' +
      '<button type="button" data-nav-group="settings"><b>\u2699</b>More</button>';
  }

  document.addEventListener(
    "click",
    function (e) {
      var tabBtn = e.target && e.target.closest && e.target.closest("[data-nav-tab]");
      if (tabBtn) {
        e.preventDefault();
        e.stopPropagation();
        activateGroup(tabBtn.getAttribute("data-nav-tab-group"), tabBtn.getAttribute("data-nav-tab"));
        return;
      }
      var gBtn = e.target && e.target.closest && e.target.closest("[data-nav-group]");
      if (gBtn) {
        e.preventDefault();
        e.stopPropagation();
        activateGroup(gBtn.getAttribute("data-nav-group"));
        return;
      }
      var pageBtn = e.target && e.target.closest && e.target.closest(".nav > button[data-page]");
      if (pageBtn) {
        var p = pageBtn.getAttribute("data-page");
        if (p === "dashboard" || p === "sips" || p === "settings") {
          setGroup(p);
          renderTabs(p);
        }
      }
    },
    true
  );

  function boot() {
    ensureGroupButtons();
    rebuildBottomNav();
    hideClutter();
    var g = getGroup();
    if (g && GROUPS[g] && GROUPS[g].tabs) renderTabs(g);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 400);
  setTimeout(boot, 1200);
  setTimeout(boot, 2500);
  setInterval(hideClutter, 2500);
  window.__consolidateActivate = activateGroup;
  console.log("[consolidate-nav] ready v2 page-persist");
})();
