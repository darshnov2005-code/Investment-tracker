"use strict";
/* Fix Refresh quotes: all unique portfolio symbols, batched, clear report */
(function () {
  function uniqueTargets() {
    var map = {};
    function add(symbol, exchange, type) {
      if (!symbol) return;
      var key = String(exchange || "NSE").toUpperCase() + "|" + String(symbol).toUpperCase();
      if (!map[key]) map[key] = { symbol: String(symbol).toUpperCase(), exchange: String(exchange || "NSE").toUpperCase(), type: type || "" };
    }
    try {
      if (typeof holdings === "function") {
        holdings().forEach(function (h) {
          add(h.symbol, h.exchange || (h.type === "MUTUAL_FUND" ? "AMFI" : "NSE"), h.type);
        });
      }
    } catch (_) {}
    try {
      if (typeof s !== "undefined" && s && Array.isArray(s.transactions)) {
        s.transactions.forEach(function (t) {
          var ex = t.exchange || (t.type === "MUTUAL_FUND" ? "AMFI" : "NSE");
          add(t.symbol, ex, t.type);
        });
      }
    } catch (_) {}
    try {
      if (typeof s !== "undefined" && s && Array.isArray(s.sips)) {
        s.sips.forEach(function (sip) {
          add(sip.symbol, sip.exchange || "AMFI", "MUTUAL_FUND");
        });
      }
    } catch (_) {}
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  async function fetchOne(target) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 12000);
    try {
      var r = await fetch(
        "/api/quote?symbol=" + encodeURIComponent(target.symbol) +
        "&exchange=" + encodeURIComponent(target.exchange) +
        "&t=" + Date.now(),
        { signal: ctl.signal, cache: "no-store" }
      );
      var d = await r.json();
      if (!r.ok || !(Number(d.price) > 0)) throw new Error(d.error || "no price");
      if (typeof q !== "undefined") {
        q[target.symbol] = Number(d.price);
        q[target.symbol + "_at"] = Date.now();
        q[target.symbol + "_source"] = d.source || "";
        if (Number(d.previousClose) > 0) q[target.symbol + "_prevClose"] = Number(d.previousClose);
      }
      return { ok: true, symbol: target.symbol };
    } catch (e) {
      return { ok: false, symbol: target.symbol, error: e.message || "fail" };
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshAllQuotes(silent) {
    var targets = uniqueTargets();
    if (!targets.length) {
      if (!silent) alert("No holdings or symbols to refresh.");
      return;
    }
    var btn = document.getElementById("refresh");
    var prevLabel = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Refreshing…";
    }
    var ok = 0;
    var fail = [];
    for (var i = 0; i < targets.length; i += 4) {
      var batch = targets.slice(i, i + 4);
      if (btn) btn.textContent = "Refreshing " + Math.min(i + batch.length, targets.length) + "/" + targets.length + "…";
      var results = await Promise.all(batch.map(fetchOne));
      results.forEach(function (r) {
        if (r.ok) ok++;
        else fail.push(r.symbol);
      });
    }
    try {
      if (typeof saveQuotes === "function") saveQuotes();
      else if (typeof q !== "undefined") localStorage.setItem("investtrack-quotes", JSON.stringify(q));
      if (typeof s !== "undefined" && s.meta) {
        s.meta.lastQuoteRefreshAt = Date.now();
        if (typeof save === "function") save();
      }
    } catch (_) {}
    try {
      if (typeof render === "function") render();
    } catch (_) {}
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevLabel || "↻ Refresh quotes";
    }
    if (!silent) {
      var msg = ok + " of " + targets.length + " quote(s) refreshed.";
      if (fail.length) msg += "\nFailed: " + fail.slice(0, 12).join(", ") + (fail.length > 12 ? "…" : "");
      alert(msg);
    }
    if (typeof window.investToast === "function") {
      window.investToast(ok + "/" + targets.length + " quotes updated");
    }
  }

  function install() {
    window.refreshQuotes = refreshAllQuotes;
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === "refresh" || (t.closest && t.closest("#refresh"))) {
        e.preventDefault();
        e.stopPropagation();
        refreshAllQuotes(false);
      }
    }, true);
  }

  var tries = 0;
  var t = setInterval(function () {
    tries++;
    if (typeof holdings === "function" || typeof refreshQuotes === "function" || document.getElementById("refresh")) {
      clearInterval(t);
      install();
    } else if (tries > 100) clearInterval(t);
  }, 100);
})();
