"use strict";
/**
 * SIP plan edit + installment edit/delete + transaction edit
 */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function getState() {
    try {
      var raw = localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3");
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || !Array.isArray(st.transactions)) return null;
      return st;
    } catch (e) {
      return null;
    }
  }

  function saveState(st) {
    st.meta = st.meta || {};
    st.meta.lastSavedAt = Date.now();
    localStorage.setItem("investtrack-v4", JSON.stringify(st));
  }

  function softRefresh() {
    try {
      localStorage.removeItem("investtrack-inv-cache-v1");
      if (window.__invCache) window.__invCache = null;
    } catch (e) {}
    var active = document.querySelector(".nav button.active[data-page]");
    var page = active && active.getAttribute("data-page");
    if (page) {
      var btn = document.querySelector('.nav button[data-page="' + page + '"]');
      if (btn) {
        btn.click();
        if (window.investToast) window.investToast("Saved");
        return;
      }
    }
    location.reload();
  }

  function money(n) {
    n = Number(n) || 0;
    return "\u20b9" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function num(n) {
    n = Number(n);
    if (!isFinite(n)) return "\u2014";
    return n.toLocaleString("en-IN", { maximumFractionDigits: 6 });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&")
      .replace(/</g, "<")
      .replace(/>/g, ">")
      .replace(/"/g, """);
  }

  function totalCharges(t) {
    var sum =
      (Number(t.brokerage) || 0) +
      (Number(t.stt) || 0) +
      (Number(t.gst) || 0) +
      (Number(t.otherCharges) || 0);
    return sum || Number(t.charges) || 0;
  }

  function openLocalModal(html) {
    var mb = $("mb");
    var modal = $("modal");
    if (!mb || !modal) {
      alert("Modal UI not ready. Refresh the page.");
      return;
    }
    modal.innerHTML = html;
    mb.classList.remove("hidden");
  }

  function closeLocalModal() {
    var mb = $("mb");
    if (mb) mb.classList.add("hidden");
  }

  function sipInstallments(st, planId) {
    return (st.transactions || [])
      .filter(function (t) {
        return t.sipId === planId && t.action === "SIP";
      })
      .sort(function (a, b) {
        return String(a.date).localeCompare(String(b.date));
      });
  }

  function showEditSipPlan(planId) {
    var st = getState();
    if (!st) return;
    var p = (st.sips || []).find(function (x) {
      return x.id === planId;
    });
    if (!p) return alert("SIP plan not found.");

    var freqs = ["MONTHLY", "QUARTERLY", "WEEKLY"];
    var statuses = ["ACTIVE", "PAUSED", "STOPPED"];
    var freqOpts = freqs
      .map(function (x) {
        return (
          '<option value="' +
          x +
          '"' +
          ((p.frequency || "MONTHLY") === x ? " selected" : "") +
          ">" +
          x +
          "</option>"
        );
      })
      .join("");
    var statusOpts = statuses
      .map(function (x) {
        return (
          '<option value="' +
          x +
          '"' +
          ((p.status || "ACTIVE") === x ? " selected" : "") +
          ">" +
          x +
          "</option>"
        );
      })
      .join("");

    openLocalModal(
      "<h2>Edit SIP plan</h2>" +
        '<p class="muted" style="margin:0 0 10px">Fix planned amount, frequency, or status. Past installments stay as recorded.</p>' +
        '<form id="ei-sip-plan"><div class="form">' +
        '<div class="field full"><label>Mutual fund name</label><input class="input wide" name="name" required value="' +
        esc(p.name || "") +
        '"></div>' +
        '<div class="field"><label>Scheme code / symbol</label><input class="input wide" name="symbol" required value="' +
        esc(p.symbol || "") +
        '"></div>' +
        '<div class="field"><label>Frequency</label><select class="select wide" name="frequency">' +
        freqOpts +
        "</select></div>" +
        '<div class="field"><label>SIP amount (planned)</label><input class="input wide" type="number" min="1" step="any" name="amount" required value="' +
        (Number(p.amount) || "") +
        '"></div>' +
        '<div class="field"><label>Start date</label><input class="input wide" type="date" name="startDate" required value="' +
        esc(p.startDate || "") +
        '"></div>' +
        '<div class="field"><label>Status</label><select class="select wide" name="status">' +
        statusOpts +
        "</select></div>" +
        '<div class="field full"><label>Notes</label><input class="input wide" name="notes" value="' +
        esc(p.notes || "") +
        '"></div>' +
        '</div><div class="modalfoot"><button type="button" class="btn" id="ei-close">Cancel</button>' +
        '<button type="submit" class="btn primary">Save plan</button></div></form>'
    );

    var closeBtn = $("ei-close");
    if (closeBtn) closeBtn.onclick = closeLocalModal;
    var f = $("ei-sip-plan");
    if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var o = Object.fromEntries(new FormData(f));
      st.sips = (st.sips || []).map(function (x) {
        if (x.id !== p.id) return x;
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
          if (t.sipId !== p.id) return t;
          return Object.assign({}, t, { name: o.name, symbol: o.symbol });
        });
      }
      saveState(st);
      closeLocalModal();
      softRefresh();
    });
  }

  function isSipsPage(view) {
    if (!view) return false;
    if (view.querySelector("[data-sip-add], [data-sip-del], [data-sip-details]")) return true;
    var h = view.querySelector("h2");
    if (h && /mutual fund sip/i.test(h.textContent || "")) return true;
    var title = $("title");
    if (title && /sip/i.test(title.textContent || "")) return true;
    return false;
  }

  function injectSipPlanEdits() {
    var view = $("view");
    if (!view) return;
    if (!isSipsPage(view)) return;

    var anchors = view.querySelectorAll("[data-sip-add], [data-sip-del], [data-sip-details]");
    var seen = {};
    anchors.forEach(function (el) {
      var id =
        el.getAttribute("data-sip-add") ||
        el.getAttribute("data-sip-del") ||
        el.getAttribute("data-sip-details");
      if (!id || seen[id]) return;
      seen[id] = true;
      var foot = el.closest(".modalfoot") || el.parentElement;
      if (!foot) return;
      if (foot.querySelector('[data-sip-edit-plan="' + id + '"]')) return;
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn primary";
      edit.textContent = "Edit plan";
      edit.title = "Change planned SIP amount, frequency, status";
      edit.setAttribute("data-sip-edit-plan", id);
      edit.style.cssText = "margin-right:6px;font-weight:700";
      foot.insertBefore(edit, foot.firstChild);
    });

    var st = getState();
    if (!st || !(st.sips || []).length) return;
    if (view.querySelector("#sipPlanEditBar")) return;
    var bar = document.createElement("div");
    bar.id = "sipPlanEditBar";
    bar.className = "card";
    bar.style.marginTop = "12px";
    bar.innerHTML =
      '<div class="head" style="margin:0 0 8px"><h2 style="margin:0">Edit SIP plan</h2></div>' +
      '<div class="muted" style="margin-bottom:10px">Change planned amount / frequency / status for a SIP.</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px">' +
      (st.sips || [])
        .map(function (p) {
          return (
            '<button type="button" class="btn primary" data-sip-edit-plan="' +
            esc(p.id) +
            '">Edit: ' +
            esc((p.name || p.symbol || "SIP").slice(0, 40)) +
            " \u00b7 \u20b9" +
            esc(String(p.amount || "")) +
            "</button>"
          );
        })
        .join("") +
      "</div>";
    var head = view.querySelector(".head");
    if (head && head.parentNode) {
      head.parentNode.insertBefore(bar, head.nextSibling);
    } else {
      view.insertBefore(bar, view.firstChild);
    }
  }

  function showSipDetails(planId) {
    var st = getState();
    if (!st) return;
    var p = (st.sips || []).find(function (x) {
      return x.id === planId;
    });
    if (!p) return alert("SIP not found.");
    var ins = sipInstallments(st, p.id);
    var invested = ins.reduce(function (a, t) {
      return a + Number(t.qty) * Number(t.price) + totalCharges(t);
    }, 0);
    var rows = ins.length
      ? ins
          .map(function (t) {
            return (
              "<tr><td>" +
              esc(t.date) +
              "</td><td>" +
              money(t.price) +
              "</td><td>" +
              num(t.qty) +
              "</td><td>" +
              money(Number(t.qty) * Number(t.price)) +
              "</td><td>" +
              money(totalCharges(t)) +
              '</td><td><div style="display:flex;gap:5px;flex-wrap:wrap">' +
              '<button type="button" class="btn" data-ei-edit="' +
              esc(t.id) +
              '">Edit</button>' +
              '<button type="button" class="btn danger" data-ei-del="' +
              esc(t.id) +
              '">Delete</button></div></td></tr>'
            );
          })
          .join("")
      : '<tr><td colspan="6" class="empty">No installments recorded.</td></tr>';
    openLocalModal(
      "<h2>" +
        esc(p.name) +
        "</h2>" +
        '<div class="muted">' +
        esc(p.frequency || "") +
        " \u00b7 Planned \u20b9" +
        num(p.amount) +
        " \u00b7 Total invested " +
        money(invested) +
        "</div>" +
        '<div class="tablewrap" style="margin-top:12px"><table class="table">' +
        "<thead><tr><th>Date</th><th>NAV</th><th>Units</th><th>Amount</th><th>Charges</th><th></th></tr></thead>" +
        "<tbody>" +
        rows +
        "</tbody></table></div>" +
        '<div class="modalfoot"><button type="button" class="btn" id="ei-close">Close</button>' +
        '<button type="button" class="btn primary" data-sip-edit-plan="' +
        esc(p.id) +
        '">Edit plan</button>' +
        '<button type="button" class="btn primary" data-sip-add="' +
        esc(p.id) +
        '">\uff0b Record installment</button></div>'
    );
    var closeBtn = $("ei-close");
    if (closeBtn) closeBtn.onclick = closeLocalModal;
  }

  function showEditInstallment(txId) {
    var st = getState();
    if (!st) return;
    var t = (st.transactions || []).find(function (x) {
      return x.id === txId;
    });
    if (!t) return alert("Installment not found.");
    var amount =
      t.amount != null ? Number(t.amount) : (Number(t.qty) || 0) * (Number(t.price) || 0);
    openLocalModal(
      "<h2>Edit SIP installment</h2>" +
        '<form id="ei-form"><div class="form">' +
        '<div class="field full"><label>Fund</label><input class="input wide" value="' +
        esc(t.name) +
        '" readonly></div>' +
        '<div class="field"><label>Installment date</label><input class="input wide" type="date" name="date" required value="' +
        esc(t.date) +
        '"></div>' +
        '<div class="field"><label>Investment amount</label><input class="input wide" type="number" step="any" name="amount" value="' +
        amount +
        '" required></div>' +
        '<div class="field"><label>NAV</label><input class="input wide" type="number" step="any" name="price" required value="' +
        (Number(t.price) || "") +
        '"></div>' +
        '<div class="field"><label>Units</label><input class="input wide" type="number" step="any" name="qty" required value="' +
        (Number(t.qty) || "") +
        '"></div>' +
        '<div class="field"><label>Charges</label><input class="input wide" type="number" step="any" name="charges" value="' +
        (Number(t.charges) || 0) +
        '"></div>' +
        '<div class="field full"><label>Notes</label><input class="input wide" name="notes" value="' +
        esc(t.notes || "") +
        '"></div>' +
        '</div><div class="modalfoot"><button type="button" class="btn" id="ei-close">Cancel</button>' +
        '<button type="submit" class="btn primary">Save changes</button></div></form>'
    );
    var closeBtn = $("ei-close");
    if (closeBtn) closeBtn.onclick = closeLocalModal;
    var f = $("ei-form");
    if (!f) return;
    function syncUnits() {
      var a = Number(f.elements.amount.value) || 0;
      var nav = Number(f.elements.price.value) || 0;
      if (nav > 0) f.elements.qty.value = (a / nav).toFixed(6);
    }
    f.elements.amount.addEventListener("input", syncUnits);
    f.elements.price.addEventListener("input", syncUnits);
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var o = Object.fromEntries(new FormData(f));
      var next = {
        id: t.id,
        sipId: t.sipId,
        type: "MUTUAL_FUND",
        name: t.name,
        symbol: t.symbol,
        exchange: t.exchange || "AMFI",
        action: "SIP",
        date: o.date,
        amount: Number(o.amount),
        price: Number(o.price),
        qty: Number(o.qty),
        charges: Number(o.charges) || 0,
        brokerage: 0,
        stt: 0,
        gst: 0,
        otherCharges: Number(o.charges) || 0,
        notes: o.notes || ""
      };
      st.transactions = st.transactions.map(function (x) {
        return x.id === t.id ? next : x;
      });
      saveState(st);
      closeLocalModal();
      softRefresh();
    });
  }

  function showEditTransaction(txId) {
    var st = getState();
    if (!st) return;
    var t = (st.transactions || []).find(function (x) {
      return x.id === txId;
    });
    if (!t) return alert("Transaction not found.");
    var types = [
      "STOCK",
      "MUTUAL_FUND",
      "ETF",
      "FD",
      "BOND",
      "SGB",
      "PPF",
      "NPS",
      "GOLD",
      "CASH",
      "OTHER"
    ];
    var actions = [
      "BUY",
      "SELL",
      "SIP",
      "DIVIDEND",
      "BONUS",
      "SPLIT",
      "RIGHTS",
      "REDEMPTION"
    ];
    var typeOpts = types
      .map(function (x) {
        return (
          '<option value="' +
          x +
          '"' +
          (t.type === x ? " selected" : "") +
          ">" +
          x +
          "</option>"
        );
      })
      .join("");
    var actionOpts = actions
      .map(function (x) {
        return (
          '<option value="' +
          x +
          '"' +
          (t.action === x ? " selected" : "") +
          ">" +
          x +
          "</option>"
        );
      })
      .join("");
    var exch = t.exchange || "NSE";
    openLocalModal(
      "<h2>Edit transaction</h2>" +
        '<form id="ei-txf"><div class="form">' +
        '<div class="field"><label>Type</label><select class="select wide" name="type">' +
        typeOpts +
        "</select></div>" +
        '<div class="field"><label>Action</label><select class="select wide" name="action">' +
        actionOpts +
        "</select></div>" +
        '<div class="field full"><label>Name</label><input class="input wide" name="name" required value="' +
        esc(t.name) +
        '"></div>' +
        '<div class="field"><label>Symbol</label><input class="input wide" name="symbol" required value="' +
        esc(t.symbol) +
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
        esc(t.date) +
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
        '"></div>' +
        '</div><div class="modalfoot"><button type="button" class="btn" id="ei-close">Cancel</button>' +
        '<button type="submit" class="btn primary">Save transaction</button></div></form>'
    );
    var closeBtn = $("ei-close");
    if (closeBtn) closeBtn.onclick = closeLocalModal;
    var f = $("ei-txf");
    if (!f) return;
    f.addEventListener("submit", function (e) {
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
      st.transactions = st.transactions.map(function (x) {
        return x.id === t.id ? next : x;
      });
      saveState(st);
      closeLocalModal();
      softRefresh();
    });
  }

  function injectTransactionEdits() {
    var view = $("view");
    if (!view) return;
    var table = view.querySelector("table.table");
    if (!table) return;
    var head = table.querySelector("thead tr");
    if (!head) return;
    var headers = Array.prototype.map.call(head.querySelectorAll("th"), function (th) {
      return (th.textContent || "").trim().toLowerCase();
    });
    if (headers.indexOf("cash flow") < 0) return;
    var st = getState();
    if (!st) return;
    var txs = (st.transactions || []).slice().sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
    table.querySelectorAll("tbody tr").forEach(function (tr, i) {
      if (tr.querySelector("[data-ei-tx-edit]")) return;
      var tx = txs[i];
      if (!tx) return;
      var cell = tr.lastElementChild;
      if (!cell) return;
      var wrap = document.createElement("div");
      wrap.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;align-items:center";
      while (cell.firstChild) wrap.appendChild(cell.firstChild);
      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn";
      editBtn.textContent = "Edit";
      editBtn.setAttribute("data-ei-tx-edit", tx.id);
      wrap.insertBefore(editBtn, wrap.firstChild);
      cell.appendChild(wrap);
    });
  }

  function hideSummaryNav() {
    document.querySelectorAll('[data-page="summary"]').forEach(function (btn) {
      btn.style.display = "none";
    });
  }

  document.addEventListener(
    "click",
    function (e) {
      var t = e.target;
      if (!t) return;

      var planEdit = t.closest && t.closest("[data-sip-edit-plan]");
      if (planEdit) {
        e.preventDefault();
        e.stopPropagation();
        showEditSipPlan(planEdit.getAttribute("data-sip-edit-plan"));
        return;
      }

      var editInst = t.closest && t.closest("[data-ei-edit]");
      if (editInst) {
        e.preventDefault();
        e.stopPropagation();
        showEditInstallment(editInst.getAttribute("data-ei-edit"));
        return;
      }

      var delInst = t.closest && t.closest("[data-ei-del]");
      if (delInst) {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("Delete this SIP installment?")) return;
        var st = getState();
        if (!st) return;
        st.transactions = st.transactions.filter(function (x) {
          return x.id !== delInst.getAttribute("data-ei-del");
        });
        saveState(st);
        closeLocalModal();
        softRefresh();
        return;
      }

      var txEdit = t.closest && t.closest("[data-ei-tx-edit]");
      if (txEdit) {
        e.preventDefault();
        e.stopPropagation();
        showEditTransaction(txEdit.getAttribute("data-ei-tx-edit"));
        return;
      }

      var details = t.closest && t.closest("[data-sip-details]");
      if (details) {
        e.preventDefault();
        e.stopPropagation();
        showSipDetails(details.getAttribute("data-sip-details"));
        return;
      }

      if (t.closest && t.closest('[data-page="summary"]')) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (t.closest && t.closest('[data-page="sips"]')) {
        setTimeout(injectSipPlanEdits, 50);
        setTimeout(injectSipPlanEdits, 250);
        setTimeout(injectSipPlanEdits, 700);
      }
    },
    true
  );

  function watchView() {
    hideSummaryNav();
    var view = $("view");
    if (!view) {
      setTimeout(watchView, 200);
      return;
    }
    new MutationObserver(function () {
      injectTransactionEdits();
      injectSipPlanEdits();
      hideSummaryNav();
    }).observe(view, { childList: true, subtree: true });
    injectTransactionEdits();
    injectSipPlanEdits();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchView);
  else watchView();
  setTimeout(injectSipPlanEdits, 500);
  setTimeout(injectSipPlanEdits, 1200);
  setTimeout(injectSipPlanEdits, 2500);

  console.log("[edit-installments] ready v7 sip-plan-edit");
})();
