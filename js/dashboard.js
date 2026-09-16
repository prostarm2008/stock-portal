/* ============================================================
   dashboard.js — executive dashboard

   Repaints on every data change in any tab, and on a timer set by
   APP_CONFIG.refreshSeconds. Everything shown is already scoped
   to the signed-in user by API.scopedData().
   ============================================================ */
(function (w, d) {
  "use strict";

  w.Dashboard = {
    mount: function () {
      var user = w.Auth.require("dashboard");
      if (!user) return;

      var UI = w.UI, Stock = w.Stock, CFG = w.APP_CONFIG;
      var content = UI.shell(user, "dashboard", "Dashboard");
      var lastPaint = null;

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Good ' + partOfDay() + ", " + UI.esc(user.fullName.split(" ")[0]) + "</h1>" +
        "<p>" + UI.esc(w.RBAC.scopeLabel(user)) + " \u00b7 " + UI.esc(w.RBAC.def(user).label) +
        ' \u00b7 <span class="livedot"></span><span id="freshness">refreshing every ' + CFG.refreshSeconds + "s</span></p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-ghost btn-sm" id="refreshNow">Refresh now</button>' +
          '<button class="btn btn-ghost btn-sm" id="printDash">Save as PDF</button>' +
        "</div></div>" +
        '<div id="modeNote"></div>' +
        '<div id="auditTasks"></div>' +
        '<div class="grid g-5 mcards" id="kpis"></div>' +
        '<div class="grid g-2 mt">' +
          '<div class="card"><div class="card-head"><h3>Stock held by branch</h3>' +
            '<span class="sub" id="branchSub"></span></div><div class="card-body" id="chartBranch"></div></div>' +
          '<div class="card"><div class="card-head"><h3>Stock by product category</h3></div>' +
            '<div class="card-body" id="chartCat"></div></div>' +
        "</div>" +
        '<div class="grid g-2 mt">' +
          '<div class="card"><div class="card-head"><h3>Inward, last 6 months</h3></div>' +
            '<div class="card-body" id="chartIn"></div></div>' +
          '<div class="card"><div class="card-head"><h3>Outward, last 6 months</h3></div>' +
            '<div class="card-body" id="chartOut"></div></div>' +
        "</div>" +
        '<div class="grid g-2 mt">' +
          '<div class="card"><div class="card-head"><h3>Recent transactions</h3>' +
            '<span class="sub">latest 50</span></div><div id="recent"></div></div>' +
          '<div class="card"><div class="card-head"><h3>Low inventory alerts</h3>' +
            '<span class="sub" id="lowSub"></span></div><div id="low"></div></div>' +
        "</div>";

      if (w.API.mode === "local") {
        var modeNote = d.getElementById("modeNote");
        if (modeNote) {
          if (modeNote) modeNote.innerHTML =
            '<div class="alert info no-print"><div><b>Running on local storage</b>' +
            "Entries are saved in this browser on this computer and update live across your open tabs. " +
            "To share data between branches, switch the backend to Power Automate in js/config.js.</div></div>";
        }
      }

      /* Cases waiting on this branch. Shown on the dashboard rather than
         a separate screen — branch users should not have to learn a new
         page for an occasional task. */
      function paintAuditTasks(data) {
        var host = d.getElementById("auditTasks");
        if (!host) return;
        if (!w.Audit || user.role === "STOCK_AUDITOR") { if (host) host.innerHTML = ""; return; }

        /* HO Admin: corrections raised by a closed audit case wait under
           Stock corrections. The sidebar badge alone was too easy to
           miss, so they are named on the dashboard as well. */
        if (user.role === "HO_ADMIN") {
          w.Audit.pendingAdjustments().then(function (adj) {
            var host = d.getElementById("auditTasks");
            if (!host) return;
            if (!adj.length) { if (host) host.innerHTML = ""; return; }
            var up = adj.filter(function (l) { return l.qtyDifference > 0; })
              .reduce(function (a, l) { return a + l.qtyDifference; }, 0);
            var down = adj.filter(function (l) { return l.qtyDifference < 0; })
              .reduce(function (a, l) { return a + Math.abs(l.qtyDifference); }, 0);
            if (host) host.innerHTML =
              '<div class="card no-print" style="border-top:3px solid var(--warn-600);margin-bottom:14px">' +
              '<div class="card-head"><h3>Stock corrections awaiting your approval</h3>' +
              '<span class="badge warn">' + adj.length + "</span>" +
              '<div class="topbar-spacer"></div>' +
              '<a class="btn btn-primary btn-sm" href="adjustments.html">Review corrections</a></div>' +
              '<div class="card-body"><p class="muted small">Raised when a stock auditor closed a ' +
              "discrepancy case. Until you approve, the branch balance still shows the old figure. " +
              UI.num(up) + " unit(s) to add, " + UI.num(down) + " to remove.</p>" +
              '<table class="tbl"><thead><tr><th>Branch</th><th>Product</th>' +
              '<th class="num">Counted</th><th class="num">Correction</th><th>Closed by</th></tr></thead><tbody>' +
              adj.slice(0, 5).map(function (l) {
                return "<tr><td>" + UI.esc(l.branch) + "</td><td>" + UI.esc(l.productName) + "</td>" +
                  '<td class="num">' + UI.num(l.physicalQty) + "</td>" +
                  '<td class="num" style="color:' + (l.qtyDifference < 0 ? "var(--bad-600)" : "var(--ok-600)") + '">' +
                  (l.qtyDifference > 0 ? "+" : "") + UI.num(l.qtyDifference) + "</td>" +
                  "<td>" + UI.esc(l.closedByName || "") + "</td></tr>";
              }).join("") + "</tbody></table></div></div>";
          });
          return;
        }

        w.Audit.lines().then(function (lines) {
          var host = d.getElementById("auditTasks");
          if (!host) return;
          var mine = lines.filter(function (l) {
            if (data.allowedBranches.indexOf(l.branch) < 0) return false;
            return l.status === w.Audit.STATUS.JUSTIFICATION ||
                   l.status === w.Audit.STATUS.CLARIFICATION;
          });
          if (!mine.length) { if (host) host.innerHTML = ""; return; }
          var overdue = mine.filter(function (l) { return w.Audit.slaState(l).level !== "ok"; }).length;
          if (host) host.innerHTML =
            '<div class="card no-print" style="border-left:3px solid var(--warn-600);margin-bottom:14px">' +
            '<div class="card-head"><h3>Pending audit queries</h3>' +
            '<span class="badge warn">' + mine.length + "</span>" +
            (overdue ? '<span class="badge out">' + overdue + " overdue</span>" : "") +
            '<div class="topbar-spacer"></div></div><div class="card-body">' +
            "<p class=\"muted small\">A stock auditor has raised " + mine.length + " quer" +
            (mine.length === 1 ? "y" : "ies") + " against your stock. Each needs a written justification.</p>" +
            '<table class="tbl"><thead><tr><th>Product</th><th class="num">System</th>' +
            '<th class="num">Counted</th><th class="num">Difference</th><th>Age</th><th></th></tr></thead><tbody>' +
            mine.slice(0, 6).map(function (l) {
              var sla = w.Audit.slaState(l);
              return "<tr><td>" + UI.esc(l.productName) + "</td>" +
                '<td class="num">' + UI.num(l.systemQtyAtSubmit) + "</td>" +
                '<td class="num">' + UI.num(l.physicalQty) + "</td>" +
                '<td class="num" style="color:' + (l.qtyDifference < 0 ? "var(--bad-600)" : "var(--warn-600)") + '">' +
                (l.qtyDifference > 0 ? "+" : "") + UI.num(l.qtyDifference) + "</td>" +
                "<td>" + (sla.level === "ok" ? sla.age + "d"
                  : '<span class="badge warn">' + sla.age + "d</span>") + "</td>" +
                '<td><a class="btn btn-primary btn-sm" href="audit-case.html?line=' +
                encodeURIComponent(l.lineId) + '">Respond</a></td></tr>';
            }).join("") + "</tbody></table></div></div>";
        });
      }

      function partOfDay() {
        var h = new Date().getHours();
        return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
      }

      function paint() {
        return w.API.scopedData(user).then(function (data) {
          var today = w.API.today();
          var totalItems = data.stocks.reduce(function (a, s) { return a + (Number(s.currentBalance) || 0); }, 0);
          var lows = Stock.lowStock(data.stocks, data.products);
          var todayIn = Stock.onDate(data.txns, "IN", today);
          var todayOut = Stock.onDate(data.txns, "OUT", today);

          /* ---- headline cards with breakdowns ----
             The reference layout carries a value against each segment.
             This data set has quantities, not rates, so the secondary
             figure is product lines and branches rather than currency.
             Inventing a value would be worse than not showing one. */
          var M = w.Master;
          var CAT = M.keys().map(function (k) { return { key: k, colour: M.colour(k) }; });

          function byCategory(rows, valueOf) {
            var acc = {};
            CAT.forEach(function (c) { acc[c.key] = { units: 0, lines: {}, branches: {} }; });
            rows.forEach(function (r) {
              var k = M ? M.of(r.productId) : "OTHER";
              if (!acc[k]) return;
              acc[k].units += valueOf(r);
              acc[k].lines[r.productId] = true;
              acc[k].branches[r.branch] = true;
            });
            return acc;
          }

          function segsFrom(acc, subNoun) {
            return CAT.map(function (c) {
              var a = acc[c.key];
              var lines = Object.keys(a.lines).length;
              var brs = Object.keys(a.branches).length;
              return {
                label: M ? M.label(c.key) : c.key,
                value: a.units,
                colour: c.colour,
                sub: lines
                  ? "\u25be " + lines + " " + (subNoun || "product") + (lines === 1 ? "" : "s") +
                    " \u00b7 " + brs + " branch" + (brs === 1 ? "" : "es")
                  : "",
                title: (M ? M.label(c.key) : c.key) + ": " + lines + " products across " + brs + " branches"
              };
            });
          }

          var stockAcc = byCategory(data.stocks, function (s2) { return Number(s2.currentBalance) || 0; });
          var inToday = data.txns.filter(function (t) { return t.txnType === "IN" && t.date === today; });
          var outToday = data.txns.filter(function (t) { return t.txnType === "OUT" && t.date === today; });
          var inAcc = byCategory(inToday, function (t) { return Number(t.qty) || 0; });
          var outAcc = byCategory(outToday, function (t) { return Number(t.qty) || 0; });

          function docCount(txns) {
            var s2 = {};
            txns.forEach(function (t) { s2[t.batchId || t.transactionId] = true; });
            return Object.keys(s2).length;
          }

          /* Low stock split by how bad it is, not by category — a nil
             balance and a balance one below reorder need different
             responses. */
          var nil = lows.filter(function (s2) { return (Number(s2.currentBalance) || 0) <= 0; });
          var atLevel = lows.filter(function (s2) { return (Number(s2.currentBalance) || 0) > 0; });
          var lowAcc = byCategory(lows, function () { return 1; });

          var kpisEl = d.getElementById("kpis");
          if (!kpisEl) return;
          if (kpisEl) kpisEl.innerHTML =
            UI.metricCard({
              label: "Total stock on hand", value: totalItems,
              foot: data.stocks.filter(function (s2) { return s2.currentBalance > 0; }).length +
                    " product\u2013branch lines \u00b7 " + data.allowedBranches.length + " branches",
              segments: segsFrom(stockAcc), maxSegments: 8,
              moreHref: "inventory-summary.html", moreText: "Inventory summary"
            }) +
            UI.metricCard({
              label: "Inward today", value: todayIn, kind: "ok",
              foot: UI.fmtDate(today) + " \u00b7 " + docCount(inToday) + " document" +
                    (docCount(inToday) === 1 ? "" : "s"),
              segments: segsFrom(inAcc, "product"), maxSegments: 8,
              emptyText: "No inward entries today",
              moreHref: "stock-summary.html", moreText: "Stock summary"
            }) +
            UI.metricCard({
              label: "Outward today", value: todayOut, kind: "warn",
              foot: UI.fmtDate(today) + " \u00b7 " + docCount(outToday) + " document" +
                    (docCount(outToday) === 1 ? "" : "s"),
              segments: segsFrom(outAcc, "product"), maxSegments: 8,
              emptyText: "No outward entries today",
              moreHref: "stock-summary.html", moreText: "Stock summary"
            }) +
            UI.metricCard({
              label: "Low stock items", value: lows.length, kind: lows.length ? "bad" : "ok",
              foot: lows.length ? "at or below reorder level" : "all above reorder level",
              maxSegments: 8,
              segments: [
                { label: "Nil balance", value: nil.length, colour: "#B3261E",
                  sub: nil.length ? "\u25be nothing on the shelf" : "",
                  title: "Products with no stock at all" },
                { label: "At or below reorder", value: atLevel.length, colour: "#A8620A",
                  sub: atLevel.length ? "\u25be still some stock" : "",
                  title: "Products at or under their reorder level" }
              ].concat(CAT.filter(function (c) { return Object.keys(lowAcc[c.key].lines).length; })
                .map(function (c) {
                  var a = lowAcc[c.key];
                  return { label: M ? M.label(c.key) : c.key, value: a.units, colour: c.colour,
                           sub: "\u25be " + Object.keys(a.branches).length + " branch" +
                                (Object.keys(a.branches).length === 1 ? "" : "es") };
                })),
              emptyText: "Nothing below reorder level"
            }) +
            UI.metricCard({
              label: "Branches in view", value: data.allowedBranches.length,
              foot: w.RBAC.scopeLabel(user),
              segments: (function () {
                var holding = {}, moved = {};
                data.stocks.forEach(function (s2) { if (s2.currentBalance > 0) holding[s2.branch] = true; });
                data.txns.forEach(function (t) { if (t.date === today) moved[t.branch] = true; });
                return [
                  { label: "Holding stock", value: Object.keys(holding).length, colour: "#0F7B4F" },
                  { label: "Active today", value: Object.keys(moved).length, colour: "#1668B0" },
                  { label: "No movement today",
                    value: data.allowedBranches.length - Object.keys(moved).length, colour: "#7A8898" }
                ];
              })()
            });

          var byBranch = Stock.groupSum(data.stocks, function (s) { return s.branch; }, function (s) { return Number(s.currentBalance) || 0; });
          var branchSub = d.getElementById("branchSub");
          if (branchSub) branchSub.textContent = byBranch.length + " branch" + (byBranch.length === 1 ? "" : "es");
          var chartBranch = d.getElementById("chartBranch");
          if (chartBranch) UI.barChart(chartBranch, byBranch.slice(0, 12), { aria: "Stock held by branch" });

          var byCat = Stock.groupSum(data.stocks, function (s) { return s.category; }, function (s) { return Number(s.currentBalance) || 0; });
          var chartCat = d.getElementById("chartCat");
          if (chartCat) UI.donutChart(chartCat, byCat.slice(0, 8), { centerLabel: "units", aria: "Stock by category" });

          var months = Stock.monthSeries(6);
          var labels = months.map(function (m) { return m.label; });
          var chartIn = d.getElementById("chartIn");
          if (chartIn) UI.lineChart(chartIn,
            [{ name: "Inward", values: Stock.monthlyTotals(data.txns, "IN", months) }],
            { labels: labels, aria: "Monthly inward trend" });
          var chartOut = d.getElementById("chartOut");
          if (chartOut) UI.lineChart(chartOut,
            [{ name: "Outward", cls: "out", values: Stock.monthlyTotals(data.txns, "OUT", months), area: false }],
            { labels: labels, aria: "Monthly outward trend" });

          var recent = data.txns.slice().sort(function (a, b) { return String(b.timestamp || "").localeCompare(String(a.timestamp || "")); }).slice(0, 50);
          var recentEl = d.getElementById("recent");
          if (recentEl) UI.grid(recentEl, {
            pageSize: 8, searchPlaceholder: "Search recent transactions\u2026",
            emptyTitle: "No transactions yet",
            emptyText: "Inward and outward entries appear here the moment they are saved.",
            columns: [
              { key: "date", label: "Moved", render: function (r) {
                  return UI.fmtDate(r.date) +
                    (r.entryDate && r.entryDate !== r.date
                      ? '<br><span class="muted small" title="Entered at the portal on this date">' +
                        UI.fmtDate(r.entryDate) + "</span>" : ""); } },
              { key: "movementCategory", label: "Category", render: function (r) {
                  return r.movementCategory
                    ? '<span class="badge neutral small">' + UI.esc(r.movementCategory) + "</span>"
                    : "\u2014"; } },
              { key: "txnType", label: "Type", render: function (r) {
                  return '<span class="badge ' + (r.txnType === "IN" ? "in\">Inward" : "out\">Outward") + "</span>"; } },
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "challanNo", label: "Doc", raw: function (r) { return r.challanNo || r.invoiceNo || ""; },
                render: function (r) {
                  var ref = r.challanNo || r.invoiceNo;
                  return ref ? '<span class="mono small">' + UI.esc(trunc(ref, 16)) + "</span>" : "\u2014"; } },
              { key: "productName", label: "Product", render: function (r) {
                  return '<span title="' + UI.esc(r.productName) + '">' + UI.esc(trunc(r.productName, 30)) + "</span>"; } },
              { key: "qty", label: "Qty", type: "num", render: function (r) { return UI.num(r.qty); } },
              { key: "enteredByName", label: "By", render: function (r) { return UI.esc(r.enteredByName || r.enteredBy); } }
            ],
            rows: recent
          });

          var lowSub = d.getElementById("lowSub");
          if (lowSub) lowSub.textContent = lows.length + " item" + (lows.length === 1 ? "" : "s");
          var lowEl = d.getElementById("low");
          if (lowEl) UI.grid(lowEl, {
            pageSize: 8, searchPlaceholder: "Search low stock\u2026",
            emptyTitle: "Nothing below reorder level",
            emptyText: "Every product in your scope is above its threshold.",
            columns: [
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "productName", label: "Product", render: function (r) {
                  return '<span title="' + UI.esc(r.productName) + '">' + UI.esc(trunc(r.productName, 34)) + "</span>"; } },
              { key: "currentBalance", label: "Balance", type: "num", render: function (r) {
                  var b = Number(r.currentBalance) || 0;
                  return '<span class="badge ' + (b <= 0 ? "out" : "warn") + '">' + UI.num(b) + "</span>"; } },
              { key: "updatedAt", label: "Last moved", render: function (r) { return UI.fmtDateTime(r.updatedAt); } }
            ],
            rows: lows
          });

          paintAuditTasks(data);

          lastPaint = new Date();
          var freshness = d.getElementById("freshness");
          if (freshness) freshness.textContent =
            "updated " + String(lastPaint.getHours()).padStart(2, "0") + ":" +
            String(lastPaint.getMinutes()).padStart(2, "0") + ":" + String(lastPaint.getSeconds()).padStart(2, "0");
        });
      }

      function kpi(label, value, foot, kind) {
        return '<div class="kpi ' + (kind || "") + '"><div class="lbl">' + UI.esc(label) + "</div>" +
               '<div class="val">' + value + '</div><div class="foot">' + UI.esc(foot) + "</div></div>";
      }
      function trunc(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "\u2026" : s; }

      d.getElementById("refreshNow").onclick = function () { paint().then(function () { UI.toast("Dashboard refreshed", "", "ok"); }); };
      d.getElementById("printDash").onclick = function () { UI.exportPDF("Dashboard \u2014 " + w.RBAC.scopeLabel(user)); };

      paint();
      w.API.onChange(UI.debounce(paint, 150));
      setInterval(paint, Math.max(5, w.APP_CONFIG.refreshSeconds) * 1000);
      w.addEventListener("theme:changed", function () { setTimeout(paint, 30); });
    }
  };
})(window, document);
