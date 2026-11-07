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

      var MASTERS = Master.keys().map(function (k) {
        var parent = Master.parentLabel(Master.parentOf(k)), lbl = Master.label(k);
        return { value: k, label: parent !== lbl && Master.tree().some(function (n) { return n.children.length > 1 && n.children.indexOf(k) >= 0; })
          ? parent + " \u2014 " + lbl : lbl };
      });

      if (content) content.innerHTML =
        '<div class="page-head"><div class="grow"><h1>Product master</h1>' +
        "<p>Every product a branch can receive or issue. Adding one here makes it " +
        "available in the inward and outward dropdowns immediately.</p></div>" +
        '<div class="btn-row no-print">' +
          '<button class="btn btn-primary btn-sm" id="addBtn">Add product</button>' +
          '<button class="btn btn-ghost btn-sm" id="bulkBtn">Bulk upload</button>' +
          '<button class="btn btn-ghost btn-sm" id="xlBtn">Export master</button>' +
        "</div></div>" +
        '<div class="grid g-5" id="pKpis"></div>' +
        '<div class="card mt"><div class="card-head"><h3>All products</h3>' +
          '<span class="sub" id="pSub"></span></div>' +
          '<div class="sel-bar no-print" id="selBar" style="display:none"><b id="selCount"></b>' +
          '<span class="grow muted small">Tick rows to act on them. The box in the heading selects everything matching the search, on every page.</span>' +
          '<button class="btn btn-ghost btn-sm" id="selClear">Clear</button>' +
          '<button class="btn btn-danger btn-sm" id="selDelete">Delete selected</button></div>' +
          '<div id="pGrid"></div></div>';

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
        showSel([]);

        state.grid = UI.grid(d.getElementById("pGrid"), {
          rows: state.products, pageSize: 25, sortKey: "productName", sortDir: "asc",
          selectable: true,
          rowKey: function (r) { return r.productId; },
          onSelect: showSel,
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

      function showSel(keys) {
        var bar = d.getElementById("selBar"); if (!bar) return;
        bar.style.display = keys.length ? "flex" : "none";
        d.getElementById("selCount").textContent = keys.length + " selected";
      }

      /* Next free P### code. extra = codes already claimed in the same batch. */
      function nextCode(extra) {
        var max = 0;
        state.products.map(function (p) { return p.productId; }).concat(extra || []).forEach(function (id) {
          var n = parseInt(String(id).replace(/\D/g, ""), 10);
          if (isFinite(n) && n > max) max = n;
        });
        return "P" + String(max + 1).padStart(3, "0");
      }

      /* A product with any recorded movement or stock row cannot be deleted:
         transactions and balances reference its code, and removing the master
         line would leave history nobody can read. */
      function blockReason(id) {
        var u = usage(id);
        var hasRow = state.stocks.some(function (s) { return s.productId === id; });
        if (u.moves) return u.moves + " movement" + (u.moves === 1 ? "" : "s") + " recorded";
        if (hasRow) return "has a stock record";
        return "";
      }

      function bulkDelete(keys) {
        var items = keys.map(function (id) {
          var p = state.products.find(function (x) { return x.productId === id; });
          return p ? { id: id, name: p.productName, why: blockReason(id) } : null;
        }).filter(Boolean);
        var ok = items.filter(function (i) { return !i.why; });
        var blocked = items.filter(function (i) { return i.why; });
        var needType = ok.length >= 10;

        var body =
          (ok.length
            ? '<p><b>' + ok.length + " product" + (ok.length === 1 ? "" : "s") + " will be permanently deleted</b> from the master. " +
              "They disappear from the inward and outward dropdowns. This cannot be undone.</p>" +
              '<div class="bulk-scroll" style="max-height:140px"><table class="tbl"><tbody>' +
              ok.slice(0, 50).map(function (i) { return '<tr><td class="mono">' + UI.esc(i.id) + "</td><td>" + UI.esc(i.name) + "</td></tr>"; }).join("") +
              "</tbody></table></div>" + (ok.length > 50 ? '<div class="muted small">\u2026and ' + (ok.length - 50) + " more.</div>" : "")
            : '<div class="alert warn"><div><b>Nothing can be deleted</b>Every selected product has stock or movement history.</div></div>') +
          (blocked.length
            ? '<div class="alert warn" style="margin-top:12px"><div><b>' + blocked.length + " selected product" + (blocked.length === 1 ? " is" : "s are") + " kept</b>" +
              "Deleting them would orphan their history. Their stock must be zero and unused first; otherwise keep them.</div></div>" +
              '<div class="bulk-scroll" style="max-height:110px"><table class="tbl"><tbody>' +
              blocked.slice(0, 30).map(function (i) { return '<tr><td class="mono">' + UI.esc(i.id) + "</td><td>" + UI.esc(i.name) +
                '</td><td class="muted small">' + UI.esc(i.why) + "</td></tr>"; }).join("") + "</tbody></table></div>"
            : "") +
          (ok.length && needType
            ? '<div class="field" style="margin-top:12px"><label>Type DELETE to confirm</label><input class="input" id="delConfirm" autocomplete="off"></div>' : "") +
          '<div id="delProg"></div>';

        var m = UI.modal({
          title: "Delete products", danger: true,
          okText: ok.length ? "Delete " + ok.length : "", cancelText: "Cancel", body: body,
          onOk: function (root) {
            if (needType && String(root.querySelector("#delConfirm").value).trim() !== "DELETE") {
              UI.toast("Confirmation needed", "Type DELETE in capitals to continue.", "warn"); return false;
            }
            run(root); return false;
          }
        });

        function run(root) {
          var okBtn = root.querySelector("[data-ok]"); if (okBtn) okBtn.style.display = "none";
          var cancel = root.querySelector(".modal-foot [data-x]");
          var stop = false, done = 0, gone = 0, fails = [], streak = 0;
          if (cancel) { cancel.textContent = "Stop"; cancel.onclick = function () { stop = true; cancel.disabled = true; }; }
          var prog = root.querySelector("#delProg");
          function paintProg(final) {
            prog.innerHTML = '<div style="margin-top:12px"><b>' + (final ? "Finished" : "Deleting\u2026") + "</b> " + done + " / " + ok.length + "</div>" +
              '<div class="bulk-prog"><i style="width:' + Math.round(done / ok.length * 100) + '%"></i></div>' +
              (fails.length ? '<div class="alert bad"><div><b>' + fails.length + " failed</b>" + UI.esc(fails[0].err) + "</div></div>" : "");
          }
          paintProg(false);
          function end() {
            paintProg(true);
            if (cancel) { cancel.disabled = false; cancel.textContent = "Close"; cancel.onclick = function () { m.close(); }; }
            try { w.API.log("PRODUCT_DELETED", { entity: "products", productName: gone + " products deleted" }, user); } catch (e) { /* log only */ }
            UI.toast(gone + " deleted", fails.length ? fails.length + " failed." : "", fails.length ? "warn" : "ok");
            if (state.grid) state.grid.clearSelection();
            load();
          }
          (function next(i) {
            if (stop || i >= ok.length || streak >= 3) return end();
            w.API.deleteProduct(ok[i].id, user).then(function () { gone++; streak = 0; })
              .catch(function (e) { fails.push({ id: ok[i].id, err: e.message }); streak++; })
              .then(function () { done++; paintProg(false); setTimeout(function () { next(i + 1); }, w.APP_CONFIG.bulkPostGapMs || 400); });
          })(0);
        }
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
              productId: p.productId || root.querySelector("#pCode").value.trim() || nextCode(),
              productName: name,
              category: root.querySelector("#pCat").value.trim() || Master.label(master),
              uom: root.querySelector("#pUom").value.trim() || "NOS",
              reorderLevel: Number(root.querySelector("#pReorder").value) || 0,
              master: master,
              masterConfirmed: true
            };

            w.API.saveProduct(rec, { isNew: isNew }).then(function (saved) {
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
      d.getElementById("bulkBtn").onclick = function () {
        w.ProductBulk.open({ user: user, products: state.products, nextCode: nextCode, onDone: load });
      };
      d.getElementById("selClear").onclick = function () { if (state.grid) state.grid.clearSelection(); };
      d.getElementById("selDelete").onclick = function () { if (state.grid) bulkDelete(state.grid.selectedKeys()); };

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
