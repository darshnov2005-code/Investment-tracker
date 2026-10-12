"use strict";
/**
 * Soft refresh after saves + notify Supabase auto-push.
 */
(function () {
  function softRefresh() {
    try {
      localStorage.removeItem("investtrack-inv-cache-v1");
      if (window.__invCache) window.__invCache = null;
    } catch (e) {}
    try {
      if (window.__investSync && typeof window.__investSync.notifySaved === "function") {
        window.__investSync.notifySaved();
      }
    } catch (e) {}
    try {
      if (window.__pagePersistRestore) {
        window.__pagePersistRestore();
        if (window.investToast) window.investToast("Saved");
        return true;
      }
    } catch (e) {}
    var active = document.querySelector(".nav button.active[data-page]");
    var page = active && active.getAttribute("data-page");
    if (page) {
      var btn = document.querySelector('.nav button[data-page="' + page + '"]');
      if (btn) {
        btn.click();
        if (window.investToast) window.investToast("Saved");
        return true;
      }
    }
    return false;
  }

  var _reload = location.reload.bind(location);
  var lastSave = 0;
  var origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (k, v) {
    origSetItem(k, v);
    if (k === "investtrack-v4" || k === "investtrack-v3") {
      lastSave = Date.now();
      try {
        if (window.__investSync && window.__investSync.notifySaved) window.__investSync.notifySaved();
      } catch (e) {}
    }
  };

  location.reload = function () {
    if (Date.now() - lastSave < 3000) {
      if (softRefresh()) return;
    }
    return _reload();
  };

  window.__softRefresh = softRefresh;
  console.log("[soft-refresh-hook] ready v2");
})();
