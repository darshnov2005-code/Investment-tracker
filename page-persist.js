"use strict";
/**
 * Stay on the current screen after Refresh quotes / soft re-render.
 */
(function () {
  var PAGE_KEY = "investtrack-ui-page";
  var GROUP_KEY = "investtrack-nav-group";
  var TAB_KEY = "investtrack-nav-tab";
  var restoring = false;

  function savePage(page, group, tab) {
    try {
      if (page) sessionStorage.setItem(PAGE_KEY, page);
      if (group) localStorage.setItem(GROUP_KEY, group);
      if (tab && group) {
        var all = {};
        try {
          all = JSON.parse(localStorage.getItem(TAB_KEY) || "{}");
        } catch (e) {}
        all[group] = tab;
        localStorage.setItem(TAB_KEY, JSON.stringify(all));
      }
    } catch (e) {}
  }

  function getSaved() {
    try {
      var page = sessionStorage.getItem(PAGE_KEY) || "dashboard";
      var group = localStorage.getItem(GROUP_KEY) || "dashboard";
      var tabs = {};
      try {
        tabs = JSON.parse(localStorage.getItem(TAB_KEY) || "{}");
      } catch (e) {}
      return { page: page, group: group, tab: tabs[group] || null };
    } catch (e) {
      return { page: "dashboard", group: "dashboard", tab: null };
    }
  }

  function clickPage(page) {
    if (!page) return false;
    if (page === "weekly" && window.__weeklyReviewLoad) {
      window.__weeklyReviewLoad(false);
      return true;
    }
    if (page === "movers" || page === "sectors") {
      var mb =
        document.querySelector('[data-page="movers"]') ||
        document.querySelector('[data-page="sectors"]');
      if (mb) {
        mb.click();
        return true;
      }
    }
    if (page === "sipcal" && window.__sipCalendarLoad) {
      window.__sipCalendarLoad();
      return true;
    }
    if (page === "notes") {
      var n = document.querySelector('[data-page="notes"]');
      if (n) {
        n.click();
        return true;
      }
    }
    if (page === "watchlist") {
      var w = document.querySelector('[data-page="watchlist"]');
      if (w) {
        w.click();
        return true;
      }
    }
    var btn =
      document.querySelector('.nav button[data-page="' + page + '"]') ||
      document.querySelector('button[data-page="' + page + '"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  function restore() {
    if (restoring) return;
    restoring = true;
    try {
      var s = getSaved();
      var page = s.page || "dashboard";
      if (s.group === "portfolio") {
        page = s.tab || "holdings";
        if (s.tab === "transactions") page = "transactions";
        if (s.tab === "realized") page = "realized";
        if (s.tab === "holdings") page = "holdings";
      }
      if (s.group === "markets") {
        page = s.tab || "movers";
        if (s.tab === "weekly") page = "weekly";
        if (s.tab === "sipcal") page = "sipcal";
        if (s.tab === "movers") page = "movers";
      }
      if (s.group === "settings") {
        page = s.tab || "settings";
      }
      if (page === "dashboard") {
        restoring = false;
        return;
      }
      clickPage(page);
      if (window.__consolidateActivate && s.group) {
        try {
          window.__consolidateActivate(s.group, s.tab);
        } catch (e) {}
      }
    } finally {
      setTimeout(function () {
        restoring = false;
      }, 400);
    }
  }

  document.addEventListener(
    "click",
    function (e) {
      var tab = e.target && e.target.closest && e.target.closest("[data-nav-tab]");
      if (tab) {
        var g = tab.getAttribute("data-nav-tab-group");
        var t = tab.getAttribute("data-nav-tab");
        var pageMap = {
          holdings: "holdings",
          transactions: "transactions",
          realized: "realized",
          movers: "movers",
          sipcal: "sipcal",
          weekly: "weekly",
          settings: "settings",
          notes: "notes",
          watchlist: "watchlist",
          goals: "goals",
          import: "import"
        };
        savePage(pageMap[t] || t, g, t);
        return;
      }
      var grp = e.target && e.target.closest && e.target.closest("[data-nav-group]");
      if (grp) {
        var gid = grp.getAttribute("data-nav-group");
        if (gid === "dashboard") savePage("dashboard", "dashboard", null);
        else if (gid === "sips") savePage("sips", "sips", null);
        else if (gid === "portfolio") savePage("holdings", "portfolio", "holdings");
        else if (gid === "markets") savePage("movers", "markets", "movers");
        else if (gid === "settings") savePage("settings", "settings", "settings");
        return;
      }
      var nav = e.target && e.target.closest && e.target.closest("[data-page]");
      if (nav) {
        var p = nav.getAttribute("data-page");
        if (p) savePage(p, null, null);
      }
    },
    true
  );

  document.addEventListener(
    "click",
    function (e) {
      if (
        !(e.target && (e.target.id === "refresh" || (e.target.closest && e.target.closest("#refresh"))))
      )
        return;
      [200, 600, 1200, 2500, 4000].forEach(function (ms) {
        setTimeout(restore, ms);
      });
    },
    true
  );

  var lastTitle = "";
  setInterval(function () {
    var title = document.getElementById("title");
    var t = (title && title.textContent) || "";
    if (t === lastTitle) return;
    lastTitle = t;
    var s = getSaved();
    if (!s.page || s.page === "dashboard") return;
    if (/dashboard|portfolio overview/i.test(t) && s.page !== "dashboard") {
      setTimeout(restore, 50);
    }
  }, 500);

  window.__pagePersistRestore = restore;
  console.log("[page-persist] ready");
})();
