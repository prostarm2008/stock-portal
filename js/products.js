/* ============================================================
   products.js — Product master (HO Admin only)

   Adding a product is HO's job, not a branch's. Twenty branches
   adding their own lines would give you "Battery 105AH Exide",
   "105 AH exide smf" and "Exide SMF 105" as three products with
   three separate balances, and no report could add them up.
   ============================================================ */
(function (w, d) {
  "use strict";

  w.Products = {
    mount: function () {
      var user = w.Auth.require("products");
      if (!user) return;

      var UI = w.UI, Master = w.Master, Stock = w.Stock;
      var content = UI.shell(user, "products", "Product master");
      var state = { products: [], stocks: [], txns: [], grid: null };

      var MASTERS = [
        { value: "UPS", label: "UPS" },
        { value: "SMF", label: "Battery \u2014 SMF Batteries" },
        { value: "LITHIUM", label: "Battery \u2014 Lithium Batteries" },
        { value: "OTHER", label: "Other equipment & spares" }
      ];

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Product master</h1>' +
        "<p>Every product a branch can receive or issue. Adding one here makes it " +
        "available in the inward and outward dropdowns immediately.</p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-primary btn-sm" id="addBtn">Add product</button>' +
          '<button class="btn btn-ghost btn-sm" id="xlBtn">Export master</button>' +
        "</div></div>" +
        '<div class="grid g-5" id="pKpis"></div>' +
        '<div class="card mt"><div class="card-head"><h3>All products</h3>' +
          '<span class="sub" id="pSub"></span></div><div id="pGrid"></div></div>';

      function load() {
        return Promise.all([w.API.getProducts(), w.API.getStocks(), w.API.getTxns()])
          .then(function (r) {
            state.products = r[0]; state.stocks = r[1]; state.txns = r[2];
            Master.useProducts(state.products);
            paint();
          });
      }

      function usage(productId) {
        var held = 0, branches = {};
        state.stocks.forEach(function (s) {
          if (s.productId !== productId) return;
          held += Number(s.currentBalance) || 0;
          if ((Number(s.currentBalance) || 0) > 0) branches[s.branch] = true;
        });
        var moves = state.txns.filter(function (t) { return t.productId === productId; }).length;
        return { held: held, branches: Object.keys(branches).length, moves: moves };
      }

      function paint() {
        var pKpis = d.getElementById("pKpis");
        if (!pKpis) return;
        var counts = { UPS: 0, SMF: 0, LITHIUM: 0, OTHER: 0 };
        state.products.forEach(function (p) { counts[Master.of(p.productId)]++; });

        var pKpis = d.getElementById("pKpis"); if(pKpis) pKpis.innerHTML =
          kpi("Products", state.products.length, "in the master") +
          kpi("UPS", counts.UPS, "") +
          kpi("SMF batteries", counts.SMF, "battery total " + (counts.SMF + counts.LITHIUM)) +
          kpi("Lithium batteries", counts.LITHIUM, "battery total " + (counts.SMF + counts.LITHIUM)) +
          kpi("Other", counts.OTHER, "transformers, spares");

        d.getElementById("pSub").textContent = state.products.length + " products";

        state.grid = UI.grid(d.getElementById("pGrid"), {
          rows: state.products, pageSize: 25, sortKey: "productName", sortDir: "asc",
          searchPlaceholder: "Search product name, code or category\u2026",
          emptyTitle: "No products", emptyText: "",
          columns: [
            { key: "productId", label: "Code", render: function (r) {
                return '<span class="mono">' + UI.esc(r.productId) + "</span>"; } },
            { key: "productName", label: "Product name", render: function (r) {
                return "<b>" + UI.esc(r.productName) + "</b>"; } },
            { key: "master", label: "Master category",
              raw: function (r) { return Master.of(r.productId); },
              render: function (r) {
                var m = Master.of(r.productId);
                var cls = m === "UPS" ? "info" : m === "OTHER" ? "neutral" : "in";
                return '<span class="badge ' + cls + '">' + UI.esc(Master.label(m)) + "</span>" +
                  (Master.isConfirmed(r.productId) ? "" : ' <span class="badge warn" title="' +
                    UI.esc(Master.noteFor(r.productId)) + '">review</span>'); } },
            { key: "category", label: "As tagged in stock sheet", render: function (r) {
                return '<span class="muted small">' + UI.esc(r.category || "\u2014") + "</span>"; } },
            { key: "uom", label: "UOM", render: function (r) { return UI.esc(r.uom || "NOS"); } },
            { key: "reorderLevel", label: "Reorder", type: "num", render: function (r) {
                return UI.num(Stock.reorderLevel(r)); } },
            { key: "held", label: "On hand",
              raw: function (r) { return usage(r.productId).held; },
              type: "num", render: function (r) {
                var u = usage(r.productId);
                return u.held ? "<b>" + UI.num(u.held) + '</b><br><span class="muted small">' +
                  u.branches + " branch" + (u.branches === 1 ? "" : "es") + "</span>" : "\u2014"; } },
            { key: "productId2", label: "", sortable: false, render: function (r) {
                return '<button class="btn btn-ghost btn-sm no-print" data-edit="' +
                  UI.esc(r.productId) + '">Edit</button>'; } }
          ],
          afterRender: function (root) {
            root.querySelectorAll("[data-edit]").forEach(function (b) {
              b.onclick = function () {
                edit(state.products.find(function (p) { return p.productId === b.getAttribute("data-edit"); }));
              };
            });
          }
        });
      }

      function kpi(l, v, foot) {
        return '<div class="kpi"><div class="lbl">' + UI.esc(l) + '</div><div class="val">' +
          UI.num(v) + '</div><div class="foot">' + UI.esc(foot || "") + "</div></div>";
      }

      /* Two products that are the same battery under different spellings
         is the failure mode worth guarding against — it splits a balance
         across two lines and no report can add them back together. */
      function similarTo(name, exceptId) {
        var norm = function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); };
        var target = norm(name);
        if (!target) return [];
        var tokens = target.split(" ").filter(function (t) { return t.length > 1; });
        if (!tokens.length) return [];
        return state.products.filter(function (p) {
          if (p.productId === exceptId) return false;
          var n = norm(p.productName);
          if (n === target) return true;
          var hits = tokens.filter(function (t) { return n.indexOf(t) >= 0; }).length;
          return hits / tokens.length >= 0.6;
        }).slice(0, 4);
      }

      function edit(product) {
        var isNew = !product;
        var p = product || { productId: "", productName: "", category: "", uom: "NOS", reorderLevel: 2, master: "" };
        var currentMaster = isNew ? "" : Master.of(p.productId);
        var use = isNew ? {} : usage(p.productId);

        var existingCats = {};
        state.products.forEach(function (x) { if (x.category) existingCats[x.category] = true; });

        var m = UI.modal({
          title: isNew ? "Add product" : "Edit " + p.productName,
          okText: isNew ? "Add to master" : "Save changes",
          body:
            '<div class="field"><label>Product name <span class="req">*</span></label>' +
              '<input class="input" id="pName" value="' + UI.esc(p.productName) + '" maxlength="140" ' +
              'placeholder="e.g. Battery 105AH Exide">' +
              '<div class="hint">Write it the way it appears on the supplier challan. This name goes on every ' +
              'entry and every report, so it is worth getting right the first time.</div>' +
              '<div id="dupWarn"></div></div>' +

            '<div class="grid g-2" style="gap:0 14px">' +
              '<div class="field"><label>Master category <span class="req">*</span></label>' +
                '<select class="input" id="pMaster"><option value="">\u2014 select \u2014</option>' +
                MASTERS.map(function (x) {
                  return '<option value="' + x.value + '"' + (currentMaster === x.value ? " selected" : "") +
                    ">" + x.label + "</option>";
                }).join("") + "</select>" +
                '<div class="hint">Decides where it counts on the Inventory report.</div></div>' +
              '<div class="field"><label>Product code</label>' +
                '<input class="input mono" id="pCode" value="' + UI.esc(p.productId) + '" ' +
                (isNew ? 'placeholder="auto"' : "readonly") + '>' +
                '<div class="hint">' + (isNew ? "Left blank, the next code in the series is used." :
                  "Fixed \u2014 transactions reference it.") + "</div></div>" +
            "</div>" +

            '<div class="grid g-3" style="gap:0 14px">' +
              '<div class="field"><label>Sub-group</label>' +
                '<input class="input" id="pCat" list="catList" value="' + UI.esc(p.category) + '" maxlength="60" ' +
                'placeholder="e.g. SMF Battery">' +
                "<datalist id=\"catList\">" +
                Object.keys(existingCats).sort().map(function (c) {
                  return '<option value="' + UI.esc(c) + '">';
                }).join("") + "</datalist></div>" +
              '<div class="field"><label>Unit of measure</label>' +
                '<input class="input" id="pUom" value="' + UI.esc(p.uom || "NOS") + '" maxlength="12"></div>' +
              '<div class="field"><label>Reorder level</label>' +
                '<input class="input" type="number" min="0" step="1" id="pReorder" value="' +
                (p.reorderLevel == null ? 2 : p.reorderLevel) + '">' +
                '<div class="hint">Flags low stock.</div></div>' +
            "</div>" +

            (isNew ? "" :
              '<div class="alert info" style="margin:4px 0 0"><div><b>Currently in use</b>' +
              UI.num(use.held) + " on hand across " + use.branches + " branch" +
              (use.branches === 1 ? "" : "es") + ", " + use.moves + " movement" +
              (use.moves === 1 ? "" : "s") + " recorded. Renaming updates the master; " +
              "transactions already saved keep the name they were entered with.</div></div>"),

          onOk: function (root) {
            var name = root.querySelector("#pName").value.trim();
            var master = root.querySelector("#pMaster").value;
            if (!name) { UI.toast("Name required", "Enter the product name.", "warn"); return false; }
            if (!master) { UI.toast("Master category required", "Pick where this counts on the Inventory report.", "warn"); return false; }

            var clash = state.products.find(function (x) {
              return x.productId !== p.productId &&
                String(x.productName || "").toLowerCase().trim() === name.toLowerCase();
            });
            if (clash) {
              UI.toast("Already in the master", '"' + clash.productName + '" (' + clash.productId + ") is the same name.", "warn");
              return false;
            }

            var rec = {
              productId: p.productId || "",
              productName: name,
              category: root.querySelector("#pCat").value.trim() || Master.label(master),
              uom: root.querySelector("#pUom").value.trim() || "NOS",
              reorderLevel: Number(root.querySelector("#pReorder").value) || 0,
              master: master,
              masterConfirmed: true
            };

            w.API.saveProduct(rec).then(function (saved) {
              w.API.log(isNew ? "PRODUCT_CREATED" : "PRODUCT_UPDATED",
                { entity: "products/" + saved.productId, productName: saved.productName }, user);
              UI.toast(isNew ? "Product added" : "Product updated",
                saved.productName + " \u00b7 " + saved.productId + " \u00b7 " + Master.label(master) +
                (isNew ? ". It is now in the inward and outward dropdowns." : "."), "ok");
              load();
            }).catch(function (e) { UI.toast("Not saved", e.message, "bad"); });
          }
        });

        /* Live near-duplicate check while they type the name. */
        var nameEl = m.root.querySelector("#pName");
        var warn = m.root.querySelector("#dupWarn");
        nameEl.addEventListener("input", UI.debounce(function () {
          if (!warn) return;
          var near = similarTo(nameEl.value, p.productId);
          if (warn) warn.innerHTML = near.length
            ? '<div class="alert warn" style="margin:8px 0 0"><div><b>Similar product' +
              (near.length === 1 ? "" : "s") + " already in the master</b>" +
              near.map(function (x) { return UI.esc(x.productName) + " (" + x.productId + ")"; }).join("; ") +
              ". If one of these is the same item, use it instead \u2014 two spellings split the balance " +
              "in two and no report can add them back together.</div></div>"
            : "";
        }, 250));
        nameEl.dispatchEvent(new Event("input"));
      }

      d.getElementById("addBtn").onclick = function () { edit(null); };

      d.getElementById("xlBtn").onclick = function () {
        UI.exportWorkbook("Product-Master-" + w.API.today(), [{
          name: "Product Master",
          columns: [
            { label: "Product Code", width: 14 },
            { label: "Product Name / Description", width: 48 },
            { label: "Master Category", width: 24 },
            { label: "Subcategory", width: 24 },
            { label: "As tagged in stock sheet", width: 24 },
            { label: "UOM", width: 10 },
            { label: "Reorder level", width: 14 },
            { label: "On hand (all branches)", width: 20 },
            { label: "Classification", width: 16 }
          ],
          rows: state.products.map(function (r) {
            var m = Master.of(r.productId);
            return [
              r.productId, r.productName,
              Master.parentLabel(Master.parentOf(m)), Master.label(m),
              r.category || "", r.uom || "NOS", Number(r.reorderLevel == null ? 2 : r.reorderLevel),
              usage(r.productId).held,
              Master.isConfirmed(r.productId) ? "Confirmed" : "Needs review"
            ];
          })
        }]);
      };

      load();
      w.API.onChange(UI.debounce(load, 300));
    }
  };
})(window, document);
