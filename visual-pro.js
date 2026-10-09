"use strict";
/**
 * Visual pro + SIP plan edit + Transaction edit
 * After save: reload so data sticks, skip PIN, restore same page.
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
      ".sip-card-pro{border-radius:14px!important}" +
      "#sipPlanEditBar{border:1px solid rgba(143,211,182,.45)!important;" +
      "background:linear-gradient(145deg,rgba(143,211,182,.1),rgba(15,22,31,.9))!important;" +
      "border-radius:14px;padding:14px 16px;margin:12px 0}" +
      "button[data-vp-edit-tx]{font-weight:700}" +
      "@media (max-width:900px){.hero-strip{grid-template-columns:1fr 1fr}}";
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
    if (!st) return alert("No portfolio data.");
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
    if (!mb || !modal) return alert("Modal not ready.");
    modal.innerHTML =
      '<h2 style="margin:0 0 6px">\u270e Edit SIP plan</h2>' +
      '<p class="muted" style="margin:0 0 12px">Change planned amount, frequency, or status.</p>' +
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
      '"></div></div>' +
      '<div class="modalfoot"><button type="button" class="btn" id="vp-sip-cancel">Cancel</button>' +
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
      try {
        st.meta = st.meta || {};
        st.meta.lastSavedAt = Date.now();
        st.version = st.version || 4;
        localStorage.setItem(STATE_KEY, JSON.stringify(st));
        if (!localStorage.getItem(STATE_KEY)) throw new Error("localStorage write failed");
      } catch (err) {
        return alert("Could not save: " + err.message);
      }
      mb.classList.add("hidden");
      rememberPageAndReload();
    };
  }

  function openTxEditor(txId) {
    var st = getState();
    if (!st) return alert("No portfolio data.");
    var t = (st.transactions || []).find(function (x) {
      return String(x.id) === String(txId);
    });
    if (!t) return alert("Transaction not found.");
    var types = ["STOCK","MUTUAL_FUND","ETF","FD","BOND","SGB","PPF","NPS","GOLD","CASH","OTHER"];
    var actions = ["BUY","SELL","SIP","DIVIDEND","BONUS","SPLIT","RIGHTS","REDEMPTION"];
    function opts(list, cur) {
      return list
        .map(function (x) {
          return (
            '<option value="' +
            x +
            '"' +
            (cur === x ? " selected" : "") +
            ">" +
            x +
            "</option>"
          );
        })
        .join("");
    }
    var exch = t.exchange || "NSE";
    var mb = document.getElementById("mb");
    var modal = document.getElementById("modal");
    if (!mb || !modal) return alert("Modal not ready.");
    modal.innerHTML =
      '<h2 style="margin:0 0 8px">\u270e Edit transaction</h2>' +
      '<form id="vp-tx-form"><div class="form">' +
      '<div class="field"><label>Type</label><select class="select wide" name="type">' +
      opts(types, t.type || "STOCK") +
      "</select></div>" +
      '<div class="field"><label>Action</label><select class="select wide" name="action">' +
      opts(actions, t.action || "BUY") +
      "</select></div>" +
      '<div class="field full"><label>Name</label><input class="input wide" name="name" required value="' +
      esc(t.name || "") +
      '"></div>' +
      '<div class="field"><label>Symbol</label><input class="input wide" name="symbol" required value="' +
      esc(t.symbol || "") +
      '"></div>' +
      '<div class="field"><label>Exchange</label><select class="select wide" name="exchange">' +
      "<option" +
      (exch === "NSE" ? " selected" : "") +
      ">NSE</option>" +
      "<option" +
      (exch === "BSE" ? " selected" : "") +
      ">BSE</option>" +
      "<option" +
      (exch === "AMFI" ? " selected" : "") +
      ">AMFI</option>" +
      "<option" +
      (exch === "OTHER" ? " selected" : "") +
      ">OTHER</option></select></div>" +
      '<div class="field"><label>Date</label><input class="input wide" type="date" name="date" required value="' +
      esc(t.date || "") +
      '"></div>' +
      '<div class="field"><label>Qty / units</label><input class="input wide" type="number" step="any" name="qty" required value="' +
      (Number(t.qty) || "") +
      '"></div>' +
      '<div class="field"><label>Price / NAV</label><input class="input wide" type="number" step="any" name="price" required value="' +
      (Number(t.price) || "") +
      '"></div>' +
      '<div class="field"><label>Brokerage</label><input class="input wide" type="number" step="any" name="brokerage" value="' +
      (Number(t.brokerage) || 0) +
      '"></div>' +
      '<div class="field"><label>STT</label><input class="input wide" type="number" step="any" name="stt" value="' +
      (Number(t.stt) || 0) +
      '"></div>' +
      '<div class="field"><label>GST</label><input class="input wide" type="number" step="any" name="gst" value="' +
      (Number(t.gst) || 0) +
      '"></div>' +
      '<div class="field"><label>Other charges</label><input class="input wide" type="number" step="any" name="otherCharges" value="' +
      (Number(t.otherCharges) || 0) +
      '"></div>' +
      '<div class="field full"><label>Notes</label><input class="input wide" name="notes" value="' +
      esc(t.notes || "") +
      '"></div></div>' +
      '<div class="modalfoot"><button type="button" class="btn" id="vp-tx-cancel">Cancel</button>' +
      '<button type="submit" class="btn primary">Save transaction</button></div></form>';
    mb.classList.remove("hidden");
    var cancel = document.getElementById("vp-tx-cancel");
    if (cancel)
      cancel.onclick = function () {
        mb.classList.add("hidden");
      };
    var f = document.getElementById("vp-tx-form");
    if (!f) return;
    f.onsubmit = function (e) {
      e.preventDefault();
      var o = Object.fromEntries(new FormData(f));
      var next = Object.assign({}, t, {
        type: o.type,
        action: o.action,
        name: o.name,
        symbol: o.symbol,
        exchange: o.exchange,
        date: o.date,
        qty: Number(o.qty),
        price: Number(o.price),
        brokerage: Number(o.brokerage) || 0,
        stt: Number(o.stt) || 0,
        gst: Number(o.gst) || 0,
        otherCharges: Number(o.otherCharges) || 0,
        notes: o.notes || ""
      });
      next.charges = next.brokerage + next.stt + next.gst + next.otherCharges;
      st.transactions = (st.transactions || []).map(function (x) {
        return String(x.id) === String(t.id) ? next : x;
      });
      try {
        st.meta = st.meta || {};
        st.meta.lastSavedAt = Date.now();
        st.version = st.version || 4;
        var payload = JSON.stringify(st);
        localStorage.setItem(STATE_KEY, payload);
        var check = localStorage.getItem(STATE_KEY);
        if (!check || check.length < 10) throw new Error("localStorage write failed");
        var parsed = JSON.parse(check);
        var found = (parsed.transactions || []).find(function (x) {
          return String(x.id) === String(t.id);
        });
        if (!found || Number(found.qty) !== Number(next.qty) || Number(found.price) !== Number(next.price)) {
          throw new Error("Save verification failed \u2014 data did not stick");
        }
      } catch (err) {
        return alert("Could not save: " + err.message);
      }
      mb.classList.add("hidden");
      rememberPageAndReload();
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
        '<div style="margin-bottom:10px"><b style="font-size:15px">\u270e Edit SIP plan</b>' +
        '<div class="muted" style="margin-top:3px">Change planned amount, frequency, or status</div></div>' +
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
  }

  function injectTxEdits() {
    var view = document.getElementById("view");
    if (!view) return;
    var h2 = view.querySelector("h2");
    var title = document.getElementById("title");
    var isTx =
      (h2 && /transaction ledger/i.test(h2.textContent || "")) ||
      (title && /transaction/i.test(title.textContent || "")) ||
      !!view.querySelector("button[data-del]");
    if (!isTx) return;
    view.querySelectorAll("button[data-del]").forEach(function (delBtn) {
      var id = delBtn.getAttribute("data-del");
      if (!id) return;
      var cell = delBtn.parentElement;
      if (!cell) return;
      if (cell.querySelector('[data-vp-edit-tx="' + id + '"]')) return;
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn primary";
      edit.textContent = "\u270e Edit";
      edit.setAttribute("data-vp-edit-tx", id);
      edit.style.cssText = "margin-right:6px;font-weight:700";
      cell.insertBefore(edit, delBtn);
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

  function rememberPageAndReload() {
    try {
      var active = document.querySelector(".nav button.active[data-page]");
      var page = active && active.getAttribute("data-page");
      if (!page) {
        var title = document.getElementById("title");
        var t = (title && title.textContent) || "";
        if (/transaction/i.test(t)) page = "transactions";
        else if (/sip/i.test(t)) page = "sips";
        else if (/holding/i.test(t)) page = "holdings";
        else if (/goal/i.test(t)) page = "goals";
        else if (/setting/i.test(t)) page = "settings";
        else if (/realis|realiz/i.test(t)) page = "realized";
        else if (/research/i.test(t)) page = "research";
        else if (/import/i.test(t)) page = "import";
      }
      if (page) sessionStorage.setItem("investtrack-restore-page", page);
      sessionStorage.setItem("investtrack-skip-pin", String(Date.now()));
    } catch (e) {}
    location.reload();
  }

  function restorePageAfterReload() {
    try {
      var page = sessionStorage.getItem("investtrack-restore-page");
      if (!page) return;
      sessionStorage.removeItem("investtrack-restore-page");
      function go() {
        var btn = document.querySelector('.nav button[data-page="' + page + '"]');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }
      if (!go()) {
        setTimeout(go, 150);
        setTimeout(go, 400);
        setTimeout(go, 900);
      } else {
        setTimeout(go, 300);
      }
    } catch (e) {}
  }

  function trySkipPinLock() {
    try {
      var t = Number(sessionStorage.getItem("investtrack-skip-pin") || 0);
      if (!t || Date.now() - t > 120000) return false;
      sessionStorage.removeItem("investtrack-skip-pin");
      function hideLock() {
        var ls = document.getElementById("lockscreen");
        if (!ls) return;
        ls.classList.add("hidden");
        ls.style.display = "none";
      }
      hideLock();
      var n = 0;
      var iv = setInterval(function () {
        hideLock();
        n++;
        if (n > 25) clearInterval(iv);
      }, 80);
      return true;
    } catch (e) {
      return false;
    }
  }

  function runAll() {
    injectCss();
    trySkipPinLock();
    restorePageAfterReload();
    enhanceDashboard();
    injectSipTools();
    injectTxEdits();
  }

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;
      var edSip = t.closest && t.closest("[data-vp-edit-sip]");
      if (edSip) {
        e.preventDefault();
        e.stopPropagation();
        openSipPlanEditor(edSip.getAttribute("data-vp-edit-sip"));
        return;
      }
      var edTx = t.closest && t.closest("[data-vp-edit-tx]");
      if (edTx) {
        e.preventDefault();
        e.stopPropagation();
        openTxEditor(edTx.getAttribute("data-vp-edit-tx"));
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
        setTimeout(injectSipTools, 300);
        setTimeout(injectSipTools, 800);
      }
      if (t.closest && t.closest('[data-page="transactions"]')) {
        setTimeout(injectTxEdits, 50);
        setTimeout(injectTxEdits, 300);
        setTimeout(injectTxEdits, 800);
      }
    },
    true
  );

  function boot() {
    injectCss();
    trySkipPinLock();
    restorePageAfterReload();
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
  setTimeout(injectTxEdits, 2000);
  trySkipPinLock();
  restorePageAfterReload();
  setTimeout(trySkipPinLock, 300);
  setTimeout(restorePageAfterReload, 400);
  setTimeout(restorePageAfterReload, 1000);

  console.log("[visual-pro] ready v7 \u2014 restore page after edit");
})();
