"use strict";
/**
 * DOM patch: SIP installment edit/delete + transaction edit
 * Also hides AI Summary remnants if core still exposes that page.
 */
(function () {
  function $(id) { return document.getElementById(id); }

  function getState() {
    try {
      var raw = localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3");
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || !Array.isArray(st.transactions)) return null;
      return st;
    } catch (e) { return null; }
  }

  function saveState(st) {
    st.meta = st.meta || {};
    st.meta.lastSavedAt = Date.now();
    localStorage.setItem("investtrack-v4", JSON.stringify(st));
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
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function totalCharges(t) {
    var sum = (Number(t.brokerage) || 0) + (Number(t.stt) || 0) + (Number(t.gst) || 0) + (Number(t.otherCharges) || 0);
    return sum || (Number(t.charges) || 0);
  }

  function openLocalModal(html) {
    var mb = $("mb"), modal = $("modal");
    if (!mb || !modal) { alert("Modal UI not ready. Refresh the page."); return; }
    modal.innerHTML = html;
    mb.classList.remove("hidden");
  }

  function closeLocalModal() {
    var mb = $("mb");
    if (mb) mb.classList.add("hidden");
  }

  function sipInstallments(st, planId) {
    return (st.transactions || [])
      .filter(function (t) { return t.sipId === planId && t.action === "SIP"; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
  }

  function showSipDetails(planId) {
    var st = getState();
    if (!st) return;
    var p = (st.sips || []).find(function (x) { return x.id === planId; });
    if (!p) return alert("SIP not found.");
    var ins = sipInstallments(st, p.id);
    var invested = ins.reduce(function (a, t) {
      return a + Number(t.qty) * Number(t.price) + totalCharges(t);
    }, 0);
    var rows = ins.length
      ? ins.map(function (t) {
          return "<tr><td>" + esc(t.date) + "</td><td>" + money(t.price) + "</td><td>" + num(t.qty) +
            "</td><td>" + money(Number(t.qty) * Number(t.price)) + "</td><td>" + money(totalCharges(t)) +
            '</td><td><div style="display:flex;gap:5px;flex-wrap:wrap">' +
            '<button type="button" class="btn" data-ei-edit="' + esc(t.id) + '">Edit</button>' +
            '<button type="button" class="btn danger" data-ei-del="' + esc(t.id) + '">Delete</button></div></td></tr>';
        }).join("")
      : '<tr><td colspan="6" class="empty">No installments recorded.</td></tr>';
    openLocalModal(
      "<h2>" + esc(p.name) + "</h2>" +
      '<div class="muted">' + esc(p.frequency || "") + " \u00b7 Planned \u20b9" + num(p.amount) +
      " \u00b7 Total invested " + money(invested) + "</div>" +
      '<div class="tablewrap" style="margin-top:12px"><table class="table">' +
      "<thead><tr><th>Date</th><th>NAV</th><th>Units</th><th>Amount</th><th>Charges</th><th></th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>" +
      '<div class="modalfoot"><button type="button" class="btn" id="ei-close">Close</button>' +
      '<button type="button" class="btn primary" data-sip-add="' + esc(p.id) + '">\uff0b Record installment</button></div>'
    );
    var closeBtn = $("ei-close");
    if (closeBtn) closeBtn.onclick = closeLocalModal;
  }

  function showEditInstallment(txId) {
    var st = getState();
    if (!st) return;
    var t = (st.transactions || []).find(function (x) { return x.id === txId; });
    if (!t) return alert("Installment not found.");
    var amount = t.amount != null ? Number(t.amount) : (Number(t.qty) || 0) * (Number(t.price) || 0);
    openLocalModal(
      "<h2>Edit SIP installment</h2>" +
      '<form id="ei-form"><div class="form">' +
      '<div class="field full"><label>Fund</label><input class="input wide" value="' + esc(t.name) + '" readonly></div>' +
      '<div class="field"><label>Installment date</label><input class="input wide" type="date" name="date" required value="' + esc(t.date) + '"></div>' +
      '<div class="field"><label>Investment amount</label><input class="input wide" type="number" step="any" name="amount" value="' + amount + '" required></div>' +
      '<div class="field"><label>NAV</label><input class="input wide" type="number" step="any" name="price" required value="' + (Number(t.price) || "") + '"></div>' +
      '<div class="field"><label>Units</label><input class="input wide" type="number" step="any" name="qty" required value="' + (Number(t.qty) || "") + '"></div>' +
      '<div class="field"><label>Charges</label><input class="input wide" type="number" step="any" name="charges" value="' + (Number(t.charges) || 0) + '"></div>' +
      '<div class="field full"><label>Notes</label><input class="input wide" name="notes" value="' + esc(t.notes || "") + '"></div>' +
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
        id: t.id, sipId: t.sipId, type: "MUTUAL_FUND", name: t.name, symbol: t.symbol,
        exchange: t.exchange || "AMFI", action: "SIP", date: o.date,
        amount: Number(o.amount), price: Number(o.price), qty: Number(o.qty),
        charges: Number(o.charges) || 0, brokerage: 0, stt: 0, gst: 0,
        otherCharges: Number(o.charges) || 0, notes: o.notes || ""
      };
      st.transactions = st.transactions.map(function (x) { return x.id === t.id ? next : x; });
      saveState(st);
      closeLocalModal();
      location.reload();
    });
  }

  function showEditTransaction(txId) {
    var st = getState();
    if (!st) return;
    var t = (st.transactions || []).find(function (x) { return x.id === txId; });
    if (!t) return alert("Transaction not found.");
    var types = ["STOCK","MUTUAL_FUND","ETF","FD","BOND","SGB","PPF","NPS","GOLD","CASH","OTHER"];
    var actions = ["BUY","SELL","SIP","DIVIDEND","BONUS","SPLIT","RIGHTS","REDEMPTION"];
    var typeOpts = types.map(function (x) {
      return '<option value="' + x + '"' + (t.type === x ? " selected" : "") + ">" + x + "</option>";
    }).join("");
    var actionOpts = actions.map(function (x) {
      return '<option value="' + x + '"' + (t.action === x ? " selected" : "") + ">" + x + "</option>";
    }).join("");
    var exch = t.exchange || "NSE";
    openLocalModal(
      "<h2>Edit transaction</h2>" +
      '<form id="ei-txf"><div class="form">' +
      '<div class="field"><label>Type</label><select class="select wide" name="type">' + typeOpts + "</select></div>" +
      '<div class="field"><label>Action</label><select class="select wide" name="action">' + actionOpts + "</select></div>" +
      '<div class="field full"><label>Name</label><input class="input wide" name="name" required value="' + esc(t.name) + '"></div>' +
      '<div class="field"><label>Symbol</label><input class="input wide" name="symbol" required value="' + esc(t.symbol) + '"></div>' +
      '<div class="field"><label>Exchange</label><select class="select wide" name="exchange">' +
      '<option' + (exch === "NSE" ? " selected" : "") + '>NSE</option>' +
      '<option' + (exch === "BSE" ? " selected" : "") + '>BSE</option>' +
      '<option' + (exch === "AMFI" ? " selected" : "") + '>AMFI</option>' +
      '<option' + (exch === "OTHER" ? " selected" : "") + '>OTHER</option></select></div>' +
      '<div class="field"><label>Date</label><input class="input wide" type="date" name="date" required value="' + esc(t.date) + '"></div>' +
      '<div class="field"><label>Qty / units</label><input class="input wide" type="number" step="any" name="qty" required value="' + (Number(t.qty) || "") + '"></div>' +
      '<div class="field"><label>Price / NAV</label><input class="input wide" type="number" step="any" name="price" required value="' + (Number(t.price) || "") + '"></div>' +
      '<div class="field"><label>Brokerage</label><input class="input wide" type="number" step="any" name="brokerage" value="' + (Number(t.brokerage) || 0) + '"></div>' +
      '<div class="field"><label>STT</label><input class="input wide" type="number" step="any" name="stt" value="' + (Number(t.stt) || 0) + '"></div>' +
      '<div class="field"><label>GST</label><input class="input wide" type="number" step="any" name="gst" value="' + (Number(t.gst) || 0) + '"></div>' +
      '<div class="field"><label>Other charges</label><input class="input wide" type="number" step="any" name="otherCharges" value="' + (Number(t.otherCharges) || 0) + '"></div>' +
      '<div class="field full"><label>Notes</label><input class="input wide" name="notes" value="' + esc(t.notes || "") + '"></div>' +
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
        type: o.type, action: o.action, name: o.name, symbol: o.symbol, exchange: o.exchange,
        date: o.date, qty: Number(o.qty), price: Number(o.price),
        brokerage: Number(o.brokerage) || 0, stt: Number(o.stt) || 0,
        gst: Number(o.gst) || 0, otherCharges: Number(o.otherCharges) || 0, notes: o.notes || ""
      });
      next.charges = next.brokerage + next.stt + next.gst + next.otherCharges;
      st.transactions = st.transactions.map(function (x) { return x.id === t.id ? next : x; });
      saveState(st);
      closeLocalModal();
      location.reload();
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

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t) return;
    var editInst = t.closest && t.closest("[data-ei-edit]");
    if (editInst) {
      e.preventDefault(); e.stopPropagation();
      showEditInstallment(editInst.getAttribute("data-ei-edit"));
      return;
    }
    var delInst = t.closest && t.closest("[data-ei-del]");
    if (delInst) {
      e.preventDefault(); e.stopPropagation();
      if (!confirm("Delete this SIP installment?")) return;
      var st = getState();
      if (!st) return;
      st.transactions = st.transactions.filter(function (x) { return x.id !== delInst.getAttribute("data-ei-del"); });
      saveState(st);
      closeLocalModal();
      location.reload();
      return;
    }
    var txEdit = t.closest && t.closest("[data-ei-tx-edit]");
    if (txEdit) {
      e.preventDefault(); e.stopPropagation();
      showEditTransaction(txEdit.getAttribute("data-ei-tx-edit"));
      return;
    }
    var btn = t.closest && t.closest("[data-sip-details]");
    if (btn) {
      e.preventDefault(); e.stopPropagation();
      showSipDetails(btn.getAttribute("data-sip-details"));
      return;
    }
    if (t.closest && t.closest('[data-page="summary"]')) {
      e.preventDefault(); e.stopPropagation();
    }
  }, true);

  function watchView() {
    hideSummaryNav();
    var view = $("view");
    if (!view) { setTimeout(watchView, 200); return; }
    new MutationObserver(function () { injectTransactionEdits(); hideSummaryNav(); })
      .observe(view, { childList: true, subtree: true });
    injectTransactionEdits();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watchView);
  else watchView();

  console.log("[edit-installments] ready v4");
})();
