"use strict";
/**
 * Patch: edit/delete SIP installments + edit transactions
 * Loads after main app.js and overrides key UI functions.
 */
(function () {
  function waitForApp(fn) {
    if (typeof openSipInstallment === "function" && typeof sipDetails === "function" && typeof openTx === "function" && typeof s !== "undefined") {
      fn();
      return;
    }
    setTimeout(function () { waitForApp(fn); }, 50);
  }

  waitForApp(function () {
    window.openEditInstallment = function (txId) {
      var t = s.transactions.find(function (x) { return x.id === txId; });
      if (!t) return;
      var amount = t.amount != null ? Number(t.amount) : (Number(t.qty) || 0) * (Number(t.price) || 0);
      openModal(
        "<h2>Edit SIP installment</h2>" +
        '<form id="sipif"><div class="form">' +
        '<div class="field full"><label>Fund</label><input class="input wide" value="' + esc(t.name) + '" readonly></div>' +
        '<div class="field"><label>Installment date</label><input class="input wide" type="date" name="date" required value="' + esc(t.date) + '"></div>' +
        '<div class="field"><label>Investment amount</label><input class="input wide" type="number" step="any" name="amount" value="' + amount + '" required></div>' +
        '<div class="field"><label>NAV</label><input class="input wide" type="number" step="any" name="price" required value="' + (Number(t.price) || "") + '"></div>' +
        '<div class="field"><label>Units</label><input class="input wide" type="number" step="any" name="qty" required value="' + (Number(t.qty) || "") + '"></div>' +
        '<div class="field"><label>Charges</label><input class="input wide" type="number" step="any" name="charges" value="' + (Number(t.charges) || 0) + '"></div>' +
        '<div class="field full"><label>Notes</label><input class="input wide" name="notes" value="' + esc(t.notes || "") + '"></div>' +
        '</div><div class="modalfoot"><button type="button" class="btn" id="close">Cancel</button><button class="btn primary">Save changes</button></div></form>'
      );
      $("close").onclick = closeModal;
      var f = $("sipif");
      f.elements.amount.oninput = function () {
        var a = Number(f.elements.amount.value) || 0;
        var nav = Number(f.elements.price.value) || 0;
        if (nav > 0) f.elements.qty.value = (a / nav).toFixed(6);
      };
      f.elements.price.oninput = f.elements.amount.oninput;
      f.onsubmit = function (e) {
        e.preventDefault();
        var o = Object.fromEntries(new FormData(f));
        o.id = t.id;
        o.sipId = t.sipId;
        o.type = "MUTUAL_FUND";
        o.name = t.name;
        o.symbol = t.symbol;
        o.exchange = t.exchange || "AMFI";
        o.action = "SIP";
        o.amount = Number(o.amount);
        o.price = Number(o.price);
        o.qty = Number(o.qty);
        o.charges = Number(o.charges) || 0;
        o.brokerage = 0;
        o.stt = 0;
        o.gst = 0;
        o.otherCharges = o.charges;
        s.transactions = s.transactions.map(function (x) { return x.id === t.id ? o : x; });
        save();
        closeModal();
        render();
      };
    };

    window.sipDetails = function (id) {
      var p = s.sips.find(function (x) { return x.id === id; });
      if (!p) return;
      var ins = sipInstallments(p);
      var invested = ins.reduce(function (a, t) {
        return a + Number(t.qty) * Number(t.price) + totalCharges(t);
      }, 0);
      openModal(
        "<h2>" + esc(p.name) + "</h2>" +
        '<div class="muted">' + esc(p.frequency) + " · Planned ₹" + num(p.amount) + " · Total invested " + money(invested) + "</div>" +
        '<div class="tablewrap" style="margin-top:12px"><table class="table"><thead><tr><th>Date</th><th>NAV</th><th>Units</th><th>Amount</th><th>Charges</th><th></th></tr></thead><tbody>' +
        (ins.length
          ? ins.map(function (t) {
              return "<tr><td>" + esc(t.date) + "</td><td>" + money(t.price) + "</td><td>" + num(t.qty) + "</td><td>" +
                money(Number(t.qty) * Number(t.price)) + "</td><td>" + money(totalCharges(t)) +
                '</td><td><div style="display:flex;gap:5px;flex-wrap:wrap">' +
                '<button class="btn" data-edit-installment="' + esc(t.id) + '">Edit</button>' +
                '<button class="btn danger" data-del-installment="' + esc(t.id) + '">Delete</button></div></td></tr>';
            }).join("")
          : '<tr><td colspan="6" class="empty">No installments recorded.</td></tr>') +
        '</tbody></table></div><div class="modalfoot"><button class="btn" id="close">Close</button>' +
        '<button class="btn primary" data-sip-add="' + esc(p.id) + '">＋ Record installment</button></div>'
      );
      $("close").onclick = closeModal;
    };

    window.transactionsPage = function () {
      var a = s.transactions.slice().sort(function (x, y) { return y.date.localeCompare(x.date); });
      return '<div class="head"><h2>Transaction ledger</h2><button class="btn primary" id="add2">＋ Add transaction</button></div>' +
        '<div class="notice">Transaction costs are stored separately so cost basis and realised P/L remain auditable.</div>' +
        '<div class="tablewrap" style="margin-top:10px"><table class="table"><thead><tr><th>Date</th><th>Action</th><th>Asset</th><th>Qty</th><th>Price/NAV</th><th>Charges</th><th>Cash flow</th><th>Notes</th><th></th></tr></thead><tbody>' +
        a.map(function (x) {
          var gross = (Number(x.qty) || 0) * (Number(x.price) || 0);
          var cash = ["BUY", "SIP", "BONUS", "RIGHTS"].indexOf(x.action) >= 0 ? gross + totalCharges(x) : gross - totalCharges(x);
          return "<tr><td>" + esc(x.date) + '</td><td><span class="pill">' + esc(x.action) + '</span></td><td><div class="asset">' +
            esc(x.name) + '</div><div class="sub">' + esc(x.symbol) + "</div></td><td>" + num(x.qty) + "</td><td>" +
            money(x.price) + "</td><td>" + money(totalCharges(x)) + "</td><td>" + money(cash) +
            '</td><td class="muted">' + esc(x.notes) + '</td><td><div style="display:flex;gap:5px;flex-wrap:wrap">' +
            '<button class="btn" data-edit-tx="' + esc(x.id) + '">Edit</button>' +
            '<button class="btn danger" data-del="' + esc(x.id) + '">Delete</button></div></td></tr>';
        }).join("") +
        "</tbody></table></div>";
    };

    var _openTx = window.openTx;
    window.openTx = function (symbolOrId, forcedAction) {
      if (symbolOrId && !forcedAction) {
        var byId = s.transactions.find(function (x) { return x.id === symbolOrId; });
        if (byId) {
          var old = byId;
          openModal(
            "<h2>Edit transaction</h2>" +
            '<form id="txf"><div class="form">' +
            '<div class="field"><label>Type</label><select class="select wide" name="type"><option>STOCK</option><option>MUTUAL_FUND</option><option>ETF</option><option>FD</option><option>BOND</option><option>SGB</option><option>PPF</option><option>NPS</option><option>GOLD</option><option>CASH</option><option>OTHER</option></select></div>' +
            '<div class="field"><label>Action</label><select class="select wide" name="action"><option>BUY</option><option>SELL</option><option>SIP</option><option>DIVIDEND</option><option>BONUS</option><option>SPLIT</option><option>RIGHTS</option><option>REDEMPTION</option></select></div>' +
            '<div class="field full"><label>Name</label><input class="input wide" name="name" required></div>' +
            '<div class="field"><label>Symbol / scheme code</label><input class="input wide" name="symbol" required></div>' +
            '<div class="field"><label>Exchange / source</label><select class="select wide" name="exchange"><option>NSE</option><option>BSE</option><option>AMFI</option><option>OTHER</option></select></div>' +
            '<div class="field"><label>Date</label><input class="input wide" type="date" name="date" required></div>' +
            '<div class="field"><label>Quantity / units</label><input class="input wide" type="number" step="any" name="qty" required></div>' +
            '<div class="field"><label>Price / NAV</label><input class="input wide" type="number" step="any" name="price" required></div>' +
            '<div class="field"><label>Brokerage</label><input class="input wide" type="number" step="any" name="brokerage" value="0"></div>' +
            '<div class="field"><label>STT</label><input class="input wide" type="number" step="any" name="stt" value="0"></div>' +
            '<div class="field"><label>GST</label><input class="input wide" type="number" step="any" name="gst" value="0"></div>' +
            '<div class="field"><label>Other charges</label><input class="input wide" type="number" step="any" name="otherCharges" value="0"></div>' +
            '<div class="field full"><label>Notes</label><input class="input wide" name="notes"></div>' +
            '</div><div class="modalfoot"><button type="button" class="btn" id="close">Cancel</button><button class="btn primary">Save transaction</button></div></form>'
          );
          var f = $("txf");
          Object.keys(old).forEach(function (k) {
            if (f.elements[k]) f.elements[k].value = old[k];
          });
          $("close").onclick = closeModal;
          f.onsubmit = async function (e) {
            e.preventDefault();
            var o = Object.fromEntries(new FormData(f));
            o.id = old.id;
            o.qty = Number(o.qty);
            o.price = Number(o.price);
            o.brokerage = Number(o.brokerage) || 0;
            o.stt = Number(o.stt) || 0;
            o.gst = Number(o.gst) || 0;
            o.otherCharges = Number(o.otherCharges) || 0;
            o.charges = o.brokerage + o.stt + o.gst + o.otherCharges;
            if (old.sipId) o.sipId = old.sipId;
            if (old.amount != null) o.amount = old.amount;
            if (["SELL", "REDEMPTION"].indexOf(o.action) >= 0) {
              var h = holdings().find(function (x) { return x.symbol === o.symbol; });
              if (!h || o.qty <= 0 || o.qty > h.qty + 1e-9) return alert("Quantity exceeds your current holding.");
            }
            s.transactions = s.transactions.map(function (x) { return x.id === old.id ? o : x; });
            save();
            closeModal();
            render();
          };
          return;
        }
      }
      return _openTx(symbolOrId, forcedAction);
    };

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.dataset) return;
      if (t.dataset.editTx) {
        openTx(t.dataset.editTx);
        return;
      }
      if (t.dataset.editInstallment) {
        openEditInstallment(t.dataset.editInstallment);
        return;
      }
      if (t.dataset.delInstallment) {
        if (confirm("Delete this SIP installment?")) {
          s.transactions = s.transactions.filter(function (x) { return x.id !== t.dataset.delInstallment; });
          save();
          render();
        }
      }
    }, true);

    console.log("[edit-installments] patch loaded: SIP installment edit/delete + transaction edit enabled");
  });
})();
