/* ============================================================
   summary.js — Stock summary screen
   Opening / Inward / Outward / Closing, filtered by branch,
   product and date range, exportable to Excel, PDF and CSV.
   ============================================================ */
(function (w, d) {
  "use strict";

  w.Summary = {
    mount: function () {
      var user = w.Auth.require("stock-summary");
      if (!user) return;

      var UI = w.UI, Stock = w.Stock;
      var content = UI.shell(user, "stock-summary", "Stock summary");
      var state = { data: null, grid: null, productSel: null, rows: [] };

      var firstOfMonth = new Date();
      firstOfMonth.setDate(1);

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Stock summary</h1>' +
        "<p>Opening, movement and closing balance for the period you choose.</p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-ghost btn-sm" id="xlBtn">Excel</button>' +
          '<button class="btn btn-ghost btn-sm" id="csvBtn">CSV</button>' +
          '<button class="btn btn-ghost btn-sm" id="pdfBtn">PDF</button>' +
        "</div></div>" +
        '<div class="card no-print"><div class="card-body"><div class="grid g-4" style="gap:0 14px">' +
          '<div class="field"><label for="fBranch">Branch</label><select class="input" id="fBranch"></select></div>' +
          '<div class="field"><label>Product</label><div id="fProductMount"></div></div>' +
          '<div class="field"><label for="fFrom">From</label><input class="input" type="date" id="fFrom"></div>' +
          '<div class="field"><label for="fTo">To</label><input class="input" type="date" id="fTo"></div>' +
        '</div><div class="btn-row"><button class="btn btn-primary btn-sm" id="applyBtn">Apply filters</button>' +
        '<button class="btn btn-ghost btn-sm" id="resetBtn">Reset</button>' +
        '<span class="muted small" id="periodNote" style="align-self:center"></span></div></div></div>' +
        '<div class="grid g-4 mt" id="totals"></div>' +
        '<div class="card mt"><div class="card-head"><h3>Product movement</h3>' +
        '<span class="sub" id="rowNote"></span></div><div id="gridMount"></div></div>';

      d.getElementById("fFrom").value = firstOfMonth.toISOString().slice(0, 10);
      d.getElementById("fTo").value = w.API.today();

      function load() {
        return w.API.scopedData(user).then(function (data) {
          var sel = d.getElementById("fBranch");
          if (!sel) return;
          state.data = data;
          if (!sel.options.length) {
            if (sel) sel.innerHTML = '<option value="">All branches in my scope</option>' +
              data.allowedBranches.map(function (b) {
                return '<option value="' + UI.esc(b) + '">' + UI.esc(b) + "</option>";
              }).join("");
            if (user.role === "BRANCH_USER") { sel.value = user.branch; sel.disabled = true; }
          }
          if (!state.productSel) {
            state.productSel = UI.searchableSelect(d.getElementById("fProductMount"), {
              placeholder: "All products",
              items: [{ value: "", label: "All products" }].concat(data.products.map(function (p) {
                return { value: p.productId, label: p.productName, group: p.category };
              }))
            });
          }
          apply();
        });
      }

      function apply() {
        var periodNote = d.getElementById("periodNote");
        if (!periodNote) return;
        var from = d.getElementById("fFrom").value;
        var to = d.getElementById("fTo").value;
        if (from && to && from > to) {
          UI.toast("Check the dates", "The From date falls after the To date.", "warn");
          return;
        }
        var rows = Stock.summary({
          stocks: state.data.stocks, txns: state.data.txns, products: state.data.products,
          branch: d.getElementById("fBranch").value,
          product: state.productSel ? state.productSel.value : "",
          from: from, to: to
        }).filter(function (r) {
          return r.opening || r.inward || r.outward || r.closing;
        });
        state.rows = rows;

        d.getElementById("periodNote").textContent =
          from || to ? UI.fmtDate(from) + " to " + UI.fmtDate(to) : "all dates";
        d.getElementById("rowNote").textContent = rows.length + " line" + (rows.length === 1 ? "" : "s");

        var t = rows.reduce(function (a, r) {
          a.o += r.opening; a.i += r.inward; a.u += r.outward; a.c += r.closing; return a;
        }, { o: 0, i: 0, u: 0, c: 0 });
        var totals = d.getElementById("totals"); if (totals) totals.innerHTML =
          k("Opening", t.o, "") + k("Inward", t.i, "ok") + k("Outward", t.u, "warn") + k("Closing", t.c, "");

        var columns = [
          { key: "branch", label: "Branch", render: function (r) { return UI.esc(r.branch); } },
          { key: "productName", label: "Product", render: function (r) { return UI.esc(r.productName); } },
          { key: "category", label: "Category", render: function (r) { return '<span class="badge neutral">' + UI.esc(r.category || "\u2014") + "</span>"; } },
          { key: "opening", label: "Opening", type: "num", render: function (r) { return UI.num(r.opening); } },
          { key: "inward", label: "Inward", type: "num", render: function (r) { return r.inward ? '<span style="color:var(--ok-600)">+' + UI.num(r.inward) + "</span>" : "0"; } },
          { key: "outward", label: "Outward", type: "num", render: function (r) { return r.outward ? '<span style="color:var(--bad-600)">\u2212' + UI.num(r.outward) + "</span>" : "0"; } },
          { key: "closing", label: "Closing", type: "num", render: function (r) {
              return '<b class="' + (r.isLow ? "" : "") + '">' + UI.num(r.closing) + "</b>" +
                (r.isLow ? ' <span class="badge warn">low</span>' : ""); } }
        ];

        if (!state.grid) {
          state.grid = UI.grid(d.getElementById("gridMount"), {
            columns: columns, rows: rows, sortKey: "closing", sortDir: "desc",
            searchPlaceholder: "Search product, branch or category\u2026",
            emptyTitle: "No movement in this period",
            emptyText: "Widen the date range, or clear the branch and product filters."
          });
        } else {
          state.grid.setRows(rows);
        }
      }

      function k(label, val, kind) {
        return '<div class="kpi ' + kind + '"><div class="lbl">' + label + '</div><div class="val">' +
          UI.num(val) + '</div><div class="foot">across ' + state.rows.length + " lines</div></div>";
      }

      function exportRows() {
        var src = state.grid ? state.grid.visibleRows() : state.rows;
        return src.map(function (r) {
          return [r.branch, r.productName, r.category, r.opening, r.inward, r.outward, r.closing];
        });
      }
      var HEAD = ["Branch", "Product", "Category", "Opening", "Inward", "Outward", "Closing"];
      var stamp = function () { return "Stock-Summary-" + w.API.today(); };

      d.getElementById("applyBtn").onclick = apply;
      d.getElementById("resetBtn").onclick = function () {
        if (user.role !== "BRANCH_USER") d.getElementById("fBranch").value = "";
        if (state.productSel) state.productSel.value = "";
        d.getElementById("fFrom").value = firstOfMonth.toISOString().slice(0, 10);
        d.getElementById("fTo").value = w.API.today();
        apply();
      };
      d.getElementById("xlBtn").onclick = function () { UI.exportExcel(stamp(), "Stock Summary", HEAD, exportRows()); };
      d.getElementById("csvBtn").onclick = function () { UI.exportCSV(stamp(), HEAD, exportRows()); };
      d.getElementById("pdfBtn").onclick = function () { UI.exportPDF(stamp()); };

      load();
      w.API.onChange(UI.debounce(load, 200));
    }
  };
})(window, document);
