"use strict";
/**
 * Notes & links + weekly review template + export notes with portfolio.
 */
(function () {
  var KEY = "investtrack-notes-v1";
  var WL_KEY = "investtrack-watchlist-v1";

  function esc(x) {
    var d = document.createElement("div");
    d.textContent = String(x == null ? "" : x);
    return d.innerHTML;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function save(arr) {
    localStorage.setItem(KEY, JSON.stringify(arr));
  }

  function uid() {
    return "n-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  }

  function weekLabel() {
    var now = new Date();
    var day = now.getDay();
    var mon = new Date(now);
    mon.setDate(now.getDate() - ((day + 6) % 7));
    var sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    function iso(d) {
      return d.toISOString().slice(0, 10);
    }
    return iso(mon) + " \u2192 " + iso(sun);
  }

  function weeklyTemplate() {
    return (
      "Weekly review (" +
      weekLabel() +
      ")\n\n" +
      "1) What worked\n- \n\n" +
      "2) What didn\u2019t / mistakes\n- \n\n" +
      "3) Sector themes (from heatmap)\n- \n\n" +
      "4) SIP / cash flows this week\n- \n\n" +
      "5) Next week focus (max 3)\n- \n"
    );
  }

  function renderList(items) {
    if (!items.length) {
      return '<div class="card empty">No notes yet. Paste a link, write a note, or start a weekly review.</div>';
    }
    return (
      '<div class="tablewrap"><table class="table"><thead><tr><th>When</th><th>Link</th><th>Note</th><th>Tags</th><th></th></tr></thead><tbody>' +
      items
        .slice()
        .sort(function (a, b) {
          return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
        })
        .map(function (n) {
          var url = n.url || "";
          var safeHref = /^https?:\/\//i.test(url) ? url : url ? "https://" + url : "#";
          var linkHtml = url
            ? '<a href="' +
              esc(safeHref) +
              '" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">' +
              esc(url.length > 48 ? url.slice(0, 48) + "\u2026" : url) +
              "</a>"
            : '<span class="muted">\u2014</span>';
          return (
            "<tr><td class=\"muted\">" +
            esc((n.createdAt || "").slice(0, 10)) +
            "</td><td>" +
            linkHtml +
            '</td><td style="max-width:280px;white-space:pre-wrap">' +
            esc(n.note || "") +
            '</td><td class="muted">' +
            esc(n.tags || "") +
            '</td><td><button type="button" class="btn danger" data-note-del="' +
            esc(n.id) +
            '">Delete</button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table></div>"
    );
  }

  function pageHtml() {
    return (
      '<div class="card"><div class="head" style="margin:0 0 10px"><div>' +
      '<h2 style="margin:0">Notes & links</h2>' +
      '<div class="muted">Research links, weekly reviews, and tags. Stored in this browser.</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn" id="noteWeekly">Weekly review</button>' +
      '<button type="button" class="btn primary" id="noteExportAll">Export notes + portfolio</button>' +
      "</div></div>" +
      '<div class="form" style="margin-top:12px">' +
      '<div class="field full"><label>Link (URL)</label><input class="input wide" id="noteUrl" placeholder="https://\u2026 or paste any link"></div>' +
      '<div class="field full"><label>Note</label><textarea class="input wide" id="noteText" rows="4" placeholder="Why this matters\u2026"></textarea></div>' +
      '<div class="field"><label>Tags</label><input class="input wide" id="noteTags" placeholder="e.g. weekly, metal, watchlist"></div>' +
      '<div class="field" style="align-self:end"><button type="button" class="btn primary" id="noteAdd">\uff0b Save note</button></div>' +
      "</div>" +
      '<div class="notice" style="margin-top:10px">Export bundles portfolio JSON + notes + watchlist into one file.</div></div>' +
      '<div id="notesList" style="margin-top:12px"></div>'
    );
  }

  function refreshList() {
    var box = document.getElementById("notesList");
    if (box) box.innerHTML = renderList(load());
  }

  function exportAll() {
    var portfolio = null;
    try {
      portfolio = JSON.parse(
        localStorage.getItem("investtrack-v4") || localStorage.getItem("investtrack-v3") || "null"
      );
    } catch (e) {
      portfolio = null;
    }
    var watchlist = [];
    try {
      watchlist = JSON.parse(localStorage.getItem(WL_KEY) || "[]");
    } catch (e) {}
    var blob = {
      kind: "investtrack-full-export",
      exportedAt: new Date().toISOString(),
      portfolio: portfolio,
      notes: load(),
      watchlist: watchlist
    };
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" }));
    a.download = "investtrack-full-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 1000);
  }

  function show() {
    var view = document.getElementById("view");
    if (!view) return;
    var titleEl = document.getElementById("title");
    if (titleEl) titleEl.textContent = "Notes & links";
    document.querySelectorAll(".nav button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-page") === "notes");
    });
    view.innerHTML = pageHtml();
    refreshList();
  }

  function ensureNav() {
    var nav = document.querySelector(".side .nav");
    if (!nav || nav.querySelector('[data-page="notes"]')) return;
    var btn = document.createElement("button");
    btn.setAttribute("data-page", "notes");
    btn.innerHTML = "\u270e <span>Notes & links</span>";
    var goals = nav.querySelector('[data-page="goals"]');
    if (goals) nav.insertBefore(btn, goals);
    else nav.appendChild(btn);
  }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === "noteWeekly") {
      var ta = document.getElementById("noteText");
      var tags = document.getElementById("noteTags");
      if (ta) ta.value = weeklyTemplate();
      if (tags) tags.value = "weekly";
      if (ta) ta.focus();
      return;
    }
    if (t.id === "noteExportAll") {
      exportAll();
      return;
    }
    if (t.id === "noteAdd") {
      var url = ((document.getElementById("noteUrl") && document.getElementById("noteUrl").value) || "").trim();
      var note = ((document.getElementById("noteText") && document.getElementById("noteText").value) || "").trim();
      var tags = ((document.getElementById("noteTags") && document.getElementById("noteTags").value) || "").trim();
      if (!url && !note) {
        alert("Add a link or a note.");
        return;
      }
      var arr = load();
      arr.push({
        id: uid(),
        url: url,
        note: note,
        tags: tags,
        createdAt: new Date().toISOString()
      });
      save(arr);
      if (document.getElementById("noteUrl")) document.getElementById("noteUrl").value = "";
      if (document.getElementById("noteText")) document.getElementById("noteText").value = "";
      if (document.getElementById("noteTags")) document.getElementById("noteTags").value = "";
      refreshList();
      return;
    }
    var del = t.closest && t.closest("[data-note-del]");
    if (del) {
      var id = del.getAttribute("data-note-del");
      if (!confirm("Delete this note?")) return;
      save(
        load().filter(function (x) {
          return x.id !== id;
        })
      );
      refreshList();
      return;
    }
    var nbtn = t.closest && t.closest('[data-page="notes"]');
    if (nbtn) setTimeout(show, 20);
  });

  function boot() {
    ensureNav();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  console.log("[notes-ui] ready v2");
})();
