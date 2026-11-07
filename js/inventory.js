/* ============================================================
   inventory.js — Inventory Summary report

   Rolls the 111 products up into four master categories:
   UPS, SMF Batteries, Lithium Batteries, Other.

   The rollup reads data/master-categories.js, not the category
   column in the product master. The source Excel had no UPS
   category at all and mis-tagged 67 products as "Servo
   Stabilizer", so the category column cannot carry this report.
   ============================================================ */
(function (w, d) {
  "use strict";

  /* Master lives in js/master.js — load it before this file. */
  var Master = w.Master;

  /* Display order comes from the category tree, not a literal. */
  function ORDER() { return w.Master ? w.Master.keys() : []; }


  w.Inventory = {
    mount: function () {
      var user = w.Auth.require("inventory-summary");
      if (!user) return;

      var UI = w.UI, Stock = w.Stock;
      var content = UI.shell(user, "inventory-summary", "Inventory summary");
      var isHO = user.role === "HO_ADMIN";
      var state = { data: null, rows: [], branchGrid: null, catGrid: null };

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Inventory summary</h1>' +
        "<p>" + (isHO
          ? "Consolidated counts across every branch, by master category."
          : "Counts for " + UI.esc(w.RBAC.scopeLabel(user)) + ", by master category.") +
        " Counts only \u2014 open Stock summary for item-level detail.</p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-ghost btn-sm" id="xlBtn">Excel</button>' +
          '<button class="btn btn-ghost btn-sm" id="csvBtn">CSV</button>' +
          '<button class="btn btn-ghost btn-sm" id="pdfBtn">PDF</button>' +
        "</div></div>" +

        '<div id="reviewNote"></div>' +

        '<div class="card no-print"><div class="card-body"><div class="grid g-3" style="gap:0 14px">' +
          '<div class="field"><label for="fBranch">Branch</label><select class="input" id="fBranch"></select></div>' +
          '<div class="field"><label for="fCat">Category</label><select class="input" id="fCat">' +
            Master.optionsHtml("All categories") + "</select></div>" +
          '<div class="field"><label for="fState">Inventory</label><select class="input" id="fState">' +
            '<option value="instock">In stock only</option>' +
            '<option value="all">All products, including nil balance</option>' +
            '<option value="low">At or below reorder level</option>' +
            '<option value="faulty">Faulty units only</option>' +
          "</select></div>" +
        "</div>" +
        '<div class="grid g-3" style="gap:0 14px">' +
          '<div class="field"><label for="fFrom">Movements from</label><input class="input" type="date" id="fFrom">' +
            '<div class="hint">Applies to the Excel detail sheet only.</div></div>' +
          '<div class="field"><label for="fTo">Movements to</label><input class="input" type="date" id="fTo"></div>' +
          '<div class="field"></div>' +
        '</div><div class="btn-row"><button class="btn btn-primary btn-sm" id="applyBtn">Apply filters</button>' +
        '<button class="btn btn-ghost btn-sm" id="resetBtn">Reset</button>' +
        '<span class="muted small" id="filterNote" style="align-self:center"></span></div></div></div>' +

        '<div class="grid g-5 mt" id="kpis"></div>' +

        '<div class="card mt"><div class="card-head"><h3>Master category structure</h3>' +
          '<span class="sub">counts on hand</span></div>' +
          '<div class="table-wrap"><table class="tbl" id="treeTbl"></table></div></div>' +

        '<div class="card mt"><div class="card-head"><h3>Branch-wise summary</h3>' +
          '<span class="sub" id="branchSub"></span></div>' +
          '<div class="card-body" id="branchChart"></div>' +
          '<div id="branchGrid"></div></div>' +

        '<div class="card mt"><div class="card-head"><h3>Category-wise summary</h3>' +
          '<span class="sub" id="catSub"></span></div><div id="catGrid"></div></div>';

      var firstOfMonth = new Date(); firstOfMonth.setDate(1);
      d.getElementById("fFrom").value = firstOfMonth.toISOString().slice(0, 10);
      d.getElementById("fTo").value = w.API.today();

      function load() {
        return w.API.scopedData(user).then(function (data) {
          var sel = d.getElementById("fBranch");
          if (!sel) return;
          state.data = data;
          Master.useProducts(data.products);
          if (!sel.options.length) {
            if (sel) sel.innerHTML = (isHO
                ? '<option value="">All branches (consolidated)</option>'
                : '<option value="">All branches in my scope</option>') +
              data.allowedBranches.map(function (b) {
                return '<option value="' + UI.esc(b) + '">' + UI.esc(b) + "</option>";
              }).join("");
            if (user.role === "BRANCH_USER") { sel.value = user.branch; sel.disabled = true; }
          }
          apply();
        });
      }

      /* One pass over the branch/product balances, filtered, then
         aggregated two ways. */
      function build() {
        var branchFilter = d.getElementById("fBranch").value;
        var catFilter = d.getElementById("fCat").value;
        var stateFilter = d.getElementById("fState").value;

        var byId = {};
        state.data.products.forEach(function (p) { byId[p.productId] = p; });

        var rows = [];
        var seen = {};

        state.data.stocks.forEach(function (s) {
          if (branchFilter && s.branch !== branchFilter) return;
          var master = Master.of(s.productId);
          if (catFilter && master !== catFilter) return;

          var qty = Number(s.currentBalance) || 0;
          var prod = byId[s.productId];
          var faulty = Master.isFaulty(s.productName);
          var lvl = Stock.reorderLevel(prod);

          if (stateFilter === "instock" && qty <= 0) return;
          if (stateFilter === "low" && qty > lvl) return;
          if (stateFilter === "faulty" && !faulty) return;

          seen[s.branch + "\u0000" + s.productId] = true;
          rows.push({
            branch: s.branch, productId: s.productId, productName: s.productName,
            sourceCategory: prod ? prod.category : (s.category || ""),
            master: master, qty: qty, faulty: faulty,
            confirmed: Master.isConfirmed(s.productId)
          });
        });

        /* "All products" also lists products a branch has never held, so
           a nil balance is visible rather than absent. */
        if (stateFilter === "all") {
          var branches = branchFilter ? [branchFilter] : state.data.allowedBranches;
          branches.forEach(function (b) {
            state.data.products.forEach(function (p) {
              if (seen[b + "\u0000" + p.productId]) return;
              var master = Master.of(p.productId);
              if (catFilter && master !== catFilter) return;
              rows.push({
                branch: b, productId: p.productId, productName: p.productName,
                sourceCategory: p.category, master: master, qty: 0,
                faulty: Master.isFaulty(p.productName), confirmed: Master.isConfirmed(p.productId)
              });
            });
          });
        }

        state.rows = rows;
        return rows;
      }

      function apply() {
        var kpisEl = d.getElementById("kpis");
        if (!kpisEl) return;
        var rows = build();
        var branchFilter = d.getElementById("fBranch").value;

        /* ---- totals ---- */
        var tot = {};
        ORDER().forEach(function (k) { tot[k] = 0; });
        var faultyTot = 0;
        rows.forEach(function (r) {
          tot[r.master] += r.qty;
          if (r.faulty) faultyTot += r.qty;
        });
        var grand = ORDER().reduce(function (a, k) { return a + tot[k]; }, 0);
        var batteryTotal = (tot.SMF || 0) + (tot.LITHIUM || 0);

        var kpis = d.getElementById("kpis"); if(kpis) kpis.innerHTML =
          kpi("UPS", tot.UPS || 0, "units across " + countBranches(rows, "UPS") + " branch(es)", "") +
          kpi("SMF batteries", tot.SMF || 0, "battery total " + UI.num(batteryTotal), "ok") +
          kpi("Lithium batteries", tot.LITHIUM || 0, "battery total " + UI.num(batteryTotal), "ok") +
          kpi("Transformers & stabilizers", (tot.ISOTX || 0) + (tot.SERVO || 0),
              UI.num(tot.ISOTX || 0) + " isolation \u00b7 " + UI.num(tot.SERVO || 0) + " servo", "warn") +
          kpi("Grand total", grand,
              (UI.num(tot.OTHER || 0) + " other \u00b7 ") +
              (faultyTot ? UI.num(faultyTot) + " faulty" : "no faulty units"),
              faultyTot ? "bad" : "");

        d.getElementById("filterNote").textContent =
          rows.length + " product\u2013branch line" + (rows.length === 1 ? "" : "s") + " in view";

        /* ---- master category structure ---- */
        var branchesHolding = {};
        var productsHolding = {};
        rows.forEach(function (r) {
          if (r.qty <= 0) return;
          (branchesHolding[r.master] = branchesHolding[r.master] || {})[r.branch] = true;
          (productsHolding[r.master] = productsHolding[r.master] || {})[r.productId] = true;
        });
        function countOf(o, k) { return o[k] ? Object.keys(o[k]).length : 0; }

        var treeHtml = "<thead><tr><th>Master category</th><th>Subcategory</th>" +
          '<th class="num">Products</th><th class="num">Branches</th><th class="num">Count</th></tr></thead><tbody>';
        Master.tree().forEach(function (node) {
          var childTotal = node.children.reduce(function (a, c) { return a + tot[c]; }, 0);
          var multi = node.children.length > 1;
          var pProducts = {}, pBranches = {};
          node.children.forEach(function (c) {
            Object.keys(productsHolding[c] || {}).forEach(function (k) { pProducts[k] = true; });
            Object.keys(branchesHolding[c] || {}).forEach(function (k) { pBranches[k] = true; });
          });
          treeHtml += '<tr style="background:var(--surface-2)">' +
            "<td><b>" + UI.esc(Master.parentLabel(node.parent)) + "</b></td>" +
            "<td>" + (multi ? '<span class="muted small">' + node.children.length + " subcategories</span>" : "") + "</td>" +
            '<td class="num">' + UI.num(Object.keys(pProducts).length) + "</td>" +
            '<td class="num">' + UI.num(Object.keys(pBranches).length) + "</td>" +
            '<td class="num"><b>' + UI.num(childTotal) + "</b></td></tr>";
          if (multi) {
            node.children.forEach(function (c) {
              treeHtml += "<tr><td></td><td style=\"padding-left:26px\">" +
                '<span class="badge in">' + UI.esc(Master.label(c)) + "</span></td>" +
                '<td class="num">' + UI.num(countOf(productsHolding, c)) + "</td>" +
                '<td class="num">' + UI.num(countOf(branchesHolding, c)) + "</td>" +
                '<td class="num">' + UI.num(tot[c]) + "</td></tr>";
            });
          }
        });
        treeHtml += '<tr style="border-top:2px solid var(--brand-600)">' +
          "<td><b>GRAND TOTAL</b></td><td></td><td></td><td></td>" +
          '<td class="num"><b>' + UI.num(grand) + "</b></td></tr></tbody>";
        var treeTbl = d.getElementById("treeTbl"); if(treeTbl) treeTbl.innerHTML = treeHtml;

        /* ---- branch-wise ---- */
        var byBranch = {};
        var branchList = branchFilter ? [branchFilter] : state.data.allowedBranches;
        branchList.forEach(function (b) {
          var meta = state.data.branches.find(function (x) { return x.branchCode === b; });
          var rec = { branch: b, zone: meta ? meta.zone : "", total: 0, faulty: 0 };
          ORDER().forEach(function (k) { rec[k] = 0; });
          Master.tree().forEach(function (n) { rec[n.parent] = 0; });
          byBranch[b] = rec;
        });
        rows.forEach(function (r) {
          var b = byBranch[r.branch];
          if (!b) return;
          b[r.master] += r.qty;
          b.total += r.qty;
          if (r.faulty) b.faulty += r.qty;
        });
        Object.keys(byBranch).forEach(function (k) {
          Master.tree().forEach(function (n) {
            byBranch[k][n.parent] = n.children.reduce(function (a, c) { return a + (byBranch[k][c] || 0); }, 0);
          });
        });
        var branchRows = Object.keys(byBranch).map(function (k) { return byBranch[k]; })
          .sort(function (a, b) { return b.total - a.total || String(a.branch || "").localeCompare(b.branch); });

        d.getElementById("branchSub").textContent =
          branchRows.filter(function (b) { return b.total > 0; }).length + " of " +
          branchRows.length + " branches holding stock";

        UI.barChart(d.getElementById("branchChart"),
          branchRows.filter(function (b) { return b.total > 0; }).slice(0, 12)
            .map(function (b) { return { label: b.branch, value: b.total }; }),
          { aria: "Total inventory by branch" });

        /* One column per subcategory, built from the tree, plus a
           Battery total where the parent has more than one child. */
        var branchCols = [
          { key: "branch", label: "Branch", render: function (r) { return "<b>" + UI.esc(r.branch) + "</b>"; } },
          { key: "zone", label: "Zone", render: function (r) { return '<span class="badge neutral">' + UI.esc(r.zone) + "</span>"; } }
        ];
        Master.tree().forEach(function (n) {
          n.children.forEach(function (c) {
            branchCols.push({
              key: c,
              label: n.children.length > 1
                ? Master.parentLabel(n.parent) + " \u2014 " + Master.label(c).replace(/ Batteries$/, "")
                : Master.parentLabel(n.parent),
              type: "num",
              render: (function (k) { return function (r) { return UI.num(r[k] || 0); }; })(c)
            });
          });
          if (n.children.length > 1) {
            branchCols.push({ key: n.parent, label: Master.parentLabel(n.parent) + " total", type: "num",
              render: (function (k) { return function (r) { return "<b>" + UI.num(r[k] || 0) + "</b>"; }; })(n.parent) });
          }
        });
        branchCols = branchCols.concat([
          { key: "total", label: "Total", type: "num", render: function (r) { return "<b>" + UI.num(r.total) + "</b>"; } },
          { key: "faulty", label: "of which faulty", type: "num", render: function (r) {
              return r.faulty ? '<span class="badge out">' + UI.num(r.faulty) + "</span>" : "\u2014"; } }
        ]);
        state.branchRows = branchRows;
        state.branchGrid = UI.grid(d.getElementById("branchGrid"), {
          columns: branchCols, rows: branchRows, sortKey: "total", sortDir: "desc",
          searchPlaceholder: "Search branch or zone\u2026",
          emptyTitle: "No branches in view",
          emptyText: "Clear the branch filter to see the full picture."
        });

        /* ---- category-wise ---- */
        var byCat = {};
        rows.forEach(function (r) {
          var k = r.master + "\u0000" + (r.sourceCategory || "\u2014");
          var c = byCat[k] || (byCat[k] = {
            master: r.master, masterLabel: Master.label(r.master),
            parentLabel: Master.parentLabel(Master.parentOf(r.master)),
            sourceCategory: r.sourceCategory || "\u2014",
            products: {}, branches: {}, qty: 0, faulty: 0, unconfirmed: 0
          });
          c.qty += r.qty;
          if (r.qty > 0) {
            c.products[r.productId] = true;
            c.branches[r.branch] = true;
          }
          if (r.faulty) c.faulty += r.qty;
          if (!r.confirmed && r.qty > 0) c.unconfirmed += r.qty;
        });
        var catRows = Object.keys(byCat).map(function (k) {
          var c = byCat[k];
          c.productCount = Object.keys(c.products).length;
          c.branchCount = Object.keys(c.branches).length;
          return c;
        }).sort(function (a, b) {
          var o = ORDER();
          return o.indexOf(a.master) - o.indexOf(b.master) || b.qty - a.qty;
        });

        d.getElementById("catSub").textContent = catRows.length + " category groups";

        state.catRows = catRows;
        state.catGrid = UI.grid(d.getElementById("catGrid"), {
          rows: catRows, search: true, sortKey: null,
          searchPlaceholder: "Search category\u2026",
          emptyTitle: "Nothing in view",
          emptyText: "Widen the filters above.",
          columns: [
            { key: "parentLabel", label: "Master category", render: function (r) {
                return "<b>" + UI.esc(r.parentLabel) + "</b>"; } },
            { key: "masterLabel", label: "Subcategory", render: function (r) {
                var cls = r.master === "UPS" ? "info" : r.master === "OTHER" ? "neutral" : "in";
                return '<span class="badge ' + cls + '">' + UI.esc(r.masterLabel) + "</span>"; } },
            { key: "sourceCategory", label: "As tagged in the stock sheet", render: function (r) {
                return '<span class="muted small">' + UI.esc(r.sourceCategory) + "</span>"; } },
            { key: "productCount", label: "Products", type: "num", render: function (r) { return UI.num(r.productCount); } },
            { key: "branchCount", label: "Branches", type: "num", render: function (r) { return UI.num(r.branchCount); } },
            { key: "qty", label: "Total count", type: "num", render: function (r) { return "<b>" + UI.num(r.qty) + "</b>"; } },
            { key: "faulty", label: "of which faulty", type: "num", render: function (r) {
                return r.faulty ? '<span class="badge out">' + UI.num(r.faulty) + "</span>" : "\u2014"; } }
          ]
        });

        paintReviewNote(rows);
      }

      function countBranches(rows, master) {
        var s = {};
        rows.forEach(function (r) { if (r.master === master && r.qty > 0) s[r.branch] = true; });
        return Object.keys(s).length;
      }

      function kpi(label, value, foot, kind) {
        return '<div class="kpi ' + (kind || "") + '"><div class="lbl">' + UI.esc(label) + "</div>" +
               '<div class="val">' + UI.num(value) + '</div><div class="foot">' + UI.esc(foot) + "</div></div>";
      }

      /* Products whose master category was a judgement call, and which
         currently hold stock, change these totals. Say so rather than
         let the numbers look settled. */
      function paintReviewNote(rows) {
        var pending = {};
        rows.forEach(function (r) {
          if (!r.confirmed && r.qty > 0) pending[r.productName] = Master.label(r.master);
        });
        var names = Object.keys(pending);
        var host = d.getElementById("reviewNote");
        if (!names.length) { if (host) host.innerHTML = ""; return; }
        if (host) host.innerHTML =
          '<div class="alert warn no-print"><div><b>' + names.length + " product" +
          (names.length === 1 ? " is" : "s are") + " counted on a judgement call</b>" +
          "The stock sheet has no UPS category and no chemistry marker on these lines, so they were placed by name. " +
          "They are included in the totals above. Confirm or change them in <span class=\"mono\">data/master-categories.js</span>: " +
          names.slice(0, 4).map(function (n) {
            return UI.esc(n) + " \u2192 " + UI.esc(pending[n]);
          }).join("; ") +
          (names.length > 4 ? "; and " + (names.length - 4) + " more" : "") + ".</div></div>";
      }

      /* ---- exports ----------------------------------------------
         Three sheets, because two different questions are being asked.

         Summary and Product Balances answer "what is on hand now" —
         a closing balance, which has no challan or invoice attached
         to it.

         Transaction Detail answers "what moved, on what paperwork" —
         that is where Date, Challan No., Invoice No., Party Name and
         Remarks live, because those belong to a movement, not to a
         balance. The two will not tie unless the date range covers
         every movement ever made.
         ------------------------------------------------------------ */
      var XS = w.XLSX ? w.XLSX.styles : {};

      function windowTxns() {
        var branchFilter = d.getElementById("fBranch").value;
        var catFilter = d.getElementById("fCat").value;
        var from = d.getElementById("fFrom").value;
        var to = d.getElementById("fTo").value;
        return state.data.txns.filter(function (t) {
          if (branchFilter && t.branch !== branchFilter) return false;
          if (catFilter && Master.of(t.productId) !== catFilter) return false;
          if (from && t.date < from) return false;
          if (to && t.date > to) return false;
          return true;
        }).sort(function (a, b) {
          return String(a.branch || "").localeCompare(b.branch)
            || Master.parentOf(Master.of(a.productId)).localeCompare(Master.parentOf(Master.of(b.productId)))
            || Master.of(a.productId).localeCompare(Master.of(b.productId))
            || String(a.productName || "").localeCompare(b.productName)
            || String(a.date).localeCompare(String(b.date));
        });
      }

      function sheetSummary() {
        var rows = [];
        var byMaster = {};
        ORDER().forEach(function (k) { byMaster[k] = 0; });
        state.rows.forEach(function (r) { byMaster[r.master] = (byMaster[r.master] || 0) + r.qty; });
        var grand = ORDER().reduce(function (a, k) { return a + byMaster[k]; }, 0);

        rows.push([{ v: "CATEGORY-WISE SUMMARY", s: XS.GROUP }, { v: "", s: XS.GROUP }, { v: "", s: XS.GROUP },
                   { v: "", s: XS.GROUP }, { v: "", s: XS.GROUP }, { v: "", s: XS.GROUP }, { v: "", s: XS.GROUP },
                   { v: "", s: XS.GROUP }, { v: "", s: XS.GROUP }]);
        Master.tree().forEach(function (node) {
          var total = node.children.reduce(function (a, c) { return a + byMaster[c]; }, 0);
          rows.push([{ v: Master.parentLabel(node.parent), s: XS.BOLD },
                     { v: node.children.length > 1 ? "(all subcategories)" : "", s: XS.NORMAL },
                     { v: total, s: XS.BOLDNUM }]);
          if (node.children.length > 1) {
            node.children.forEach(function (c) {
              rows.push(["", Master.label(c), byMaster[c]]);
            });
          }
        });
        rows.push([{ v: "GRAND TOTAL", s: XS.TOTAL }, { v: "", s: XS.TOTAL }, { v: grand, s: XS.TOTALNUM }]);
        rows.push([]);

        rows.push([{ v: "BRANCH-WISE SUMMARY", s: XS.GROUP }, { v: "", s: XS.GROUP }, { v: "", s: XS.GROUP }]);
        /* Header and row shape both come from branchHead()/branchFlat(),
           so a new category appears here without touching this code. */
        rows.push(branchHead().map(function (h) { return { v: h, s: XS.BOLD }; }));
        var totals = null;
        (state.branchRows || []).forEach(function (r) {
          var flat = branchFlat(r);
          rows.push(flat.map(function (v, i) {
            return i === flat.length - 2 ? { v: v, s: XS.BOLDNUM } : v;
          }));
          if (!totals) totals = flat.map(function (v, i) { return i < 2 ? "" : 0; });
          flat.forEach(function (v, i) { if (i >= 2) totals[i] += Number(v) || 0; });
        });
        if (totals) {
          totals[0] = "GRAND TOTAL";
          rows.push(totals.map(function (v, i) {
            return { v: v, s: i < 2 ? XS.TOTAL : XS.TOTALNUM };
          }));
        }

        var cols = [
          { label: "Master category", width: 26 }, { label: "Subcategory", width: 24 },
          { label: "Count", width: 14 }
        ];
        while (cols.length < branchHead().length) cols.push({ label: "", width: 16 });
        return { name: "Summary", autoFilter: false, columns: cols, rows: rows };
      }

      function sheetDetail() {
        var txns = windowTxns();
        var byId = {};
        state.data.products.forEach(function (p) { byId[p.productId] = p; });

        var rows = [], total = 0;
        txns.forEach(function (t) {
          var master = Master.of(t.productId);
          var qty = Number(t.qty) || 0;
          var signed = t.txnType === "IN" ? qty : -qty;
          total += signed;
          rows.push([
            t.date,
            t.entryDate || "",
            t.movementCategory || "",
            t.branch,
            t.challanNo || "",
            t.invoiceNo || "",
            t.partyName || "",
            t.remarks || "",
            Master.parentLabel(Master.parentOf(master)),
            Master.label(master),
            t.productName,
            t.productId,
            t.txnType === "IN" ? "Inward" : "Outward",
            qty,
            signed
          ]);
        });
        rows.push([
          { v: "GRAND TOTAL", s: XS.TOTAL }, { v: "", s: XS.TOTAL }, { v: "", s: XS.TOTAL },
          { v: "", s: XS.TOTAL }, { v: "", s: XS.TOTAL }, { v: "", s: XS.TOTAL }, { v: "", s: XS.TOTAL },
          { v: "", s: XS.TOTAL }, { v: "", s: XS.TOTAL }, { v: "", s: XS.TOTAL },
          { v: txns.length + " movement lines", s: XS.TOTAL }, { v: "", s: XS.TOTAL },
          { v: "", s: XS.TOTAL },
          { v: txns.reduce(function (a, t) { return a + (Number(t.qty) || 0); }, 0), s: XS.TOTALNUM },
          { v: total, s: XS.TOTALNUM }
        ]);

        return {
          name: "Transaction Detail",
          columns: [
            { label: "Date of Movement", width: 16 },
            { label: "Date of Entry at Portal", width: 20 },
            { label: "Movement Category", width: 20 },
            { label: "Branch Name", width: 18 },
            { label: "Challan No.", width: 18 },
            { label: "Invoice No.", width: 18 },
            { label: "Party / Vendor Name", width: 28 },
            { label: "Remarks", width: 34 },
            { label: "Product Category", width: 22 },
            { label: "Product Subcategory", width: 22 },
            { label: "Product Name / Description", width: 46 },
            { label: "Product Code", width: 14 },
            { label: "Movement", width: 12 },
            { label: "Qty", width: 10 },
            { label: "Qty signed (in +, out \u2212)", width: 18 }
          ],
          rows: rows
        };
      }

      function sheetBalances() {
        var rows = [];
        var sorted = state.rows.slice().sort(function (a, b) {
          return String(a.branch || "").localeCompare(b.branch)
            || Master.parentOf(a.master).localeCompare(Master.parentOf(b.master))
            || String(a.master || "").localeCompare(b.master)
            || String(a.productName || "").localeCompare(b.productName);
        });

        var lastKey = null, groupQty = 0, grand = 0;
        function flushGroup() {
          if (lastKey === null) return;
          rows.push([{ v: "", s: XS.BOLD }, { v: "", s: XS.BOLD }, { v: "", s: XS.BOLD },
                     { v: "Subtotal \u2014 " + lastKey, s: XS.BOLD }, { v: "", s: XS.BOLD },
                     { v: groupQty, s: XS.BOLDNUM }, { v: "", s: XS.BOLD }]);
          groupQty = 0;
        }

        sorted.forEach(function (r) {
          var key = r.branch + " \u00b7 " + Master.parentLabel(Master.parentOf(r.master)) +
                    " \u00b7 " + Master.label(r.master);
          if (key !== lastKey) { flushGroup(); lastKey = key; }
          rows.push([
            r.branch,
            Master.parentLabel(Master.parentOf(r.master)),
            Master.label(r.master),
            r.productName,
            r.productId,
            r.qty,
            r.faulty ? "Faulty" : ""
          ]);
          groupQty += r.qty;
          grand += r.qty;
        });
        flushGroup();
        rows.push([{ v: "GRAND TOTAL", s: XS.TOTAL }, { v: "", s: XS.TOTAL }, { v: "", s: XS.TOTAL },
                   { v: "", s: XS.TOTAL }, { v: "", s: XS.TOTAL },
                   { v: grand, s: XS.TOTALNUM }, { v: "", s: XS.TOTAL }]);

        return {
          name: "Product Balances",
          autoFilter: false,
          columns: [
            { label: "Branch Name", width: 18 },
            { label: "Product Category", width: 22 },
            { label: "Product Subcategory", width: 22 },
            { label: "Product Name / Description", width: 46 },
            { label: "Product Code", width: 14 },
            { label: "Qty on hand", width: 14 },
            { label: "Condition", width: 12 }
          ],
          rows: rows
        };
      }

      function branchHead() {
        var h = ["Branch", "Zone"];
        Master.tree().forEach(function (n) {
          n.children.forEach(function (c) {
            h.push(n.children.length > 1 ? Master.parentLabel(n.parent) + " - " + Master.label(c) : Master.parentLabel(n.parent));
          });
          if (n.children.length > 1) h.push(Master.parentLabel(n.parent) + " total");
        });
        return h.concat(["Total", "Of which faulty"]);
      }
      function branchFlat(r) {
        var v = [r.branch, r.zone];
        Master.tree().forEach(function (n) {
          n.children.forEach(function (c) { v.push(r[c] || 0); });
          if (n.children.length > 1) v.push(r[n.parent] || 0);
        });
        return v.concat([r.total, r.faulty]);
      }

      function stamp() { return "Inventory-Report-" + w.API.today(); }

      d.getElementById("applyBtn").onclick = apply;
      d.getElementById("resetBtn").onclick = function () {
        if (user.role !== "BRANCH_USER") d.getElementById("fBranch").value = "";
        d.getElementById("fCat").value = "";
        d.getElementById("fState").value = "instock";
        apply();
      };
      d.getElementById("xlBtn").onclick = function () {
        UI.exportWorkbook(stamp(), [sheetSummary(), sheetDetail(), sheetBalances()]);
      };
      /* CSV is one flat table, so it carries the movement detail —
         the sheet people actually pivot on. */
      d.getElementById("csvBtn").onclick = function () {
        var sheet = sheetDetail();
        UI.exportCSV(stamp() + "-Detail",
          sheet.columns.map(function (c) { return c.label; }),
          sheet.rows.map(function (r) {
            return r.map(function (c) { return c && typeof c === "object" && "v" in c ? c.v : c; });
          }));
      };
      d.getElementById("pdfBtn").onclick = function () { UI.exportPDF("Inventory summary \u2014 " + w.RBAC.scopeLabel(user)); };

      load();
      w.API.onChange(UI.debounce(load, 250));
    }
  };
})(window, document);
