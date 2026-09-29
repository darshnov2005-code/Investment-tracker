"use strict";
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

  function moversHTML(data, loading) {
    if (loading) {
      return '<div class="card" data-movers-panel="1" style="margin-top:12px"><div class="head" style="margin:0 0 8px"><h2 style="margin:0">Hot movers (price + volume)</h2></div><div class="card empty">Scanning Nifty 50 / Next 50 / Midcap / 500…</div></div>';
    }
    var list = (data && data.movers) || [];
    var body;
    if (!list.length) {
      body = '<div class="muted" style="padding:8px 0">No names currently showing ≥5% day move with volume confirmation in the scanned universe.</div>';
    } else {
      body = '<div class="tablewrap"><table class="table"><thead><tr><th>Stock</th><th>Move</th><th>Price</th><th>Volume</th><th>Universe</th><th></th></tr></thead><tbody>' +
        list.map(function (x) {
          var up = x.changePct >= 0;
          var big = Math.abs(x.changePct) >= 10;
          var cls = up ? "green" : "red";
          var badge = big ? ' <span class="pill" style="background:#3a2a12;color:var(--amber)">10%+</span>' : "";
          var volExtra = x.volumeRatio != null ? (' · ' + x.volumeRatio.toFixed(1) + '× avg') : "";
          return '<tr><td><div class="asset">' + esc(x.name || x.symbol) + badge + '</div><div class="sub">' + esc(x.symbol) + '</div></td>' +
            '<td class="' + cls + '"><b>' + (up ? "+" : "") + fmt(x.changePct, 2) + '%</b></td>' +
            '<td>' + fmt(x.price, 2) + '</td>' +
            '<td>' + fmtVol(x.volume) + '<div class="sub">' + esc(volExtra) + '</div></td>' +
            '<td class="muted">' + esc(x.universe || "") + '</td>' +
            '<td><button class="btn" data-movers-research="' + esc(x.symbol) + '">Research</button></td></tr>';
        }).join("") + '</tbody></table></div>';
    }
    var crit = data && data.criteria
      ? '<div class="muted" style="margin-bottom:8px">' + esc(data.criteria.price) + ' · ' + esc(data.criteria.volume) + ' · ' + esc(data.criteria.universe) + '</div>'
      : '';
    return '<div class="card" data-movers-panel="1" style="margin-top:12px">' +
      '<div class="head" style="margin:0 0 8px"><div><h2 style="margin:0">Hot movers (price + volume)</h2>' +
      '<div class="muted">Large day moves with rising volume — Nifty 50, Next 50, Midcap 150, Nifty 500</div></div>' +
      '<button class="btn" id="moversRefresh">↻ Refresh</button></div>' + crit + body + '</div>';
  }

  async function loadMovers(force) {
    var view = document.getElementById("view");
    var title = (document.getElementById("title") || {}).textContent || "";
    if (!view || title.indexOf("Dashboard") !== 0) return;
    var existing = view.querySelector("[data-movers-panel]");
    if (existing && !force) return;
    if (!existing) {
      var ph = document.createElement("div");
      ph.innerHTML = moversHTML(null, true);
      if (ph.firstChild) view.appendChild(ph.firstChild);
    } else if (force) {
      existing.outerHTML = moversHTML(null, true);
    }
    try {
      var r = await fetch("/api/movers?minMove=5&t=" + Date.now());
      var d = await r.json();
      if (!r.ok) throw new Error(d.error || "fail");
      var panel = view.querySelector("[data-movers-panel]");
      var tmp = document.createElement("div");
      tmp.innerHTML = moversHTML(d, false);
      if (panel && tmp.firstChild) panel.replaceWith(tmp.firstChild);
    } catch (e) {
      var p = view.querySelector("[data-movers-panel]");
      if (p) p.innerHTML = '<div class="head"><h2 style="margin:0">Hot movers</h2></div><div class="empty">Could not load movers: ' + esc(e.message || "error") + '</div>';
    }
  }

  document.addEventListener("click", function (e) {
    if (e.target && e.target.id === "moversRefresh") {
      loadMovers(true);
      return;
    }
    if (e.target && (e.target.id === "refresh" || (e.target.closest && e.target.closest("#refresh")))) {
      loadMovers(true);
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
  }, true);

  var tries = 0;
  var t = setInterval(function () {
    tries++;
    var title = (document.getElementById("title") || {}).textContent || "";
    if (document.getElementById("view") && title.indexOf("Dashboard") === 0) {
      clearInterval(t);
      loadMovers(false);
    } else if (tries > 80) clearInterval(t);
  }, 200);

  setInterval(function () {
    var title = (document.getElementById("title") || {}).textContent || "";
    if (title.indexOf("Dashboard") === 0 && !document.querySelector("[data-movers-panel]")) {
      loadMovers(false);
    }
  }, 2500);
})();
