"use strict";
/**
 * Review page removed — buy/sell signals live inside Weekly review.
 * This stub only cleans up any leftover Review nav button.
 */
(function () {
  function clean() {
    try {
      document.querySelectorAll('.nav button[data-page="review"]').forEach(function (b) {
        b.remove();
      });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", clean);
  else clean();
  setTimeout(clean, 500);
  setTimeout(clean, 1500);
  console.log("[review-ui] stub — merged into Weekly");
})();
