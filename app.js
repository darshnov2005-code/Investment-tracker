"use strict";
(async function () {
  try {
    const url =
      "https://raw.githubusercontent.com/darshnov2005-code/Investment-tracker/e588f66ec899a2e79a131a2d1df7ecafe8c5cd79/app.js";
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const code = await r.text();
    if (!code || code.length < 1000 || code.indexOf("PLACEHOLDER") === 0)
      throw new Error("Bad app payload");
    (0, eval)(code);
    var patches = [
      "/quote-form.js",
      "/review-ui.js",
      "/movers-ui.js",
      "/ideas-ui.js",
      "/ui.js",
      "/edit-installments.js",
      "/news-dropdown.js",
      "/notes-ui.js",
      "/watchlist-ui.js",
      "/tx-filters.js",
      "/holdings-sector.js",
      "/weekly-review-ui.js",
      "/visual-pro.js"
    ];
    var ver = "?v=21";
    patches.forEach(function (src) {
      var s = document.createElement("script");
      s.src = src + ver;
      s.defer = true;
      document.body.appendChild(s);
    });
  } catch (e) {
    document.body.innerHTML =
      '<pre style="color:#ef8d8d;padding:24px;font:14px system-ui;max-width:560px;margin:40px auto;line-height:1.5">' +
      "Failed to load app: " + e + "</pre>";
    console.error(e);
  }
})();
