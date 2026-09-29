"use strict";
(function () {
  function escSafe(x) {
    if (typeof esc === "function") return esc(x);
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function fmtIndex(n) {
    if (n == null || !isFinite(n)) return "—";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
  }
  function indicesHTML(data) {
    var list = (data && data.indices) || [];
    if (!list.length) {
      return '<div class="grid three" data-indices-panel="1" style="margin-bottom:12px"><div class="card empty">Loading market indices…</div></div>';
    }
    return '<div class="grid three" data-indices-panel="1" style="margin-bottom:12px">' +
      list.map(function (x) {
        var up = x.change != null && x.change >= 0;
        var cls = x.change == null ? "" : (up ? "green" : "red");
        var ch = x.change == null ? "—" :
          ((up ? "+" : "") + fmtIndex(x.change) + " (" + (up ? "+" : "") +
            (x.changePct != null ? x.changePct.toFixed(2) : "—") + "%)");
        return '<div class="card"><div class="label">' + escSafe(x.label) +
          '</div><div class="big ' + cls + '">' + fmtIndex(x.price) +
          '</div><div class="sub ' + cls + '">' + ch + '</div></div>';
      }).join("") + '</div>';
  }
  async function loadIndices() {
    var view = document.getElementById("view");
    if (!view) return;
    var title = (document.getElementById("title") || {}).textContent || "";
    if (title.indexOf("Dashboard") !== 0) return;
    var existing = view.querySelector("[data-indices-panel]");
    if (!existing) {
      var wrap = document.createElement("div");
      wrap.innerHTML = indicesHTML(null);
      if (wrap.firstChild) view.insertBefore(wrap.firstChild, view.firstChild);
    }
    try {
      var r = await fetch("/api/indices");
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || "fail");
      var panel = view.querySelector("[data-indices-panel]");
      if (panel) {
        var tmp = document.createElement("div");
        tmp.innerHTML = indicesHTML(d);
        if (tmp.firstChild) panel.replaceWith(tmp.firstChild);
      }
    } catch (e) {
      var panel2 = view.querySelector("[data-indices-panel]");
      if (panel2) panel2.innerHTML = '<div class="card empty">Could not load Nifty / Sensex / Bank Nifty</div>';
    }
  }
  function hook() {
    if (typeof render === "function" && !render.__indices) {
      var orig = render;
      window.render = function () {
        orig.apply(this, arguments);
        try { loadIndices(); } catch (_) {}
      };
      window.render.__indices = true;
      if (orig.__enhanced) window.render.__enhanced = true;
    }
    try { loadIndices(); } catch (_) {}
  }
  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (typeof render === "function") {
      clearInterval(t);
      hook();
    } else if (tries > 60) clearInterval(t);
  }, 200);
})();
