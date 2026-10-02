"use strict";
/**
 * Inject symbol / action / date filters on the Transactions page.
 */
(function () {
  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }

  function isTransactionsPage(view) {
    if (!view) return false;
    var h = view.querySelector("h2");
    if (h && /transaction ledger/i.test(h.textContent || "")) return true;
    var table = view.querySelector("table.table");
    if (!table) return false;
    var headers = Array.prototype.map.call(table.querySelectorAll("thead th"), function (th) {
      return (th.textContent || "").trim().toLowerCase();
    });
    return headers.indexOf("cash flow") >= 0 && headers.indexOf("action") >= 0;
  }

  function inject() {
    var view = document.getElementById("view");
    if (!view || !isTransactionsPage(view)) return;
    if (view.querySelector("#txFilterBar")) return;

    var table = view.querySelector("table.table");
    if (!table) return;

    var actions = {};
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      var cells = tr.querySelectorAll("td");
      if (cells.length < 3) return;
      var action = (cells[1].textContent || "").trim();
      if (action) actions[action] = true;
    });

    var bar = document.createElement("div");
    bar.id = "txFilterBar";
    bar.className = "search";
    bar.style.marginTop = "10px";
    bar.innerHTML =
      '<input class="input" id="txFilterSymbol" placeholder="Symbol / name\u2026" style="min-width:140px">' +
      '<select class="select" id="txFilterAction"><option value="">All actions</option>' +
      Object.keys(actions)
        .sort()
        .map(function (a) {
          return '<option value="' + esc(a) + '">' + esc(a) + "</option>";
        })
        .join("") +
      "</select>" +
      '<input class="input" id="txFilterFrom" type="date" title="From date">' +
      '<input class="input" id="txFilterTo" type="date" title="To date">' +
      '<button type="button" class="btn" id="txFilterClear">Clear</button>' +
      '<span class="muted" id="txFilterCount" style="align-self:center"></span>';

    var notice = view.querySelector(".notice");
    if (notice && notice.nextSibling) notice.parentNode.insertBefore(bar, notice.nextSibling);
    else if (table.parentNode) table.parentNode.parentNode.insertBefore(bar, table.parentNode);
    else view.insertBefore(bar, table);

    function apply() {
      var symQ = ((document.getElementById("txFilterSymbol") && document.getElementById("txFilterSymbol").value) || "")
        .trim()
        .toLowerCase();
      var act = ((document.getElementById("txFilterAction") && document.getElementById("txFilterAction").value) || "").trim();
      var from = ((document.getElementById("txFilterFrom") && document.getElementById("txFilterFrom").value) || "").trim();
      var to = ((document.getElementById("txFilterTo") && document.getElementById("txFilterTo").value) || "").trim();
      var shown = 0;
      var total = 0;
      table.querySelectorAll("tbody tr").forEach(function (tr) {
        total++;
        var cells = tr.querySelectorAll("td");
        if (cells.length < 3) {
          tr.style.display = "";
          shown++;
          return;
        }
        var date = (cells[0].textContent || "").trim();
        var action = (cells[1].textContent || "").trim();
        var assetText = (cells[2].textContent || "").toLowerCase();
        var ok = true;
        if (symQ && assetText.indexOf(symQ) < 0) ok = false;
        if (act && action !== act) ok = false;
        if (from && date < from) ok = false;
        if (to && date > to) ok = false;
        tr.style.display = ok ? "" : "none";
        if (ok) shown++;
      });
      var cnt = document.getElementById("txFilterCount");
      if (cnt) cnt.textContent = shown + " / " + total + " shown";
    }

    ["txFilterSymbol", "txFilterAction", "txFilterFrom", "txFilterTo"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", apply);
      el.addEventListener("change", apply);
    });
    var clear = document.getElementById("txFilterClear");
    if (clear) {
      clear.addEventListener("click", function () {
        ["txFilterSymbol", "txFilterAction", "txFilterFrom", "txFilterTo"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.value = "";
        });
        apply();
      });
    }
    apply();
  }

  function watch() {
    var view = document.getElementById("view");
    if (!view) {
      setTimeout(watch, 300);
      return;
    }
    new MutationObserver(function () {
      inject();
    }).observe(view, { childList: true, subtree: true });
    inject();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
  console.log("[tx-filters] ready");
})();
