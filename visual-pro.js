"use strict";
/**
 * Visual + UX + light performance layer (no new APIs).
 * - Dashboard hero strip
 * - Global section / card polish CSS
 * - SIP "This month" one-tap helper
 * - Stronger empty states
 * - localStorage inventory cache for filters/UI
 */
(function () {
  var STATE_KEY = "investtrack-v4";
  var STATE_KEY_OLD = "investtrack-v3";
  var INV_CACHE = "investtrack-inv-cache-v1";

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }
  function money(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    var sign = n < 0 ? "-" : "";
    return sign + "\u20b9" + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return "\u2014";
    return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function getState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY) || localStorage.getItem(STATE_KEY_OLD) || "null");
    } catch (e) {
      return null;
    }
  }

  function injectCss() {
    if (document.getElementById("visual-pro-css")) return;
    var s = document.createElement("style");
    s.id = "visual-pro-css";
    s.textContent =
      ".hero-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 16px}" +
      ".hero-card{position:relative;overflow:hidden;padding:18px 16px;border-radius:14px;" +
      "background:linear-gradient(145deg,#15202b,#0f161f);border:1px solid var(--line)}" +
      ".hero-card::after{content:'';position:absolute;right:-20px;top:-20px;width:90px;height:90px;" +
      "border-radius:50%;background:rgba(143,211,182,.08)}" +
      ".hero-card .label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600}" +
      ".hero-card .hero-num{font-size:28px;font-weight:800;letter-spacing:-.03em;margin:8px 0 4px;line-height:1.1}" +
      ".hero-card .hero-sub{font-size:12px;color:var(--muted)}" +
      ".hero-card.up .hero-num{color:var(--green)}.hero-card.down .hero-num{color:var(--red)}" +
      ".sec-block{border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:14px 0;" +
      "background:rgba(255,255,255,.02)}" +
      ".sec-block .sec-head{display:flex;align-items:center;justify-content:space-between;gap:10px;" +
      "padding:12px 14px;background:rgba(0,0,0,.22);border-bottom:1px solid var(--line)}" +
      ".sec-block .sec-head h3{margin:0;font-size:15px;font-weight:700}" +
      ".sec-block .sec-body{padding:14px}" +
      ".stats .card .big{font-size:22px;font-weight:800;letter-spacing:-.02em}" +
      ".stats .card{border-radius:12px;transition:border-color .15s}" +
      ".stats .card:hover{border-color:#3a5166}" +
      ".table tbody tr:hover{background:rgba(255,255,255,.03)}" +
      ".empty-pro{padding:36px 18px;text-align:center;color:var(--muted)}" +
      ".empty-pro .empty-ico{font-size:28px;margin-bottom:8px}" +
      ".empty-pro b{display:block;color:var(--text);font-size:15px;margin-bottom:6px}" +
      ".sip-quick{margin-left:6px;font-size:11px;padding:6px 10px}" +
      ".toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);" +
      "background:#1a2734;border:1px solid var(--line);color:var(--text);padding:10px 16px;" +
      "border-radius:10px;z-index:90;opacity:0;transition:.2s;pointer-events:none;font-size:13px}" +
      ".toast.show{opacity:1;transform:translateX(-50%) translateY(0)}" +
      "@media (max-width:900px){.hero-strip{grid-template-columns:1fr 1fr}.hero-card .hero-num{font-size:22px}}" +
      "@media (max-width:520px){.hero-strip{grid-template-columns:1fr}}";
    document.head.appendChild(s);
  }

  function rebuildInventory(st) {
    var qty = {}, meta = {}, cost = {};
    (st.transactions || []).forEach(function (t) {
      if (!t || !t.symbol) return;
      var k = String(t.symbol).toUpperCase();
      var q = Number(t.qty) || 0;
      var px = Number(t.price) || 0;
      if (["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(t.action) >= 0) {
        qty[k] = (qty[k] || 0) + q;
        cost[k] = (cost[k] || 0) + q * px;
      } else if (["SELL", "REDEMPTION"].indexOf(t.action) >= 0) {
        qty[k] = (qty[k] || 0) - q;
      }
      meta[k] = { name: t.name || k, type: t.type || "STOCK", symbol: k };
    });
    var holds = Object.keys(qty)
      .filter(function (k) { return qty[k] > 1e-8; })
      .map(function (k) {
        return {
          symbol: k,
          qty: qty[k],
          cost: cost[k] || 0,
          name: (meta[k] && meta[k].name) || k,
          type: (meta[k] && meta[k].type) || "STOCK"
        };
      });
    var payload = { at: Date.now(), holds: holds, txCount: (st.transactions || []).length };
    try { localStorage.setItem(INV_CACHE, JSON.stringify(payload)); } catch (e) {}
    window.__invCache = payload;
    return payload;
  }

  function getInventory() {
    var st = getState();
    if (!st) return { holds: [], txCount: 0 };
    var cached = window.__invCache;
    try {
      if (!cached) cached = JSON.parse(localStorage.getItem(INV_CACHE) || "null");
    } catch (e) { cached = null; }
    if (cached && cached.txCount === (st.transactions || []).length) return cached;
    return rebuildInventory(st);
  }

  function enhanceDashboard() {
    var view = document.getElementById("view");
    if (!view) return;
    var title = document.getElementById("title");
    if (title && !/dashboard/i.test(title.textContent || "")) return;
    if (view.querySelector("#heroStrip")) return;

    var cards = view.querySelectorAll(".grid.stats > .card");
    if (cards.length < 4) return;

    function cardVal(i) {
      var big = cards[i] && cards[i].querySelector(".big");
      return big ? big.textContent.trim() : "\u2014";
    }
    function cardSub(i) {
      var m = cards[i] && cards[i].querySelector(".muted");
      return m ? m.textContent.trim() : "";
    }
    function cardCls(i) {
      var big = cards[i] && cards[i].querySelector(".big");
      if (!big) return "";
      if (big.classList.contains("green")) return "up";
      if (big.classList.contains("red")) return "down";
      return "";
    }

    var labels = ["\uD83D\uDCE6 Portfolio", "\uD83D\uDCB0 Invested", "\uD83D\uDCC8 Overall P/L", "\u2600\uFE0F Day P/L"];
    var strip = document.createElement("div");
    strip.id = "heroStrip";
    strip.className = "hero-strip";
    for (var i = 0; i < 4; i++) {
      var cls = cardCls(i);
      strip.innerHTML +=
        '<div class="hero-card ' + cls + '"><div class="label">' + labels[i] +
        '</div><div class="hero-num">' + esc(cardVal(i)) +
        '</div><div class="hero-sub">' + esc(cardSub(i)) + "</div></div>";
    }

    var head = view.querySelector(".head");
    if (head && head.parentNode) head.parentNode.insertBefore(strip, head.nextSibling);
    else view.insertBefore(strip, view.firstChild);

    var firstStats = view.querySelector(".grid.stats");
    if (firstStats) firstStats.style.display = "none";
  }

  function polishEmpty() {
    var view = document.getElementById("view");
    if (!view) return;
    view.querySelectorAll(".empty, .card.empty").forEach(function (el) {
      if (el.dataset.proEmpty) return;
      el.dataset.proEmpty = "1";
      var txt = (el.textContent || "").trim();
      if (!txt) return;
      el.classList.add("empty-pro");
      if (!el.querySelector(".empty-ico")) {
        el.innerHTML =
          '<div class="empty-ico">\uD83D\uDDED</div><b>Nothing here yet</b><div>' + esc(txt) + "</div>";
      }
    });
  }

  function ym(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function injectSipQuick() {
    var view = document.getElementById("view");
    if (!view) return;
    var title = document.getElementById("title");
    var isSip =
      (title && /sip/i.test(title.textContent || "")) ||
      (view.querySelector("h2") && /mutual fund sip/i.test(view.querySelector("h2").textContent || ""));
    if (!isSip) return;

    view.querySelectorAll("[data-sip-add]").forEach(function (btn) {
      if (btn.parentElement && btn.parentElement.querySelector(".sip-quick")) return;
      var q = document.createElement("button");
      q.type = "button";
      q.className = "btn sip-quick";
      q.textContent = "\u26A1 This month";
      q.title = "Open record form prefilled for this month";
      q.setAttribute("data-sip-quick", btn.getAttribute("data-sip-add"));
      btn.parentElement.insertBefore(q, btn.nextSibling);
    });
  }

  function prefillInstallmentModal(sipId) {
    var st = getState();
    if (!st || !st.sips) return;
    var sip = st.sips.find(function (p) { return p.id === sipId; });
    if (!sip) return;

    var native = document.querySelector('[data-sip-add="' + sipId + '"]');
    if (native) native.click();

    setTimeout(function () {
      var modal = document.getElementById("modal");
      if (!modal) return;
      var today = new Date();
      var dateStr = today.toISOString().slice(0, 10);
      var amount = Number(sip.amount) || "";
      var inputs = modal.querySelectorAll("input");
      inputs.forEach(function (inp) {
        var lab = (inp.previousElementSibling && inp.previousElementSibling.textContent) || "";
        var name = (inp.name || inp.id || "").toLowerCase();
        var ph = (inp.placeholder || "").toLowerCase();
        if (inp.type === "date" || /date/.test(lab + name + ph)) {
          if (!inp.value) inp.value = dateStr;
        }
        if (/amount|invested|total/.test(lab + name + ph) && amount) {
          if (!inp.value) inp.value = String(amount);
        }
      });
      var ta = modal.querySelector("textarea");
      if (ta && !ta.value) ta.value = "Auto: " + ym(today) + " installment";
      if (window.investToast) window.investToast("Prefilled for this month \u2014 confirm NAV & units");
    }, 120);
  }

  function runAll() {
    injectCss();
    try { getInventory(); } catch (e) {}
    enhanceDashboard();
    injectSipQuick();
    polishEmpty();
  }

  document.addEventListener(
    "click",
    function (e) {
      var q = e.target && e.target.closest && e.target.closest("[data-sip-quick]");
      if (q) {
        e.preventDefault();
        e.stopPropagation();
        prefillInstallmentModal(q.getAttribute("data-sip-quick"));
        return;
      }
    },
    true
  );

  function boot() {
    injectCss();
    var view = document.getElementById("view");
    if (view) {
      new MutationObserver(function () { runAll(); }).observe(view, { childList: true, subtree: true });
    }
    runAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 600);
  setTimeout(boot, 1500);
  console.log("[visual-pro] ready \u2014 hero, SIP quick, inventory cache");
})();
