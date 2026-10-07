"use strict";
/**
 * Visual + SIP plan edit (reliable injection on MF SIPs page)
 */
(function () {
  var STATE_KEY = "investtrack-v4";
  var STATE_KEY_OLD = "investtrack-v3";

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }

  function getState() {
    try {
      return JSON.parse(
        localStorage.getItem(STATE_KEY) || localStorage.getItem(STATE_KEY_OLD) || "null"
      );
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
      ".hero-card .label{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600}" +
      ".hero-card .hero-num{font-size:28px;font-weight:800;letter-spacing:-.03em;margin:8px 0 4px;line-height:1.1}" +
      ".hero-card .hero-sub{font-size:12px;color:var(--muted)}" +
      ".hero-card.up .hero-num{color:var(--green)}.hero-card.down .hero-num{color:var(--red)}" +
      ".stats .card .big{font-size:22px;font-weight:800}" +
      ".stats .card{border-radius:12px}" +
      ".table tbody tr:hover{background:rgba(255,255,255,.03)}" +
      ".sip-card-pro{border-radius:14px!important;border-color:#2a3d4f!important}" +
      ".sip-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:10px}" +
      "#sipPlanEditBar{border:1px solid rgba(143,211,182,.45)!important;" +
      "background:linear-gradient(145deg,rgba(143,211,182,.1),rgba(15,22,31,.9))!important;" +
      "border-radius:14px;padding:14px 16px;margin:12px 0}" +
      "@media (max-width:900px){.hero-strip{grid-template-columns:1fr 1fr}.hero-card .hero-num{font-size:22px}}" +
      "@media (max-width:520px){.hero-strip{grid-template-columns:1fr}}";
    document.head.appendChild(s);
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
      strip.innerHTML +=
        '<div class="hero-card ' +
        cardCls(i) +
        '"><div class="label">' +
        labels[i] +
        '</div><div class="hero-num">' +
        esc(cardVal(i)) +
        '</div><div class="hero-sub">' +
        esc(cardSub(i)) +
        "</div></div>";
    }
    var head = view.querySelector(".head");
    if (head && head.parentNode) head.parentNode.insertBefore(strip, head.nextSibling);
    else view.insertBefore(strip, view.firstChild);
    var firstStats = view.querySelector(".grid.stats");
    if (firstStats) firstStats.style.display = "none";
  }

  function openSipPlanEditor(planId) {
    var st = getState();
    if (!st) return alert("No portfolio data in this browser.");
    var p = (st.sips || []).find(function (x) {
      return String(x.id) === String(planId);
    });
    if (!p) return alert("SIP plan not found.");

    var freqs = ["MONTHLY", "QUARTERLY", "WEEKLY"];
    var statuses = ["ACTIVE", "PAUSED", "STOPPED"];
    function opts(list, cur) {
      return list
        .map(function (x) {
          return (
            '<option value="' +
            x +
            '"' +
            ((cur || list[0]) === x ? " selected" : "") +
            ">" +
            x +
            "</option>"
          );
        })
        .join("");
    }

    var mb = document.getElementById("mb");
    var modal = document.getElementById("modal");
    if (!mb || !modal) return alert("Modal not ready \u2014 refresh the page.");

    modal.innerHTML =
      '<h2 style="margin:0 0 6px">\u270e Edit SIP plan</h2>' +
      '<p class="muted" style="margin:0 0 12px">Change planned amount, frequency, or status. Past installments are not modified.</p>' +
      '<form id="vp-sip-plan"><div class="form">' +
      '<div class="field full"><label>Fund name</label><input class="input wide" name="name" required value="' +
      esc(p.name || "") +
      '"></div>' +
      '<div class="field"><label>Scheme code</label><input class="input wide" name="symbol" required value="' +
      esc(p.symbol || "") +
      '"></div>' +
      '<div class="field"><label>Frequency</label><select class="select wide" name="frequency">' +
      opts(freqs, p.frequency || "MONTHLY") +
      "</select></div>" +
      '<div class="field"><label>Planned SIP amount (\u20b9)</label><input class="input wide" type="number" min="1" step="any" name="amount" required value="' +
      (Number(p.amount) || "") +
      '"></div>' +
      '<div class="field"><label>Start date</label><input class="input wide" type="date" name="startDate" required value="' +
      esc(p.startDate || "") +
      '"></div>' +
      '<div class="field"><label>Status</label><select class="select wide" name="status">' +
      opts(statuses, p.status || "ACTIVE") +
      "</select></div>" +
      '<div class="field full"><label>Notes</label><input class="input wide" name="notes" value="' +
      esc(p.notes || "") +
      '"></div>' +
      '</div><div class="modalfoot">' +
      '<button type="button" class="btn" id="vp-sip-cancel">Cancel</button>' +
      '<button type="submit" class="btn primary">Save plan</button></div></form>';
    mb.classList.remove("hidden");

    var cancel = document.getElementById("vp-sip-cancel");
    if (cancel)
      cancel.onclick = function () {
        mb.classList.add("hidden");
      };
    var f = document.getElementById("vp-sip-plan");
    if (!f) return;
    f.onsubmit = function (e) {
      e.preventDefault();
      var o = Object.fromEntries(new FormData(f));
      st.sips = (st.sips || []).map(function (x) {
        if (String(x.id) !== String(p.id)) return x;
        return Object.assign({}, x, {
          name: o.name,
          symbol: o.symbol,
          frequency: o.frequency,
          amount: Number(o.amount),
          startDate: o.startDate,
          status: o.status,
          notes: o.notes || "",
          type: x.type || "MUTUAL_FUND",
          exchange: x.exchange || "AMFI"
        });
      });
      if (p.symbol !== o.symbol || p.name !== o.name) {
        st.transactions = (st.transactions || []).map(function (t) {
          if (String(t.sipId) !== String(p.id)) return t;
          return Object.assign({}, t, { name: o.name, symbol: o.symbol });
        });
      }
      try {
        st.meta = st.meta || {};
        st.meta.lastSavedAt = Date.now();
        localStorage.setItem(STATE_KEY, JSON.stringify(st));
      } catch (err) {
        return alert("Could not save: " + err.message);
      }
      mb.classList.add("hidden");
      if (window.investToast) window.investToast("SIP plan saved");
      var btn = document.querySelector('.nav button[data-page="sips"]');
      if (btn) btn.click();
      else location.reload();
    };
  }

  function injectSipTools() {
    var view = document.getElementById("view");
    if (!view) return;
    var title = document.getElementById("title");
    var h2 = view.querySelector("h2");
    var isSip =
      (title && /sip/i.test(title.textContent || "")) ||
      (h2 && /mutual fund sip/i.test(h2.textContent || "")) ||
      !!view.querySelector("[data-sip-add], [data-sip-del]");
    if (!isSip) return;

    var st = getState();
    var sips = (st && st.sips) || [];

    if (sips.length && !view.querySelector("#sipPlanEditBar")) {
      var bar = document.createElement("div");
      bar.id = "sipPlanEditBar";
      bar.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
        '<div><b style="font-size:15px">\u270e Edit SIP plan</b>' +
        '<div class="muted" style="margin-top:3px">Change planned amount, frequency, or pause a SIP</div></div></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
        sips
          .map(function (p) {
            return (
              '<button type="button" class="btn primary" data-vp-edit-sip="' +
              esc(String(p.id)) +
              '" style="font-weight:700">' +
              esc(String(p.name || p.symbol || "SIP").slice(0, 34)) +
              " \u00b7 \u20b9" +
              esc(String(p.amount != null ? p.amount : "\u2014")) +
              "</button>"
            );
          })
          .join("") +
        "</div>";
      var head = view.querySelector(".head");
      if (head && head.parentNode) head.parentNode.insertBefore(bar, head.nextSibling);
      else view.insertBefore(bar, view.firstChild);
    }

    view.querySelectorAll("[data-sip-add]").forEach(function (btn) {
      var id = btn.getAttribute("data-sip-add");
      if (!id) return;
      var foot = btn.closest(".modalfoot") || btn.parentElement;
      if (!foot) return;
      foot.classList.add("sip-actions");

      if (!foot.querySelector('[data-vp-edit-sip="' + id + '"]')) {
        var edit = document.createElement("button");
        edit.type = "button";
        edit.className = "btn primary";
        edit.textContent = "\u270e Edit plan";
        edit.setAttribute("data-vp-edit-sip", id);
        edit.style.fontWeight = "700";
        foot.insertBefore(edit, foot.firstChild);
      }

      if (!foot.querySelector(".sip-quick")) {
        var q = document.createElement("button");
        q.type = "button";
        q.className = "btn sip-quick";
        q.textContent = "\u26A1 This month";
        q.setAttribute("data-sip-quick", id);
        if (btn.nextSibling) foot.insertBefore(q, btn.nextSibling);
        else foot.appendChild(q);
      }
    });

    view.querySelectorAll(".grid.two > .card").forEach(function (card) {
      card.classList.add("sip-card-pro");
    });
  }

  function prefillInstallmentModal(sipId) {
    var st = getState();
    if (!st || !st.sips) return;
    var sip = st.sips.find(function (p) {
      return String(p.id) === String(sipId);
    });
    if (!sip) return;
    var native = document.querySelector('[data-sip-add="' + sipId + '"]');
    if (native) native.click();
    setTimeout(function () {
      var modal = document.getElementById("modal");
      if (!modal) return;
      var today = new Date();
      var dateStr = today.toISOString().slice(0, 10);
      var amount = Number(sip.amount) || "";
      modal.querySelectorAll("input").forEach(function (inp) {
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
      if (window.investToast) window.investToast("Prefilled \u2014 confirm NAV & units");
    }, 120);
  }

  function runAll() {
    injectCss();
    enhanceDashboard();
    injectSipTools();
  }

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;
      var ed = t.closest && t.closest("[data-vp-edit-sip]");
      if (ed) {
        e.preventDefault();
        e.stopPropagation();
        openSipPlanEditor(ed.getAttribute("data-vp-edit-sip"));
        return;
      }
      var q = t.closest && t.closest("[data-sip-quick]");
      if (q) {
        e.preventDefault();
        e.stopPropagation();
        prefillInstallmentModal(q.getAttribute("data-sip-quick"));
        return;
      }
      if (t.closest && t.closest('[data-page="sips"]')) {
        setTimeout(injectSipTools, 50);
        setTimeout(injectSipTools, 250);
        setTimeout(injectSipTools, 700);
      }
    },
    true
  );

  function boot() {
    injectCss();
    var view = document.getElementById("view");
    if (view) {
      new MutationObserver(function () {
        runAll();
      }).observe(view, { childList: true, subtree: true });
    }
    runAll();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(injectSipTools, 2000);

  console.log("[visual-pro] ready v3 \u2014 SIP edit plan + hero");
})();
