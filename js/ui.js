/* ============================================================
   ui.js — the shared interface kit

   Sidebar shell, toasts, loader, modal, searchable dropdown,
   sortable/filterable grid, SVG charts, and file exports.
   No external libraries, so the portal runs with no internet.
   ============================================================ */
(function (w, d) {
  "use strict";

  var CFG = w.APP_CONFIG;

  /* ---------- tiny DOM helpers ---------- */
  function el(tag, attrs, kids) {
    var n = d.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") { if (n) n.innerHTML = attrs[k]; }
      else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function num(n) { return (Number(n) || 0).toLocaleString("en-IN"); }
  function fmtDate(s) {
    if (!s) return "";
    var dt = new Date(s);
    if (isNaN(dt)) return String(s);
    return String(dt.getDate()).padStart(2, "0") + " " +
      ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][dt.getMonth()] +
      " " + dt.getFullYear();
  }
  function fmtDateTime(s) {
    var dt = new Date(s);
    if (isNaN(dt)) return String(s || "");
    return fmtDate(s) + ", " + String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0");
  }
  function initials(name) {
    return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (p) { return p[0]; }).join("").toUpperCase();
  }
  function debounce(fn, ms) {
    var t; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms || 200); };
  }

  /* ---------- icons ---------- */
  var ICON = {
    dashboard: '<path d="M3 3h7v8H3zM14 3h7v5h-7zM14 11h7v10h-7zM3 14h7v7H3z"/>',
    inward:    '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
    outward:   '<path d="M12 17V5M7 9l5-5 5 5M4 20h16"/>',
    summary:   '<path d="M4 5h16M4 12h16M4 19h10"/>',
    reports:   '<path d="M6 3h9l4 4v14H6zM15 3v4h4M9 13h6M9 17h6"/>',
    boxes:     '<path d="M3 8h8V3H3zM13 8h8V3h-8zM3 21h8v-8H3zM13 21h8v-5h-8z"/>',
    tag:       '<path d="M20.6 13.4 12 22l-9-9V3h10zM7.5 7.5h.01"/>',
    clipboard: '<path d="M9 3h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4"/>',
    scale:     '<path d="M12 3v18M7 7h10M5 7 2 14h6zM19 7l-3 7h6z"/>',
    gauge:     '<path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M13.4 10.6 19 5M4 20a9 9 0 1 1 16 0"/>',
    bell:      '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
    users:     '<path d="M16 20v-2a4 4 0 0 0-8 0v2M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 20v-2a3 3 0 0 0-2.4-2.9"/>',
    audit:     '<path d="M12 8v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9z"/>',
    signout:   '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:      '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    menu:      '<path d="M3 6h18M3 12h18M3 18h18"/>'
  };
  function icon(name, size) {
    return '<svg width="' + (size || 17) + '" height="' + (size || 17) + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  }

  /* ---------- theme ---------- */
  var THEME_KEY = CFG.storageKey + ".theme";
  function applyTheme(t) {
    d.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    var b = d.getElementById("themeBtn");
    if (b) {
      if (b) b.innerHTML = icon(t === "dark" ? "sun" : "moon");
      b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
      b.title = t === "dark" ? "Light theme" : "Dark theme";
    }
  }
  function initTheme() {
    var saved;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    applyTheme(saved || (w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  }
  initTheme();

  /* ---------- toast / loader / modal ---------- */
  function toast(title, msg, kind) {
    var host = d.getElementById("toasts") || d.body.appendChild(el("div", { id: "toasts" }));
    var t = el("div", { class: "toast " + (kind || "ok"), role: "status",
      html: "<div><b>" + esc(title) + "</b>" + (msg ? "<p>" + esc(msg) + "</p>" : "") + "</div>" });
    host.appendChild(t);
    setTimeout(function () { t.classList.add("hide"); setTimeout(function () { t.remove(); }, 220); }, kind === "bad" ? 6500 : 3800);
  }
  function loader(on) {
    var l = d.getElementById("loader") || d.body.appendChild(el("div", { id: "loader", html: '<div class="spinner"></div>' }));
    l.classList.toggle("show", !!on);
  }
  function modal(opts) {
    var host = d.getElementById("modal") || d.body.appendChild(el("div", { id: "modal", class: "modal" }));
    if (host) host.innerHTML =
      '<div class="modal-box" role="dialog" aria-modal="true"><div class="modal-head"><h3>' + esc(opts.title) + '</h3>' +
      '<button class="icon-btn" data-x aria-label="Close">&times;</button></div>' +
      '<div class="modal-body">' + opts.body + '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-x>' + esc(opts.cancelText || "Cancel") + '</button>' +
        (opts.okText ? '<button class="btn ' + (opts.danger ? "btn-danger" : "btn-primary") + '" data-ok>' + esc(opts.okText) + '</button>' : '') +
      '</div></div>';
    host.classList.add("show");
    function close() { host.classList.remove("show"); }
    host.querySelectorAll("[data-x]").forEach(function (b) { b.onclick = close; });
    host.onclick = function (e) { if (e.target === host) close(); };
    var ok = host.querySelector("[data-ok]");
    if (ok) ok.onclick = function () { if (!opts.onOk || opts.onOk(host) !== false) close(); };
    return { close: close, root: host };
  }

  /* ---------- app shell ---------- */
  var NAV = [
    { group: "Overview" },
    { page: "dashboard", href: "dashboard.html", label: "Dashboard", icon: "dashboard" },
    { group: "Stock movement" },
    { page: "inward", href: "inward.html", label: "Stock inward", icon: "inward" },
    { page: "outward", href: "outward.html", label: "Stock outward", icon: "outward" },
    { page: "stock-summary", href: "stock-summary.html", label: "Stock summary", icon: "summary" },
    { group: "Stock audit" },
    { page: "audit-workspace", href: "audit-workspace.html", label: "Audit workspace", icon: "clipboard" },
    { page: "audit-dashboard", href: "audit-dashboard.html", label: "Audit dashboard", icon: "gauge" },
    { page: "adjustments", href: "adjustments.html", label: "Stock corrections", icon: "scale" },
    { group: "Analysis" },
    { page: "inventory-summary", href: "inventory-summary.html", label: "Inventory summary", icon: "boxes" },
    { page: "reports", href: "reports.html", label: "Reports", icon: "reports" },
    { group: "Administration" },
    { page: "products", href: "products.html", label: "Product master", icon: "tag" },
    { page: "users", href: "users.html", label: "Users", icon: "users" },
    { page: "audit", href: "audit.html", label: "Audit trail", icon: "audit" }
  ];

  function shell(user, activePage, title, crumb) {
    var side = el("aside", { class: "sidebar", id: "sidebar" });
    if (side) side.innerHTML =
      '<div class="sidebar-head">' +
      '<span class="brand-plate"><img class="brand-mark" src="assets/prostarm-mark.png" alt="Prostarm"></span>' +
      '<div class="logo-text">Stock Portal<small>Prostarm</small></div></div><nav class="nav"></nav>' +
      '<div class="sidebar-foot">' + esc(w.RBAC.def(user).label) + ' &middot; ' + esc(w.RBAC.scopeLabel(user)) + '</div>';

    var nav = side.querySelector(".nav");
    var pendingGroup = null, groupHasItems = false;
    NAV.forEach(function (item) {
      if (item.group) { pendingGroup = item.group; groupHasItems = false; return; }
      if (!w.RBAC.canOpen(user, item.page)) return;
      if (pendingGroup && !groupHasItems) { nav.appendChild(el("div", { class: "nav-label", text: pendingGroup })); groupHasItems = true; }
      nav.appendChild(el("a", {
        href: item.href, class: item.page === activePage ? "active" : "",
        html: icon(item.icon) + "<span>" + esc(item.label) + "</span>"
      }));
    });

    var main = el("div", { class: "main" });
    var top = el("header", { class: "topbar" });
    if (top) top.innerHTML =
      '<button class="icon-btn hamburger" id="menuBtn" aria-label="Open menu">' + icon("menu") + '</button>' +
      '<div><h2>' + esc(title) + '</h2><div class="crumb">' + esc(crumb || w.RBAC.scopeLabel(user)) + '</div></div>' +
      '<div class="topbar-spacer"></div>' +
      '<a class="icon-btn hidden" id="taskBtn" title="Open audit tasks" aria-label="Open audit tasks">' +
        icon("bell") + '<span class="task-dot" id="taskDot"></span></a>' +
      '<button class="icon-btn" id="themeBtn"></button>' +
      '<div class="userchip"><div class="avatar">' + esc(initials(user.fullName)) + '</div>' +
      '<div class="who">' + esc(user.fullName) + '<small>' + esc(w.RBAC.def(user).label) + '</small></div></div>' +
      '<button class="icon-btn" id="outBtn" title="Sign out" aria-label="Sign out">' + icon("signout") + '</button>';

    var content = el("main", { class: "content", id: "content" });

    /* Only visible when printing or saving to PDF, so exported reports
       carry the letterhead a branch or HO would expect. */
    var printBrand = el("div", { class: "print-brand" });
    if (printBrand) printBrand.innerHTML =
      '<img src="assets/prostarm-logo-black.png" alt="Prostarm Info Systems Ltd.">' +
      '<div class="meta"><b>' + esc(title) + "</b><br>" +
      esc(w.RBAC.scopeLabel(user)) + " &middot; " + esc(user.fullName) + "<br>" +
      "Generated " + esc(fmtDateTime(new Date().toISOString())) + "</div>";

    main.appendChild(top); main.appendChild(printBrand); main.appendChild(content);

    var scrim = el("div", { class: "scrim", id: "scrim" });
    var app = el("div", { class: "app" }, [side, main, scrim]);
    d.body.insertBefore(app, d.body.firstChild);

    d.getElementById("themeBtn").onclick = function () {
      applyTheme(d.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
      w.dispatchEvent(new CustomEvent("theme:changed"));
    };
    applyTheme(d.documentElement.getAttribute("data-theme"));
    d.getElementById("outBtn").onclick = function () { w.Auth.signOut(); };
    d.getElementById("menuBtn").onclick = function () {
      side.classList.add("open"); scrim.classList.add("show");
    };
    scrim.onclick = function () { side.classList.remove("open"); scrim.classList.remove("show"); };

    /* Audit tasks waiting on this person, wherever they are in the app. */
    if (w.Audit) {
      var paintTasks = function () {
        w.Audit.lines().then(function (lines) {
          var mine = w.Audit.tasksFor(user, lines);
          var btn = d.getElementById("taskBtn");
          var dot = d.getElementById("taskDot");
          if (!btn) return;
          btn.classList.toggle("hidden", !mine.length);
          if (!mine.length) return;
          dot.textContent = mine.length > 9 ? "9+" : mine.length;
          btn.title = mine.length + " audit task" + (mine.length === 1 ? "" : "s") + " waiting on you";
          btn.href = user.role === "BRANCH_USER"
            ? "audit-case.html?line=" + encodeURIComponent(mine[0].lineId)
            : user.role === "HO_ADMIN" ? "adjustments.html"
            : user.role === "STOCK_AUDITOR" ? "audit-workspace.html"
            : "audit-dashboard.html";
        }).catch(function () {});
      };
      paintTasks();
      w.API.onChange(debounce(paintTasks, 500));
    }

    var denied = new URLSearchParams(location.search).get("denied");
    if (denied) toast("Not available on your role", "You do not have access to " + denied.replace("-", " ") + ".", "warn");

    return content;
  }

  /* ---------- searchable select (Select2 stand-in) ---------- */
  function searchableSelect(mount, opts) {
    var items = opts.items || [];
    var value = opts.value || "";
    var hl = -1, filtered = items.slice();

    var root = el("div", { class: "ss" });
    var btn = el("button", { type: "button", class: "ss-toggle placeholder", text: opts.placeholder || "Select" });
    var pop = el("div", { class: "ss-pop" });
    var search = el("input", { class: "ss-search", type: "text", placeholder: opts.searchPlaceholder || "Type to filter\u2026", "aria-label": "Filter list" });
    var list = el("div", { class: "ss-list", role: "listbox" });
    pop.appendChild(search); pop.appendChild(list);
    root.appendChild(btn); root.appendChild(pop);
    if (mount) mount.innerHTML = ""; mount.appendChild(root);

    function labelOf(v) { var f = items.find(function (i) { return i.value === v; }); return f ? f.label : ""; }
    function paint() {
      if (list) list.innerHTML = "";
      if (!filtered.length) { list.appendChild(el("div", { class: "ss-empty", text: "Nothing matches that." })); return; }
      var lastGroup = null;
      filtered.forEach(function (it, i) {
        if (it.group && it.group !== lastGroup) {
          lastGroup = it.group;
          list.appendChild(el("div", { class: "ss-group", text: it.group }));
        }
        var o = el("div", {
          class: "ss-opt" + (i === hl ? " hl" : ""), role: "option", "data-i": i,
          html: "<span>" + esc(it.label) + "</span>" + (it.meta ? '<span class="bal">' + esc(it.meta) + "</span>" : "")
        });
        o.onclick = function () { pick(it); };
        list.appendChild(o);
      });
    }
    function filter(q) {
      q = q.trim().toLowerCase();
      filtered = !q ? items.slice() : items.filter(function (i) {
        return i.label.toLowerCase().indexOf(q) >= 0 || (i.group || "").toLowerCase().indexOf(q) >= 0;
      });
      hl = filtered.length ? 0 : -1;
      paint();
    }
    function open() { root.classList.add("open"); search.value = ""; filter(""); search.focus(); }
    function close() { root.classList.remove("open"); }
    function pick(it) {
      value = it.value;
      btn.textContent = it.label;
      btn.classList.remove("placeholder");
      btn.classList.remove("err");
      close();
      if (opts.onChange) opts.onChange(it);
    }

    btn.onclick = function () { root.classList.contains("open") ? close() : open(); };
    search.oninput = function () { filter(search.value); };
    search.onkeydown = function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); hl = Math.min(hl + 1, filtered.length - 1); paint(); scrollHl(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); hl = Math.max(hl - 1, 0); paint(); scrollHl(); }
      else if (e.key === "Enter") { e.preventDefault(); if (filtered[hl]) pick(filtered[hl]); }
      else if (e.key === "Escape") { close(); btn.focus(); }
    };
    function scrollHl() { var n = list.querySelector(".ss-opt.hl"); if (n) n.scrollIntoView({ block: "nearest" }); }
    d.addEventListener("click", function (e) { if (!root.contains(e.target)) close(); });

    if (value) { var f = items.find(function (i) { return i.value === value; }); if (f) pick(f); }

    return {
      get value() { return value; },
      set value(v) { var f = items.find(function (i) { return i.value === v; }); if (f) pick(f); },
      setItems: function (arr) {
        items = arr; filtered = arr.slice();
        var still = arr.find(function (i) { return i.value === value; });
        if (!still) { value = ""; btn.textContent = opts.placeholder || "Select"; btn.classList.add("placeholder"); }
        else { btn.textContent = still.label; }
        paint();
      },
      label: function () { return labelOf(value); },
      find: function () { return items.find(function (i) { return i.value === value; }); },
      markInvalid: function (on) { btn.classList.toggle("err", !!on); },
      clear: function () { value = ""; btn.textContent = opts.placeholder || "Select"; btn.classList.add("placeholder"); },
      focus: function () { btn.focus(); }
    };
  }

  /* ---------- data grid (DataTables stand-in) ---------- */
  function grid(mount, opts) {
    var cols = opts.columns;
    var rows = opts.rows || [];
    var sortKey = opts.sortKey || null, sortDir = opts.sortDir || "desc";
    var page = 1, size = opts.pageSize || CFG.pageSize;
    var q = "";

    var root = el("div");
    if (mount) mount.innerHTML = ""; mount.appendChild(root);

    function view() {
      var out = rows;
      if (q) {
        var needle = q.toLowerCase();
        out = out.filter(function (r) {
          return cols.some(function (c) {
            return String(c.raw ? c.raw(r) : r[c.key] == null ? "" : r[c.key]).toLowerCase().indexOf(needle) >= 0;
          });
        });
      }
      if (sortKey) {
        var col = cols.find(function (c) { return c.key === sortKey; });
        out = out.slice().sort(function (a, b) {
          var av = col && col.raw ? col.raw(a) : a[sortKey];
          var bv = col && col.raw ? col.raw(b) : b[sortKey];
          if (col && col.type === "num") { av = Number(av) || 0; bv = Number(bv) || 0; }
          else { av = String(av == null ? "" : av).toLowerCase(); bv = String(bv == null ? "" : bv).toLowerCase(); }
          return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === "asc" ? 1 : -1);
        });
      }
      return out;
    }

    function render() {
      var data = view();
      var pages = Math.max(1, Math.ceil(data.length / size));
      if (page > pages) page = pages;
      var slice = data.slice((page - 1) * size, page * size);

      var html = "";
      if (opts.search !== false) {
        html += '<div class="tbl-toolbar"><input class="input grow" type="search" id="gq" placeholder="' +
          esc(opts.searchPlaceholder || "Search this table\u2026") + '" value="' + esc(q) + '" aria-label="Search table">' +
          (opts.toolbarHtml || "") + '</div>';
      }
      html += '<div class="table-wrap"><table class="tbl"><thead><tr>';
      cols.forEach(function (c) {
        var sorted = c.key === sortKey;
        html += '<th class="' + (c.type === "num" ? "num " : "") + (c.sortable === false ? "" : "sortable") +
          (sorted ? " sorted" : "") + '" data-k="' + esc(c.key) + '">' + esc(c.label) +
          (c.sortable === false ? "" : '<span class="arrow">' + (sorted ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25BC") + "</span>") + "</th>";
      });
      html += "</tr></thead><tbody>";
      if (!slice.length) {
        html += '<tr><td colspan="' + cols.length + '"><div class="empty"><b>' +
          esc(opts.emptyTitle || "Nothing here yet") + "</b>" + esc(opts.emptyText || "") + "</div></td></tr>";
      } else {
        slice.forEach(function (r) {
          html += "<tr>";
          cols.forEach(function (c) {
            html += '<td class="' + (c.type === "num" ? "num" : "") + '">' + (c.render ? c.render(r) : esc(r[c.key])) + "</td>";
          });
          html += "</tr>";
        });
      }
      html += "</tbody></table></div>";
      html += '<div class="pager"><span class="grow">' + data.length.toLocaleString("en-IN") + " row" +
        (data.length === 1 ? "" : "s") + (q ? " matching" : "") + "</span>" +
        '<button class="btn btn-ghost btn-sm" id="gprev"' + (page <= 1 ? " disabled" : "") + ">Previous</button>" +
        "<span>Page " + page + " of " + pages + "</span>" +
        '<button class="btn btn-ghost btn-sm" id="gnext"' + (page >= pages ? " disabled" : "") + ">Next</button></div>";

      if (root) root.innerHTML = html;

      var qi = root.querySelector("#gq");
      if (qi) qi.oninput = debounce(function () { q = qi.value; page = 1; render(); var n = root.querySelector("#gq"); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 220);
      root.querySelectorAll("th.sortable").forEach(function (th) {
        th.onclick = function () {
          var k = th.getAttribute("data-k");
          if (sortKey === k) sortDir = sortDir === "asc" ? "desc" : "asc";
          else { sortKey = k; sortDir = "asc"; }
          render();
        };
      });
      var p = root.querySelector("#gprev"), n2 = root.querySelector("#gnext");
      if (p) p.onclick = function () { page--; render(); };
      if (n2) n2.onclick = function () { page++; render(); };
      if (opts.afterRender) opts.afterRender(root);
    }

    render();
    return {
      setRows: function (r) { rows = r; render(); },
      visibleRows: view,
      allRows: function () { return rows; },
      refresh: render
    };
  }

  /* ---------- breakdown metric card ----------
     A headline figure with a segmented breakdown under it. Each segment
     takes { label, value, sub, colour }. Kept in the UI kit rather than
     the dashboard so the audit and inventory screens can reuse it. */
  function metricCard(opts) {
    var segs = (opts.segments || []).slice(0, opts.maxSegments || 6);
    var html =
      '<div class="mcard ' + (opts.kind || "") + '">' +
        '<div class="mcard-head"><div class="mcard-lbl">' + esc(opts.label) + "</div>" +
        '<div class="mcard-val">' + (typeof opts.value === "number" ? num(opts.value) : esc(opts.value)) + "</div>" +
        '<div class="mcard-foot">' + esc(opts.foot || "") + "</div></div>" +
        '<div class="mcard-segs">';
    if (!segs.length) {
      html += '<div class="mseg empty"><div class="mseg-name"><span>' +
        esc(opts.emptyText || "Nothing to break down") + "</span></div></div>";
    }
    segs.forEach(function (sg) {
      var zero = !sg.value;
      html +=
        '<div class="mseg' + (zero ? " empty" : "") + '" title="' + esc(sg.title || sg.label) + '">' +
          '<div class="mseg-name">' +
            (sg.colour ? '<i style="background:' + sg.colour + '"></i>' : "") +
            "<span>" + esc(sg.label) + "</span></div>" +
          '<div class="mseg-val"' + (sg.colour ? ' style="color:' + sg.colour + '"' : "") + ">" +
            (typeof sg.value === "number" ? num(sg.value) : esc(sg.value)) + "</div>" +
          (sg.sub ? '<div class="mseg-sub">' + esc(sg.sub) + "</div>" : "") +
        "</div>";
    });
    html += "</div>";
    if (opts.moreHref) {
      html += '<a class="mcard-more" href="' + esc(opts.moreHref) + '">' +
        esc(opts.moreText || "See detail") + " \u203a</a>";
    }
    return html + "</div>";
  }

  /* ---------- SVG charts ---------- */
  function barChart(mount, data, opts) {
    opts = opts || {};
    var W = 720, H = opts.height || 260, PL = opts.padLeft || 46, PR = 14, PT = 14, PB = opts.padBottom || 58;
    if (!data.length) { if (mount) mount.innerHTML = '<div class="empty">No data for this view yet.</div>'; return; }
    var max = Math.max.apply(null, data.map(function (r) { return r.value; })) || 1;
    var niceMax = Math.ceil(max / 4) * 4 || 4;
    var iw = W - PL - PR, ih = H - PT - PB;
    var step = iw / data.length, bw = Math.min(46, step * 0.62);
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(opts.aria || "Bar chart") + '">';
    for (var g = 0; g <= 4; g++) {
      var y = PT + ih - (ih * g / 4);
      s += '<line class="gridline" x1="' + PL + '" y1="' + y + '" x2="' + (W - PR) + '" y2="' + y + '"/>';
      s += '<text class="tick" x="' + (PL - 7) + '" y="' + (y + 3.5) + '" text-anchor="end">' + Math.round(niceMax * g / 4) + "</text>";
    }
    data.forEach(function (r, i) {
      var h = (r.value / niceMax) * ih;
      var x = PL + step * i + (step - bw) / 2;
      var y = PT + ih - h;
      s += '<rect class="bar' + (opts.alt ? " alt" : "") + '" x="' + x + '" y="' + y + '" width="' + bw + '" height="' + Math.max(h, r.value > 0 ? 2 : 0) +
        '" rx="3"><title>' + esc(r.label) + ": " + num(r.value) + "</title></rect>";
      if (r.value > 0) s += '<text class="vlabel" x="' + (x + bw / 2) + '" y="' + (y - 5) + '" text-anchor="middle">' + num(r.value) + "</text>";
      var lbl = r.label.length > 13 ? r.label.slice(0, 12) + "\u2026" : r.label;
      s += '<text class="tick" transform="rotate(-38 ' + (PL + step * i + step / 2) + " " + (PT + ih + 14) + ')" x="' +
        (PL + step * i + step / 2) + '" y="' + (PT + ih + 14) + '" text-anchor="end">' + esc(lbl) + "<title>" + esc(r.label) + "</title></text>";
    });
    s += '<line class="axis" x1="' + PL + '" y1="' + (PT + ih) + '" x2="' + (W - PR) + '" y2="' + (PT + ih) + '"/></svg>';
    if (mount) mount.innerHTML = s;
  }

  function lineChart(mount, series, opts) {
    opts = opts || {};
    var W = 720, H = opts.height || 250, PL = 46, PR = 14, PT = 14, PB = 40;
    var labels = opts.labels || [];
    if (!labels.length) { if (mount) mount.innerHTML = '<div class="empty">No data for this view yet.</div>'; return; }
    var all = series.reduce(function (a, s) { return a.concat(s.values); }, [0]);
    var max = Math.max.apply(null, all) || 1;
    var niceMax = Math.ceil(max / 4) * 4 || 4;
    var iw = W - PL - PR, ih = H - PT - PB;
    var stepX = labels.length > 1 ? iw / (labels.length - 1) : 0;
    function X(i) { return PL + stepX * i + (labels.length === 1 ? iw / 2 : 0); }
    function Y(v) { return PT + ih - (v / niceMax) * ih; }
    var s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + esc(opts.aria || "Line chart") + '">';
    for (var g = 0; g <= 4; g++) {
      var y = PT + ih - (ih * g / 4);
      s += '<line class="gridline" x1="' + PL + '" y1="' + y + '" x2="' + (W - PR) + '" y2="' + y + '"/>';
      s += '<text class="tick" x="' + (PL - 7) + '" y="' + (y + 3.5) + '" text-anchor="end">' + Math.round(niceMax * g / 4) + "</text>";
    }
    series.forEach(function (ser) {
      var pts = ser.values.map(function (v, i) { return X(i) + "," + Y(v); }).join(" ");
      if (ser.area !== false) {
        s += '<polygon class="area" points="' + PL + "," + (PT + ih) + " " + pts + " " + (W - PR) + "," + (PT + ih) + '"/>';
      }
      s += '<polyline class="line ' + (ser.cls || "") + '" points="' + pts + '"/>';
      ser.values.forEach(function (v, i) {
        s += '<circle class="dot ' + (ser.cls || "") + '" cx="' + X(i) + '" cy="' + Y(v) + '" r="3"><title>' +
          esc(labels[i]) + " \u2014 " + esc(ser.name) + ": " + num(v) + "</title></circle>";
      });
    });
    labels.forEach(function (l, i) {
      s += '<text class="tick" x="' + X(i) + '" y="' + (PT + ih + 17) + '" text-anchor="middle">' + esc(l) + "</text>";
    });
    s += '<line class="axis" x1="' + PL + '" y1="' + (PT + ih) + '" x2="' + (W - PR) + '" y2="' + (PT + ih) + '"/></svg>';
    if (mount) mount.innerHTML = s;
  }

  function donutChart(mount, data, opts) {
    opts = opts || {};
    if (!data.length) { if (mount) mount.innerHTML = '<div class="empty">No data for this view yet.</div>'; return; }
    var total = data.reduce(function (a, r) { return a + r.value; }, 0);
    if (!total) { if (mount) mount.innerHTML = '<div class="empty">Everything reads zero for this view.</div>'; return; }
    var palette = ["#1E5FA8", "#2F80D2", "#00B3A4", "#0B3F7A", "#5FDCCB", "#8CBEE8", "#B26A00", "#5D7C93"];
    var R = 82, r = 50, C = 110, ang = -Math.PI / 2, s = '<svg class="chart" viewBox="0 0 460 220" role="img" aria-label="' + esc(opts.aria || "Share chart") + '">';
    var legend = "";
    data.forEach(function (row, i) {
      var frac = row.value / total, a2 = ang + frac * Math.PI * 2, large = frac > 0.5 ? 1 : 0;
      var x1 = C + R * Math.cos(ang), y1 = C + R * Math.sin(ang), x2 = C + R * Math.cos(a2), y2 = C + R * Math.sin(a2);
      var x3 = C + r * Math.cos(a2), y3 = C + r * Math.sin(a2), x4 = C + r * Math.cos(ang), y4 = C + r * Math.sin(ang);
      var col = palette[i % palette.length];
      if (frac >= 0.9999) {
        s += '<circle cx="' + C + '" cy="' + C + '" r="' + ((R + r) / 2) + '" fill="none" stroke="' + col + '" stroke-width="' + (R - r) + '"><title>' + esc(row.label) + ": " + num(row.value) + "</title></circle>";
      } else {
        s += '<path fill="' + col + '" d="M' + x1 + " " + y1 + " A" + R + " " + R + " 0 " + large + " 1 " + x2 + " " + y2 +
          " L" + x3 + " " + y3 + " A" + r + " " + r + " 0 " + large + " 0 " + x4 + " " + y4 + ' Z"><title>' +
          esc(row.label) + ": " + num(row.value) + " (" + Math.round(frac * 100) + "%)</title></path>";
      }
      legend += '<div><i style="background:' + col + '"></i>' + esc(row.label) + " \u2014 " + num(row.value) + "</div>";
      ang = a2;
    });
    s += '<text x="' + C + '" y="' + (C - 4) + '" text-anchor="middle" class="vlabel" style="font-size:22px">' + num(total) + "</text>";
    s += '<text x="' + C + '" y="' + (C + 14) + '" text-anchor="middle" class="tick">' + esc(opts.centerLabel || "total") + "</text>";
    s += "</svg>";
    if (mount) mount.innerHTML = s + '<div class="legend" style="padding:6px 0 0">' + legend + "</div>";
  }

  /* ---------- exports ---------- */
  function download(filename, blob) {
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename });
    d.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function toCSV(headers, rows) {
    function cell(v) {
      var s = String(v == null ? "" : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return "\uFEFF" + [headers.map(cell).join(",")].concat(rows.map(function (r) { return r.map(cell).join(","); })).join("\r\n");
  }
  function exportCSV(name, headers, rows) {
    download(name + ".csv", new Blob([toCSV(headers, rows)], { type: "text/csv;charset=utf-8;" }));
    toast("Exported", name + ".csv is in your downloads folder.");
  }
  /* Real .xlsx via js/xlsx.js. Falls back to SpreadsheetML 2003 on any
     page that has not loaded the writer. */
  function exportExcel(name, sheetName, headers, rows) {
    if (w.XLSX) {
      return exportWorkbook(name, [{
        name: sheetName,
        columns: headers.map(function (h) { return { label: h, width: Math.min(42, Math.max(12, h.length + 6)) }; }),
        rows: rows
      }]);
    }
    function x(v) { return esc(v); }
    var s = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ' +
      'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
      'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Color="#FFFFFF"/>' +
      '<Interior ss:Color="#1668B0" ss:Pattern="Solid"/></Style>' +
      '<Style ss:ID="n"><NumberFormat ss:Format="#,##0"/></Style></Styles>' +
      '<Worksheet ss:Name="' + x(sheetName).slice(0, 31) + '"><Table>';
    s += "<Row>" + headers.map(function (h) { return '<Cell ss:StyleID="h"><Data ss:Type="String">' + x(h) + "</Data></Cell>"; }).join("") + "</Row>";
    rows.forEach(function (r) {
      s += "<Row>" + r.map(function (v) {
        var isNum = typeof v === "number" && isFinite(v);
        return isNum ? '<Cell ss:StyleID="n"><Data ss:Type="Number">' + v + "</Data></Cell>"
                     : '<Cell><Data ss:Type="String">' + x(v == null ? "" : v) + "</Data></Cell>";
      }).join("") + "</Row>";
    });
    s += "</Table></Worksheet></Workbook>";
    download(name + ".xls", new Blob([s], { type: "application/vnd.ms-excel" }));
    toast("Exported", name + ".xls opens straight into Excel.");
  }

  /* Multi-sheet .xlsx. Each sheet: { name, columns:[{label,width}], rows }.
     A row cell may be a plain value or { v, s } where s is an XLSX.styles id. */
  function exportWorkbook(name, sheets, options) {
    if (!w.XLSX) { toast("Export unavailable", "The workbook writer is not loaded on this page.", "bad"); return; }
    var done = function (blob) {
      download(name + ".xlsx", blob);
      toast("Exported", name + ".xlsx \u2014 " + sheets.length + " sheet" +
        (sheets.length === 1 ? "" : "s") + ", " + Math.round(blob.size / 1024) + " KB.");
    };
    try {
      if (w.XLSX.blobAsync) {
        return w.XLSX.blobAsync(sheets, options).then(done).catch(function (e) {
          console.error(e);
          done(w.XLSX.blob(sheets, options));
        });
      }
      done(w.XLSX.blob(sheets, options));
    } catch (e) {
      console.error(e);
      toast("Export failed", e.message, "bad");
    }
  }
  /* PDF via the browser print dialog — choose "Save as PDF". No
     library, and page breaks land where the print stylesheet says. */
  function exportPDF(title) {
    var prev = d.title;
    d.title = title;
    toast("Print dialog opening", "Choose \u201cSave as PDF\u201d as the destination.", "info");
    setTimeout(function () { w.print(); d.title = prev; }, 350);
  }

  w.UI = {
    el: el, esc: esc, num: num, icon: icon, initials: initials, debounce: debounce,
    fmtDate: fmtDate, fmtDateTime: fmtDateTime,
    toast: toast, loader: loader, modal: modal, shell: shell, metricCard: metricCard,
    searchableSelect: searchableSelect, grid: grid,
    barChart: barChart, lineChart: lineChart, donutChart: donutChart,
    exportCSV: exportCSV, exportExcel: exportExcel, exportWorkbook: exportWorkbook,
    exportPDF: exportPDF, download: download
  };
})(window, document);
