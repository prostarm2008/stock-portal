/* ============================================================
   reports.js — the five standard reports
   Daily, Monthly, Branch-wise, Zone-wise, Product-wise.
   Every report exports to Excel, CSV and PDF.
   ============================================================ */
(function (w, d) {
  "use strict";

  w.Reports = {
    mount: function () {
      var user = w.Auth.require("reports");
      if (!user) return;

      var UI = w.UI, Stock = w.Stock;
      var content = UI.shell(user, "reports", "Reports");
      var state = { data: null, grid: null, current: "daily", head: [], rows: [], title: "" };

      var TABS = [
        { id: "category", label: "Movement category" },
        { id: "daily",   label: "Daily stock" },
        { id: "monthly", label: "Monthly stock" },
        { id: "branch",  label: "Branch-wise" },
        { id: "zone",    label: "Zone-wise" },
        { id: "product", label: "Product-wise" }
      ];

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Reports</h1>' +
        "<p>Scoped to " + UI.esc(w.RBAC.scopeLabel(user)) + ". Pick a report, set the period, then export.</p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-ghost btn-sm" id="xlBtn">Excel</button>' +
          '<button class="btn btn-ghost btn-sm" id="csvBtn">CSV</button>' +
          '<button class="btn btn-ghost btn-sm" id="pdfBtn">PDF</button>' +
        "</div></div>" +
        '<div class="card no-print"><div class="card-body">' +
          '<div class="btn-row" id="tabs" style="margin-bottom:14px"></div>' +
          '<div class="grid g-3" style="gap:0 14px">' +
            '<div class="field"><label for="rFrom">From</label><input class="input" type="date" id="rFrom"></div>' +
            '<div class="field"><label for="rTo">To</label><input class="input" type="date" id="rTo"></div>' +
            '<div class="field"><label for="rBranch">Branch</label><select class="input" id="rBranch"></select></div>' +
          "</div>" +
          '<div class="btn-row"><button class="btn btn-primary btn-sm" id="runBtn">Run report</button></div>' +
        "</div></div>" +
        '<div class="card mt"><div class="card-head"><h3 id="repTitle">Daily stock report</h3>' +
        '<span class="sub" id="repSub"></span></div><div id="repGrid"></div></div>';

      var first = new Date(); first.setDate(1);
      d.getElementById("rFrom").value = first.toISOString().slice(0, 10);
      d.getElementById("rTo").value = w.API.today();

      var tabs = d.getElementById("tabs"); if (tabs) tabs.innerHTML = TABS.map(function (t, i) {
        return '<button class="btn ' + (i === 0 ? "btn-primary" : "btn-ghost") +
          ' btn-sm" data-tab="' + t.id + '">' + t.label + "</button>";
      }).join("");

      d.querySelectorAll("[data-tab]").forEach(function (b) {
        b.onclick = function () {
          state.current = b.getAttribute("data-tab");
          d.querySelectorAll("[data-tab]").forEach(function (x) {
            x.className = "btn btn-sm " + (x === b ? "btn-primary" : "btn-ghost");
          });
          run();
        };
      });

      function load() {
        return w.API.scopedData(user).then(function (data) {
          var sel = d.getElementById("rBranch");
          if (!sel) return;
          state.data = data;
          if (!sel.options.length) {
            if (sel) sel.innerHTML = '<option value="">All branches in my scope</option>' +
              data.allowedBranches.map(function (b) { return '<option value="' + UI.esc(b) + '">' + UI.esc(b) + "</option>"; }).join("");
            if (user.role === "BRANCH_USER") { sel.value = user.branch; sel.disabled = true; }
          }
          run();
        });
      }

      function windowTxns() {
        var from = d.getElementById("rFrom").value, to = d.getElementById("rTo").value;
        var branch = d.getElementById("rBranch").value;
        return state.data.txns.filter(function (t) {
          if (branch && t.branch !== branch) return false;
          if (from && t.date < from) return false;
          if (to && t.date > to) return false;
          return true;
        });
      }
      function scopedStocks() {
        var branch = d.getElementById("rBranch").value;
        return branch ? state.data.stocks.filter(function (s) { return s.branch === branch; }) : state.data.stocks;
      }

      var BUILD = {
        /* Why stock moved, which the daily and monthly reports cannot
           answer. A branch whose outward is mostly Demo Out has a very
           different problem from one that is mostly Sales Out. */
        category: function () {
          var txns = windowTxns(), map = {};
          txns.forEach(function (t) {
            var cat = t.movementCategory || "Not specified";
            var k = cat + "\u0000" + t.branch;
            var r = map[k] || (map[k] = { cat: cat, branch: t.branch, dir: t.txnType,
                                          qty: 0, lines: 0, docs: {} });
            r.qty += Number(t.qty) || 0;
            r.lines++;
            r.docs[t.batchId || t.transactionId] = true;
          });
          var rows = Object.keys(map).map(function (k) {
            var r = map[k]; r.docCount = Object.keys(r.docs).length; return r;
          }).sort(function (a, b) {
            return String(a.cat || "").localeCompare(b.cat) || b.qty - a.qty;
          });
          return {
            title: "Movement category report",
            head: ["Category", "Direction", "Branch", "Documents", "Lines", "Quantity"],
            cols: [
              { key: "cat", label: "Category", render: function (r) {
                  return '<span class="badge ' + (r.dir === "IN" ? "in" : "out") + '">' +
                    UI.esc(r.cat) + "</span>"; } },
              { key: "dir", label: "Direction", render: function (r) {
                  return r.dir === "IN" ? "Inward" : "Outward"; } },
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "docCount", label: "Documents", type: "num", render: function (r) { return UI.num(r.docCount); } },
              { key: "lines", label: "Lines", type: "num", render: function (r) { return UI.num(r.lines); } },
              { key: "qty", label: "Quantity", type: "num", render: function (r) { return "<b>" + UI.num(r.qty) + "</b>"; } }
            ],
            rows: rows,
            flat: function (r) { return [r.cat, r.dir === "IN" ? "Inward" : "Outward", r.branch, r.docCount, r.lines, r.qty]; }
          };
        },

        daily: function () {
          var txns = windowTxns(), map = {};
          txns.forEach(function (t) {
            var k = t.date + "\u0000" + t.branch;
            var r = map[k] || (map[k] = { date: t.date, branch: t.branch, inward: 0, outward: 0, entries: 0 });
            r.entries++;
            if (t.txnType === "IN") r.inward += Number(t.qty) || 0; else r.outward += Number(t.qty) || 0;
          });
          var rows = Object.keys(map).map(function (k) {
            var r = map[k]; r.net = r.inward - r.outward; return r;
          }).sort(function (a, b) { return String(b.date || "").localeCompare(a.date) || String(a.branch || "").localeCompare(b.branch); });
          return {
            title: "Daily stock report",
            head: ["Date", "Branch", "Entries", "Inward", "Outward", "Net"],
            cols: [
              { key: "date", label: "Date", render: function (r) { return UI.fmtDate(r.date); } },
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "entries", label: "Entries", type: "num", render: function (r) { return UI.num(r.entries); } },
              { key: "inward", label: "Inward", type: "num", render: function (r) { return UI.num(r.inward); } },
              { key: "outward", label: "Outward", type: "num", render: function (r) { return UI.num(r.outward); } },
              { key: "net", label: "Net", type: "num", render: net }
            ],
            rows: rows,
            flat: function (r) { return [r.date, r.branch, r.entries, r.inward, r.outward, r.net]; }
          };
        },

        monthly: function () {
          var txns = windowTxns(), map = {};
          txns.forEach(function (t) {
            var k = String(t.date).slice(0, 7) + "\u0000" + t.branch;
            var r = map[k] || (map[k] = { month: String(t.date).slice(0, 7), branch: t.branch, inward: 0, outward: 0, entries: 0 });
            r.entries++;
            if (t.txnType === "IN") r.inward += Number(t.qty) || 0; else r.outward += Number(t.qty) || 0;
          });
          var rows = Object.keys(map).map(function (k) { var r = map[k]; r.net = r.inward - r.outward; return r; })
            .sort(function (a, b) { return String(b.month || "").localeCompare(a.month) || String(a.branch || "").localeCompare(b.branch); });
          return {
            title: "Monthly stock report",
            head: ["Month", "Branch", "Entries", "Inward", "Outward", "Net"],
            cols: [
              { key: "month", label: "Month", render: function (r) { return UI.esc(r.month); } },
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "entries", label: "Entries", type: "num", render: function (r) { return UI.num(r.entries); } },
              { key: "inward", label: "Inward", type: "num", render: function (r) { return UI.num(r.inward); } },
              { key: "outward", label: "Outward", type: "num", render: function (r) { return UI.num(r.outward); } },
              { key: "net", label: "Net", type: "num", render: net }
            ],
            rows: rows,
            flat: function (r) { return [r.month, r.branch, r.entries, r.inward, r.outward, r.net]; }
          };
        },

        branch: function () {
          var txns = windowTxns(), stocks = scopedStocks(), map = {};
          state.data.allowedBranches.forEach(function (b) {
            var bs = state.data.branches.find(function (x) { return x.branchCode === b; });
            map[b] = { branch: b, zone: bs ? bs.zone : "", lines: 0, onHand: 0, inward: 0, outward: 0, low: 0 };
          });
          stocks.forEach(function (s) {
            var r = map[s.branch]; if (!r) return;
            r.lines++; r.onHand += Number(s.currentBalance) || 0;
          });
          Stock.lowStock(stocks, state.data.products).forEach(function (s) { if (map[s.branch]) map[s.branch].low++; });
          txns.forEach(function (t) {
            var r = map[t.branch]; if (!r) return;
            if (t.txnType === "IN") r.inward += Number(t.qty) || 0; else r.outward += Number(t.qty) || 0;
          });
          var branchFilter = d.getElementById("rBranch").value;
          var rows = Object.keys(map).map(function (k) { return map[k]; })
            .filter(function (r) { return !branchFilter || r.branch === branchFilter; })
            .sort(function (a, b) { return b.onHand - a.onHand; });
          return {
            title: "Branch-wise stock report",
            head: ["Branch", "Zone", "Product lines", "On hand", "Inward", "Outward", "Low stock items"],
            cols: [
              { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
              { key: "zone", label: "Zone", render: function (r) { return '<span class="badge neutral">' + UI.esc(r.zone) + "</span>"; } },
              { key: "lines", label: "Lines", type: "num", render: function (r) { return UI.num(r.lines); } },
              { key: "onHand", label: "On hand", type: "num", render: function (r) { return "<b>" + UI.num(r.onHand) + "</b>"; } },
              { key: "inward", label: "Inward", type: "num", render: function (r) { return UI.num(r.inward); } },
              { key: "outward", label: "Outward", type: "num", render: function (r) { return UI.num(r.outward); } },
              { key: "low", label: "Low", type: "num", render: function (r) {
                  return r.low ? '<span class="badge warn">' + r.low + "</span>" : "0"; } }
            ],
            rows: rows,
            flat: function (r) { return [r.branch, r.zone, r.lines, r.onHand, r.inward, r.outward, r.low]; }
          };
        },

        zone: function () {
          var b = this.branch(), map = {};
          b.rows.forEach(function (r) {
            var z = map[r.zone] || (map[r.zone] = { zone: r.zone, branches: 0, onHand: 0, inward: 0, outward: 0, low: 0 });
            z.branches++; z.onHand += r.onHand; z.inward += r.inward; z.outward += r.outward; z.low += r.low;
          });
          var rows = Object.keys(map).map(function (k) { return map[k]; })
            .sort(function (a, b2) { return b2.onHand - a.onHand; });
          return {
            title: "Zone-wise stock report",
            head: ["Zone", "Branches", "On hand", "Inward", "Outward", "Low stock items"],
            cols: [
              { key: "zone", label: "Zone", render: function (r) { return "<b>" + UI.esc(r.zone) + "</b>"; } },
              { key: "branches", label: "Branches", type: "num", render: function (r) { return UI.num(r.branches); } },
              { key: "onHand", label: "On hand", type: "num", render: function (r) { return UI.num(r.onHand); } },
              { key: "inward", label: "Inward", type: "num", render: function (r) { return UI.num(r.inward); } },
              { key: "outward", label: "Outward", type: "num", render: function (r) { return UI.num(r.outward); } },
              { key: "low", label: "Low", type: "num", render: function (r) {
                  return r.low ? '<span class="badge warn">' + r.low + "</span>" : "0"; } }
            ],
            rows: rows,
            flat: function (r) { return [r.zone, r.branches, r.onHand, r.inward, r.outward, r.low]; }
          };
        },

        product: function () {
          var txns = windowTxns(), stocks = scopedStocks(), map = {};
          function slot(id, name, cat) {
            return map[id] || (map[id] = { productId: id, productName: name, category: cat, onHand: 0, branches: 0, inward: 0, outward: 0 });
          }
          stocks.forEach(function (s) {
            var r = slot(s.productId, s.productName, s.category);
            r.onHand += Number(s.currentBalance) || 0;
            if ((Number(s.currentBalance) || 0) > 0) r.branches++;
          });
          txns.forEach(function (t) {
            var r = slot(t.productId, t.productName, t.category);
            if (t.txnType === "IN") r.inward += Number(t.qty) || 0; else r.outward += Number(t.qty) || 0;
          });
          var rows = Object.keys(map).map(function (k) { return map[k]; })
            .filter(function (r) { return r.onHand || r.inward || r.outward; })
            .sort(function (a, b) { return b.onHand - a.onHand; });
          return {
            title: "Product-wise stock report",
            head: ["Product", "Category", "Branches holding", "On hand", "Inward", "Outward"],
            cols: [
              { key: "productName", label: "Product", render: function (r) { return UI.esc(r.productName); } },
              { key: "category", label: "Category", render: function (r) { return '<span class="badge neutral">' + UI.esc(r.category || "\u2014") + "</span>"; } },
              { key: "branches", label: "Branches", type: "num", render: function (r) { return UI.num(r.branches); } },
              { key: "onHand", label: "On hand", type: "num", render: function (r) { return "<b>" + UI.num(r.onHand) + "</b>"; } },
              { key: "inward", label: "Inward", type: "num", render: function (r) { return UI.num(r.inward); } },
              { key: "outward", label: "Outward", type: "num", render: function (r) { return UI.num(r.outward); } }
            ],
            rows: rows,
            flat: function (r) { return [r.productName, r.category, r.branches, r.onHand, r.inward, r.outward]; }
          };
        }
      };

      function net(r) {
        var v = r.net;
        return '<span style="color:' + (v > 0 ? "var(--ok-600)" : v < 0 ? "var(--bad-600)" : "inherit") + '">' +
          (v > 0 ? "+" : "") + UI.num(v) + "</span>";
      }

      function run() {
        if (!state.data) return;
        var from = d.getElementById("rFrom").value, to = d.getElementById("rTo").value;
        if (from && to && from > to) { UI.toast("Check the dates", "The From date falls after the To date.", "warn"); return; }

        var rep = BUILD[state.current].call(BUILD);
        state.head = rep.head; state.rows = rep.rows; state.title = rep.title; state.flat = rep.flat;

        d.getElementById("repTitle").textContent = rep.title;
        d.getElementById("repSub").textContent =
          rep.rows.length + " row" + (rep.rows.length === 1 ? "" : "s") + " \u00b7 " +
          UI.fmtDate(from) + " to " + UI.fmtDate(to);

        state.grid = UI.grid(d.getElementById("repGrid"), {
          columns: rep.cols, rows: rep.rows,
          searchPlaceholder: "Search this report\u2026",
          emptyTitle: "Nothing to report for this period",
          emptyText: "Widen the dates, or check that entries exist for the selected branch."
        });
      }

      function exportRows() {
        var src = state.grid ? state.grid.visibleRows() : state.rows;
        return src.map(state.flat);
      }
      function fileName() {
        return state.title.replace(/[^A-Za-z0-9]+/g, "-") + "-" + w.API.today();
      }

      d.getElementById("runBtn").onclick = run;
      d.getElementById("xlBtn").onclick = function () { UI.exportExcel(fileName(), state.title.slice(0, 31), state.head, exportRows()); };
      d.getElementById("csvBtn").onclick = function () { UI.exportCSV(fileName(), state.head, exportRows()); };
      d.getElementById("pdfBtn").onclick = function () { UI.exportPDF(state.title); };

      load();
      w.API.onChange(UI.debounce(load, 250));
    }
  };
})(window, document);
