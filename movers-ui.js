"use strict";
/* Hot movers as its own page (not on Dashboard) */
(function () {
  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function fmt(n, d) {
    if (n == null || !isFinite(n)) return "—";
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: d == null ? 2 : d }).format(n);
  }
  function fmtVol(n) {
    if (n == null || !isFinite(n)) return "—";
    if (n >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
    if (n >= 1e5) return (n / 1e5).toFixed(2) + " L";
    return fmt(n, 0);
  }

  function tableRows(list) {
    return '<div class="tablewrap"><table class="table"><thead><tr><th>Stock</th><th>Move</th><th>Price</th><th>Volume</th><th>Universe</th><th></th></tr></thead><tbody>' +
      list.map(function (x) {
        var up = x.changePct >= 0;
        var abs = Math.abs(x.changePct);
        var cls = up ? "green" : "red";
        var badge = abs >= 10
          ? ' <span class="pill" style="background:#3a2a12;color:var(--amber)">10%+</span>'
          : abs >= 5
            ? ' <span class="pill">5%+</span>'
            : "";
        var volExtra = x.volumeRatio != null ? (" · " + x.volumeRatio.toFixed(1) + "× avg") : "";
        return '<tr><td><div class="asset">' + esc(x.name || x.symbol) + badge + '</div><div class="sub">' + esc(x.symbol) + '</div></td>' +
          '<td class="' + cls + '"><b>' + (up ? "+" : "") + fmt(x.changePct, 2) + "%</b></td>" +
          "<td>" + fmt(x.price, 2) + "</td>" +
          "<td>" + fmtVol(x.volume) + '<div class="sub">' + esc(volExtra) + "</div></td>" +
          '<td class="muted">' + esc(x.universe || "") + "</td>" +
          '<td><button class="btn" data-movers-research="' + esc(x.symbol) + '">Research</button></td></tr>';
      }).join("") + "</tbody></table></div>";
  }

  function pageShell(inner) {
    return '<div class="card"><div class="head" style="margin:0 0 10px"><div><h2 style="margin:0">Hot movers (price + volume)</h2>' +
      '<div class="muted">Nifty 50, Next 50, mid/large focus — 5% / 10% jumps with volume when available</div></div>' +
      '<button class="btn primary" id="moversRefresh">↻ Scan now</button></div>' +
      '<div class="notice">Not trade recommendations. Large moves can reverse quickly.</div></div>' +
      '<div id="moversBody" style="margin-top:12px">' + inner + "</div>";
  }

  function renderData(data) {
    var hot = (data && data.movers) || [];
    var top = (data && data.topMovers) || [];
    var body = "";
    var crit = data && data.criteria
      ? '<div class="muted" style="margin-bottom:8px">' + esc(data.criteria.price) + " · " + esc(data.criteria.volume) + " · " + esc(data.criteria.universe) + "</div>"
      : "";
    body += crit;
    if (hot.length) {
      body += '<div class="label" style="margin:8px 0 6px">Hot (≥5% move' +
        (data.counts && data.counts.move10 ? " · " + data.counts.move10 + " at 10%+" : "") +
        ")</div>" + tableRows(hot);
    }
    if (top.length) {
      body += '<div class="label" style="margin:14px 0 6px">Top day movers in universe</div>' + tableRows(top);
    }
    if (!hot.length && !top.length) {
      body += '<div class="card empty">No mover data right now. Try again after market open.</div>';
    }
    return body;
  }

  async function loadMovers() {
    var box = document.getElementById("moversBody");
    if (!box) return;
    box.innerHTML = '<div class="card empty">Scanning universe…</div>';
    try {
      var r = await fetch("/api/movers?minMove=5&t=" + Date.now());
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || "fail");
      box.innerHTML = renderData(d);
    } catch (e) {
      box.innerHTML = '<div class="card empty">Could not load movers: ' + esc(e.message || "error") + "</div>";
    }
  }

  function showMoversPage() {
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Hot movers";
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "movers");
    });
    var view = document.getElementById("view");
    if (view) {
      view.innerHTML = pageShell('<div class="card empty">Click <b>Scan now</b> to load movers.</div>');
      loadMovers();
    }
  }

  function ensureNav() {
    var nav = document.querySelector(".side .nav");
    if (!nav || nav.querySelector('[data-page="movers"]')) return;
    var btn = document.createElement("button");
    btn.setAttribute("data-page", "movers");
    btn.innerHTML = "⚡ <span>Movers</span>";
    var research = nav.querySelector('[data-page="research"]');
    if (research) research.parentNode.insertBefore(btn, research);
    else nav.appendChild(btn);
  }

  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "moversRefresh") {
      loadMovers();
      return;
    }
    var res = e.target.closest && e.target.closest("[data-movers-research]");
    if (res) {
      var sym = res.getAttribute("data-movers-research");
      var navBtn = document.querySelector('.nav [data-page="research"]');
      if (navBtn) navBtn.click();
      setTimeout(function () {
        var inp = document.getElementById("researchSymbol");
        if (inp) inp.value = sym;
        var run = document.getElementById("researchRun");
        if (run) run.click();
      }, 80);
    }
    var mbtn = e.target.closest && e.target.closest('[data-page="movers"]');
    if (mbtn) {
      e.preventDefault();
      e.stopPropagation();
      showMoversPage();
    }
  }, true);

  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (document.querySelector(".side .nav")) {
      clearInterval(t);
      ensureNav();
    } else if (tries > 80) clearInterval(t);
  }, 150);
})();
