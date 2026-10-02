"use strict";
/* Stock Ideas removed — strip any leftover nav button */
(function () {
  function strip() {
    document.querySelectorAll('[data-page="ideas"]').forEach(function (b) {
      b.remove();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", strip);
  else strip();
  setTimeout(strip, 400);
  setTimeout(strip, 1200);
})();
