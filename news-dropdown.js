"use strict";
/* News section removed — hide leftover nav and block page */
(function () {
  function strip() {
    document.querySelectorAll('[data-page="news"]').forEach(function (b) {
      b.style.display = "none";
      b.remove();
    });
  }
  document.addEventListener(
    "click",
    function (e) {
      var n = e.target && e.target.closest && e.target.closest('[data-page="news"]');
      if (n) {
        e.preventDefault();
        e.stopPropagation();
        strip();
      }
    },
    true
  );
  function boot() {
    strip();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(strip, 400);
  setTimeout(strip, 1200);
  console.log("[news-removed] ok");
})();
