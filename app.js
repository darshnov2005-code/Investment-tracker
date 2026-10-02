"use strict";
(async function () {
  try {
    const r = await fetch("/b64.0.txt");
    if (!r.ok) throw new Error("HTTP " + r.status);
    const b64 = (await r.text()).replace(/\s+/g, "");
    if (!b64 || b64.length < 1000) throw new Error("Bad app payload");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const code = new TextDecoder("utf-8").decode(bytes);
    if (!code || code.length < 1000 || code.indexOf("PLACEHOLDER") === 0)
      throw new Error("Bad app payload");
    (0, eval)(code);
    ["/quote-fix.js", "/review-ui.js", "/movers-ui.js", "/ideas-ui.js", "/ui.js"].forEach(function (src) {
      var s = document.createElement("script");
      s.src = src;
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
